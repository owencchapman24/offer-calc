import type { VestingSchedule } from "../../src/offer/types";
import { VESTING_PRESETS } from "../../src/offer/presets";

// The vesting presets the equity editor offers: the engine's own (src/offer/presets.ts, which the main thread may import).
export const PRESETS = VESTING_PRESETS;

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
