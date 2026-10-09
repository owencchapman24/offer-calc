import { addMonths, dayIn, daysInMonth, fromDays, jan1, nextMonthStart, nextOccurrence, toDays, yearOfDay } from "./dates";
import type { AnnualBonus, BonusDetail, CashAward, Component, EventDetail, OfferWarning, Salary, SalaryChangeReason, Scenario } from "./types";

const round2 = (x: number) => Math.round(x * 100) / 100;

// Each stream turns part of an offer into dated payments (unrounded). Days are day numbers;
// ranges are half-open [from, to).

export interface RawEvent {
  day: number;
  component: Component;
  detail: EventDetail;
  gross: number;
  /** Accrued pay (salary): the first day it covers. Its employment year follows this day. */
  accruedFrom?: number;
  /** Not wages (a repayment of an earlier year's pay): left out of the year's taxable wages; carries its own tax effect. */
  nonWage?: { tax: number };
}

// ---- salary path ------------------------------------------------------------------

/** Annual salary rate over time: piecewise constant, changing on raise and promotion days. */
export interface SalaryPath {
  /** Sorted by day; steps[0] is the start date. Each rate holds until the next step. */
  steps: Array<{ day: number; annual: number; reasons: SalaryChangeReason[] }>;
}

/**
 * Merit raises compound at `raise` on each anniversary (or each Jan 1 after the start);
 * promotions multiply by 1 + stepUp on their date, in the scenarios they list. Same-day
 * changes multiply together.
 */
export function salaryPath(salary: Salary, scenario: Scenario, start: number, until: number): SalaryPath {
  const raise = salary.raise?.[scenario] ?? 0;
  if (!(raise > -1)) throw new Error("Merit raise must be greater than -100%.");
  const changes = new Map<number, { factor: number; reasons: SalaryChangeReason[] }>();
  const add = (day: number, factor: number, reason: SalaryChangeReason) => {
    const c = changes.get(day) ?? { factor: 1, reasons: [] };
    changes.set(day, { factor: c.factor * factor, reasons: [...c.reasons, reason] });
  };
  if (raise !== 0) {
    const meritDays: number[] = [];
    if ((salary.raiseOn ?? "anniversary") === "anniversary") {
      for (let k = 1; addMonths(start, 12 * k) < until; k++) meritDays.push(addMonths(start, 12 * k));
    } else {
      for (let y = yearOfDay(start) + 1; jan1(y) < until; y++) meritDays.push(jan1(y));
    }
    for (const d of meritDays) add(d, 1 + raise, { kind: "merit", rate: raise });
  }
  for (const p of salary.promotions ?? []) {
    if (p.scenarios && !p.scenarios.includes(scenario)) continue;
    const day = toDays(p.on);
    if (day <= start) throw new Error(`Promotion on ${p.on} must be after the start date.`);
    if (!(p.stepUp > -1)) throw new Error("Promotion step-ups must be greater than -100%.");
    if (day < until) add(day, 1 + p.stepUp, { kind: "promotion", stepUp: p.stepUp });
  }
  const steps: SalaryPath["steps"] = [{ day: start, annual: salary.annual, reasons: [] }];
  for (const [day, c] of [...changes].sort((a, b) => a[0] - b[0])) {
    steps.push({ day, annual: steps[steps.length - 1].annual * c.factor, reasons: c.reasons });
  }
  return { steps };
}

/** Annual rate in effect on `day`. */
export function rateAt(path: SalaryPath, day: number): number {
  let rate = path.steps[0].annual;
  for (const s of path.steps) if (s.day <= day) rate = s.annual;
  return rate;
}

const nextChange = (path: SalaryPath, day: number) => path.steps.find((s) => s.day > day)?.day ?? Infinity;

/**
 * Salary accrues by calendar month: 1/12 of the annual rate per month, and a partial month
 * earns its share by days (days worked / days in that month). Salaried payroll pays a month as
 * a month, so a full calendar year sums to the annual rate and leap years don't change it.
 * A rate change mid-month splits the month by days.
 */
const salaryFor = (annual: number, a: number, b: number) => (annual / 12) * ((b - a) / daysInMonth(a));

/** Salary earned on [from, to). */
export function salaryEarned(path: SalaryPath, from: number, to: number): number {
  let sum = 0;
  for (let a = from; a < to;) {
    const b = Math.min(to, nextMonthStart(a), nextChange(path, a));
    sum += salaryFor(rateAt(path, a), a, b);
    a = b;
  }
  return sum;
}

/** One salary event per calendar month, split at anniversaries and rate changes, dated on its last day. */
export function salaryEvents(path: SalaryPath, from: number, to: number, anniversaries: number[]): RawEvent[] {
  const out: RawEvent[] = [];
  for (let a = from; a < to;) {
    const nextAnniversary = anniversaries.find((d) => d > a) ?? Infinity;
    const b = Math.min(to, nextMonthStart(a), nextAnniversary, nextChange(path, a));
    const days = b - a;
    const month = daysInMonth(a);
    const annual = rateAt(path, a);
    out.push({
      day: b - 1,
      component: "salary",
      detail: { kind: "salary", from: fromDays(a), to: fromDays(b - 1), annual, days, daysInMonth: month },
      gross: salaryFor(annual, a, b),
      accruedFrom: a,
    });
    a = b;
  }
  return out;
}

// ---- bonus ----------------------------------------------------------------------------

/**
 * Annual bonus. Each 12-month performance period pays on the first `payOn` after it ends.
 * percentOfSalary applies to salary earned in the period, so a partial first period prorates
 * itself; fixed and byEmploymentYear amounts prorate by days employed. A start on/after
 * `cutoff` skips that period. With a leave date, unpaid bonuses are forfeited, or
 * (mustBeEmployedOnPayDate: false) the leave period is prorated and still pays on its usual date.
 */
export function bonusEvents(
  bonus: AnnualBonus,
  scenario: Scenario,
  start: number,
  until: number,
  earned: (from: number, to: number) => number,
  employmentYearOf: (day: number) => number,
  warnings: OfferWarning[],
  leave?: number,
): RawEvent[] {
  if (bonus.basis === "byEmploymentYear" && bonus.amounts.length === 0) {
    throw new Error("A byEmploymentYear bonus needs at least one year's amounts.");
  }
  const periodStart = bonus.periodStart ?? { month: 1, day: 1 };
  const mustBeEmployed = bonus.mustBeEmployedOnPayDate ?? true;
  let year = yearOfDay(start);
  if (dayIn(year, periodStart) > start) year -= 1; // the period containing the start date
  const out: RawEvent[] = [];
  for (let first = true; ; first = false, year++) {
    const from = dayIn(year, periodStart);
    const to = dayIn(year + 1, periodStart);
    if (leave !== undefined && from > leave) break; // periods after you leave earn nothing
    const payDay = nextOccurrence(bonus.payOn, to);
    if (payDay >= until) break;
    const period = { periodFrom: fromDays(from), periodTo: fromDays(to - 1) };
    if (first && bonus.cutoff) {
      let cutoff = dayIn(year, bonus.cutoff);
      if (cutoff < from) cutoff = dayIn(year + 1, bonus.cutoff);
      if (start >= cutoff) {
        warnings.push({ code: "bonusCutoff", params: { start: fromDays(start), cutoff: bonus.cutoff, ...period } });
        continue;
      }
    }
    const pick = (v: { bear: number; base: number; bull: number }) =>
      (first && bonus.firstPayoutGuaranteed ? v.base : v[scenario]);
    const workedFrom = Math.max(from, start);
    /** The period's bonus for work from `workedFrom` up to (not including) `workedTo`. */
    const forWork = (workedTo: number): { gross: number; detail: BonusDetail } => {
      const common = { kind: "bonus" as const, ...period, proratedToLeave: workedTo < to };
      if (bonus.basis === "percentOfSalary") {
        const rate = pick(bonus.amount);
        const salaryEarned = earned(workedFrom, workedTo);
        return { gross: rate * salaryEarned, detail: { ...common, basis: "percentOfSalary", rate, salaryEarned } };
      }
      const n = bonus.basis === "byEmploymentYear" ? Math.min(employmentYearOf(to - 1), bonus.amounts.length) : 0;
      const amount = pick(bonus.basis === "byEmploymentYear" ? bonus.amounts[n - 1] : bonus.amount);
      return { gross: (amount * (workedTo - workedFrom)) / (to - from),
        detail: { ...common, basis: bonus.basis, amount, ...(n ? { employmentYear: n } : {}), daysEmployed: workedTo - workedFrom,
          periodDays: to - from } };
    };
    if (leave !== undefined && payDay > leave && mustBeEmployed) {
      // Forfeited: say what was earned toward it by the last day, and what it pays if you stay through the payout.
      const now = forWork(Math.min(to, leave + 1));
      const full = forWork(to);
      warnings.push({ code: "bonusForfeited", params: { leaveDate: fromDays(leave), ...period, payDate: fromDays(payDay),
        earned: round2(now.gross), full: round2(full.gross), detail: now.detail, fullDetail: full.detail } });
      continue;
    }
    const b = forWork(leave !== undefined ? Math.min(to, leave + 1) : to);
    out.push({ day: payDay, component: "bonus", gross: b.gross, detail: b.detail });
  }
  return out;
}

// ---- cash awards ---------------------------------------------------------------------

export function cashEvents(awards: CashAward[], start: number): RawEvent[] {
  return awards.map((a) => {
    const day = typeof a.paidOn === "string" ? toDays(a.paidOn) : start + a.paidOn.daysAfterStart;
    return { day, component: "cash", detail: { kind: "cash", award: a.label, amount: a.amount }, gross: a.amount };
  });
}
