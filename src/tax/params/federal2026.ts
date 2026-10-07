import type { FilingStatus, Schedule } from "../types";

/**
 * Federal parameters, tax year 2026.
 * Source: IRS Rev. Proc. 2025-32 (inflation adjustments incl. OBBBA changes).
 * Brackets cross-checked against IRS-derived tables (NerdWallet, Ed Slott & Co., LPL)
 * and against PolicyEngine-US 2.30.3.
 */
export const FEDERAL_2026 = {
  standardDeduction: {
    single: 16_100,
    joint: 32_200,
    headOfHousehold: 24_150,
  } satisfies Record<FilingStatus, number>,

  brackets: {
    single: [
      [0, 0.1], [12_400, 0.12], [50_400, 0.22], [105_700, 0.24],
      [201_775, 0.32], [256_225, 0.35], [640_600, 0.37],
    ],
    joint: [
      [0, 0.1], [24_800, 0.12], [100_800, 0.22], [211_400, 0.24],
      [403_550, 0.32], [512_450, 0.35], [768_700, 0.37],
    ],
    headOfHousehold: [
      [0, 0.1], [17_700, 0.12], [67_450, 0.22], [105_700, 0.24],
      [201_750, 0.32], [256_200, 0.35], [640_600, 0.37],
    ],
  } satisfies Record<FilingStatus, Schedule>,
} as const;

/**
 * Payroll (FICA) parameters, 2026.
 * Source: SSA 2026 COLA fact sheet; IRC 3101(b)(2) for Additional Medicare Tax
 * (thresholds are statutory and not indexed).
 */
export const PAYROLL_2026 = {
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 184_500,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: {
    single: 200_000,
    joint: 250_000,
    headOfHousehold: 200_000,
  } satisfies Record<FilingStatus, number>,
} as const;
