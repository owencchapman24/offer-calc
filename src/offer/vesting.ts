import { addMonths, checkMonthDay, dayIn, fromDays, yearOfDay } from "./dates";
import type { RawEvent } from "./streams";
import type { RefresherPolicy, RsuGrantRef, VestingSchedule } from "./types";

export { byYear, VESTING_PRESETS } from "./presets";

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
  grant: RsuGrantRef;
  value: number;
  grantDay: number;
  vestStartDay: number;
  schedule: VestingSchedule;
}

/** Nominal (unsnapped) vest day of each tranche. */
export const nominalVestDays = (g: GrantInstance) => g.schedule.tranches.map((t) => addMonths(g.vestStartDay, t.month));

/** Actual vest day of each tranche, after any snapping to the company vest calendar. */
export const vestDays = (g: GrantInstance) => nominalVestDays(g)
  .map((d) => (g.schedule.vestDates ? snapToVestDate(d, g.schedule.vestDates) : d));

/**
 * One event per tranche vesting before `until`, valued at vest: fraction x grant value x
 * (1 + growth)^(years from grant to vest). Vested RSUs are W-2 wages at that value.
 */
export function rsuEvents(g: GrantInstance, growth: number, until: number): RawEvent[] {
  const nominal = nominalVestDays(g);
  const actual = vestDays(g);
  const n = g.schedule.tranches.length;
  return g.schedule.tranches.flatMap((t, i) => {
    const day = actual[i];
    if (day >= until) return [];
    const factor = (1 + growth) ** ((day - g.grantDay) / 365.25);
    return [{
      day,
      component: "rsu" as const,
      detail: {
        kind: "rsu" as const, grant: g.grant, tranche: i + 1, tranches: n, grantValue: g.value, fraction: t.fraction,
        priceFactor: factor, ...(day !== nominal[i] ? { nominalDate: fromDays(nominal[i]) } : {}),
      },
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
      grant: { kind: "refresher", ...(p.label !== undefined ? { label: p.label } : {}), number: k + 1, grantDate: fromDays(grantDay) },
      value, grantDay, vestStartDay: grantDay, schedule: p.schedule,
    });
  }
  return out;
}
