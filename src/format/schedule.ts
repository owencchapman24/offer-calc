import type { VestingSchedule } from "../offer/types";

// Words for a vesting schedule, read off its tranches, so a label can't drift from the schedule.

const CADENCE: Record<number, string> = { 1: "monthly", 3: "quarterly", 6: "semiannual", 12: "annual" };

/** Plain-language label read off the tranches, e.g. "5/15/40/40, semiannual after a 1-year cliff". */
export function describeSchedule(s: VestingSchedule): string {
  const pcts: number[] = [];
  for (const t of s.tranches) {
    const year = Math.max(0, Math.ceil(t.month / 12) - 1);
    pcts[year] = (pcts[year] ?? 0) + t.fraction * 100;
  }
  const split = Array.from(pcts, (p) => +(p ?? 0).toFixed(1)).join("/");
  const months = s.tranches.map((t) => t.month);
  const gaps = months.slice(1).map((m, i) => m - months[i]);
  if (gaps.length === 0) return `${split}, all at month ${months[0]}`;
  if (!gaps.every((g) => g === gaps[0])) return `${split} by year, on a custom schedule`;
  const cadence = CADENCE[gaps[0]] ?? `every ${gaps[0]} months`;
  if (months[0] === gaps[0]) return `${split}, ${cadence}`;
  const cliff = months[0] % 12 === 0 ? `${months[0] / 12}-year` : `${months[0]}-month`;
  return `${split}, ${cadence} after a ${cliff} cliff`;
}
