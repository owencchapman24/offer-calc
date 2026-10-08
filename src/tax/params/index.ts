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
  /** IRC 402(g) elective deferral limit. */
  k401Limit: number;
  /** IRC 223(b)(2) HSA contribution limit, employee + employer. */
  hsaLimit: Readonly<{ self: number; family: number }>;
  /** IRC 127 educational assistance exclusion per year. */
  section127Limit: number;
  /** IRC 132(f) qualified transportation fringe per month. */
  commuterMonthlyLimit: number;
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
  /** State law for this year: 2026 amounts, with `indexed` amounts scaled in projected years. */
  states: Readonly<Record<string, StateSpec>>;
  local: LocalParams;
}

/**
 * SALT cap for `year`, IRC 164(b)(7) as added by Pub. L. 119-21 sec. 70120 (text verified on
 * Cornell LII, Oct 2026). No rounding anywhere in the paragraph.
 *  - Cap (A): $40,400 for 2026; for years after 2026 and before 2030, 101% of the prior
 *    year's amount; $10,000 after 2029.
 *  - Phase-down (B): only for years beginning before Jan 1, 2030. Reduce by 30% of MAGI over
 *    the threshold ($505,000 for 2026, then 101% of the prior year's), not below $10,000.
 */
export function saltForYear(year: number): SaltParams {
  if (year < BASE_YEAR) throw new Error(`No SALT parameters before ${BASE_YEAR}.`);
  if (year >= 2030) return { cap: 10_000 };
  const { cap, phaseDown } = FEDERAL_2026.salt;
  let c: number = cap;
  let threshold: number = phaseDown.threshold;
  for (let y = BASE_YEAR + 1; y <= year; y++) {
    c *= 1.01;
    threshold *= 1.01;
  }
  return { cap: c, phaseDown: { ...phaseDown, threshold } };
}

const PARAMS_2026: TaxParams = {
  year: BASE_YEAR,
  indexFactor: 1,
  projected: false,
  federal: { ...FEDERAL_2026, salt: saltForYear(BASE_YEAR) },
  payroll: PAYROLL_2026,
  states: STATES_2026,
  local: { nyc: NYC_2026, philadelphia: PHILLY_2026 },
};

const byStatus = <T, U>(r: Readonly<Record<FilingStatus, T>>, f: (v: T) => U): Record<FilingStatus, U> =>
  ({ single: f(r.single), joint: f(r.joint), headOfHousehold: f(r.headOfHousehold) });

const scaleSchedule = (s: Schedule, f: number): Schedule => s.map(([lo, rate]) => [lo * f, rate] as const);
const scalePair = (p: readonly [number, number], f: number) => [p[0] * f, p[1] * f] as const;

/** A state's projected spec: amounts listed in `indexed` scaled by `f`, everything else as in 2026. */
function projectState(s: StateSpec, f: number): StateSpec {
  const ix = s.indexed;
  if (!ix) return s;
  const out: StateSpec = { ...s };
  if (ix.brackets) {
    if (s.single) out.single = scaleSchedule(s.single, f);
    if (s.joint) out.joint = scaleSchedule(s.joint, f);
  }
  if (ix.stdDeduction && s.stdDeduction) out.stdDeduction = scalePair(s.stdDeduction, f);
  if (ix.exemption && s.exemption) out.exemption = scalePair(s.exemption, f);
  if (ix.exemptionCredit && s.exemptionCredit) out.exemptionCredit = scalePair(s.exemptionCredit, f);
  return out; // specialThresholds: state.ts scales them with params.indexFactor
}

/**
 * Tax parameters for `year`.
 * - 2026: enacted 2026 law (`inflation` is ignored).
 * - Later years: projected. Federal amounts that the IRC indexes are scaled by
 *   (1 + inflation)^(year - 2026), with no IRS rounding; the SALT cap follows its statutory
 *   schedule; Additional Medicare thresholds stay fixed (IRC 3101(b)(2), not indexed).
 *   The SS wage base is scaled by the same factor, though it really tracks the national
 *   average wage index. State law is held at 2026 except amounts a state indexes by
 *   statute (`StateSpec.indexed`) and federal links; local law is held at 2026.
 * There's no default inflation: callers choose it, so the assumption stays visible.
 */
export function paramsForYear(year: number, opts: { inflation?: number } = {}): TaxParams {
  if (!Number.isInteger(year) || year < BASE_YEAR) {
    throw new Error(`Tax year ${year} isn't supported: parameters start in ${BASE_YEAR}.`);
  }
  if (year === BASE_YEAR) return PARAMS_2026;
  const { inflation } = opts;
  if (inflation === undefined || !Number.isFinite(inflation) || inflation <= -1) {
    throw new Error(`Tax year ${year} is projected from ${BASE_YEAR} law: pass paramsForYear(${year}, { inflation }).`);
  }
  const indexFactor = (1 + inflation) ** (year - BASE_YEAR);
  const ix = (n: number) => n * indexFactor;
  return {
    year,
    indexFactor,
    projected: true,
    federal: {
      standardDeduction: byStatus(FEDERAL_2026.standardDeduction, ix), // IRC 63(c)(7)
      brackets: byStatus(FEDERAL_2026.brackets, (s) => s.map(([lo, rate]) => [ix(lo), rate] as const)), // IRC 1(f), 1(j)(3)
      salt: saltForYear(year),
      k401Limit: ix(FEDERAL_2026.k401Limit), // IRC 402(g)(4)
      hsaLimit: { self: ix(FEDERAL_2026.hsaLimit.self), family: ix(FEDERAL_2026.hsaLimit.family) }, // IRC 223(g)
      section127Limit: ix(FEDERAL_2026.section127Limit), // IRC 127, indexed after 2026
      commuterMonthlyLimit: ix(FEDERAL_2026.commuterMonthlyLimit), // IRC 132(f)(6)
    },
    payroll: { ...PAYROLL_2026, socialSecurityWageBase: ix(PAYROLL_2026.socialSecurityWageBase) },
    states: Object.fromEntries(Object.entries(STATES_2026).map(([k, s]) => [k, projectState(s, indexFactor)])),
    local: PARAMS_2026.local, // NYC brackets are statutory; Philadelphia's rate is set yearly, so hold 2026
  };
}
