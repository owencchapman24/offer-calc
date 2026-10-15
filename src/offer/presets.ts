import type { VestingSchedule } from "./types";

// The vesting presets and the builder behind them. Pure, with no run-time imports, so the main thread may import it
// (the samples and the equity editor use the presets): scripts/lib/imports.test.ts holds it to that.

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

/** Common schedules, named by split and cadence. Pair with `vestDates` for a company vest calendar. */
export const VESTING_PRESETS = {
  /** 25/25/25/25: 25% at a 1-year cliff, then quarterly. */
  evenQuarterlyAfterCliff: byYear([25, 25, 25, 25], { perYear: 4, cliffMonths: 12 }),
  /** 25/25/25/25: 25% on each of the first four anniversaries. */
  evenAnnual: byYear([25, 25, 25, 25], { perYear: 1 }),
  /** 5/15/40/40: 5% at a 1-year cliff, then semiannual (7.5% twice, then 20% every six months). */
  backLoadedSemiannualAfterCliff: byYear([5, 15, 40, 40], { perYear: 2, cliffMonths: 12 }),
  /** 33/33/22/12: monthly from month 1, no cliff. */
  frontLoadedMonthly: byYear([33, 33, 22, 12], { perYear: 12 }),
} as const;
