import { addMonths, checkMonthDay, dayIn, fromDays, yearOfDay } from "./dates";
import { type RawEvent, usd } from "./streams";
import type { RefresherPolicy, VestingSchedule } from "./types";

/**
 * Vesting schedule from percentages per year, each year split into `perYear` equal vests.
 * Anything scheduled before `cliffMonths` vests at the cliff instead.
 *   byYear([25, 25, 25, 25], { perYear: 4, cliffMonths: 12 })  // 25% at 12 months, then quarterly
 *   byYear([5, 15, 40, 40], { perYear: 2, cliffMonths: 12 })    // back-loaded, semiannual
 */
export function byYear(pctPerYear: number[], opts: { perYear: number; cliffMonths?: number }): VestingSchedule {
  const { perYear, cliffMonths = 0 } = opts;
  if (!Number.isInteger(perYear) || perYear < 1 || 12 % perYear !== 0) {
    throw new Error("perYear must divide 12 (1, 2, 3, 4, 6 or 12).");
  }
  if (pctPerYear.some((p) => !(p >= 0))) throw new Error("Vesting percentages can't be negative.");
  const sum = pctPerYear.reduce((s, p) => s + p, 0);
  if (Math.abs(sum - 100) > 1e-9) throw new Error(`Vesting percentages must sum to 100 (got ${sum}).`);
  const byMonth = new Map<number, number>();
  pctPerYear.forEach((p, year) => {
    for (let k = 1; k <= perYear; k++) {
      const month = Math.max(year * 12 + (k * 12) / perYear, cliffMonths);
      byMonth.set(month, (byMonth.get(month) ?? 0) + p / 100 / perYear);
    }
  });
  return {
    tranches: [...byMonth].filter(([, f]) => f > 0).sort((a, b) => a[0] - b[0])
      .map(([month, fraction]) => ({ month, fraction })),
  };
}

/** Common schedules. Pair with `vestDates` for a company vest calendar. */
export const VESTING_PRESETS = {
  /** 25% a year: 25% at a 1-year cliff, then quarterly. */
  standard: byYear([25, 25, 25, 25], { perYear: 4, cliffMonths: 12 }),
  /** 25% on each of the first four anniversaries. */
  annual: byYear([25, 25, 25, 25], { perYear: 1 }),
  /** Back-loaded 5/15/40/40: 5% at a 1-year cliff, then semiannual. */
  backLoaded: byYear([5, 15, 40, 40], { perYear: 2, cliffMonths: 12 }),
  /** Front-loaded 33/33/22/12, monthly from month 1, no cliff. */
  frontLoaded: byYear([33, 33, 22, 12], { perYear: 12 }),
} as const;

export function checkSchedule(s: VestingSchedule): void {
  if (s.tranches.length === 0) throw new Error("A vesting schedule needs at least one tranche.");
  for (const t of s.tranches) {
    if (!Number.isInteger(t.month) || t.month < 0) throw new Error(`Tranche month ${t.month} must be a whole number >= 0.`);
    if (!(t.fraction > 0)) throw new Error("Tranche fractions must be positive.");
  }
  const sum = s.tranches.reduce((a, t) => a + t.fraction, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`Tranche fractions must sum to 1 (got ${sum}).`);
  if (s.vestDates) {
    if (s.vestDates.months.length === 0) throw new Error("vestDates needs at least one month.");
    for (const month of s.vestDates.months) checkMonthDay({ month, day: s.vestDates.day });
  }
}

/** First company vest date on or after `day`. */
export function snapToVestDate(day: number, cal: { months: number[]; day: number }): number {
  const year = yearOfDay(day);
  const candidates = [year, year + 1].flatMap((y) => cal.months.map((month) => dayIn(y, { month, day: cal.day })));
  return Math.min(...candidates.filter((d) => d >= day));
}

export interface GrantInstance {
  label: string;
  value: number;
  grantDay: number;
  vestStartDay: number;
  schedule: VestingSchedule;
}

/** Nominal (unsnapped) vest day of each tranche. */
export const nominalVestDays = (g: GrantInstance) => g.schedule.tranches.map((t) => addMonths(g.vestStartDay, t.month));

/**
 * One event per tranche vesting before `until`, valued at vest: fraction x grant value x
 * (1 + growth)^(years from grant to vest). Vested RSUs are W-2 wages at that value.
 */
export function rsuEvents(g: GrantInstance, growth: number, until: number): RawEvent[] {
  const nominal = nominalVestDays(g);
  const n = g.schedule.tranches.length;
  return g.schedule.tranches.flatMap((t, i) => {
    const day = g.schedule.vestDates ? snapToVestDate(nominal[i], g.schedule.vestDates) : nominal[i];
    if (day >= until) return [];
    const factor = (1 + growth) ** ((day - g.grantDay) / 365.25);
    const moved = day !== nominal[i] ? ` (nominal ${fromDays(nominal[i])})` : "";
    return [{
      day,
      component: "rsu" as const,
      label: `RSU: ${g.label}, tranche ${i + 1} of ${n}${moved}`,
      formula: `${usd(g.value)} x ${+(t.fraction * 100).toFixed(4)}% x ${factor.toFixed(4)} price factor`,
      gross: t.fraction * g.value * factor,
    }];
  });
}

/** Refresher grants made before `until`, each vesting from its own grant date. */
export function refresherGrants(p: RefresherPolicy, value: number, start: number, until: number): GrantInstance[] {
  if (!Number.isInteger(p.firstAfterMonths) || p.firstAfterMonths < 0) throw new Error("firstAfterMonths must be a whole number >= 0.");
  if (!Number.isInteger(p.everyMonths) || p.everyMonths < 1) throw new Error("everyMonths must be a whole number >= 1.");
  const out: GrantInstance[] = [];
  for (let k = 0; ; k++) {
    const grantDay = addMonths(start, p.firstAfterMonths + k * p.everyMonths);
    if (grantDay >= until) break;
    out.push({
      label: `${p.label ?? "Refresher"} ${k + 1} (granted ${fromDays(grantDay)})`,
      value, grantDay, vestStartDay: grantDay, schedule: p.schedule,
    });
  }
  return out;
}
