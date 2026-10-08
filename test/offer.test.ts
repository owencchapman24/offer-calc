import { describe, expect, it } from "vitest";
import { computeTaxes, paramsForYear } from "../src/tax/index";
import {
  breakeven, byYear, compareOffers, convenienceRuleWarning, describeSchedule, leaveDateSweep, projectOffer,
  projectScenario, VESTING_PRESETS, type AnnualBonus, type Household, type OfferInput,
} from "../src/offer/index";
import { addMonths, fromDays, nextOccurrence, toDays } from "../src/offer/dates";
import { snapToVestDate } from "../src/offer/vesting";

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
    expect(rsus(r)[0].label).toContain("nominal 2027-08-03");
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
    expect(before.warnings.some((w) => w.includes("forfeits the bonus for 2026-01-01 to 2026-12-31"))).toBe(true);
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
    expect(c).toMatchObject({ fraction: 1 / 12, owed: 2_500, treatment: "no relief ($3,000 or less)", taxRelief: 0, netCost: 2_500 });
  });
  it("window edge, full kind: the day before owes all $30,000; 1341 credit $6,119.35 (crosses into 12%)", () => {
    // 2026 federal with the sign-on: taxable 75,593.548 -> 1,240 + 4,560 + 22% x 25,193.548 = 11,342.58.
    // Without $30,000: taxable 45,593.548 -> 1,240 + 12% x 33,193.548 = 5,223.23. Credit 6,119.35.
    expect(leaving("2027-08-02", clawback({ months: 12, kind: "full" })).leave!.clawbacks).toEqual([]);
    expect(leaving("2027-08-01", clawback({ months: 12, kind: "full" })).leave!.clawbacks[0])
      .toMatchObject({ owed: 30_000, treatment: "IRC 1341 credit", taxRelief: 6_119.35, netCost: 23_880.65 });
  });
  it("window edge, day proration: one unworked day owes $30,000 / 365", () => {
    expect(leaving("2027-08-01", clawback({ months: 12, kind: "prorated", per: "day" })).leave!.clawbacks[0].owed).toBe(82.19);
  });
  it("design §10: leave after 6 months owes $15,000; 1341 recovers 22% = $3,300; FICA isn't refunded", () => {
    const r = leaving("2027-02-02");
    expect(r.leave!.clawbacks[0]).toMatchObject({
      paidOn: "2026-09-02", repaidOn: "2027-02-02", fraction: 0.5, owed: 15_000,
      treatment: "IRC 1341 credit", taxRelief: 3_300, netCost: 11_700,
    });
    expect(r.calendarYears.find((c) => c.year === 2027)!.priorYearRepayments).toEqual({ repaid: 15_000, relief: 3_300 });
    expect(r.calendarYears[0].offerGross.cash).toBe(30_000); // 2026 wages (and FICA) stay
    expect(r.warnings.some((w) => w.includes("FICA withheld on it isn't automatically refunded"))).toBe(true);
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
      owed: 22_500, treatment: "same-year wage reversal", taxRelief: 5_730.92, netCost: 16_769.08,
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
    const kept = rows.map((r) => r.netKept);
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
    expect(r.window.nominal).toEqual({ gross: 10_000, tax: 765, net: 9_235 });
    expect(r.window.presentValue!.net).toBe(8_795.53);
    expect(r.events.find((e) => e.component === "cash")!.discountFactor).toBeCloseTo(1.05 ** (-365 / 365.25), 12);
  });
  it("a 0% discount rate gives PV = nominal; the default window is the employment-year horizon", () => {
    const r = projectScenario(worked, single, { ...valued, discountRate: 0 });
    expect(r.window.presentValue).toEqual(r.window.nominal);
    expect(r.window.nominal.net).toBeCloseTo(r.employmentYears.reduce((s, y) => s + y.net, 0), 1);
    expect(projectScenario(worked, single, valued).window.presentValue!.net).toBeLessThan(r.window.nominal.net);
  });
  it("projectOffer runs bear/base/bull together", () => {
    const p = projectOffer(worked, single, valued);
    const net = (s: "bear" | "base" | "bull") => p.scenarios[s].window.nominal.net;
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
    const pv = (o: OfferInput) => projectScenario(o, single, { ...valued, scenario: "base" }).window.presentValue!.net;
    expect(pv({ ...ca, salary: { annual: r.to } })).toBeCloseTo(r.targetPV, 0);
  });
  it("breakeven is negative when B is already ahead", () => {
    expect(breakeven(tx({}), tx({ salary: { annual: 110_000 } }), "salary", single, valued).increase).toBeCloseTo(-10_000, 1);
  });
});

describe("input validation", () => {
  it("rejects start dates before 2026 and bad horizons", () => {
    expect(() => projectScenario({ ...worked, startDate: "2025-12-01" }, single)).toThrow(/2026/);
    expect(() => projectScenario(worked, single, { years: 0 })).toThrow();
  });
});
