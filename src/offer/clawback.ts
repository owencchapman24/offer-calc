import { addMonths } from "./dates";
import type { Clawback } from "./types";

/**
 * Share of an award owed back if your last day is `leave`. The window runs from the clock
 * start to clock start + `months`; working through its last day (leave = end - 1) clears it.
 * "prorated" owes the unworked share: by completed months (default) or by days.
 */
export function clawbackFraction(c: Clawback, clockStart: number, leave: number): number {
  if (!Number.isInteger(c.months) || c.months < 1) throw new Error("Clawback months must be a whole number >= 1.");
  const end = addMonths(clockStart, c.months);
  const firstDayGone = leave + 1;
  if (firstDayGone >= end) return 0;
  if (c.kind === "full") return 1;
  if ((c.per ?? "month") === "day") return (end - firstDayGone) / (end - clockStart);
  let completed = 0;
  while (completed < c.months && addMonths(clockStart, completed + 1) <= firstDayGone) completed++;
  return (c.months - completed) / c.months;
}

/** IRC 1341 applies to repayments over $3,000; below that there's no federal deduction or credit. */
export const SECTION_1341_THRESHOLD = 3_000;
