import type { FilingStatus, Schedule } from "../types";
import { FEDERAL_2026, PAYROLL_2026 } from "./federal2026";
import { NYC_2026, PHILLY_2026 } from "./local2026";
import { STATES_2026, type StateSpec } from "./states2026";

/** Year of all parameter data in params/. Later years are projected from it. */
export const BASE_YEAR = 2026;

export interface SaltParams {
  cap: number;
  /** Absent from 2030: IRC 164(b)(7)(B) applies only to years beginning before Jan 1, 2030. */
  phaseDown?: { threshold: number; rate: number; floor: number };
}

export interface FederalParams {
  standardDeduction: Readonly<Record<FilingStatus, number>>;
  brackets: Readonly<Record<FilingStatus, Schedule>>;
  salt: SaltParams;
  k401Limit: number;
}

export interface PayrollParams {
  socialSecurityRate: number;
  socialSecurityWageBase: number;
  medicareRate: number;
  additionalMedicareRate: number;
  additionalMedicareThreshold: Readonly<Record<FilingStatus, number>>;
}

export interface LocalParams {
  nyc: Readonly<Record<"single" | "joint", Schedule>>;
  philadelphia: { resident: number; nonresident: number };
}

/** Every parameter the engine reads for one tax year. Build with paramsForYear(). */
export interface TaxParams {
  year: number;
  /** (1 + inflation)^(year - 2026); exactly 1 for 2026. */
  indexFactor: number;
  /** True after 2026: law projected from 2026 rather than enacted amounts. */
  projected: boolean;
  federal: FederalParams;
  payroll: PayrollParams;
  states: Readonly<Record<string, StateSpec>>;
  local: LocalParams;
}

const PARAMS_2026: TaxParams = {
  year: BASE_YEAR,
  indexFactor: 1,
  projected: false,
  federal: FEDERAL_2026,
  payroll: PAYROLL_2026,
  states: STATES_2026,
  local: { nyc: NYC_2026, philadelphia: PHILLY_2026 },
};

/** Tax parameters for `year`. */
export function paramsForYear(year: number): TaxParams {
  if (year === BASE_YEAR) return PARAMS_2026;
  throw new Error("Only tax year 2026 is supported.");
}
