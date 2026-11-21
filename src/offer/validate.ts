import { STATES_2026 } from "../tax/index";
import { RPP } from "../col/index";
import { addMonths, toDays } from "./dates";
import { daysOff } from "./timeOff";
import { snapToVestDate } from "./vesting";
import type { ByScenario, Household, ISODate, MonthDay, OfferInput, VestingSchedule } from "./types";

// Input checks with the path of the field that caused each problem, so the UI can show it under
// that field (engine item 7). validateOffer returns every problem at once, as codes and numbers;
// src/format writes the words (formatIssue). projectScenario keeps its own throws as a backstop.

type NoParams = Record<string, never>;

/** One problem with an input: what's wrong, where (a path into OfferInput, e.g. "equity.grants.0.schedule"), and its numbers. */
export type OfferIssue = { path: string } & (
  /** Blank, or not a number. */
  | { code: "required"; params: { kind: "amount" | "percent" | "date" | "number" | "choice" | "text" } }
  /** Text longer than `max` characters (a benefit's name). */
  | { code: "tooLong"; params: { max: number } }
  /** A list longer than `max` (other benefits; any list, MAX_ROWS). */
  | { code: "tooMany"; params: { max: number } }
  /** A number above the most it can be (audit C25): dollars, a percent (`max` a fraction) or days. */
  | { code: "tooLarge"; params: { max: number; unit: "dollars" | "percent" | "days" } }
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
  /** An ESPP discount over the 15% IRC 423(b)(6) allows. */
  | { code: "esppDiscount"; params: { max: number } }
  /** An ESPP offering that isn't whole months from 1 to 27 (IRC 423(b)(7)). */
  | { code: "esppOffering"; params: { min: number; max: number } }
  /** Purchases an offering that aren't a whole number dividing its months evenly. */
  | { code: "esppPurchases"; params: NoParams }
  /** Vacation, holidays and sick days that come to a whole year of workdays or more (260). */
  | { code: "daysOff"; params: { max: number } }
  | { code: "wholeMonths"; params: { min: number } }
  | { code: "wholeYears"; params: { min: number } }
  | { code: "wholeDays"; params: { min: number } }
  /** A whole number of days outside min-max (commission's payout lag, 0 to 366). */
  | { code: "dayRange"; params: { min: number; max: number } }
  /** A flat local income tax rate outside 0 to `max` (a fraction): no U.S. city's or county's is higher. */
  | { code: "localRate"; params: { max: number } }
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
  /** A bonus or commission by employment year with no years. */
  | { code: "noYears"; params: NoParams }
  /** Plan-year-hours vesting service without weekly hours. */
  | { code: "needsHours"; params: NoParams }
  /** Graded vesting steps that don't rise year by year to 100%. */
  | { code: "gradedSteps"; params: NoParams }
  /** Out-of-pocket estimates that don't rise from low to medium to high. */
  | { code: "oopOrder"; params: NoParams }
  /**
   * A range's bear or bull case on the wrong side of its base case (audit C7): `side` is the side it can't be on. Money and rates
   * run bear <= base <= bull; weekly hours the other way, bear >= base >= bull, since the bear case is the one where you work most.
   */
  | { code: "caseOrder"; params: { scenario: "bear" | "bull"; side: "above" | "below" } }
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
 * The most a flat local income tax can be: above every U.S. city's and county's, the highest being Philadelphia's resident wage
 * tax, 3.74% in 2026 (src/tax/params/local2026.ts); Maryland's counties reach about 3.3% and Ohio's cities 2.5% or so (the states'
 * notes, src/tax/params/states2026.ts). So a typo such as 25 for 2.5% is caught.
 */
export const MAX_LOCAL_RATE = 0.05;
/**
 * The most any dollar amount can be (audit C25): a year's salary, a bonus, a grant, a month's rent, a year's other wages. Far above
 * any offer's pay, grant or cost, it keeps every figure finite and well inside exact cents: a salary of 1e308, or Infinity, made NaN
 * of every result. The app's About you holds the same figure (app/src/model.ts), since the main thread can't import this file.
 */
export const MAX_AMOUNT = 100_000_000;
/** The most a rate of change can be, a year (a raise, a promotion's step-up, share-price or rent growth): 100%. */
export const MAX_RATE = 1;
/** The most a bonus can be as a share of salary, and a 401(k) match as a rate on what you put in: 1,000%. */
export const MAX_MULTIPLE = 10;
/** The most vacation days an offer can give a year: a year's workdays (52 weeks of 5 days). */
export const MAX_DAYS_GIVEN = 260;
/**
 * The most rows a list can have (audit C25): promotions, cash awards, grants, a schedule's tranches (monthly over 10 years is 120),
 * vest months, match tiers, graded steps and amounts by employment year. Other benefits keep their own 8.
 */
export const MAX_ROWS = 120;

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
  /** An amount from 0 to `max`: dollars by default (MAX_AMOUNT), or a share of salary. Infinity is too large. */
  const nonNegative = (path: string, v: unknown, max = MAX_AMOUNT, unit: "dollars" | "percent" = "dollars") => {
    if (!amount(path, v)) return;
    if (!((v as number) >= 0)) add(path, "negative", {});
    else if (!((v as number) <= max)) add(path, "tooLarge", { max, unit });
  };
  const bonusShare = (path: string, v: unknown) => nonNegative(path, v, MAX_MULTIPLE, "percent");
  /** A rate of change a year: above -100% and at most MAX_RATE. */
  const rate = (path: string, v: unknown) => {
    if (!amount(path, v, "percent")) return;
    if (!((v as number) > -1)) add(path, "rate", {});
    else if (!((v as number) <= MAX_RATE)) add(path, "tooLarge", { max: MAX_RATE, unit: "percent" });
  };
  /** A list of at most MAX_ROWS rows. */
  const rows = (path: string, list: readonly unknown[] | undefined) => {
    if (list && list.length > MAX_ROWS) add(path, "tooMany", { max: MAX_ROWS });
  };
  const share = (path: string, v: unknown) => {
    if (amount(path, v, "percent") && !((v as number) >= 0 && (v as number) <= 1)) add(path, "share", {});
  };
  /**
   * A range: each case on its own, then, if all three pass, their order (audit C7): bear <= base <= bull, or with `fewerIsBetter`
   * (weekly hours) bear >= base >= bull. A case on the wrong side gets the problem; the base is the value you entered first.
   */
  const each = (path: string, s: ByScenario | undefined, check: (path: string, v: unknown) => void, fewerIsBetter = false) => {
    if (!s) return;
    const before = out.length;
    for (const k of SCENARIOS) check(`${path}.${k}`, s[k]);
    if (out.length > before) return;
    const low = fewerIsBetter ? "bull" : "bear";
    const high = fewerIsBetter ? "bear" : "bull";
    if (s[low] > s.base) add(`${path}.${low}`, "caseOrder", { scenario: low, side: "above" });
    if (s[high] < s.base) add(`${path}.${high}`, "caseOrder", { scenario: high, side: "below" });
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
  // Own keys only (audit C25): "toString" or "constructor" would find an inherited property and pass.
  if (!Object.hasOwn(STATES_2026, offer.residence.state)) add("residence.state", "unknownState", { state: offer.residence.state });
  const loc = offer.residence.locality;
  if (loc?.kind === "flat") {
    const r = "residence.locality.rate";
    if (amount(r, loc.rate, "percent") && !(loc.rate >= 0 && loc.rate <= MAX_LOCAL_RATE)) add(r, "localRate", { max: MAX_LOCAL_RATE });
    if (loc.label.length > 40) add("residence.locality.label", "tooLong", { max: 40 });
  }
  if (!Object.hasOwn(STATES_2026, offer.employerState)) add("employerState", "unknownState", { state: offer.employerState });
  const col = offer.costOfLiving;
  if (col) {
    // An area with prices (audit C25): four of BEA's rows have none, and their price factor was Infinity.
    if (!hasPrices(col.area)) add("costOfLiving.area", "unknownArea", { code: col.area });
    if (col.monthlyRent !== undefined) nonNegative("costOfLiving.monthlyRent", col.monthlyRent);
    if (col.rentGrowth !== undefined) rate("costOfLiving.rentGrowth", col.rentGrowth);
  }

  // ---- pay -------------------------------------------------------------------------------
  nonNegative("salary.annual", offer.salary.annual);
  each("salary.raise", offer.salary.raise, rate);
  rows("salary.promotions", offer.salary.promotions);
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
      rows("bonus.amounts", b.amounts);
      b.amounts.forEach((a, i) => each(`bonus.amounts.${i}`, a, nonNegative));
    } else {
      each("bonus.amount", b.amount, b.basis === "percentOfSalary" ? bonusShare : nonNegative);
    }
    if (!b.payOn) add("bonus.payOn", "required", { kind: "date" });
    monthDay("bonus.payOn", b.payOn);
    monthDay("bonus.periodStart", b.periodStart);
    monthDay("bonus.cutoff", b.cutoff);
  }

  // ---- commission (4h) ----------------------------------------------------------------------
  const cm = offer.commission;
  if (cm) {
    if (cm.basis === "byEmploymentYear") {
      if (cm.amounts.length === 0) add("commission.amounts", "noYears", {});
      rows("commission.amounts", cm.amounts);
      cm.amounts.forEach((a, i) => each(`commission.amounts.${i}`, a, nonNegative));
    } else {
      each("commission.amount", cm.amount, nonNegative);
    }
    if (cm.period !== "month" && cm.period !== "quarter") add("commission.period", "required", { kind: "choice" });
    const lag = cm.payAfterDays;
    if (amount("commission.payAfterDays", lag, "number") && !(Number.isInteger(lag) && lag >= 0 && lag <= 366)) {
      add("commission.payAfterDays", "dayRange", { min: 0, max: 366 });
    }
    const d = cm.draw;
    if (d) {
      nonNegative("commission.draw.monthly", d.monthly);
      if (typeof d.recoverable !== "boolean") add("commission.draw.recoverable", "required", { kind: "choice" });
      if (d.months !== undefined) whole("commission.draw.months", d.months, 1, "wholeMonths");
    }
  }

  // ---- cash awards -------------------------------------------------------------------------
  rows("cashAwards", offer.cashAwards);
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
    rows("equity.grants", eq.grants);
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
    if (s.tranches.length > MAX_ROWS) { add(`${path}.tranches`, "tooMany", { max: MAX_ROWS }); ok = false; }
    s.tranches.forEach((t, j) => {
      if (!whole(`${path}.tranches.${j}.month`, t.month, 0, "wholeMonths")) ok = false;
      if (!amount(`${path}.tranches.${j}.fraction`, t.fraction, "percent")) ok = false;
      else if (!(t.fraction > 0)) { add(`${path}.tranches.${j}.fraction`, "positive", {}); ok = false; }
    });
    const sum = s.tranches.reduce((a, t) => a + (num(t.fraction) ? t.fraction : 0), 0);
    if (s.tranches.length && Math.abs(sum - 1) > 1e-9) add(path, "trancheSum", { sum });
    if (s.vestDates) {
      if (!s.vestDates.months.length) add(`${path}.vestDates`, "noMonths", {});
      if (s.vestDates.months.length > MAX_ROWS) add(`${path}.vestDates`, "tooMany", { max: MAX_ROWS });
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
    rows("retirement.match", tiers);
    tiers.forEach((t, i) => {
      const path = `retirement.match.${i}`;
      if (!num(t.upToPct) || !num(t.rate)) { add(path, "required", { kind: "percent" }); return; }
      if (!(t.upToPct > 0 && t.upToPct <= 1) || !(t.rate >= 0 && t.rate <= MAX_MULTIPLE)) add(path, "tierRange", {});
      else if (i > 0 && num(tiers[i - 1].upToPct) && t.upToPct <= tiers[i - 1].upToPct) add(path, "tierOrder", {});
    });
    if (ret.nonElectivePct !== undefined) nonNegative("retirement.nonElectivePct", ret.nonElectivePct, 1, "percent");
    const v = ret.vesting;
    if (v?.kind === "cliff") whole("retirement.vesting.years", v.years, 1, "wholeYears");
    if (v?.kind === "graded") {
      const steps = v.steps;
      rows("retirement.vesting.steps", steps);
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

  // ---- other benefits (4j): up to 8, each named (up to 40 characters), an amount a year, taxable or tax-free -----------------------
  const ob = offer.otherBenefits;
  if (ob) {
    if (ob.length > 8) add("otherBenefits", "tooMany", { max: 8 });
    ob.forEach((x, i) => {
      const label = typeof x.label === "string" ? x.label.trim() : "";
      if (!label) add(`otherBenefits.${i}.label`, "required", { kind: "text" });
      else if (label.length > 40) add(`otherBenefits.${i}.label`, "tooLong", { max: 40 });
      nonNegative(`otherBenefits.${i}.annual`, x.annual);
      if (typeof x.taxable !== "boolean") add(`otherBenefits.${i}.taxable`, "required", { kind: "choice" });
    });
  }

  // ---- hours -------------------------------------------------------------------------------
  if (offer.hours) {
    each("hours.weekly", offer.hours.weekly, (path, v) => {
      if (amount(path, v, "number") && !((v as number) >= 1 && (v as number) <= 168)) add(path, "hours", { min: 1, max: 168 });
    }, true);
    const weeks = offer.hours.weeksPerYear;
    if (weeks !== undefined && amount("hours.weeksPerYear", weeks, "number") && !(weeks >= 1 && weeks <= 52)) {
      add("hours.weeksPerYear", "weeks", { min: 1, max: 52 });
    }
  }

  // ---- the ESPP (4i) ---------------------------------------------------------------------------
  const e = offer.espp;
  if (e) {
    share("espp.contributionPct", e.contributionPct);
    if (amount("espp.discount", e.discount, "percent") && !(e.discount >= 0 && e.discount <= 0.15)) add("espp.discount", "esppDiscount", { max: 0.15 });
    if (typeof e.lookback !== "boolean") add("espp.lookback", "required", { kind: "choice" });
    const m = e.offeringMonths;
    const monthsOk = amount("espp.offeringMonths", m, "number") && Number.isInteger(m) && m >= 1 && m <= 27;
    if (num(m) && !monthsOk) add("espp.offeringMonths", "esppOffering", { min: 1, max: 27 });
    const n = e.purchasesPerOffering;
    if (n !== undefined && amount("espp.purchasesPerOffering", n, "number")
      && !(Number.isInteger(n) && n >= 1 && (!monthsOk || m % n === 0))) add("espp.purchasesPerOffering", "esppPurchases", {});
    const md = e.offeringsStart;
    if (!md || !num(md.month) || !num(md.day)) add("espp.offeringsStart", "required", { kind: "date" });
    else if (!realMonthDay(md.month, md.day)) add("espp.offeringsStart", "monthDay", { month: md.month, day: md.day });
    if (e.eligibleFrom !== undefined) date("espp.eligibleFrom", e.eligibleFrom);
  }

  // ---- days off and the vacation policy (4a) ---------------------------------------------------
  const t = offer.timeOff;
  if (t) {
    const valid = (k: "vacation" | "holidays" | "sick" | "gives" | "cap") => {
      const v = t[k];
      if (v === undefined || !amount(`timeOff.${k}`, v, "number")) return false;
      if (!(v >= 0)) { add(`timeOff.${k}`, "negative", {}); return false; }
      // Days given a year bound what banks (audit C25); a cap on banking needs none, since it caps what's given.
      if (k === "gives" && !(v <= MAX_DAYS_GIVEN)) { add("timeOff.gives", "tooLarge", { max: MAX_DAYS_GIVEN, unit: "days" }); return false; }
      return true;
    };
    const ok = (["vacation", "holidays", "sick", "gives", "cap"] as const).filter(valid);
    // Weeks worked must stay above 0: the days off a year (entered, or at their defaults) under 260, 52 weeks of 5 days.
    const off = (["vacation", "holidays", "sick"] as const).filter((k) => t[k] !== undefined);
    const d = daysOff(t);
    if (off.length && off.every((k) => ok.includes(k)) && d.vacation + d.holidays + d.sick >= 260) {
      add(`timeOff.${off[0]}`, "daysOff", { max: 260 });
    }
  }

  // ---- the household's part ------------------------------------------------------------------
  const savings = household?.costOfLiving?.savingsRate;
  if (savings !== undefined && !(savings >= 0 && savings < 1)) add("household.costOfLiving.savingsRate", "savingsRate", {});
  // Other wages and a spouse's, each year's (audit C25). The app bounds them where they're entered and imported; this is the
  // engine's own check.
  for (const k of ["otherWages", "spouseWages"] as const) {
    const bad = Object.values(household?.[k] ?? {}).find((w) => !(num(w) && w >= 0 && w <= MAX_AMOUNT));
    if (bad === undefined) continue;
    const path = `household.${k}`;
    if (!num(bad)) add(path, "required", { kind: "amount" });
    else if (bad < 0) add(path, "negative", {});
    else add(path, "tooLarge", { max: MAX_AMOUNT, unit: "dollars" });
  }

  return out;
}

/** A BEA area this data has, with prices: an own key (not "constructor"), and all items and housing above 0 (audit C25). */
export function hasPrices(code: string): boolean {
  if (!Object.hasOwn(RPP.areas, code)) return false;
  const a = RPP.areas[code];
  return a.allItems > 0 && a.housing > 0;
}

/** A month and day that exist (Feb 29 counts: it falls on Feb 28 in other years). */
export function realMonthDay(month: number, day: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= MONTH_DAYS[month - 1];
}
