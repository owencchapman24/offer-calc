import { dayIn, daysInYear, formatMonthDay, fromDays, jan1, nextMonthStart, nextOccurrence, toDays, yearOfDay } from "./dates";
import type { AnnualBonus, CashAward, Component, Scenario } from "./types";

// Each stream turns part of an offer into dated payments (unrounded). Days are day numbers;
// ranges are half-open [from, to).

export interface RawEvent {
  day: number;
  component: Component;
  label: string;
  formula: string;
  gross: number;
  /** Accrued pay (salary): the first day it covers. Its employment year follows this day. */
  accruedFrom?: number;
}

/** "$150,000" or "$62,054.79" */
export const usd = (x: number) =>
  `$${x.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 })}`;
const pct = (x: number) => `${+(x * 100).toFixed(4)}%`;

/** Salary earned on [from, to): each day earns annual / (days in its calendar year). */
export function salaryEarned(annual: number, from: number, to: number): number {
  let sum = 0;
  for (let a = from; a < to;) {
    const year = yearOfDay(a);
    const b = Math.min(to, jan1(year + 1));
    sum += (annual * (b - a)) / daysInYear(year);
    a = b;
  }
  return sum;
}

/** One salary event per calendar month, split at anniversaries, dated on its last day. */
export function salaryEvents(annual: number, from: number, to: number, anniversaries: number[]): RawEvent[] {
  const out: RawEvent[] = [];
  for (let a = from; a < to;) {
    const nextAnniversary = anniversaries.find((d) => d > a) ?? Infinity;
    const b = Math.min(to, nextMonthStart(a), nextAnniversary);
    const year = yearOfDay(a);
    out.push({
      day: b - 1,
      component: "salary",
      label: `Salary ${fromDays(a)} to ${fromDays(b - 1)}`,
      formula: `${usd(annual)} x ${b - a}/${daysInYear(year)}`,
      gross: (annual * (b - a)) / daysInYear(year),
      accruedFrom: a,
    });
    a = b;
  }
  return out;
}

/**
 * Annual bonus. Each 12-month performance period pays on the first `payOn` after it ends.
 * percentOfSalary applies to salary earned in the period, so a partial first period prorates
 * itself; fixed amounts prorate by days employed. A start on/after `cutoff` skips that period.
 */
export function bonusEvents(
  bonus: AnnualBonus,
  scenario: Scenario,
  start: number,
  until: number,
  earned: (from: number, to: number) => number,
  warnings: string[],
): RawEvent[] {
  const periodStart = bonus.periodStart ?? { month: 1, day: 1 };
  let year = yearOfDay(start);
  if (dayIn(year, periodStart) > start) year -= 1; // the period containing the start date
  const out: RawEvent[] = [];
  for (let first = true; ; first = false, year++) {
    const from = dayIn(year, periodStart);
    const to = dayIn(year + 1, periodStart);
    const payDay = nextOccurrence(bonus.payOn, to);
    if (payDay >= until) break;
    const period = `${fromDays(from)} to ${fromDays(to - 1)}`;
    if (first && bonus.cutoff) {
      let cutoff = dayIn(year, bonus.cutoff);
      if (cutoff < from) cutoff = dayIn(year + 1, bonus.cutoff);
      if (start >= cutoff) {
        warnings.push(`Start date ${fromDays(start)} is on or after the ${formatMonthDay(bonus.cutoff)} bonus `
          + `cutoff, so the ${period} period pays nothing.`);
        continue;
      }
    }
    const rate = first && bonus.firstPayoutGuaranteed ? bonus.amount.base : bonus.amount[scenario];
    const workedFrom = Math.max(from, start);
    let gross: number;
    let formula: string;
    if (bonus.basis === "percentOfSalary") {
      const base = earned(workedFrom, to);
      gross = rate * base;
      formula = `${pct(rate)} x ${usd(Math.round(base * 100) / 100)} salary earned in the period`;
    } else {
      gross = (rate * (to - workedFrom)) / (to - from);
      formula = `${usd(rate)} x ${to - workedFrom}/${to - from} days employed`;
    }
    out.push({ day: payDay, component: "bonus", label: `Bonus for ${period}`, formula, gross });
  }
  return out;
}

export function cashEvents(awards: CashAward[], start: number): RawEvent[] {
  return awards.map((a) => {
    const day = typeof a.paidOn === "string" ? toDays(a.paidOn) : start + a.paidOn.daysAfterStart;
    return { day, component: "cash", label: a.label, formula: usd(a.amount), gross: a.amount };
  });
}
