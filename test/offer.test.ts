import { describe, expect, it } from "vitest";
import { computeTaxes, paramsForYear } from "../src/tax/index";
import { convenienceRuleWarning, projectScenario, type Household, type OfferInput } from "../src/offer/index";
import { addMonths, fromDays, nextOccurrence, toDays } from "../src/offer/dates";

const single: Household = { filingStatus: "single" };

/** docs/offer-model.md §10 worked example, minus RSUs (slice 2). */
const worked: OfferInput = {
  label: "Worked example",
  residence: { state: "TX" },
  employerState: "TX",
  startDate: "2026-08-03",
  salary: { annual: 150_000 },
  bonus: {
    basis: "percentOfSalary", amount: { bear: 0.05, base: 0.10, bull: 0.15 },
    payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 },
  },
  cashAwards: [{ label: "Sign-on", amount: 30_000, paidOn: { daysAfterStart: 30 } }],
};

const at = (iso: string) => toDays(iso);
const iso = (day: number) => fromDays(day);

describe("civil dates", () => {
  it("month adds clamp to the month's end", () => {
    expect(iso(addMonths(at("2026-01-31"), 1))).toBe("2026-02-28");
    expect(iso(addMonths(at("2028-01-31"), 1))).toBe("2028-02-29");
    expect(iso(addMonths(at("2028-02-29"), 12))).toBe("2029-02-28");
    expect(iso(addMonths(at("2026-08-03"), 12))).toBe("2027-08-03");
  });
  it("next occurrence of a month/day is on or after the given day", () => {
    expect(iso(nextOccurrence({ month: 3, day: 15 }, at("2027-01-01")))).toBe("2027-03-15");
    expect(iso(nextOccurrence({ month: 3, day: 15 }, at("2027-03-16")))).toBe("2028-03-15");
  });
  it("rejects impossible dates", () => {
    expect(() => toDays("2026-02-30")).toThrow();
    expect(() => toDays("2026-8-3")).toThrow();
  });
});

describe("worked example (golden)", () => {
  const r = projectScenario(worked, single);
  const ey1 = r.employmentYears[0];

  it("first 12 months: $186,169.35 = $150,000 salary + $6,169.35 prorated bonus + $30,000 sign-on", () => {
    // Salary by month: Aug 2026 29/31 + Sep-Jul (11 months) + Aug 2027 2/31 = 12 months x $12,500.
    // 2026 salary: 12,500 x 29/31 + 4 x 12,500 = 61,693.55; bonus 10% of that = 6,169.35.
    expect(ey1.start).toBe("2026-08-03");
    expect(ey1.end).toBe("2027-08-03");
    expect(ey1.gross).toEqual({ salary: 150_000, bonus: 6_169.35, cash: 30_000, total: 186_169.35 });
  });
  it("quoted year-1 TC is $195,000 until RSUs land in slice 2 ($205,000 with them)", () => {
    expect(ey1.quotedTC).toBe(195_000);
  });
  it("sign-on pays 2026-09-02; the 2026 bonus pays 2027-03-15 on 2026's salary", () => {
    const signOn = r.events.find((e) => e.component === "cash")!;
    expect(signOn).toMatchObject({ date: "2026-09-02", gross: 30_000, calendarYear: 2026, employmentYear: 1 });
    const bonus = r.events.find((e) => e.component === "bonus")!;
    expect(bonus).toMatchObject({ date: "2027-03-15", gross: 6_169.35, calendarYear: 2027, employmentYear: 1 });
  });
  it("calendar years: 2026 = $91,693.55 (partial year), 2027 = $156,169.35", () => {
    expect(r.calendarYears[0].offerGross).toEqual({ salary: 61_693.55, bonus: 0, cash: 30_000, total: 91_693.55 });
    expect(r.calendarYears[1].offerGross).toEqual({ salary: 150_000, bonus: 6_169.35, cash: 0, total: 156_169.35 });
  });
  it("2026 offer tax in TX is $18,357.14 (hand-checked)", () => {
    // Federal: taxable 91,693.548 - 16,100 = 75,593.548; 1,240 + 4,560 + 22% x 25,193.548 = 11,342.58.
    // FICA: 6.2% + 1.45% of 91,693.548 = 5,685.00 + 1,329.56. Total (unrounded parts) 18,357.14.
    // Without the offer (no other wages) the household owes 0.
    expect(r.calendarYears[0].offerTax).toBe(18_357.14);
    expect(r.calendarYears[0].withoutOffer.result.totalTax).toBe(0);
  });
  it("later calendar years use projected law at the default 2.5% inflation", () => {
    const y27 = r.calendarYears[1];
    expect(y27.projectedLaw).toBe(true);
    expect(y27.indexFactor).toBeCloseTo(1.025, 12);
    expect(y27.withOffer.input.year).toBe(2027);
  });
  it("reconciles: payments' tax sums to calendar-year offer tax, and employment years to their payments", () => {
    const eventTax = r.events.reduce((s, e) => s + e.tax, 0);
    const calendarTax = r.calendarYears.reduce((s, c) => s + c.offerTax, 0);
    expect(eventTax).toBeCloseTo(calendarTax, 0);
    const inHorizon = r.events.filter((e) => e.employmentYear <= 5).reduce((s, e) => s + e.tax, 0);
    expect(r.employmentYears.reduce((s, y) => s + y.tax, 0)).toBeCloseTo(inHorizon, 0);
  });
  it("a full calendar year and a full employment year of salary are exactly the annual rate, leap years included", () => {
    expect(r.calendarYears.find((c) => c.year === 2028)!.offerGross.salary).toBe(150_000);
    expect(r.employmentYears.map((y) => y.gross.salary)).toEqual([150_000, 150_000, 150_000, 150_000, 150_000]);
  });
});

describe("incremental tax", () => {
  it("a job-switcher's 2026 offer is taxed on top of $60k of earlier wages: $27,135.01 (hand-checked)", () => {
    // With: 151,693.548 wages. Federal: taxable 135,593.548; 1,240 + 4,560 + 12,166 + 24% x 29,893.548
    //   = 25,140.45. SS 9,405.00, Medicare 2,199.56. Total 36,745.01.
    // Without: 60,000. Federal 1,240 + 12% x 31,500 = 5,020; SS 3,720; Medicare 870. Total 9,610.
    const r = projectScenario(worked, { filingStatus: "single", otherWages: { 2026: 60_000 } });
    expect(r.calendarYears[0].withOffer.result.totalTax).toBe(36_745.01);
    expect(r.calendarYears[0].withoutOffer.result.totalTax).toBe(9_610);
    expect(r.calendarYears[0].offerTax).toBe(27_135.01);
    expect(r.calendarYears[1].offerTax).toBe(projectScenario(worked, single).calendarYears[1].offerTax);
  });
  it("joint filers: the offer's tax is measured on top of the spouse's wages", () => {
    const hh: Household = { filingStatus: "joint", spouseWages: { 2026: 80_000 } };
    const r = projectScenario(worked, hh);
    const tax = (wages: number) => computeTaxes(
      { year: 2026, filingStatus: "joint", wages, spouseWages: 80_000, state: "TX" }, paramsForYear(2026)).totalTax;
    const offerWages = 150_000 / 12 * (29 / 31) + 4 * 12_500 + 30_000;
    expect(r.calendarYears[0].offerTax).toBeCloseTo(tax(offerWages) - tax(0), 1);
  });
});

describe("bonus timing and proration", () => {
  const withBonus = (bonus: Partial<NonNullable<OfferInput["bonus"]>>, startDate = "2026-08-03"): OfferInput =>
    ({ ...worked, startDate, cashAwards: [], bonus: { ...worked.bonus!, ...bonus } });
  const bonuses = (offer: OfferInput, scenario: "bear" | "base" | "bull" = "base") =>
    projectScenario(offer, single, { scenario }).events.filter((e) => e.component === "bonus");

  it("starting after the Oct 1 cutoff skips 2026; the first bonus is 2028-03-15 on a full 2027", () => {
    const r = projectScenario(withBonus({}, "2026-10-15"), single);
    const b = r.events.filter((e) => e.component === "bonus");
    expect(b[0]).toMatchObject({ date: "2028-03-15", gross: 15_000, employmentYear: 2 });
    expect(r.warnings.some((w) => w.includes("Oct 1 bonus cutoff"))).toBe(true);
  });
  it("fiscal-year period (Jul 1, paid Sep 15): first bonus 2027-09-15, in year 2", () => {
    // Aug 3 2026 - Jun 30 2027 = 29/31 of August + 10 months: 10% x 12,500 x 10.9355 = 13,669.35.
    const b = bonuses(withBonus({ periodStart: { month: 7, day: 1 }, payOn: { month: 9, day: 15 }, cutoff: undefined }));
    expect(b[0]).toMatchObject({ date: "2027-09-15", gross: 13_669.35, employmentYear: 2 });
  });
  it("fixed bonus prorates by days employed: $20,000 x 151/365 = $8,273.97", () => {
    const b = bonuses(withBonus({ basis: "fixed", amount: { bear: 20_000, base: 20_000, bull: 20_000 } }));
    expect(b[0].gross).toBe(8_273.97);
    expect(b[1].gross).toBe(20_000);
  });
  it("scenarios pick the bonus rate; a guaranteed first payout stays at base", () => {
    expect(bonuses(withBonus({}), "bear")[0].gross).toBe(3_084.68); // 5% x 61,693.55
    const g = bonuses(withBonus({ firstPayoutGuaranteed: true }), "bear");
    expect(g[0].gross).toBe(6_169.35);
    expect(g[1].gross).toBe(7_500);
  });
});

describe("employment-year boundaries (decision 1)", () => {
  const paidOn = (date: string) => projectScenario(
    { ...worked, bonus: undefined, cashAwards: [{ label: "Award", amount: 1_000, paidOn: date }] }, single,
  ).events.find((e) => e.component === "cash")!;

  it("a payment exactly on the anniversary counts toward the year just ended", () => {
    expect(paidOn("2027-08-03").employmentYear).toBe(1);
    expect(paidOn("2027-08-04").employmentYear).toBe(2);
  });
  it("salary accrued on the anniversary day itself belongs to the new year", () => {
    const r = projectScenario({ ...worked, bonus: undefined, cashAwards: [] }, single);
    const anniversaryMonth = r.events.find((e) => e.label === "Salary 2027-08-03 to 2027-08-31")!;
    expect(anniversaryMonth.employmentYear).toBe(2);
    expect(r.employmentYears[0].gross.salary).toBe(150_000);
  });
});

describe("residence vs employer state (decision 9)", () => {
  it("warns when the employer state has a convenience-of-employer rule", () => {
    expect(convenienceRuleWarning("NJ", "NY")).toMatch(/convenience-of-employer/);
    expect(convenienceRuleWarning("PA", "DE")).toBeDefined();
  });
  it("CT and NJ apply it only to residents of states that have one", () => {
    expect(convenienceRuleWarning("NY", "CT")).toBeDefined();
    expect(convenienceRuleWarning("TX", "CT")).toBeUndefined();
  });
  it("no warning when you live where the employer is", () => {
    expect(convenienceRuleWarning("NY", "NY")).toBeUndefined();
  });
  it("flows into the projection's warnings", () => {
    const r = projectScenario({ ...worked, residence: { state: "NJ" }, employerState: "NY" }, single);
    expect(r.warnings).toHaveLength(1);
  });
});

describe("input validation", () => {
  it("rejects start dates before 2026 and bad horizons", () => {
    expect(() => projectScenario({ ...worked, startDate: "2025-12-01" }, single)).toThrow(/2026/);
    expect(() => projectScenario(worked, single, { years: 0 })).toThrow();
  });
});
