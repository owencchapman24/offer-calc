import type { Schedule } from "./types";

/** Tax owed on `income` under a progressive schedule of [lowerBound, rate] bands. */
export function applySchedule(schedule: Schedule, income: number): number {
  if (income <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < schedule.length; i++) {
    const [lower, rate] = schedule[i];
    const upper = i + 1 < schedule.length ? schedule[i + 1][0] : Infinity;
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * rate;
  }
  return tax;
}

/** Index of the band that `income` falls into. */
export function bandIndex(schedule: Schedule, income: number): number {
  let idx = 0;
  for (let i = 0; i < schedule.length; i++) if (income > schedule[i][0]) idx = i;
  return idx;
}

export const clamp0 = (x: number) => Math.max(0, x);
export const round2 = (x: number) => Math.round(x * 100) / 100;
