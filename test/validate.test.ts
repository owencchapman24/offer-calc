import { describe, expect, it } from "vitest";
import { type Household, type OfferInput, projectScenario, validateOffer } from "../src/offer/index";
import { formatIssue } from "../src/format/index";
import { SAMPLE_HOUSEHOLD, SAMPLE_OFFERS } from "../src/samples";

// validateOffer (engine item 7): every problem at once, each with the path of the field that caused it.
// Each case also runs the engine in all three scenarios: `engine: true` says projectScenario throws for
// it (the validator covers that throw, at the field), false that only the validator catches it.

const clone = (o: OfferInput): OfferInput => structuredClone(o);
const [A, , C] = SAMPLE_OFFERS;
const hh: Household = SAMPLE_HOUSEHOLD;

const engineThrows = (o: OfferInput, h: Household = hh) => (["bear", "base", "bull"] as const).some((scenario) => {
  try {
    projectScenario(o, h, { scenario });
    return false;
  } catch {
    return true;
  }
});

type Case = [name: string, base: OfferInput, edit: (o: OfferInput) => void, path: string, code: string, engine: boolean];

const cases: Case[] = [
  ["a blank salary", C, (o) => { o.salary.annual = Number.NaN; }, "salary.annual", "required", true],
  ["a negative salary", C, (o) => { o.salary.annual = -1; }, "salary.annual", "negative", true],
  ["a start before 2026", C, (o) => { o.startDate = "2025-12-01"; }, "startDate", "before2026", true],
  ["no such day", C, (o) => { o.startDate = "2026-02-30"; }, "startDate", "date", true],
  ["a leave date before the start", C, (o) => { o.leaveDate = "2026-07-12"; }, "leaveDate", "leaveBeforeStart", true],
  ["a bear raise of -100%", C, (o) => { o.salary.raise = { bear: -1, base: 0.03, bull: 0.03 }; }, "salary.raise.bear", "rate", true],
  ["a promotion on the start date", A, (o) => { o.salary.promotions![0].on = o.startDate; }, "salary.promotions.0.on", "notAfterStart", true],
  ["a promotion step-up of -100%", A, (o) => { o.salary.promotions![0].stepUp = -1; }, "salary.promotions.0.stepUp", "rate", true],
  ["a negative bonus target", C, (o) => { if (o.bonus?.basis === "percentOfSalary") o.bonus.amount.base = -0.1; }, "bonus.amount.base", "negative", false],
  ["a by-year bonus with no years", A, (o) => { if (o.bonus?.basis === "byEmploymentYear") o.bonus.amounts = []; }, "bonus.amounts", "noYears", true],
  ["a pay date of Feb 30", C, (o) => { o.bonus!.payOn = { month: 2, day: 30 }; }, "bonus.payOn", "monthDay", false],
  ["a pay month of 13", C, (o) => { o.bonus!.payOn = { month: 13, day: 1 }; }, "bonus.payOn", "monthDay", true],
  ["a cutoff of Apr 31", C, (o) => { o.bonus!.cutoff = { month: 4, day: 31 }; }, "bonus.cutoff", "monthDay", false],
  ["a negative sign-on", C, (o) => { o.cashAwards![0].amount = -5; }, "cashAwards.0.amount", "negative", false],
  ["a sign-on paid in 2025", C, (o) => { o.cashAwards![0].paidOn = "2025-12-31"; }, "cashAwards.0.paidOn", "before2026", true],
  ["a sign-on paid half a day after the start", C, (o) => { o.cashAwards![0].paidOn = { daysAfterStart: 0.5 }; }, "cashAwards.0.paidOn", "wholeDays", false],
  ["a clawback window of 0 months", C, (o) => { o.cashAwards![0].clawback!.months = 0; }, "cashAwards.0.clawback.months", "wholeMonths", false],
  ["share-price growth of -100%", C, (o) => { o.equity!.priceGrowth = { bear: -1, base: 0, bull: 0 }; }, "equity.priceGrowth.bear", "rate", true],
  ["a negative grant", C, (o) => { o.equity!.grants[0].value = -1; }, "equity.grants.0.value", "negative", true],
  ["tranches that add up to 95%", C, (o) => { o.equity!.grants[0].schedule.tranches.at(-1)!.fraction -= 0.05; }, "equity.grants.0.schedule", "trancheSum", true],
  ["a schedule with no tranches", C, (o) => { o.equity!.grants[0].schedule = { tranches: [] }; }, "equity.grants.0.schedule", "noTranches", true],
  ["a tranche at month 12.5", C, (o) => { o.equity!.grants[0].schedule.tranches[0].month = 12.5; }, "equity.grants.0.schedule.tranches.0.month", "wholeMonths", true],
  ["a 0% tranche", C, (o) => {
    o.equity!.grants[0].schedule = { tranches: [{ month: 12, fraction: 0 }, { month: 24, fraction: 1 }] };
  }, "equity.grants.0.schedule.tranches.0.fraction", "positive", true],
  ["company vest dates with no months", C, (o) => { o.equity!.grants[0].schedule.vestDates = { months: [], day: 15 }; }, "equity.grants.0.schedule.vestDates", "noMonths", true],
  ["company vest dates with no day", C, (o) => { o.equity!.grants[0].schedule.vestDates = { months: [2, 8], day: Number.NaN }; },
    "equity.grants.0.schedule.vestDates", "required", true],
  ["company vest dates on Feb 31", C, (o) => { o.equity!.grants[0].schedule.vestDates = { months: [2, 5, 8, 11], day: 31 }; }, "equity.grants.0.schedule.vestDates", "monthDay", false],
  ["a vesting start that vests before 2026", C, (o) => { o.equity!.grants[0].vestStart = "2024-01-01"; }, "equity.grants.0.vestStart", "before2026", true],
  ["a refresher every 0 months", C, (o) => { o.equity!.refreshers!.everyMonths = 0; }, "equity.refreshers.everyMonths", "wholeMonths", true],
  ["a first refresher at -1 months", C, (o) => { o.equity!.refreshers!.firstAfterMonths = -1; }, "equity.refreshers.firstAfterMonths", "wholeMonths", true],
  ["a negative bear refresher", C, (o) => { o.equity!.refreshers!.value.bear = -1; }, "equity.refreshers.value.bear", "negative", false],
  ["refresher tranches over 100%", C, (o) => { o.equity!.refreshers!.schedule.tranches[0].fraction += 0.05; }, "equity.refreshers.schedule", "trancheSum", true],
  ["a 150% deferral", C, (o) => { o.retirement!.contributionPct = 1.5; }, "retirement.contributionPct", "share", true],
  ["match tiers out of order", C, (o) => { o.retirement!.match = [{ upToPct: 0.06, rate: 1 }, { upToPct: 0.04, rate: 0.5 }]; }, "retirement.match.1", "tierOrder", true],
  ["a match tier up to 0%", C, (o) => { o.retirement!.match = [{ upToPct: 0, rate: 1 }]; }, "retirement.match.0", "tierRange", true],
  ["a negative non-elective contribution", C, (o) => { o.retirement!.nonElectivePct = -0.01; }, "retirement.nonElectivePct", "negative", true],
  ["a 0-year cliff", C, (o) => { o.retirement!.vesting = { kind: "cliff", years: 0 }; }, "retirement.vesting.years", "wholeYears", false],
  ["graded vesting that stops at 80%", C, (o) => {
    o.retirement!.vesting = { kind: "graded", steps: [{ years: 2, pct: 0.4 }, { years: 3, pct: 0.8 }] };
  }, "retirement.vesting.steps", "gradedSteps", false],
  ["plan-year hours without hours", C, (o) => { o.retirement!.vestingService = "planYearHours"; delete o.hours; }, "retirement.vestingService", "needsHours", true],
  ["a negative premium", C, (o) => { o.health!.premium = -1; }, "health.premium", "negative", true],
  ["out-of-pocket falling from low to medium", C, (o) => { o.health!.outOfPocket = { low: 2_000, medium: 1_800, high: 4_500 }; }, "health.outOfPocket", "oopOrder", false],
  ["a negative education benefit", C, (o) => { o.perks!.section127 = -1; }, "perks.section127", "negative", true],
  ["168.5 hours a week", C, (o) => { o.hours!.weekly = { bear: 168.5, base: 45, bull: 45 }; }, "hours.weekly.bear", "hours", true],
  ["half an hour a week", C, (o) => { o.hours!.weekly.base = 0.5; }, "hours.weekly.base", "hours", false],
  ["53 weeks a year", C, (o) => { o.hours!.weeksPerYear = 53; }, "hours.weeksPerYear", "weeks", true],
  ["a negative rent", C, (o) => { o.costOfLiving!.monthlyRent = -1; }, "costOfLiving.monthlyRent", "negative", true],
  ["rent growth of -100%", C, (o) => { o.costOfLiving!.rentGrowth = -1; }, "costOfLiving.rentGrowth", "rate", true],
  ["an unknown BEA area", C, (o) => { o.costOfLiving!.area = "99999"; }, "costOfLiving.area", "unknownArea", true],
  ["an unknown state", C, (o) => { o.residence = { state: "XX" }; }, "residence.state", "unknownState", true],
  ["an unknown employer state", C, (o) => { o.employerState = "XX"; }, "employerState", "unknownState", false],
];

describe("validateOffer: each problem at its field", () => {
  it("the samples have none", () => {
    for (const o of SAMPLE_OFFERS) expect(validateOffer(o, hh)).toEqual([]);
  });
  for (const [name, base, edit, path, code, engine] of cases) {
    it(name, () => {
      const o = clone(base);
      edit(o);
      const issues = validateOffer(o, hh);
      expect(issues.map((i) => `${i.path} ${i.code}`)).toEqual([`${path} ${code}`]);
      expect(engineThrows(o), "does the engine throw?").toBe(engine);
      expect(formatIssue(issues[0])).toMatch(/^[A-Z"].+[.]$/);
    });
  }
  it("a savings rate of 100% is the household's problem", () => {
    const issues = validateOffer(C, { ...hh, costOfLiving: { savingsRate: 1 } });
    expect(issues).toEqual([{ path: "household.costOfLiving.savingsRate", code: "savingsRate", params: {} }]);
    expect(engineThrows(C, { ...hh, costOfLiving: { savingsRate: 1 } })).toBe(true);
  });
  it("every problem at once", () => {
    const o = clone(C);
    o.salary.annual = -1;
    o.hours!.weeksPerYear = 60;
    o.equity!.grants[0].schedule.tranches.at(-1)!.fraction -= 0.05;
    expect(validateOffer(o).map((i) => i.path)).toEqual(["salary.annual", "equity.grants.0.schedule", "hours.weeksPerYear"]);
  });
});

describe("validateOffer: the edges", () => {
  it("a promotion the day after the start date is fine; on it isn't", () => {
    const o = clone(A);
    o.salary.promotions![0].on = "2026-07-14";
    expect(validateOffer(o)).toEqual([]);
    expect(engineThrows(o)).toBe(false);
  });
  it("168 hours a week is fine; 168.5 isn't (above); 1 is the least", () => {
    const o = clone(C);
    o.hours!.weekly = { bear: 168, base: 1, bull: 168 };
    expect(validateOffer(o)).toEqual([]);
  });
  it("33.33 / 33.33 / 33.34 is exactly 100%; 99.99% says what's missing", () => {
    const o = clone(C);
    o.equity!.grants[0].schedule = { tranches: [{ month: 12, fraction: 0.3333 }, { month: 24, fraction: 0.3333 }, { month: 36, fraction: 0.3334 }] };
    expect(validateOffer(o)).toEqual([]);
    expect(engineThrows(o)).toBe(false);
    o.equity!.grants[0].schedule.tranches[2].fraction = 0.3333;
    const [issue] = validateOffer(o);
    expect(issue).toMatchObject({ path: "equity.grants.0.schedule", code: "trancheSum" });
    expect(formatIssue(issue)).toBe("These tranches add up to 99.99%: 0.01% is missing.");
  });
  it("the plan's messages, word for word", () => {
    const msg = (path: string, code: string, params = {}) => formatIssue({ path, code, params } as Parameters<typeof formatIssue>[0]);
    expect(msg("equity.grants.0.schedule", "trancheSum", { sum: 0.95 })).toBe("These tranches add up to 95%: 5% is missing.");
    expect(msg("equity.grants.0.schedule", "trancheSum", { sum: 1.05 })).toBe("These tranches add up to 105%: 5% too much.");
    expect(msg("retirement.match.1", "tierOrder")).toBe("Each match tier must go higher than the one before it.");
    expect(msg("salary.promotions.0.on", "notAfterStart", { start: "2026-07-13" })).toBe("The promotion date must be after your start date.");
    expect(msg("hours.weekly.base", "hours", { min: 1, max: 168 })).toBe("Weekly hours must be between 1 and 168.");
    expect(msg("hours.weeksPerYear", "weeks", { min: 1, max: 52 })).toBe("Weeks a year must be between 1 and 52.");
    expect(msg("cashAwards.0.clawback.months", "wholeMonths", { min: 1 })).toBe("A clawback window is a whole number of months, at least 1.");
    expect(msg("cashAwards.0.paidOn", "before2026", { what: "payment" })).toBe("Payments before 2026 aren't supported: tax data starts in 2026.");
    expect(msg("bonus.payOn", "monthDay", { month: 2, day: 30 })).toBe("February has no 30th.");
    expect(msg("bonus.cutoff", "monthDay", { month: 4, day: 31 })).toBe("April has no 31st.");
  });
  it("Feb 29 is a real month and day (it falls on Feb 28 in other years)", () => {
    const o = clone(C);
    o.bonus!.payOn = { month: 2, day: 29 };
    expect(validateOffer(o)).toEqual([]);
  });
});
