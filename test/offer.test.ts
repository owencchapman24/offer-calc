import { describe, expect, it } from "vitest";
import { computeTaxes, paramsForYear } from "../src/tax/index";
import {
  breakeven, byYear, cliffs, compareOffers, convenienceRuleWarning, leaveDateSweep, nextCliff, projectOffer,
  projectScenario, VESTING_PRESETS, withholdingShortfall, horizonSweep, monthlyEquivalent, type AnnualBonus, type Household, type OfferInput,
} from "../src/offer/index";
import { SAMPLE_HOUSEHOLD, SAMPLE_OFFERS } from "../src/samples";
import { describeSchedule, formatWarning } from "../src/format/index";
import { addMonths, fromDays, nextOccurrence, toDays } from "../src/offer/dates";
import { snapToVestDate } from "../src/offer/vesting";
import { areaStates, cityOptions, findRppAreas, nonHousingRpp, RPP, rppArea } from "../src/col/index";
import { estimateRent, FMR, fmrArea, US_MEDIAN_GROSS_RENT } from "../src/col/rent";
import cities from "../src/col/cities.json";

const single: Household = { filingStatus: "single" };

/** docs/offer-model.md §10 worked example. */
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
  equity: {
    grants: [{
      kind: "rsu", label: "New-hire grant", value: 200_000,
      schedule: { ...VESTING_PRESETS.backLoadedSemiannualAfterCliff, vestDates: { months: [2, 5, 8, 11], day: 15 } },
    }],
  },
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
    expect(ey1.gross).toEqual({ salary: 150_000, bonus: 6_169.35, cash: 30_000, rsu: 0, clawback: 0, total: 186_169.35 });
  });
  it("quoted year-1 TC is $205,000: $150k + $15k target bonus + $30k sign-on + 5% of $200k RSUs", () => {
    expect(ey1.quotedTC).toBe(205_000);
  });
  it("sign-on pays 2026-09-02; the 2026 bonus pays 2027-03-15 on 2026's salary", () => {
    const signOn = r.events.find((e) => e.component === "cash")!;
    expect(signOn).toMatchObject({ date: "2026-09-02", gross: 30_000, calendarYear: 2026, employmentYear: 1 });
    const bonus = r.events.find((e) => e.component === "bonus")!;
    expect(bonus).toMatchObject({ date: "2027-03-15", gross: 6_169.35, calendarYear: 2027, employmentYear: 1 });
  });
  it("calendar years: 2026 = $91,693.55 (partial year), 2027 = $166,169.35 with the first $10,000 vest", () => {
    expect(r.calendarYears[0].offerGross)
      .toEqual({ salary: 61_693.55, bonus: 0, cash: 30_000, rsu: 0, clawback: 0, total: 91_693.55 });
    expect(r.calendarYears[1].offerGross)
      .toEqual({ salary: 150_000, bonus: 6_169.35, cash: 0, rsu: 10_000, clawback: 0, total: 166_169.35 });
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
    ({ ...worked, startDate, cashAwards: [], bonus: { ...worked.bonus!, ...bonus } as AnnualBonus });
  const bonuses = (offer: OfferInput, scenario: "bear" | "base" | "bull" = "base") =>
    projectScenario(offer, single, { scenario }).events.filter((e) => e.component === "bonus");

  it("starting after the Oct 1 cutoff skips 2026; the first bonus is 2028-03-15 on a full 2027", () => {
    const r = projectScenario(withBonus({}, "2026-10-15"), single);
    const b = r.events.filter((e) => e.component === "bonus");
    expect(b[0]).toMatchObject({ date: "2028-03-15", gross: 15_000, employmentYear: 2 });
    expect(r.warnings).toContainEqual({ code: "bonusCutoff", params: expect.objectContaining({ cutoff: { month: 10, day: 1 } }) });
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
    const anniversaryMonth = r.events.find((e) => e.detail.kind === "salary" && e.detail.from === "2027-08-03")!;
    expect(anniversaryMonth.detail).toMatchObject({ to: "2027-08-31", days: 29, daysInMonth: 31 });
    expect(anniversaryMonth.employmentYear).toBe(2);
    expect(r.employmentYears[0].gross.salary).toBe(150_000);
  });
});

describe("residence vs employer state (decision 9)", () => {
  it("warns when the employer state has a convenience-of-employer rule", () => {
    expect(convenienceRuleWarning("NJ", "NY")).toEqual({ code: "convenienceRule", params: { residenceState: "NJ", employerState: "NY" } });
    expect(formatWarning(convenienceRuleWarning("NJ", "NY")!)).toMatch(/convenience-of-employer/);
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
    expect(r.warnings).toEqual([{ code: "convenienceRule", params: { residenceState: "NJ", employerState: "NY" } }]);
  });
});

describe("vesting schedules", () => {
  it("standard: 25% at a 1-year cliff, then 6.25% quarterly to month 48", () => {
    const t = VESTING_PRESETS.evenQuarterlyAfterCliff.tranches;
    expect(t[0]).toEqual({ month: 12, fraction: 0.25 });
    expect(t.slice(1)).toEqual([15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48].map((month) => ({ month, fraction: 0.0625 })));
  });
  it("back-loaded 5/15/40/40: 5% at the cliff, 7.5% twice, then 20% every six months", () => {
    expect(VESTING_PRESETS.backLoadedSemiannualAfterCliff.tranches.map((t) => [t.month, +t.fraction.toFixed(6)]))
      .toEqual([[12, 0.05], [18, 0.075], [24, 0.075], [30, 0.2], [36, 0.2], [42, 0.2], [48, 0.2]]);
  });
  it("annual and front-loaded monthly", () => {
    expect(VESTING_PRESETS.evenAnnual.tranches).toEqual([12, 24, 36, 48].map((month) => ({ month, fraction: 0.25 })));
    const f = VESTING_PRESETS.frontLoadedMonthly.tranches;
    expect(f).toHaveLength(48);
    expect(f[0].month).toBe(1);
    expect(f[0].fraction).toBeCloseTo(0.0275, 12); // 33% / 12
    expect(f.reduce((s, t) => s + t.fraction, 0)).toBeCloseTo(1, 12);
  });
  it("labels say the real cadence: only the even 4-year preset is quarterly after year 1", () => {
    expect(describeSchedule(VESTING_PRESETS.evenQuarterlyAfterCliff)).toBe("25/25/25/25, quarterly after a 1-year cliff");
    expect(describeSchedule(VESTING_PRESETS.backLoadedSemiannualAfterCliff)).toBe("5/15/40/40, semiannual after a 1-year cliff");
    expect(describeSchedule(VESTING_PRESETS.evenAnnual)).toBe("25/25/25/25, annual");
    expect(describeSchedule(VESTING_PRESETS.frontLoadedMonthly)).toBe("33/33/22/12, monthly");
    expect(describeSchedule(byYear([5, 15, 40, 40], { perYear: 4, cliffMonths: 12 })))
      .toBe("5/15/40/40, quarterly after a 1-year cliff");
  });
  it("rejects percentages that don't sum to 100 and splits that don't divide the year", () => {
    expect(() => byYear([25, 25, 25], { perYear: 4 })).toThrow(/sum to 100/);
    expect(() => byYear([50, 50], { perYear: 5 })).toThrow(/divide 12/);
  });
  it("snaps to the next company vest date on or after the nominal date", () => {
    const cal = { months: [2, 5, 8, 11], day: 15 };
    expect(iso(snapToVestDate(at("2027-08-03"), cal))).toBe("2027-08-15");
    expect(iso(snapToVestDate(at("2027-08-15"), cal))).toBe("2027-08-15");
    expect(iso(snapToVestDate(at("2027-11-20"), cal))).toBe("2028-02-15");
  });
});

describe("RSUs in the projection", () => {
  const rsus = (r: ReturnType<typeof projectScenario>) => r.events.filter((e) => e.component === "rsu");

  it("worked example: $200k back-loaded grant vests on company dates, first one 12 days into year 2", () => {
    const r = projectScenario(worked, single);
    expect(rsus(r).map((e) => [e.date, e.gross, e.employmentYear])).toEqual([
      ["2027-08-15", 10_000, 2], ["2028-02-15", 15_000, 2], ["2028-08-15", 15_000, 3], ["2029-02-15", 40_000, 3],
      ["2029-08-15", 40_000, 4], ["2030-02-15", 40_000, 4], ["2030-08-15", 40_000, 5],
    ]);
    expect(rsus(r)[0].detail).toMatchObject({ kind: "rsu", tranche: 1, nominalDate: "2027-08-03" });
    expect(r.employmentYears.map((y) => y.gross.rsu)).toEqual([0, 25_000, 55_000, 80_000, 40_000]);
  });
  it("quoted TC counts new-hire tranches by nominal year at grant value", () => {
    // Months 12 | 18, 24 | 30, 36 | 42, 48 -> $10k | $30k | $80k | $80k | $0, on $165k salary + target bonus.
    const r = projectScenario(worked, single);
    expect(r.employmentYears.map((y) => y.quotedTC)).toEqual([205_000, 195_000, 245_000, 245_000, 165_000]);
  });
  it("vests are taxed as wages at their calendar year's offer rate", () => {
    const r = projectScenario(worked, single);
    const first = rsus(r)[0];
    expect(first.tax / first.gross).toBeCloseTo(r.calendarYears.find((c) => c.year === 2027)!.offerTaxRate, 4);
  });
  it("price growth compounds from grant to vest, per scenario", () => {
    // 2026-08-03 to 2027-08-15 is 377 days.
    const g = { ...worked, equity: { ...worked.equity!, priceGrowth: { bear: -0.2, base: 0, bull: 0.1 } } };
    const first = (scenario: "bear" | "base" | "bull") => rsus(projectScenario(g, single, { scenario }))[0].gross;
    expect(first("base")).toBe(10_000);
    expect(first("bull")).toBeCloseTo(10_000 * 1.1 ** (377 / 365.25), 2);
    expect(first("bear")).toBeCloseTo(10_000 * 0.8 ** (377 / 365.25), 2);
  });
  it("refreshers stack: $20k a year from month 12, vesting annually, adds 5k/10k/15k/20k in years 2-5", () => {
    const g: OfferInput = {
      ...worked,
      equity: {
        grants: [],
        refreshers: { value: { bear: 10_000, base: 20_000, bull: 30_000 }, firstAfterMonths: 12, everyMonths: 12,
          schedule: VESTING_PRESETS.evenAnnual },
      },
    };
    const r = projectScenario(g, single);
    // Refresher vests land on anniversaries, which count toward the year just ended (decision 1).
    expect(r.employmentYears.map((y) => y.gross.rsu)).toEqual([0, 5_000, 10_000, 15_000, 20_000]);
    expect(rsus(r).filter((e) => e.date === "2031-08-03")).toHaveLength(4);
    expect(r.employmentYears[1].quotedTC).toBe(165_000); // refreshers aren't in the offer letter
    expect(projectScenario(g, single, { scenario: "bear" }).employmentYears[4].gross.rsu).toBe(10_000);
  });
  it("arbitrary schedules with their own vest start", () => {
    const g: OfferInput = {
      ...worked,
      equity: {
        grants: [{ kind: "rsu", label: "Custom", value: 12_000, vestStart: "2026-09-01",
          schedule: { tranches: [{ month: 6, fraction: 0.5 }, { month: 30, fraction: 0.5 }] } }],
      },
    };
    expect(rsus(projectScenario(g, single)).map((e) => [e.date, e.gross])).toEqual([["2027-03-01", 6_000], ["2029-03-01", 6_000]]);
    const bad = { ...g, equity: { grants: [{ ...g.equity!.grants[0], schedule: { tranches: [{ month: 6, fraction: 0.9 }] } }] } };
    expect(() => projectScenario(bad, single)).toThrow(/sum to 1/);
  });
});

describe("leave date and clawbacks", () => {
  // Worked example with a 12-month prorated (by completed month) gross clawback on the sign-on.
  // Start 2026-08-03; sign-on $30,000 paid 2026-09-02; window ends 2027-08-03.
  const withClawback: OfferInput = {
    ...worked,
    cashAwards: [{ ...worked.cashAwards![0], clawback: { months: 12, kind: "prorated" } }],
  };
  const clawback = (c: NonNullable<NonNullable<OfferInput["cashAwards"]>[0]["clawback"]>): OfferInput =>
    ({ ...withClawback, cashAwards: [{ ...worked.cashAwards![0], clawback: c }] });
  const leaving = (leaveDate: string, offer: OfferInput = withClawback) => projectScenario({ ...offer, leaveDate }, single);
  const sum = (r: ReturnType<typeof projectScenario>, c: string) =>
    r.events.filter((e) => e.component === c).reduce((s, e) => s + e.gross, 0);

  it("RSU edge: leaving the day before a vest forfeits it; leaving on the vest day keeps it", () => {
    const before = leaving("2027-08-14");
    expect(sum(before, "rsu")).toBe(0);
    expect(before.leave!.unvestedRsuForfeited).toBe(200_000);
    const on = leaving("2027-08-15");
    expect(sum(on, "rsu")).toBe(10_000);
    expect(on.leave!.unvestedRsuForfeited).toBe(190_000);
  });
  it("bonus edge: leaving the day before the payout forfeits it; on the payout day it pays", () => {
    const before = leaving("2027-03-14");
    expect(sum(before, "bonus")).toBe(0);
    expect(before.warnings).toContainEqual({ code: "bonusForfeited",
      params: expect.objectContaining({ periodFrom: "2026-01-01", periodTo: "2026-12-31" }) });
    expect(sum(leaving("2027-03-15"), "bonus")).toBe(6_169.35);
  });
  it("prorated-bonus alternative: earned bonuses still pay, the leave period is prorated", () => {
    // 2026: 6,169.35 on 2027-03-15. 2027 so far: Jan + Feb + 14/31 of Mar = 30,645.16 x 10% = 3,064.52.
    const r = leaving("2027-03-14", { ...withClawback, bonus: { ...worked.bonus!, mustBeEmployedOnPayDate: false } });
    expect(r.events.filter((e) => e.component === "bonus").map((e) => [e.date, e.gross]))
      .toEqual([["2027-03-15", 6_169.35], ["2028-03-15", 3_064.52]]);
  });
  it("salary stops on the leave date (inclusive)", () => {
    // Aug 3-Dec 1 2026: 12,500 x 29/31 + 3 x 12,500 + 12,500 x 1/31 = 49,596.77.
    expect(leaving("2026-12-01").calendarYears[0].offerGross.salary).toBe(49_596.77);
    expect(leaving("2026-12-01").employmentYears[1].gross.total).toBe(0);
  });
  it("window edge: the window's last day clears it; the day before owes 1/12, under the 1341 threshold", () => {
    expect(leaving("2027-08-02").leave!.clawbacks).toEqual([]);
    const c = leaving("2027-08-01").leave!.clawbacks[0];
    expect(c).toMatchObject({ fraction: 1 / 12, owed: 2_500, treatment: "noRelief", taxRelief: 0, netCost: 2_500 });
  });
  it("window edge, full kind: the day before owes all $30,000; 1341 credit $6,119.35 (crosses into 12%)", () => {
    // 2026 federal with the sign-on: taxable 75,593.548 -> 1,240 + 4,560 + 22% x 25,193.548 = 11,342.58.
    // Without $30,000: taxable 45,593.548 -> 1,240 + 12% x 33,193.548 = 5,223.23. Credit 6,119.35.
    expect(leaving("2027-08-02", clawback({ months: 12, kind: "full" })).leave!.clawbacks).toEqual([]);
    expect(leaving("2027-08-01", clawback({ months: 12, kind: "full" })).leave!.clawbacks[0])
      .toMatchObject({ owed: 30_000, treatment: "irc1341Credit", taxRelief: 6_119.35, netCost: 23_880.65 });
  });
  it("window edge, day proration: one unworked day owes $30,000 / 365", () => {
    expect(leaving("2027-08-01", clawback({ months: 12, kind: "prorated", per: "day" })).leave!.clawbacks[0].owed).toBe(82.19);
  });
  it("design §10: leave after 6 months owes $15,000; 1341 recovers 22% = $3,300; FICA isn't refunded", () => {
    const r = leaving("2027-02-02");
    expect(r.leave!.clawbacks[0]).toMatchObject({
      paidOn: "2026-09-02", repaidOn: "2027-02-02", fraction: 0.5, owed: 15_000,
      treatment: "irc1341Credit", taxRelief: 3_300, netCost: 11_700,
    });
    expect(r.calendarYears.find((c) => c.year === 2027)!.priorYearRepayments).toEqual({ repaid: 15_000, relief: 3_300 });
    expect(r.calendarYears[0].offerGross.cash).toBe(30_000); // 2026 wages (and FICA) stay
    expect(r.warnings).toContainEqual({ code: "clawbackFica", params: { award: "Sign-on", paidYear: 2026, repaidYear: 2027 } });
  });
  it("same-year repayment reverses the wages: owes $22,500, gets back $5,730.92 of tax (hand-checked)", () => {
    // Leave 2026-12-01: 3 completed months -> owes 9/12 x 30,000 = 22,500, reversing 2026 wages.
    // 2026 wages 49,596.77 + 30,000 - 22,500 = 57,096.77. TX tax: federal 1,240 + 12% x 28,596.77
    // = 4,671.61, FICA 4,367.90 -> 9,039.52. Without the reversal (79,596.77): 8,681.29 + 6,089.15
    // = 14,770.44. Relief 5,730.92.
    const r = leaving("2026-12-01");
    expect(r.calendarYears[0].offerGross).toMatchObject({ cash: 30_000, clawback: -22_500, total: 57_096.77 });
    expect(r.calendarYears[0].offerTax).toBe(9_039.52);
    expect(r.leave!.clawbacks[0]).toMatchObject({
      owed: 22_500, treatment: "sameYearReversal", taxRelief: 5_730.92, netCost: 16_769.08,
    });
  });
  it("net-basis repayment: same year costs the same as gross; a later year repays the after-tax share", () => {
    const net = clawback({ months: 12, kind: "prorated", repay: "net" });
    expect(leaving("2026-12-01", net).leave!.clawbacks[0]).toMatchObject({ owed: 16_769.08, netCost: 16_769.08 });
    const later = leaving("2027-02-02", net).leave!.clawbacks[0];
    expect(later.owed).toBeCloseTo(15_000 * (1 - 18_357.14 / (150_000 / 12 * (29 / 31 + 4) + 30_000)), 1);
    expect(later.taxRelief).toBeCloseTo(0.22 * later.owed, 1);
  });
  it("refreshers aren't granted after the leave date", () => {
    const g: OfferInput = {
      ...withClawback,
      equity: { ...worked.equity!, refreshers: { value: { bear: 20_000, base: 20_000, bull: 20_000 },
        firstAfterMonths: 12, everyMonths: 12, schedule: VESTING_PRESETS.evenAnnual } },
    };
    // The first refresher is granted 2027-08-03.
    expect(leaving("2027-08-02", g).leave!.unvestedRsuForfeited).toBe(200_000);
    expect(leaving("2027-08-03", g).leave!.unvestedRsuForfeited).toBe(220_000);
  });
  it("reconciles: payments' tax = calendar-year offer tax less prior-year 1341 relief", () => {
    const r = leaving("2027-02-02");
    const eventTax = r.events.reduce((s, e) => s + e.tax, 0);
    const yearTax = r.calendarYears.reduce((s, c) => s + c.offerTax - c.priorYearRepayments.relief, 0);
    expect(eventTax).toBeCloseTo(yearTax, 0);
  });
  it("leaveDateSweep: month 11 owes $2,500, month 12 clears the window, month 13 adds the first vest", () => {
    const rows = leaveDateSweep(withClawback, single, [6, 11, 12, 13]);
    expect(rows.map((r) => r.leaveDate)).toEqual(["2027-02-02", "2027-07-02", "2027-08-02", "2027-09-02"]);
    expect(rows.map((r) => r.clawbackOwed)).toEqual([15_000, 2_500, 0, 0]);
    expect(rows.map((r) => r.unvestedRsuForfeited)).toEqual([200_000, 200_000, 200_000, 190_000]);
    expect(rows[2].paid).toBe(186_169.35); // exactly the first 12 months
    const kept = rows.map((r) => r.afterTaxCompKept);
    expect(kept).toEqual([...kept].sort((a, b) => a - b));
  });
});

describe("raises and promotions", () => {
  const all = (v: number) => ({ bear: v, base: v, bull: v });
  const plain = (salary: OfferInput["salary"], startDate = "2026-07-13"): OfferInput =>
    ({ label: "P", residence: { state: "TX" }, employerState: "TX", startDate, salary });

  it("anniversary merit raises compound: 100,000 / 103,000 / 106,090 / 109,272.70 / 112,550.88", () => {
    const r = projectScenario(plain({ annual: 100_000, raise: all(0.03) }), single);
    expect(r.employmentYears.map((y) => y.gross.salary)).toEqual([100_000, 103_000, 106_090, 109_272.7, 112_550.88]);
  });
  it("Jan 1 raises split the first employment year: $101,596.77 (hand-checked)", () => {
    // 100,000/12 x (19/31 + 5 months) + 103,000/12 x (6 months + 12/31) = 46,774.19 + 54,822.58.
    const r = projectScenario(plain({ annual: 100_000, raise: all(0.03), raiseOn: "jan1" }), single);
    expect(r.employmentYears[0].gross.salary).toBe(101_596.77);
    expect(r.calendarYears.find((c) => c.year === 2027)!.offerGross.salary).toBe(103_000);
    expect(r.employmentYears[1].quotedTC).toBe(103_000); // the rate in effect at the year's start
  });
  it("a mid-month promotion splits the month by days: 2027 salary $129,516.13 (hand-checked)", () => {
    // Jan-Feb 20,000 + Mar (10,000 x 15/31 + 11,000 x 16/31 = 10,516.13) + Apr-Dec 9 x 11,000 = 129,516.13.
    const r = projectScenario(plain({ annual: 120_000, promotions: [{ on: "2027-03-16", stepUp: 0.1 }] }, "2026-08-03"), single);
    expect(r.calendarYears.find((c) => c.year === 2027)!.offerGross.salary).toBe(129_516.13);
  });
  it("promotions can be limited to scenarios; merit raises compound on top of a step-up", () => {
    const promo = { on: "2029-07-13", stepUp: 0.35, scenarios: ["base", "bull"] as ("base" | "bull")[] };
    const run = (scenario: "bear" | "base") =>
      projectScenario(plain({ annual: 100_000, promotions: [promo] }), single, { scenario }).employmentYears.map((y) => y.gross.salary);
    expect(run("base")).toEqual([100_000, 100_000, 100_000, 135_000, 135_000]);
    expect(run("bear")).toEqual([100_000, 100_000, 100_000, 100_000, 100_000]);
    const both = projectScenario(plain({ annual: 100_000, raise: all(0.03), promotions: [promo] }), single);
    expect(both.employmentYears[3].gross.salary).toBe(147_518.15); // 100,000 x 1.092727 (1.03^3) x 1.35
  });
  it("a percent-of-salary bonus picks up raises", () => {
    const o = { ...plain({ annual: 100_000, raise: all(0.03), raiseOn: "jan1" }),
      bonus: { basis: "percentOfSalary", amount: all(0.1), payOn: { month: 3, day: 15 } } as AnnualBonus };
    expect(projectScenario(o, single).events.find((e) => e.date === "2028-03-15")!.gross).toBe(10_300);
  });
  it("bonus by employment year: $70k prorated to a July start, then $85k, $100k, and the last repeats", () => {
    // Calendar periods paid Jan 31; each uses the employment year it ends in. 70,000 x 172/365 = 32,986.30.
    const o: OfferInput = { ...plain({ annual: 100_000 }), bonus: {
      basis: "byEmploymentYear", amounts: [all(70_000), all(85_000), { bear: 80_000, base: 100_000, bull: 120_000 }],
      payOn: { month: 1, day: 31 },
    } };
    const b = (scenario: "bear" | "base") =>
      projectScenario(o, single, { scenario }).events.filter((e) => e.component === "bonus").map((e) => [e.date, e.gross]);
    expect(b("base")).toEqual([["2027-01-31", 32_986.3], ["2028-01-31", 85_000], ["2029-01-31", 100_000],
      ["2030-01-31", 100_000], ["2031-01-31", 100_000]]);
    expect(b("bear")[2]).toEqual(["2029-01-31", 80_000]);
    expect(projectScenario(o, single).employmentYears[1].quotedTC).toBe(185_000);
  });
});

describe("present value and comparisons", () => {
  const tx = (o: Partial<OfferInput>): OfferInput =>
    ({ label: "T", residence: { state: "TX" }, employerState: "TX", startDate: "2026-07-13", salary: { annual: 100_000 }, ...o });
  const valued = { valuationDate: "2026-07-01" };

  it("one $10,000 payment a year out in TX: $9,235 after FICA, PV $8,795.53 at 5% (hand-checked)", () => {
    // 2027 federal tax is 0 (under the standard deduction); FICA 7.65% = 765.
    // 365 days = 0.99932 years; 9,235 x 1.05^-(365/365.25) = 9,235 x 0.952413 = 8,795.53.
    const r = projectScenario(tx({ startDate: "2026-07-01", salary: { annual: 0 },
      cashAwards: [{ label: "One", amount: 10_000, paidOn: "2027-07-01" }] }), single, valued);
    expect(r.window.nominal).toEqual({ gross: 10_000, tax: 765, premiums: 0, afterTaxComp: 9_235, takeHome: 9_235 });
    expect(r.window.presentValue!.afterTaxComp).toBe(8_795.53);
    expect(r.events.find((e) => e.component === "cash")!.discountFactor).toBeCloseTo(1.05 ** (-365 / 365.25), 12);
  });
  it("a 0% discount rate gives PV = nominal; the default window is the employment-year horizon", () => {
    const r = projectScenario(worked, single, { ...valued, discountRate: 0 });
    expect(r.window.presentValue).toEqual(r.window.nominal);
    expect(r.window.nominal.afterTaxComp).toBeCloseTo(r.employmentYears.reduce((s, y) => s + y.afterTaxComp, 0), 1);
    expect(projectScenario(worked, single, valued).window.presentValue!.afterTaxComp).toBeLessThan(r.window.nominal.afterTaxComp);
  });
  it("projectOffer runs bear/base/bull together", () => {
    const p = projectOffer(worked, single, valued);
    const net = (s: "bear" | "base" | "bull") => p.scenarios[s].window.nominal.afterTaxComp;
    expect(net("bear")).toBeLessThan(net("base"));
    expect(net("base")).toBeLessThan(net("bull"));
  });
  it("compareOffers: a start two months later means two months less pay in the shared window", () => {
    // Window 2026-07-01 to 2031-07-01 = 60 months: A earns 60 x 10,000; B (from 2026-09-01) 58 x 10,000.
    const c = compareOffers([tx({ startDate: "2026-07-01", salary: { annual: 120_000 } }),
      tx({ startDate: "2026-09-01", salary: { annual: 120_000 } })], single, valued);
    expect(c.window).toEqual({ start: "2026-07-01", end: "2031-07-01" });
    expect(c.projections.map((p) => p.scenarios.base.window.nominal.gross)).toEqual([600_000, 580_000]);
  });
  it("breakeven: offers differing only by $10k of salary need exactly $10k (hand-checked)", () => {
    const r = breakeven(tx({ salary: { annual: 110_000 } }), tx({}), "salary", single, valued);
    expect(r.increase).toBeCloseTo(10_000, 1);
    expect(r.to).toBeCloseTo(110_000, 1);
  });
  it("breakeven: a $10k smaller sign-on paid the same day needs $10k more sign-on", () => {
    const signOn = (amount: number) => [{ label: "Sign-on", amount, paidOn: { daysAfterStart: 30 } }];
    const r = breakeven(tx({ cashAwards: signOn(25_000) }), tx({ cashAwards: signOn(15_000) }), "signOn", single, valued);
    expect(r.increase).toBeCloseTo(10_000, 1);
  });
  it("breakeven: CA needs more salary than TX to tie, and the result does tie in PV", () => {
    const ca = tx({ residence: { state: "CA" }, employerState: "CA" });
    const r = breakeven(tx({}), ca, "salary", single, valued);
    expect(r.increase).toBeGreaterThan(5_000);
    const pv = (o: OfferInput) => projectScenario(o, single, { ...valued, scenario: "base" }).window.presentValue!.afterTaxComp;
    expect(pv({ ...ca, salary: { annual: r.to! } })).toBeCloseTo(r.targetPV, 0);
  });
  it("breakeven is negative when B is already ahead", () => {
    expect(breakeven(tx({}), tx({ salary: { annual: 110_000 } }), "salary", single, valued).increase).toBeCloseTo(-10_000, 1);
  });
  it("already ahead even at a $0 sign-on: an outcome, not an error, with B's lead (hand-checked)", () => {
    // TX, calendar 2026, 0% discount so PV = nominal. A: $100,000. B: $110,000 + a $5,000 sign-on.
    // B's extra $15,000 is all in the 22% bracket (taxable 98,900 < 105,700): 15,000 x (1 - 22% - 7.65%)
    // = 10,552.50 ahead. Even at a $0 sign-on B leads by 10,000 x 0.7035, so no sign-on ties.
    const jan = (o: Partial<OfferInput>) => tx({ startDate: "2026-01-01", ...o });
    const opts = { valuationDate: "2026-01-01", discountRate: 0, horizonYears: 1, years: 1 };
    const B = jan({ salary: { annual: 110_000 }, cashAwards: [{ label: "Sign-on", amount: 5_000, paidOn: "2026-01-01" }] });
    const r = breakeven(jan({}), B, "signOn", single, opts);
    expect(r).toMatchObject({ outcome: "alreadyAhead", increase: null, to: null, from: 5_000 });
    expect(r.aheadBy).toBeCloseTo(10_552.5, 2);
    // Salary can still tie, by giving up $15,000: $95,000 + $5,000 = A's $100,000.
    const s = breakeven(jan({}), B, "salary", single, opts);
    expect(s).toMatchObject({ outcome: "tie", from: 110_000 });
    expect(s.increase).toBeCloseTo(-15_000, 1);
    expect(s.aheadBy).toBeCloseTo(10_552.5, 2);
  });
});

describe("401(k), health, perks and hours", () => {
  const all = (v: number) => ({ bear: v, base: v, bull: v });
  // TX, a calendar-year job (start 2026-01-01, one employment year = calendar 2026).
  const jan: OfferInput = { label: "J", residence: { state: "TX" }, employerState: "TX", startDate: "2026-01-01", salary: { annual: 100_000 } };
  const oneYear = (o: OfferInput) => projectScenario(o, single, { years: 1 }).employmentYears[0];
  const match50to6 = { contributionPct: 0.06, match: [{ upToPct: 0.06, rate: 0.5 }] };

  it("everything together, hand-checked: tax $19,144.20, after-tax comp $79,655.80, take-home $73,655.80, total rewards $81,655.80", () => {
    // Wages 100,000; pre-tax 401(k) 6,000; premium 1,200 via section 125.
    // Federal: AGI 92,800, taxable 76,700 -> 1,240 + 4,560 + 22% x 26,300 = 11,586.
    // FICA on 98,800 (401(k) doesn't lower it; the premium does): 6,125.60 + 1,432.60 = 7,558.20. Tax 19,144.20.
    // After-tax comp = 100,000 - 19,144.20 - 1,200 premium = 79,655.80. Take-home = - 6,000 deferral = 73,655.80.
    // Total rewards = 79,655.80 + 3,000 match - 1,500 OOP + 500 employer HSA = 81,655.80.
    // Hours 45 x 50 = 2,250: 79,655.80 / 2,250 = 35.40; 81,655.80 / 2,250 = 36.29.
    const y = oneYear({
      ...jan, retirement: match50to6, hours: { weekly: all(45) },
      health: { premium: 1_200, outOfPocket: { low: 500, medium: 1_500, high: 4_000 }, oopMax: 4_000, employerHsa: 500 },
    });
    expect(y.tax).toBe(19_144.2);
    expect(y.afterTaxComp).toBe(79_655.8);
    expect(y.takeHome).toBe(73_655.8);
    expect(y.retirement).toEqual({ employee: 6_000, employerCredited: 3_000, employerVested: 3_000 });
    expect(y.health).toEqual({ premiums: 1_200, outOfPocket: 1_500, employerHsa: 500, employeeHsa: 0, net: 2_200 });
    expect(y.totalRewards).toBe(81_655.8);
    expect(y.hours).toBe(2_250);
    expect(y.hourly).toEqual({ afterTaxComp: 35.4, totalRewards: 36.29 });
  });
  it("expected out-of-pocket is capped at the out-of-pocket max", () => {
    const y = oneYear({ ...jan, health: { premium: 0, outOfPocket: { low: 0, medium: 0, high: 9_000 }, oopMax: 4_000 } });
    expect(y.health.outOfPocket).toBe(0);
    const high = projectScenario({ ...jan, health: { premium: 0, outOfPocket: { low: 0, medium: 0, high: 9_000 }, oopMax: 4_000 } },
      { ...single, healthUsage: "high" }, { years: 1 }).employmentYears[0];
    expect(high.health.outOfPocket).toBe(4_000);
  });

  const cliffA: OfferInput = {
    label: "A", residence: { state: "TX" }, employerState: "TX", startDate: "2026-07-13", salary: { annual: 110_000 },
    retirement: { ...match50to6, vesting: { kind: "cliff", years: 3 } },
  };
  const vestedAt = (o: OfferInput, leaveDate: string) => {
    const r = projectScenario({ ...o, leaveDate }, single);
    return { vested: r.benefitEvents.reduce((s, b) => s + (b.vested ?? 0), 0), forfeited: r.leave!.retirementForfeited };
  };
  it("3-year cliff: leaving the day before the 3rd anniversary vests $9,900; a day earlier forfeits $9,891.13", () => {
    // Match = 50% x 6% = 3% of salary. 36 months x $9,166.67 x 3% = 9,900. Leaving 2029-07-11 loses
    // one day of July: 9,900 - 3% x 9,166.67 x 1/31 = 9,891.13, and only 2 years are complete.
    expect(vestedAt(cliffA, "2029-07-12")).toEqual({ vested: expect.closeTo(9_900, 2), forfeited: 0 });
    expect(vestedAt(cliffA, "2029-07-11")).toEqual({ vested: 0, forfeited: 9_891.13 });
  });
  it("graded vesting: 20% after 2 years, 40% after 3, by completed years at the leave date", () => {
    const graded: OfferInput = { ...cliffA, retirement: { ...match50to6, vesting: { kind: "graded",
      steps: [{ years: 2, pct: 0.2 }, { years: 3, pct: 0.4 }, { years: 4, pct: 0.6 }, { years: 5, pct: 0.8 }, { years: 6, pct: 1 }] } } };
    expect(vestedAt(graded, "2029-07-12").vested).toBeCloseTo(3_960, 2); // 40% x 9,900
    expect(vestedAt(graded, "2028-07-12").vested).toBeCloseTo(1_320, 2); // 20% x 6,600 (24 months)
    expect(vestedAt(graded, "2028-07-11").vested).toBe(0); // 1 year complete
  });
  it("staying through the window counts the vested share at its end; a 5-year window clears a 3-year cliff", () => {
    const r = projectScenario(cliffA, single);
    expect(r.employmentYears[0].retirement.employerVested).toBe(r.employmentYears[0].retirement.employerCredited);
    const short = projectScenario(cliffA, single, { years: 2 });
    expect(short.employmentYears[0].retirement.employerVested).toBe(0);
  });
  it("402(g) cap: $600k at 6% stops deferring in September, so the per-paycheck match stops too", () => {
    // $50,000 a month x 6% = 3,000; Jan-Aug 24,000, Sep 500 to reach 24,500. Match (100% of 3% + 50%
    // of the next 2%): 4% x 50,000 = 2,000 x 8 = 16,000, plus 1% x 50,000 = 500 in Sep = 16,500.
    const y = oneYear({ ...jan, salary: { annual: 600_000 },
      retirement: { contributionPct: 0.06, match: [{ upToPct: 0.03, rate: 1 }, { upToPct: 0.05, rate: 0.5 }] } });
    expect(y.retirement).toEqual({ employee: 24_500, employerCredited: 16_500, employerVested: 16_500 });
  });
  it("Roth deferrals don't lower taxable wages; pre-tax ones do", () => {
    const tax = (type: "pretax" | "roth") => oneYear({ ...jan, retirement: { contributionPct: 0.06, type } }).tax;
    expect(tax("roth") - tax("pretax")).toBeCloseTo(0.22 * 6_000, 1);
  });
  it("HSA: yours are capped at the limit less the employer's $1,000: $3,400 in 2026", () => {
    const r = projectScenario({ ...jan, health: { premium: 0, outOfPocket: { low: 0, medium: 0, high: 0 }, oopMax: 0,
      employeeHsa: 4_000, employerHsa: 1_000 } }, single, { years: 1 });
    expect(r.employmentYears[0].health).toMatchObject({ employeeHsa: 3_400, employerHsa: 1_000, net: -1_000 });
    expect(r.calendarYears[0].withOffer.input.section125).toBeCloseTo(3_400, 6);
  });
  it("perks: capped at $5,250 and $340/month, worth face / (1 - 29.65%) pre-tax", () => {
    // TX at $100k: 22% federal + 7.65% FICA marginal. 5,250 + 12 x 340 = 9,330; 9,330 / 0.7035 = 13,262.26.
    const r = projectScenario({ ...jan, perks: { section127: 6_000, commuterMonthly: 400 } }, single, { years: 1 });
    expect(r.calendarYears[0].withOffer.result.marginalRate).toBeCloseTo(0.2965, 10);
    expect(r.employmentYears[0].perks).toEqual({ face: 9_330, preTaxEquivalent: 13_262.26 });
    expect(r.warnings).toHaveLength(2);
  });
  it("hours prorate when you leave mid-year: 45 x 50 x 181/365 = 1,115.75", () => {
    const y = projectScenario({ ...jan, hours: { weekly: all(45) }, leaveDate: "2026-06-30" }, single, { years: 1 }).employmentYears[0];
    expect(y.hours).toBe(1_115.75);
    expect(y.hourly!.afterTaxComp).toBeCloseTo(y.afterTaxComp / 1_115.75, 2);
  });
  it("breakeven on total rewards adds the match, grossed up, to the cash breakeven", () => {
    // A defers 6% pre-tax with a 3% match; B has no plan. Cash: B needs Delta x (1 - 29.65%) = 22% x 6,000
    // -> 1,876.33 a year. Total rewards adds 3,000 / 0.7035 = 4,264.39 -> 6,140.72.
    const A = { ...jan, retirement: match50to6 };
    const opts = { valuationDate: "2026-01-01" };
    expect(breakeven(A, jan, "salary", single, opts).increase).toBeCloseTo(1_876.33, 1);
    const tr = breakeven(A, jan, "salary", single, { ...opts, basis: "totalRewards" });
    expect(tr).toMatchObject({ basis: "totalRewards" });
    expect(tr.increase).toBeCloseTo(6_140.72, 1);
  });
  it("premiums are a cost on the cash basis: a $1,200 pre-tax premium needs exactly $1,200 more salary", () => {
    // Pre-tax, the premium saves P x marginal in tax, so after-tax comp falls by P x (1 - m); a raise
    // of D adds D x (1 - m). Tie at D = P.
    const withPremium = { ...jan, health: { premium: 1_200, outOfPocket: { low: 0, medium: 0, high: 0 }, oopMax: 0 } };
    expect(breakeven(jan, withPremium, "salary", single, { valuationDate: "2026-01-01" }).increase).toBeCloseTo(1_200, 0);
  });
  it("take-home also nets out your HSA contributions", () => {
    const y = oneYear({ ...jan, health: { premium: 0, outOfPocket: { low: 0, medium: 0, high: 0 }, oopMax: 0, employeeHsa: 2_000 } });
    expect(y.takeHome).toBeCloseTo(y.afterTaxComp - 2_000, 2);
  });

  // A at 80 hours a week, 50 weeks: 4,000 hours a year, accruing evenly.
  const hoursA: OfferInput = { ...cliffA, hours: { weekly: all(80) } };
  const planYear: OfferInput = { ...hoursA, retirement: { ...hoursA.retirement!, vestingService: "planYearHours" } };
  it("plan-year hours: A vests on 2028-04-01, when 2028 reaches 1,000 hours (hand-checked)", () => {
    // 2026 (Jul 13-Dec 31): 4,000 x 172/365 = 1,885 hours. 2027: 4,000. 2028 is a leap year:
    // 4,000 x 91/366 = 994.5 hours through Mar 31, 1,005.5 through Apr 1. The 3rd year is credited
    // on Apr 1 even though 2028 hasn't ended (29 CFR 2530.200b-1), so the 3-year cliff vests then.
    // Match credited by then: 3% x (9,166.67 x (19/31 + 20 + 1/30) = 189,257.17) = 5,677.72.
    expect(vestedAt(planYear, "2028-03-31").vested).toBe(0);
    expect(vestedAt(planYear, "2028-04-01")).toEqual({ vested: expect.closeTo(5_677.72, 1), forfeited: 0 });
  });
  it("the same leave dates under elapsed time: nothing vests until the day before the 3rd anniversary", () => {
    expect(vestedAt(hoursA, "2028-04-01").vested).toBe(0);
    expect(vestedAt(hoursA, "2029-07-11").vested).toBe(0);
    expect(vestedAt(hoursA, "2029-07-12").vested).toBeCloseTo(9_900, 2);
  });
  it("plan-year hours needs hours, and part-time years under 1,000 hours don't count", () => {
    expect(() => projectScenario({ ...cliffA, retirement: { ...cliffA.retirement!, vestingService: "planYearHours" } }, single)).toThrow(/hours/);
    // 19 hours x 50 weeks = 950 a year: never a year of service.
    expect(vestedAt({ ...planYear, hours: { weekly: all(19) } }, "2031-07-12").vested).toBe(0);
  });
  it("leaveDateSweep reports vested retirement money: the cliff shows at 36 months", () => {
    const rows = leaveDateSweep(cliffA, single, [35, 36]);
    expect(rows.map((r) => Math.round(r.retirementVested))).toEqual([0, 9_900]);
  });
});

describe("cost of living (BEA RPPs)", () => {
  it("baked data: 2024 RPPs, U.S. all items = 100, the sample metros present", () => {
    expect(RPP.dataYear).toBe(2024);
    expect(RPP.vintage).toMatch(/February 19, 2026/);
    expect(rppArea("00000").allItems).toBe(100);
    expect(Object.keys(RPP.areas).length).toBeGreaterThan(500);
    expect(rppArea("35620").name).toMatch(/^New York-Newark-Jersey City/);
    expect(findRppAreas("charlotte-concord")).toEqual([expect.objectContaining({ code: "16740", kind: "msa" })]);
    expect(() => rppArea("99999")).toThrow(/Unknown BEA RPP area/);
  });
  it("city picker: every metro and each state's area outside metros, with the states each lies in", () => {
    expect(areaStates("35620")).toEqual(["NY", "NJ"]);
    expect(areaStates("16740")).toEqual(["NC", "SC"]);
    expect(areaStates("14860")).toEqual(["CT"]); // BEA names this one without parentheses
    expect(areaStates("37999")).toEqual(["NC"]);
    const options = cityOptions();
    expect(options.filter((o) => rppArea(o.code).kind === "msa")).toHaveLength(387);
    expect(options).toContainEqual({ code: "37999", name: "North Carolina, outside metro areas", states: ["NC"] });
    expect(options.every((o) => o.states.length > 0)).toBe(true);
    // The UI's slim list (src/col/cities.json) is generated from the same data: run `npm run build-cities` if this fails.
    expect(cities.cities).toEqual(options);
    expect([cities.rppDataYear, cities.fmrFiscalYear]).toEqual([RPP.dataYear, FMR.fiscalYear]);
  });
  it("non-housing RPP backs housing out at BEA's 16% weight: U.S. 99.8802, Charlotte 97.2933", () => {
    // (100 - 0.16 x 100.629) / 0.84 and (97.348 - 0.16 x 97.635) / 0.84.
    expect(nonHousingRpp(rppArea("00000"))).toBeCloseTo(99.88019, 4);
    expect(nonHousingRpp(rppArea("16740"))).toBeCloseTo(97.29333, 4);
  });

  const clt: OfferInput = {
    label: "CLT", residence: { state: "NC" }, employerState: "NC", startDate: "2026-01-01", salary: { annual: 100_000 },
    costOfLiving: { area: "16740", monthlyRent: 1_700 },
  };
  const saver: Household = { filingStatus: "single", costOfLiving: { savingsRate: 0.1 } };

  it("Charlotte end to end, hand-checked: $47,728.86 left after savings and rent = $48,997.88 in U.S. dollars", () => {
    // Tax: federal 13,170 + FICA 7,650 + NC 3.99% x (100,000 - 12,750) = 3,481.275 -> 24,301.275
    // (floating point rounds the half cent down: 24,301.27). Take-home 75,698.73.
    // Savings 10% = 7,569.873; rent 12 x 1,700 = 20,400; non-housing 47,728.857 (local dollars).
    // Factor = U.S. non-housing 99.8802 / Charlotte 97.2933 = 1.026588 -> 48,997.883 U.S. dollars.
    // With no benefits, the COL-adjusted total just adds the savings back at face value:
    // 48,997.883 + 7,569.873 = 56,567.76.
    const r = projectScenario(clt, saver, { years: 1 });
    const y = r.employmentYears[0];
    expect(y.tax).toBe(24_301.27);
    expect(y.takeHome).toBe(75_698.73);
    expect(y.costOfLiving).toEqual({ savings: 7_569.87, rent: 20_400, nonHousingLocal: 47_728.86, discretionaryReference: 48_997.88,
      outOfPocketReference: 0, faceValue: 7_569.87, total: 56_567.76 });
    expect(r.costOfLiving!.nonHousingFactor).toBeCloseTo(99.88019 / 97.29333, 6);
    expect(r.costOfLiving).toMatchObject({ monthlyRent: 1_700, rentSource: "input", savingsRate: 0.1,
      area: { code: "16740", nonHousing: 97.293 }, reference: { code: "00000", nonHousing: 99.88 } });
    expect(r.window.costOfLiving!.nominal).toEqual(y.costOfLiving);
  });
  it("gross pay is never adjusted: the same offer without cost of living has identical pay and tax", () => {
    const a = projectScenario(clt, saver, { years: 1 }).employmentYears[0];
    const b = projectScenario({ ...clt, costOfLiving: undefined }, saver, { years: 1 }).employmentYears[0];
    expect([a.gross, a.tax, a.takeHome]).toEqual([b.gross, b.tax, b.takeHome]);
  });
  it("rent left blank defaults to HUD's FY2027 Fair Market Rent for the metro: Charlotte $1,640 (1 bedroom)", () => {
    // HUD FY27_FMRs.xlsx, Charlotte-Concord-Gastonia, NC-SC HUD Metro FMR Area: studio 1,574, 1 bedroom 1,640.
    const r = projectScenario({ ...clt, costOfLiving: { area: "16740" } }, single, { years: 1 });
    expect(r.costOfLiving).toMatchObject({ monthlyRent: 1_640, rentSource: "fmr",
      rentEstimate: { source: "fmr", hudArea: "METRO16740M16740", bedrooms: 1, fiscalYear: 2027 } });
    expect(r.employmentYears[0].costOfLiving!.rent).toBe(12 * 1_640);
    const studio = projectScenario({ ...clt, costOfLiving: { area: "16740" } },
      { filingStatus: "single", costOfLiving: { fmrBedrooms: 0 } }, { years: 1 });
    expect(studio.costOfLiving!.monthlyRent).toBe(1_574);
    // An entered rent always wins.
    expect(projectScenario(clt, single, { years: 1 }).costOfLiving).toMatchObject({ monthlyRent: 1_700, rentSource: "input" });
  });
  it("HUD FMR areas for the sample metros: the area with most of the metro's people, in your state when it spans states", () => {
    // New York metro: seven FMR areas; New York, NY HMFA (9.9M people) for NY, Newark (2.1M, the largest
    // NJ area) for an NJ resident. Seattle metro: Seattle-Bellevue (3.1M) over Tacoma (0.9M).
    expect(estimateRent("35620", "NY")).toMatchObject({ monthlyRent: 2_729, hudAreaName: "New York, NY HUD Metro FMR Area" });
    expect(estimateRent("35620", "NJ")).toMatchObject({ monthlyRent: 1_850, hudAreaName: "Newark, NJ HUD Metro FMR Area" });
    expect(estimateRent("42660", "WA")).toMatchObject({ monthlyRent: 2_180, hudAreaName: "Seattle-Bellevue, WA HUD Metro FMR Area" });
    expect(estimateRent("42660", "WA", { bedrooms: 0 }).monthlyRent).toBe(2_091);
    // Charlotte's main FMR area includes York County, SC, so it's the largest one for an SC resident too.
    expect(fmrArea("16740", "SC")!.name).toBe("Charlotte-Concord-Gastonia, NC-SC HUD Metro FMR Area");
  });
  it("areas without an FMR fall back to BEA housing prices: NC nonmetro $881.08 from the U.S. median (hand-checked)", () => {
    // Every BEA metro has an FMR area; state nonmetro portions don't. U.S. median gross rent 1,487 (ACS 2024,
    // B25064) x NC nonmetro housing 59.625 / U.S. housing 100.629 = 881.08.
    expect(estimateRent("37999", "NC")).toMatchObject({ source: "derived", anchorRent: 1_487, anchorArea: "00000",
      monthlyRent: expect.closeTo(881.08, 2) });
    // With your own rent at a reference location: 1,500 in Charlotte (housing 97.635) -> 1,500 x 59.625 / 97.635.
    expect(estimateRent("37999", "NC", { anchorRent: 1_500, anchorArea: "16740" }).monthlyRent).toBeCloseTo(916.04, 2);
    expect(US_MEDIAN_GROSS_RENT).toBe(1_487);
    expect(FMR).toMatchObject({ fiscalYear: 2027, effective: "2026-10-01" });
  });
  it("with Charlotte as the reference, the factor is 1 and dollars stay local", () => {
    const r = projectScenario(clt, { filingStatus: "single", costOfLiving: { reference: "16740" } }, { years: 1 });
    expect(r.costOfLiving!.nonHousingFactor).toBe(1);
    expect(r.employmentYears[0].costOfLiving!.discretionaryReference).toBe(r.employmentYears[0].costOfLiving!.nonHousingLocal);
  });

  // TX, calendar 2026, every benefit flow: 401(k) 6% pre-tax with a 3% match, premium 1,200,
  // OOP 1,500, your HSA 1,000, employer HSA 500, Section 127 2,000. Rent 1,500 in Dallas.
  const all = (v: number) => ({ bear: v, base: v, bull: v });
  const dallas: OfferInput = {
    label: "DAL", residence: { state: "TX" }, employerState: "TX", startDate: "2026-01-01", salary: { annual: 100_000 },
    retirement: { contributionPct: 0.06, match: [{ upToPct: 0.06, rate: 0.5 }] },
    health: { premium: 1_200, outOfPocket: { low: 500, medium: 1_500, high: 4_000 }, oopMax: 4_000, employeeHsa: 1_000, employerHsa: 500 },
    perks: { section127: 2_000 }, hours: { weekly: all(45) },
    costOfLiving: { area: "19100", monthlyRent: 1_500 },
  };
  it("COL-adjusted total, Dallas, hand-checked: $65,771.03 = discretionary $47,469.90 - OOP $1,494.11 + face $19,795.23", () => {
    // Federal: AGI 100,000 - 6,000 401(k) - 2,200 section 125 = 91,800; taxable 75,700 -> 1,240 + 4,560
    // + 22% x 25,300 = 11,366. FICA 7.65% x 97,800 = 7,481.70. After-tax comp = 100,000 - 18,847.70 - 1,200
    // = 79,952.30; take-home = - 6,000 - 1,000 = 72,952.30. Savings 10% = 7,295.23; rent 18,000;
    // local non-housing 47,657.07. Factor = U.S. 99.88019 / Dallas 100.27400 = 0.996073:
    // discretionary 47,469.90, out-of-pocket 1,500 -> 1,494.11. Face: 7,295.23 savings + 6,000 + 1,000
    // yours + 3,000 match + 500 employer HSA + 2,000 perks = 19,795.23.
    const r = projectScenario(dallas, saver, { years: 1 });
    const y = r.employmentYears[0];
    expect(y.afterTaxComp).toBe(79_952.3);
    expect(y.costOfLiving).toEqual({ savings: 7_295.23, rent: 18_000, nonHousingLocal: 47_657.07, discretionaryReference: 47_469.9,
      outOfPocketReference: 1_494.11, faceValue: 19_795.23, total: 65_771.03 });
    // It reconciles with total rewards: 83,952.30 - rent 18,000 + (0.996073 - 1) x (47,657.07 - 1,500) = 65,771.03.
    expect(y.totalRewards).toBe(83_952.3);
    const f = r.costOfLiving!.nonHousingFactor;
    expect(y.totalRewards - y.costOfLiving!.rent + (f - 1) * (y.costOfLiving!.nonHousingLocal - y.health.outOfPocket))
      .toBeCloseTo(y.costOfLiving!.total, 2);
  });
  it("at a factor of 1 with no rent, the COL-adjusted total equals total rewards, whatever the savings rate", () => {
    for (const savingsRate of [0, 0.25]) {
      const r = projectScenario({ ...dallas, costOfLiving: { area: "19100", monthlyRent: 0 } },
        { filingStatus: "single", costOfLiving: { reference: "19100", savingsRate } }, { years: 1 });
      expect(r.employmentYears[0].costOfLiving!.total).toBeCloseTo(r.employmentYears[0].totalRewards, 2);
    }
  });
  it("PV of the COL-adjusted total discounts each flow by its date; at 0% it equals nominal", () => {
    const r = projectScenario(dallas, saver, { years: 1, valuationDate: "2026-01-01" });
    expect(r.window.costOfLiving!.presentValue!.total).toBeLessThan(r.window.costOfLiving!.nominal.total);
    const flat = projectScenario(dallas, saver, { years: 1, valuationDate: "2026-01-01", discountRate: 0 });
    expect(flat.window.costOfLiving!.presentValue).toEqual(flat.window.costOfLiving!.nominal);
  });

  // Charlotte from 2026-07-13: the lease runs from the start date, so rent steps up each July 13.
  const july: OfferInput = { ...clt, startDate: "2026-07-13" };
  const rents = (o: OfferInput, years = 5) => projectScenario(o, single, { years }).employmentYears.map((y) => y.costOfLiving!.rent);
  it("rent grows at the inflation input by default: $20,400, then x 1.025 each lease year (hand-checked)", () => {
    // Year 1: 1,700 x (19/31 + 11 + 12/31) = 20,400. Year 2: 20,400 x 1.025 = 20,910.
    // Window: 20,400 x (1 + 1.025 + 1.025^2 + 1.025^3 + 1.025^4 = 5.256329) = 107,229.10.
    expect(rents(july)).toEqual([20_400, 20_910, 21_432.75, 21_968.57, 22_517.78]);
    const r = projectScenario(july, single, { years: 5 });
    expect(r.window.costOfLiving!.nominal.rent).toBe(107_229.1);
    expect(r.costOfLiving).toMatchObject({ rentGrowth: 0.025, rentGrowthSource: "inflation" });
    expect(projectScenario(july, single, { years: 1, inflation: 0.04 }).costOfLiving!.rentGrowth).toBe(0.04);
  });
  it("an entered rent growth overrides inflation; 0 holds rent flat", () => {
    expect(rents({ ...july, costOfLiving: { area: "16740", monthlyRent: 1_700, rentGrowth: 0.03 } }, 2)).toEqual([20_400, 21_012]);
    expect(rents({ ...july, costOfLiving: { area: "16740", monthlyRent: 1_700, rentGrowth: 0 } }, 3)).toEqual([20_400, 20_400, 20_400]);
    expect(() => rents({ ...july, costOfLiving: { area: "16740", monthlyRent: 1_700, rentGrowth: -1 } })).toThrow(/Rent growth/);
  });
  it("rent at the lease anniversary: leaving the day before pays no year-2 rent; the day of pays 1 day at $1,742.50", () => {
    // 1,700 x 1.025 = 1,742.50 a month; one day of July = 1,742.50 / 31 = 56.21.
    expect(rents({ ...july, leaveDate: "2027-07-12" }, 2)).toEqual([20_400, 0]);
    expect(rents({ ...july, leaveDate: "2027-07-13" }, 2)).toEqual([20_400, 56.21]);
  });
  it("breakeven on the COL-adjusted total: Dallas vs NYC prices, same TX taxes, needs +$13,230.95 (hand-checked)", () => {
    // Both TX residents at $100,000 (take-home 79,180; marginal 22% + 7.65% = 29.65%), no savings. A pays
    // 1,500 rent in Dallas, B 2,000 in NYC. COL totals: A = 61,180 x fA; B = (55,180 + 0.7035 D) x fB.
    // Tie: D = (61,180 x fA / fB - 55,180) / 0.7035, with fA / fB = NYC 105.69576 / Dallas 100.27400 = 1.054069
    // -> 13,230.95. Every month is identical, so discounting doesn't move the tie.
    const tx = (area: string, monthlyRent: number): OfferInput => ({ label: area, residence: { state: "TX" }, employerState: "TX",
      startDate: "2026-01-01", salary: { annual: 100_000 }, costOfLiving: { area, monthlyRent } });
    const opts = { valuationDate: "2026-01-01", horizonYears: 1, years: 1 };
    const r = breakeven(tx("19100", 1_500), tx("35620", 2_000), "salary", single, { ...opts, basis: "colAdjustedTotal" });
    expect(r.basis).toBe("colAdjustedTotal");
    expect(r.increase).toBeCloseTo(13_230.95, 1);
    // On the cash basis the two are identical.
    expect(breakeven(tx("19100", 1_500), tx("35620", 2_000), "salary", single, opts).increase).toBeCloseTo(0, 1);
    expect(() => breakeven(tx("19100", 1_500), { ...tx("35620", 0), costOfLiving: undefined }, "salary", single,
      { ...opts, basis: "colAdjustedTotal" })).toThrow(/costOfLiving/);
  });
});

describe("cliffs and the next cliff (roadmap 7)", () => {
  const tx = (o: Partial<OfferInput>): OfferInput =>
    ({ label: "T", residence: { state: "TX" }, employerState: "TX", startDate: "2026-01-01", salary: { annual: 120_000 }, ...o });
  const flat = { inflation: 0 }; // 2027 law = 2026 law (bar SALT), so 2027 is hand-checkable

  it("bonus cliff: leaving Mar 1 vs Mar 15, 2027 forfeits a $12,000 bonus; staying is worth $13,434.26 (hand-checked)", () => {
    // Fixed $12,000 bonus for calendar 2026, paid Mar 15, 2027; you must be employed that day.
    // Leave Mar 1: 2027 wages 20,000 + 10,000 x 1/31 = 20,322.58; tax 10% x 4,222.58 + 7.65% = 1,976.94.
    // Leave Mar 15: 20,000 + 10,000 x 15/31 + 12,000 = 36,838.71; tax 1,240 + 12% x 8,338.71 + 7.65% = 5,058.81.
    // Value of staying = (36,838.71 - 5,058.81) - (20,322.58 - 1,976.94) = 13,434.26. The bonus itself,
    // at 2027's average offer rate (5,058.81 / 36,838.71): 12,000 x (1 - 13.732%) = 10,352.12.
    const o = tx({ bonus: { basis: "fixed", amount: { bear: 12_000, base: 12_000, bull: 12_000 }, payOn: { month: 3, day: 15 } } });
    const r = nextCliff(o, single, "2027-03-01", flat);
    expect(r.next).toMatchObject({ date: "2027-03-15", daysAway: 14, cliffs: [{ kind: "bonus", amount: 12_000 }] });
    expect(r.next!.valueOfStaying.afterTaxComp).toBeCloseTo(13_434.26, 1);
    expect(r.next!.valueOfStaying.totalRewards).toBeCloseTo(13_434.26, 1);
    expect(r.next!.cliffValue).toBeCloseTo(10_352.12, 1);
    // The day before vs the day of: on Mar 15 itself the bonus is kept, so the next cliff is a year on.
    expect(nextCliff(o, single, "2027-03-14", flat).next!.date).toBe("2027-03-15");
    expect(nextCliff(o, single, "2027-03-15", flat).next!.date).toBe("2028-03-15");
  });

  // $60,000 salary; a $12,000 sign-on paid on the start date, repaid by uncompleted months over 12.
  const signOn = tx({ salary: { annual: 60_000 }, cashAwards: [{ label: "Sign-on", amount: 12_000, paidOn: "2026-01-01",
    clawback: { months: 12, kind: "prorated" } }] });
  it("prorated clawback: a $1,000 step at each month's end, cleared on Dec 31", () => {
    const c = cliffs(signOn, single, flat).filter((x) => x.kind.startsWith("clawback"));
    expect(c.map((x) => x.date).slice(0, 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(c).toHaveLength(12);
    expect(c.every((x) => x.amount === 1_000)).toBe(true);
    expect(c[11]).toMatchObject({ date: "2026-12-31", kind: "clawbackCleared" });
  });
  it("next cliff from Mar 15: the Mar 31 step saves $823.50 net; staying is worth $3,116.73 (hand-checked)", () => {
    // Same-year repayment reverses wages, so the net cost is the repayment less the tax on it.
    // Leave Mar 30: owe 10/12 = 10,000; wages 10,000 + 5,000 x 30/31 + 12,000 - 10,000; relief = 10% + 7.65%
    // of 10,000 (all in the 10% bracket) = 1,765 -> net 8,235. Leave Mar 31: owe 9,000; relief 1,588.50 -> 7,411.50.
    // Saved: 823.50. Kept: Mar 15 wages 14,419.35, FICA only (under the standard deduction): 13,316.27;
    // Mar 31 wages 18,000, tax 190 + 1,377: 16,433. Difference 3,116.73.
    const r = nextCliff(signOn, single, "2026-03-15", flat);
    expect(r.next).toMatchObject({ date: "2026-03-31", daysAway: 16, cliffs: [{ kind: "clawbackStep", amount: 1_000 }] });
    expect(r.next!.cliffValue).toBeCloseTo(823.5, 1);
    expect(r.next!.valueOfStaying.afterTaxComp).toBeCloseTo(3_116.73, 1);
  });
  it("401(k) cliff vesting: 2029-07-12 under elapsed time, 2028-04-01 under plan-year hours", () => {
    // Same plan as the vesting tests above: 3% of $110,000 a year, 3-year cliff.
    const A: OfferInput = { label: "A", residence: { state: "TX" }, employerState: "TX", startDate: "2026-07-13",
      salary: { annual: 110_000 }, retirement: { contributionPct: 0.06, match: [{ upToPct: 0.06, rate: 0.5 }], vesting: { kind: "cliff", years: 3 } },
      hours: { weekly: { bear: 80, base: 80, bull: 80 } } };
    const vest = (o: OfferInput) => cliffs(o, single).filter((c) => c.kind === "retirementVest");
    expect(vest(A)).toEqual([expect.objectContaining({ date: "2029-07-12", amount: expect.closeTo(9_900, 1) })]);
    const planYear = { ...A, retirement: { ...A.retirement!, vestingService: "planYearHours" as const } };
    expect(vest(planYear)).toEqual([expect.objectContaining({ date: "2028-04-01", amount: expect.closeTo(5_677.72, 1) })]);
    expect(nextCliff(A, single, "2029-07-12").next).toBeNull();
  });
  it("sample A (illustrative): leaving Jan 12, 2027, the first bonus is 19 days away; staying is worth $29,970", () => {
    // The bonus is taxed at 2027's average offer rate in the stay-until-Jan-31 projection, where 2027
    // has one month of salary: $26,057 of the $32,986 bonus is kept, more than in a full year there.
    const r = nextCliff(SAMPLE_OFFERS[0], SAMPLE_HOUSEHOLD, "2027-01-12", { inflation: 0.025 });
    expect(r.next).toMatchObject({ date: "2027-01-31", daysAway: 19, cliffs: [{ kind: "bonus", amount: 32_986.3 }] });
    expect(Math.round(r.next!.valueOfStaying.afterTaxComp)).toBe(29_970);
    expect(Math.round(r.next!.cliffValue)).toBe(26_057);
  });
});

describe("withholding vs liability (roadmap 5)", () => {
  const tx = (o: Partial<OfferInput>): OfferInput =>
    ({ label: "T", residence: { state: "TX" }, employerState: "TX", startDate: "2026-01-01", salary: { annual: 120_000 }, ...o });
  const y2026 = (o: OfferInput) => withholdingShortfall(o, single, { years: 1 }).years.find((y) => y.year === 2026)!;

  it("a July start is over-withheld: $8,785 withheld on $5,020 of tax, a $3,765 refund (hand-checked)", () => {
    // Each $10,000 month is withheld as if it were $120,000 a year: tax on 103,900 = 1,240 + 4,560
    // + 22% x 53,500 = 17,570, / 12 = 1,464.17, x 6 months = 8,785. Owed on 60,000: taxable 43,900
    // -> 1,240 + 12% x 31,500 = 5,020.
    const y = y2026(tx({ startDate: "2026-07-01" }));
    expect(y).toEqual({ year: 2026, federalIncomeTax: 5_020, withheld: { regular: 8_785, supplemental: 0, total: 8_785 }, balanceDue: -3_765 });
  });
  it("a $50,000 sign-on in the 24% bracket, withheld at 22%: $1,000 due in April (hand-checked)", () => {
    // Owed on 200,000: taxable 183,900 -> 5,800 + 22% x 55,300 + 24% x 78,200 = 36,734. Salary alone:
    // taxable 133,900 -> 24,734 withheld. Sign-on: 22% x 50,000 = 11,000. Due: 2% x 50,000 = 1,000.
    const o = tx({ salary: { annual: 150_000 }, cashAwards: [{ label: "Sign-on", amount: 50_000, paidOn: "2026-06-30" }] });
    expect(y2026(o)).toEqual({ year: 2026, federalIncomeTax: 36_734,
      withheld: { regular: 24_734, supplemental: 11_000, total: 35_734 }, balanceDue: 1_000 });
    const w = withholdingShortfall(o, single, { years: 1 }).warnings;
    expect(w).toHaveLength(1);
    expect(w).toEqual([{ code: "withholdingShortfall", params: { year: 2026, balanceDue: expect.closeTo(1_000, 6), supplemental: true } }]);
    expect(formatWarning(w[0])).toMatch(/\$1,000 short.*22% supplemental.*April 2027/);
  });
  it("supplemental pay over $1 million is withheld at 37%: $1.2M -> 220,000 + 74,000", () => {
    const o = tx({ salary: { annual: 100_000 }, cashAwards: [{ label: "Award", amount: 1_200_000, paidOn: "2026-06-30" }] });
    expect(y2026(o).withheld.supplemental).toBe(294_000);
  });
  it("pre-tax 401(k) deferrals lower salary withholding the way they lower the tax: nothing due", () => {
    // 10% deferred: $9,000 a month taxable -> 108,000 a year -> tax on 91,900 = 5,800 + 22% x 41,500 = 14,930.
    const y = y2026(tx({ retirement: { contributionPct: 0.1 } }));
    expect(y.withheld.regular).toBe(14_930);
    expect(y.federalIncomeTax).toBe(14_930);
    expect(y.balanceDue).toBe(0);
  });
});

describe("stay length: window hours, per month, and the horizon sweep", () => {
  const all = (v: number) => ({ bear: v, base: v, bull: v });
  const tx = (o: Partial<OfferInput>): OfferInput =>
    ({ label: "T", residence: { state: "TX" }, employerState: "TX", startDate: "2026-01-01", salary: { annual: 100_000 }, ...o });

  it("per month is the level month-end amount with the same PV (hand-checked factor)", () => {
    // Month-ends of 2026 are days 30, 58, 89, ..., 364 after Jan 1; each is discounted (1.05)^-(days / 365.25).
    const days = [30, 58, 89, 119, 150, 180, 211, 242, 272, 303, 333, 364];
    const factor = days.reduce((s, d) => s + 1.05 ** (-d / 365.25), 0);
    expect(monthlyEquivalent(10_000, { start: "2026-01-01", years: 1 }, "2026-01-01")).toBeCloseTo(10_000 / factor, 9);
    expect(monthlyEquivalent(12_000, { start: "2026-01-01", years: 2 }, "2026-01-01", 0)).toBeCloseTo(500, 9);
  });
  it("window hours tie to the employment years, prorated where the window cuts one (hand-checked)", () => {
    // Same start: 45 x 50 = 2,250 hours; 79,655.80 / 2,250 = 35.40 an hour, as in the employment-year test.
    const everything = tx({ retirement: { contributionPct: 0.06, match: [{ upToPct: 0.06, rate: 0.5 }] }, hours: { weekly: all(45) },
      health: { premium: 1_200, outOfPocket: { low: 500, medium: 1_500, high: 4_000 }, oopMax: 4_000, employerHsa: 500 } });
    const w = projectScenario(everything, single, { years: 1 }).window;
    expect(w.hours).toBe(2_250);
    expect(w.perHour).toEqual({ afterTaxComp: 35.4, totalRewards: 36.29 });
    // A July start in a window from Jan 1, 2026 for 2 years: employment year 1 (365 days) is all inside,
    // 2,000 hours; year 2 runs Jul 1, 2027 to Jul 1, 2028 (366 days) with 184 inside: 2,000 x 184/366.
    const late = projectScenario(tx({ startDate: "2026-07-01", hours: { weekly: all(40) } }), single,
      { window: { start: "2026-01-01", years: 2 } }).window;
    expect(late.hours).toBeCloseTo(2_000 + (2_000 * 184) / 366, 2);
  });
  it("the winner flips with the stay: a bigger sign-on wins short stays, a bigger salary wins from 3 years (hand-checked)", () => {
    // TX, 0% inflation (2027-28 law = 2026's), 0% discount (PV = nominal). A: $110,000. B: $100,000 + $25,000 sign-on.
    // A a year: tax 15,370 + 8,415 -> 86,215. B in 2026: on 125,000, 5,800 + 22% x 55,300 + 24% x 3,200 = 18,734
    // + 9,562.50 -> 96,703.50; later years on 100,000: 13,170 + 7,650 -> 79,180.
    // 1 year: B by 10,488.50 (874.04 a month). 2 years: B by 175,883.50 - 172,430 = 3,453.50 (143.90 a month,
    // 1.96%: close). 3 years: A by 258,645 - 255,063.50 = 3,581.50 (99.49 a month, 1.38%: close).
    const A = tx({ salary: { annual: 110_000 } });
    const B = tx({ cashAwards: [{ label: "Sign-on", amount: 25_000, paidOn: "2026-01-31" }] });
    const h = horizonSweep([A, B], single, [1, 2, 3], { valuationDate: "2026-01-01", inflation: 0, discountRate: 0 });
    expect(h.rows.map((r) => r.leads.cash)).toEqual([
      { winner: 1, runnerUp: 0, margin: 10_488.5, perMonth: 874.04, share: expect.closeTo(10_488.5 / 96_703.5, 9), closeCall: false },
      { winner: 1, runnerUp: 0, margin: 3_453.5, perMonth: 143.9, share: expect.closeTo(3_453.5 / 175_883.5, 9), closeCall: true },
      { winner: 0, runnerUp: 1, margin: 3_581.5, perMonth: 99.49, share: expect.closeTo(3_581.5 / 258_645, 9), closeCall: true },
    ]);
    expect(h.rows[2].window).toEqual({ start: "2026-01-01", end: "2029-01-01" });
    expect(h.rows[0].leads.colAdjustedTotal).toBeUndefined(); // no costOfLiving
    expect(h.rows[0].leads.perHour).toBeUndefined(); // no hours
  });
  it("sample offers (illustrative): C leads after rent at U.S. prices at every stay; 5 years is a close call", () => {
    const h = horizonSweep(SAMPLE_OFFERS, SAMPLE_HOUSEHOLD, [2, 3, 4, 5], { inflation: 0.025, valuationDate: "2026-07-13" });
    expect(h.perHourOf).toBe("colAdjustedTotal");
    expect(h.rows.map((r) => [r.leads.colAdjustedTotal!.winner, Math.round(r.leads.colAdjustedTotal!.perMonth!), r.leads.colAdjustedTotal!.closeCall]))
      .toEqual([[2, 722, false], [2, 665, false], [2, 487, false], [2, 155, true]]);
    expect(h.rows.map((r) => Math.round(r.leads.cash!.perMonth!))).toEqual([1_376, 1_177, 1_373, 1_733]);
    expect(h.rows[2].values.perHour).toEqual([21.85, 21.66, 41.32]);
  });
});

describe("input validation", () => {
  it("rejects start dates before 2026 and bad horizons", () => {
    expect(() => projectScenario({ ...worked, startDate: "2025-12-01" }, single)).toThrow(/2026/);
    expect(() => projectScenario(worked, single, { years: 0 })).toThrow();
  });
});
