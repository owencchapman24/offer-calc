import type { FilingStatus, Locality, TaxInput, TaxResult } from "../tax/types";

// Offer model types (docs/offer-model.md §12b). Slices 1-3: salary, bonus, cash awards, RSUs,
// leave date and clawbacks, one scenario at a time. Raises and multi-scenario totals come later.

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
  /**
   * Your last day of work (inclusive). Cuts off every stream: salary stops, unvested RSU
   * tranches and ungranted refreshers are forfeited, unpaid bonuses follow
   * `bonus.mustBeEmployedOnPayDate`, unpaid cash awards are never paid, and clawbacks trigger.
   * Omit to stay through the horizon. Assumes a voluntary exit.
   */
  leaveDate?: ISODate;
  salary: Salary;
  bonus?: AnnualBonus;
  /** Sign-on, year-2 sign-on, relocation: anything paid as a lump of cash. */
  cashAwards?: CashAward[];
  equity?: Equity;
}

export interface Equity {
  /** Annual share-price growth, one path for all grants. Default 0 in every scenario. */
  priceGrowth?: ByScenario;
  grants: RsuGrant[];
  refreshers?: RefresherPolicy;
}

export interface RsuGrant {
  kind: "rsu"; // room for "option" later
  label: string;
  /** Dollar value at grant, as quoted. (Have shares? Pass shares x grant price.) */
  value: number;
  /** Default startDate. The price-growth clock starts here. */
  grantDate?: ISODate;
  /** Default startDate. Tranche months count from here. */
  vestStart?: ISODate;
  schedule: VestingSchedule;
}

export interface VestingSchedule {
  /** Fraction vesting at each month offset from vestStart. Must sum to 1. */
  tranches: Array<{ month: number; fraction: number }>;
  /** Company vest calendar, e.g. { months: [2, 5, 8, 11], day: 15 }. A tranche moves to the
   *  first company vest date on or after its nominal date. Omit to vest on the nominal date. */
  vestDates?: { months: number[]; day: number };
}

/** Refresher grants: a new grant every `everyMonths`, the first `firstAfterMonths` after start. */
export interface RefresherPolicy {
  /** Default "Refresher". */
  label?: string;
  /** Dollar value of each refresher grant. */
  value: ByScenario;
  firstAfterMonths: number;
  everyMonths: number;
  schedule: VestingSchedule;
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
  /**
   * Default true: a bonus not paid by your leave date is forfeited. false: the period you
   * leave in pays a prorated bonus (salary earned to the leave date), and every earned bonus
   * still pays on its usual date.
   */
  mustBeEmployedOnPayDate?: boolean;
}

export interface CashAward {
  label: string;
  amount: number;
  paidOn: ISODate | { daysAfterStart: number };
  clawback?: Clawback;
}

/** Repayment owed if you leave before working through the window. */
export interface Clawback {
  /** Window length. You're clear once your leave date is the day before clock start + months, or later. */
  months: number;
  /** "full": owe it all if you leave inside the window. "prorated": owe the unworked share. */
  kind: "full" | "prorated";
  /** Proration unit. Default "month": only completed months count as worked. */
  per?: "month" | "day";
  /** Clock start. Default "start" (your start date); "payment" suits later installments. */
  from?: "start" | "payment";
  /** Default "gross": you repay the full amount though you received it net of withholding. */
  repay?: "gross" | "net";
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
export type Component = "salary" | "bonus" | "cash" | "rsu" | "clawback";
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
  /**
   * Clawbacks of earlier years' payments repaid this year. Not wages, so they're outside
   * offerGross/offerTax; `relief` is the IRC 1341 federal credit claimed for them.
   */
  priorYearRepayments: { repaid: number; relief: number };
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
   *  in the year + new-hire RSU tranches nominally due in the year, at grant value. No
   *  proration, payout lag, vest-date snapping, price growth or refreshers. */
  quotedTC: number;
}

export interface ClawbackResult {
  award: string;
  paidOn: ISODate;
  repaidOn: ISODate;
  /** Share of the award clawed back (1 = all of it). */
  fraction: number;
  basis: "gross" | "net";
  /** Cash you hand back. */
  owed: number;
  treatment: "same-year wage reversal" | "IRC 1341 credit" | "no relief ($3,000 or less)";
  /** Tax you get back: the reversed year's tax (same year) or the federal 1341 credit (later year). */
  taxRelief: number;
  /** What leaving costs you: owed - taxRelief (for same-year net repayment, the employer keeps the withholding). */
  netCost: number;
}

export interface LeaveResult {
  leaveDate: ISODate;
  /** RSU tranches granted by the leave date but not vested by it, at grant value. */
  unvestedRsuForfeited: number;
  clawbacks: ClawbackResult[];
}

/** One row of leaveDateSweep: what you keep if your last day is after `months` months. */
export interface LeaveSweepRow {
  months: number;
  /** start + months - 1 day: you work exactly `months` months. */
  leaveDate: ISODate;
  /** Salary, bonus, cash and vested RSUs paid, before tax and clawbacks. */
  paid: number;
  /** Cash handed back under clawbacks. */
  clawbackOwed: number;
  /** After tax and clawbacks, nominal. */
  netKept: number;
  unvestedRsuForfeited: number;
}

export interface ScenarioResult {
  label: string;
  scenario: Scenario;
  events: CompEvent[];
  calendarYears: CalendarYearResult[];
  employmentYears: EmploymentYearResult[];
  /** Present when the offer has a leave date. */
  leave?: LeaveResult;
  /** Input-specific, plain language. */
  warnings: string[];
  /** Assumptions behind these numbers, for the methodology page. */
  assumptions: string[];
}
