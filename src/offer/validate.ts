import { STATES_2026 } from "../tax/index";
import { RPP } from "../col/index";
import { addMonths, toDays } from "./dates";
import { snapToVestDate } from "./vesting";
import type { ByScenario, Household, ISODate, MonthDay, OfferInput, VestingSchedule } from "./types";

// Input checks with the path of the field that caused each problem, so the UI can show it under
// that field (engine item 7). validateOffer returns every problem at once, as codes and numbers;
// src/format writes the words (formatIssue). projectScenario keeps its own throws as a backstop.

type NoParams = Record<string, never>;

/** One problem with an input: what's wrong, where (a path into OfferInput, e.g. "equity.grants.0.schedule"), and its numbers. */
export type OfferIssue = { path: string } & (
  /** Blank, or not a number. */
  | { code: "required"; params: { kind: "amount" | "percent" | "date" | "number" | "choice" } }
  /** Not a real "YYYY-MM-DD" date. */
  | { code: "date"; params: { value: string } }
  /** Not a real month and day (Feb 29 is allowed: it falls on Feb 28 in other years). */
  | { code: "monthDay"; params: { month: number; day: number } }
  /** A date or payment before 2026: tax data starts in 2026. */
  | { code: "before2026"; params: { what: "start" | "payment" | "vest" } }
  | { code: "leaveBeforeStart"; params: NoParams }
  /** A promotion on or before the start date. */
  | { code: "notAfterStart"; params: { start: ISODate } }
  /** An amount below 0. */
  | { code: "negative"; params: NoParams }
  /** A rate of change at or below -100% (a raise, a step-up, growth). */
  | { code: "rate"; params: NoParams }
  /** A share of pay outside 0-100%. */
  | { code: "share"; params: NoParams }
  | { code: "hours"; params: { min: number; max: number } }
  | { code: "weeks"; params: { min: number; max: number } }
  | { code: "wholeMonths"; params: { min: number } }
  | { code: "wholeYears"; params: { min: number } }
  | { code: "wholeDays"; params: { min: number } }
  /** A vesting tranche of 0% or less. */
  | { code: "positive"; params: NoParams }
  /** Vesting tranches that don't add up to 100%. `sum` is a fraction (0.95). */
  | { code: "trancheSum"; params: { sum: number } }
  | { code: "noTranches"; params: NoParams }
  /** A company vest calendar with no months. */
  | { code: "noMonths"; params: NoParams }
  /** A match tier's "up to" outside (0, 100%], or a negative match rate. */
  | { code: "tierRange"; params: NoParams }
  /** Each match tier must go higher than the one before it. */
  | { code: "tierOrder"; params: NoParams }
  /** A bonus by employment year with no years. */
  | { code: "noYears"; params: NoParams }
  /** Plan-year-hours vesting service without weekly hours. */
  | { code: "needsHours"; params: NoParams }
  /** Graded vesting steps that don't rise year by year to 100%. */
  | { code: "gradedSteps"; params: NoParams }
  /** Out-of-pocket estimates that don't rise from low to medium to high. */
  | { code: "oopOrder"; params: NoParams }
  | { code: "unknownArea"; params: { code: string } }
  | { code: "unknownState"; params: { state: string } }
  | { code: "savingsRate"; params: NoParams }
);

export type IssueCode = OfferIssue["code"];

const SCENARIOS = ["bear", "base", "bull"] as const;
const FIRST_DAY = toDays("2026-01-01");
/** Days in each month, with February's leap day allowed (a Feb 29 date falls on Feb 28 in other years). */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Every problem with an offer's inputs, each with the path of the field that caused it. Empty when
 * the offer can be projected. Pass the household to check its savings rate too.
 */
export function validateOffer(offer: OfferInput, household?: Household): OfferIssue[] {
  const out: OfferIssue[] = [];
  const add = <C extends IssueCode>(path: string, code: C, params: Extract<OfferIssue, { code: C }>["params"]) =>
    out.push({ path, code, params } as OfferIssue);
  const num = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

  /** A required number: blank first, then its own check. */
  const amount = (path: string, v: unknown, kind: "amount" | "percent" | "number" = "amount") => {
    if (!num(v)) { add(path, "required", { kind }); return false; }
    return true;
  };
  const nonNegative = (path: string, v: unknown) => { if (amount(path, v) && !((v as number) >= 0)) add(path, "negative", {}); };
  const rate = (path: string, v: unknown) => { if (amount(path, v, "percent") && !((v as number) > -1)) add(path, "rate", {}); };
  const share = (path: string, v: unknown) => {
    if (amount(path, v, "percent") && !((v as number) >= 0 && (v as number) <= 1)) add(path, "share", {});
  };
  const each = (path: string, s: ByScenario | undefined, check: (path: string, v: unknown) => void) => {
    if (s) for (const k of SCENARIOS) check(`${path}.${k}`, s[k]);
  };
  const whole = (path: string, v: unknown, min: number, code: "wholeMonths" | "wholeYears" | "wholeDays") => {
    if (!amount(path, v, "number")) return false;
    if (!Number.isInteger(v) || (v as number) < min) { add(path, code, { min }); return false; }
    return true;
  };
  /** A real date's day number, or null (with an issue). */
  const date = (path: string, v: unknown): number | null => {
    if (typeof v !== "string" || v === "") { add(path, "required", { kind: "date" }); return null; }
    try {
      return toDays(v);
    } catch {
      add(path, "date", { value: v });
      return null;
    }
  };
  const monthDay = (path: string, md: MonthDay | undefined) => {
    if (!md) return;
    if (!realMonthDay(md.month, md.day)) add(path, "monthDay", { month: md.month, day: md.day });
  };

  // ---- dates ---------------------------------------------------------------------------
  const start = date("startDate", offer.startDate);
  if (start !== null && start < FIRST_DAY) add("startDate", "before2026", { what: "start" });
  if (offer.leaveDate !== undefined) {
    const leave = date("leaveDate", offer.leaveDate);
    if (leave !== null && start !== null && leave < start) add("leaveDate", "leaveBeforeStart", {});
  }

  // ---- where you'd live ------------------------------------------------------------------
  if (!STATES_2026[offer.residence.state]) add("residence.state", "unknownState", { state: offer.residence.state });
  if (!STATES_2026[offer.employerState]) add("employerState", "unknownState", { state: offer.employerState });
  const col = offer.costOfLiving;
  if (col) {
    if (!RPP.areas[col.area]) add("costOfLiving.area", "unknownArea", { code: col.area });
    if (col.monthlyRent !== undefined) nonNegative("costOfLiving.monthlyRent", col.monthlyRent);
    if (col.rentGrowth !== undefined) rate("costOfLiving.rentGrowth", col.rentGrowth);
  }

  // ---- pay -------------------------------------------------------------------------------
  nonNegative("salary.annual", offer.salary.annual);
  each("salary.raise", offer.salary.raise, rate);
  (offer.salary.promotions ?? []).forEach((p, i) => {
    const on = date(`salary.promotions.${i}.on`, p.on);
    if (on !== null && start !== null && on <= start) add(`salary.promotions.${i}.on`, "notAfterStart", { start: offer.startDate });
    rate(`salary.promotions.${i}.stepUp`, p.stepUp);
  });

  // ---- bonus -----------------------------------------------------------------------------
  const b = offer.bonus;
  if (b) {
    if (b.basis === "byEmploymentYear") {
      if (b.amounts.length === 0) add("bonus.amounts", "noYears", {});
      b.amounts.forEach((a, i) => each(`bonus.amounts.${i}`, a, nonNegative));
    } else {
      each("bonus.amount", b.amount, nonNegative);
    }
    if (!b.payOn) add("bonus.payOn", "required", { kind: "date" });
    monthDay("bonus.payOn", b.payOn);
    monthDay("bonus.periodStart", b.periodStart);
    monthDay("bonus.cutoff", b.cutoff);
  }

  // ---- cash awards -------------------------------------------------------------------------
  (offer.cashAwards ?? []).forEach((a, i) => {
    const path = `cashAwards.${i}`;
    nonNegative(`${path}.amount`, a.amount);
    if (typeof a.paidOn === "string") {
      const paid = date(`${path}.paidOn`, a.paidOn);
      if (paid !== null && paid < FIRST_DAY) add(`${path}.paidOn`, "before2026", { what: "payment" });
    } else {
      whole(`${path}.paidOn`, a.paidOn?.daysAfterStart, 0, "wholeDays");
    }
    if (a.clawback) whole(`${path}.clawback.months`, a.clawback.months, 1, "wholeMonths");
  });

  // ---- equity ------------------------------------------------------------------------------
  const eq = offer.equity;
  if (eq) {
    each("equity.priceGrowth", eq.priceGrowth, rate);
    eq.grants.forEach((g, i) => {
      const path = `equity.grants.${i}`;
      nonNegative(`${path}.value`, g.value);
      if (g.grantDate !== undefined) date(`${path}.grantDate`, g.grantDate);
      const vestStart = g.vestStart !== undefined ? date(`${path}.vestStart`, g.vestStart) : start;
      if (schedule(`${path}.schedule`, g.schedule) && vestStart !== null) {
        // A tranche can't vest before 2026: tax data starts in 2026.
        const days = g.schedule.tranches.map((t) => addMonths(vestStart, t.month));
        const vests = g.schedule.vestDates ? days.map((d) => snapToVestDate(d, g.schedule.vestDates!)) : days;
        if (vests.some((d) => d < FIRST_DAY)) add(g.vestStart !== undefined ? `${path}.vestStart` : "startDate", "before2026", { what: "vest" });
      }
    });
    const r = eq.refreshers;
    if (r) {
      each("equity.refreshers.value", r.value, nonNegative);
      whole("equity.refreshers.firstAfterMonths", r.firstAfterMonths, 0, "wholeMonths");
      whole("equity.refreshers.everyMonths", r.everyMonths, 1, "wholeMonths");
      schedule("equity.refreshers.schedule", r.schedule);
    }
  }

  /** A vesting schedule's tranches and company vest dates; true when the tranches are usable. */
  function schedule(path: string, s: VestingSchedule): boolean {
    let ok = true;
    if (!s.tranches.length) { add(path, "noTranches", {}); ok = false; }
    s.tranches.forEach((t, j) => {
      if (!whole(`${path}.tranches.${j}.month`, t.month, 0, "wholeMonths")) ok = false;
      if (!amount(`${path}.tranches.${j}.fraction`, t.fraction, "percent")) ok = false;
      else if (!(t.fraction > 0)) { add(`${path}.tranches.${j}.fraction`, "positive", {}); ok = false; }
    });
    const sum = s.tranches.reduce((a, t) => a + (num(t.fraction) ? t.fraction : 0), 0);
    if (s.tranches.length && Math.abs(sum - 1) > 1e-9) add(path, "trancheSum", { sum });
    if (s.vestDates) {
      if (!s.vestDates.months.length) add(`${path}.vestDates`, "noMonths", {});
      if (!num(s.vestDates.day)) { add(`${path}.vestDates`, "required", { kind: "date" }); return false; }
      const bad = s.vestDates.months.find((m) => !realMonthDay(m, s.vestDates!.day));
      if (bad !== undefined) { add(`${path}.vestDates`, "monthDay", { month: bad, day: s.vestDates.day }); ok = false; }
    }
    return ok;
  }

  // ---- 401(k) ------------------------------------------------------------------------------
  const ret = offer.retirement;
  if (ret) {
    share("retirement.contributionPct", ret.contributionPct);
    const tiers = ret.match ?? [];
    tiers.forEach((t, i) => {
      const path = `retirement.match.${i}`;
      if (!num(t.upToPct) || !num(t.rate)) { add(path, "required", { kind: "percent" }); return; }
      if (!(t.upToPct > 0 && t.upToPct <= 1) || !(t.rate >= 0)) add(path, "tierRange", {});
      else if (i > 0 && num(tiers[i - 1].upToPct) && t.upToPct <= tiers[i - 1].upToPct) add(path, "tierOrder", {});
    });
    if (ret.nonElectivePct !== undefined) nonNegative("retirement.nonElectivePct", ret.nonElectivePct);
    const v = ret.vesting;
    if (v?.kind === "cliff") whole("retirement.vesting.years", v.years, 1, "wholeYears");
    if (v?.kind === "graded") {
      const steps = v.steps;
      const rising = steps.length > 0 && steps.every((s, i) => Number.isInteger(s.years) && s.years >= 1 && s.pct > 0 && s.pct <= 1
        && (i === 0 || (s.years > steps[i - 1].years && s.pct > steps[i - 1].pct)));
      if (!rising || steps[steps.length - 1].pct !== 1) add("retirement.vesting.steps", "gradedSteps", {});
    }
    if (ret.vestingService === "planYearHours" && !offer.hours) add("retirement.vestingService", "needsHours", {});
  }

  // ---- health and perks --------------------------------------------------------------------
  const h = offer.health;
  if (h) {
    nonNegative("health.premium", h.premium);
    for (const k of ["low", "medium", "high"] as const) nonNegative(`health.outOfPocket.${k}`, h.outOfPocket[k]);
    const o = h.outOfPocket;
    if (num(o.low) && num(o.medium) && num(o.high) && o.low >= 0 && !(o.low <= o.medium && o.medium <= o.high)) {
      add("health.outOfPocket", "oopOrder", {});
    }
    nonNegative("health.oopMax", h.oopMax);
    if (h.employeeHsa !== undefined) nonNegative("health.employeeHsa", h.employeeHsa);
    if (h.employerHsa !== undefined) nonNegative("health.employerHsa", h.employerHsa);
  }
  const p = offer.perks;
  if (p) {
    if (p.section127 !== undefined) nonNegative("perks.section127", p.section127);
    if (p.commuterMonthly !== undefined) nonNegative("perks.commuterMonthly", p.commuterMonthly);
  }

  // ---- hours -------------------------------------------------------------------------------
  if (offer.hours) {
    each("hours.weekly", offer.hours.weekly, (path, v) => {
      if (amount(path, v, "number") && !((v as number) >= 1 && (v as number) <= 168)) add(path, "hours", { min: 1, max: 168 });
    });
    const weeks = offer.hours.weeksPerYear;
    if (weeks !== undefined && amount("hours.weeksPerYear", weeks, "number") && !(weeks >= 1 && weeks <= 52)) {
      add("hours.weeksPerYear", "weeks", { min: 1, max: 52 });
    }
  }

  // ---- the household's part ------------------------------------------------------------------
  const savings = household?.costOfLiving?.savingsRate;
  if (savings !== undefined && !(savings >= 0 && savings < 1)) add("household.costOfLiving.savingsRate", "savingsRate", {});

  return out;
}

/** A month and day that exist (Feb 29 counts: it falls on Feb 28 in other years). */
export function realMonthDay(month: number, day: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= MONTH_DAYS[month - 1];
}
