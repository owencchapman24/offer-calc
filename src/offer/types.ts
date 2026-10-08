import type { FilingStatus, Locality, TaxInput, TaxResult } from "../tax/types";

// Offer model types (docs/offer-model.md §12b). Slice 1: salary, bonus, cash awards, one
// scenario at a time. RSUs, leave date/clawbacks, raises and multi-scenario totals come later.

// ---- shared -----------------------------------------------------------------
/** Civil date "YYYY-MM-DD". Date math is on calendar days (UTC), never local time. */
export type ISODate = string;
/** A date that recurs every year, e.g. { month: 3, day: 15 }. */
export interface MonthDay { month: number; day: number }

/** Joint scenarios: each sets every uncertain input to its bear/base/bull value at once. */
export type Scenario = "bear" | "base" | "bull";
export interface ByScenario { bear: number; base: number; bull: number }

// ---- inputs -----------------------------------------------------------------
export interface OfferInput {
  label: string;
  /** Where you'd live: the engine taxes you as a full-year resident here. */
  residence: { state: string; locality?: Locality };
  /** Where the employer is. Drives the convenience-of-employer warning; not taxed. */
  employerState: string;
  startDate: ISODate;
  salary: Salary;
  bonus?: AnnualBonus;
  /** Sign-on, year-2 sign-on, relocation: anything paid as a lump of cash. */
  cashAwards?: CashAward[];
}

export interface Salary {
  /** Annual rate. */
  annual: number;
}

export interface AnnualBonus {
  /** percentOfSalary: fraction of salary earned in the period. fixed: dollars, prorated by days. */
  basis: "percentOfSalary" | "fixed";
  amount: ByScenario;
  /** Performance period = 12 months from this date. Default Jan 1. */
  periodStart?: MonthDay;
  /** Paid on the first occurrence of this date after the period ends. */
  payOn: MonthDay;
  /** Starting on/after this date in a period earns nothing for that period. */
  cutoff?: MonthDay;
  /** First payout at the base (target) amount in every scenario. */
  firstPayoutGuaranteed?: boolean;
}

export interface CashAward {
  label: string;
  amount: number;
  paidOn: ISODate | { daysAfterStart: number };
}

/** About you, not the job: shared by every offer being compared. */
export interface Household {
  filingStatus: FilingStatus;
  /** Your W-2 wages from other jobs, by calendar year (e.g. the job you're leaving). */
  otherWages?: Record<number, number>;
  /** Joint filers: spouse's W-2 wages by calendar year. Unlisted years are 0. */
  spouseWages?: Record<number, number>;
}

export interface ProjectionOptions {
  /** Default "base". */
  scenario?: Scenario;
  /** Employment years to show. Default 5. */
  years?: number;
  /** Indexes tax law after 2026 (not pay growth). Default 0.025. */
  inflation?: number;
}

// ---- outputs ------------------------------------------------------------------
export type Component = "salary" | "bonus" | "cash";
export type ByComponent = Record<Component, number> & { total: number };

/** One dated payment: the unit of "show the work". Money is rounded to cents. */
export interface CompEvent {
  /** Pay date; a salary event is dated on the last day of the stretch it covers. */
  date: ISODate;
  component: Component;
  label: string;
  /** The arithmetic, e.g. "$150,000 x 29/365". */
  formula: string;
  gross: number;
  calendarYear: number;
  /** 1-based. Above `years` means after the reported horizon (kept so its year is taxed in full). */
  employmentYear: number;
  tax: number;
  net: number;
}

export interface CalendarYearResult {
  year: number;
  offerGross: ByComponent;
  /** Exactly what went into the engine, both runs. Offer tax = difference in totalTax. */
  withOffer: { input: TaxInput; result: TaxResult };
  withoutOffer: { input: TaxInput; result: TaxResult };
  offerTax: number;
  /** offerTax / offerGross.total, applied to every payment in the year. */
  offerTaxRate: number;
  /** (1 + inflation)^(year - 2026); 1 in 2026. */
  indexFactor: number;
  projectedLaw: boolean;
}

export interface EmploymentYearResult {
  year: number;
  start: ISODate;
  /** Exclusive: the next anniversary. */
  end: ISODate;
  gross: ByComponent;
  tax: number;
  net: number;
  /** Offer-letter view: salary rate at year start + target bonus on it + cash awards paid
   *  in the year. No proration, no payout lag. */
  quotedTC: number;
}

export interface ScenarioResult {
  label: string;
  scenario: Scenario;
  events: CompEvent[];
  calendarYears: CalendarYearResult[];
  employmentYears: EmploymentYearResult[];
  /** Input-specific, plain language. */
  warnings: string[];
  /** Assumptions behind these numbers, for the methodology page. */
  assumptions: string[];
}
