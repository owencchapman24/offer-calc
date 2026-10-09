import type { VestingSchedule } from "../../src/offer/types";

// The vesting presets the equity editor offers, built the way the engine's byYear() builds
// VESTING_PRESETS. The main thread can't import engine values, so they're rebuilt here; a test
// checks they equal the engine's, tranche for tranche.

/** Percents per year, each year split into `perYear` equal vests; anything before the cliff vests at the cliff. */
function byYear(pctPerYear: number[], perYear: number, cliffMonths = 0): VestingSchedule {
  const byMonth = new Map<number, number>();
  pctPerYear.forEach((p, year) => {
    for (let k = 1; k <= perYear; k++) {
      const month = Math.max(year * 12 + (k * 12) / perYear, cliffMonths);
      byMonth.set(month, (byMonth.get(month) ?? 0) + p / 100 / perYear);
    }
  });
  return { tranches: [...byMonth].filter(([, f]) => f > 0).sort((a, b) => a[0] - b[0]).map(([month, fraction]) => ({ month, fraction })) };
}

export const PRESETS = {
  /** 25/25/25/25: 25% at a 1-year cliff, then quarterly. The default: the most common. */
  evenQuarterlyAfterCliff: byYear([25, 25, 25, 25], 4, 12),
  evenAnnual: byYear([25, 25, 25, 25], 1),
  backLoadedSemiannualAfterCliff: byYear([5, 15, 40, 40], 2, 12),
  frontLoadedMonthly: byYear([33, 33, 22, 12], 12),
} as const;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
export const DEFAULT_PRESET: PresetId = "evenQuarterlyAfterCliff";

/** The preset whose tranches these are, if any. */
export function presetOf(tranches: VestingSchedule["tranches"]): PresetId | null {
  return PRESET_IDS.find((id) => {
    const p = PRESETS[id].tranches;
    return p.length === tranches.length && p.every((t, i) => t.month === tranches[i].month && Math.abs(t.fraction - tranches[i].fraction) < 1e-12);
  }) ?? null;
}
