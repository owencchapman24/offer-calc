import type { FilingStatus, Locality, TaxInput, TaxResult } from "../tax/types";

// Offer model types (docs/offer-model.md §12b). projectScenario runs one scenario;
// projectOffer runs bear/base/bull together; compareOffers puts offers on one window.

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
  /** Starting annual rate. */
  annual: number;
  /** Annual merit raise, e.g. 0.03. Default 0 in every scenario. Pay growth, not tax inflation. */
  raise?: ByScenario;
  /** When merit raises take effect: each work anniversary (default) or each Jan 1 after you start. */
  raiseOn?: "anniversary" | "jan1";
  promotions?: Promotion[];
}

export interface Promotion {
  on: ISODate;
  /** Increase at that date, e.g. 0.35 = +35%. Merit raises compound from the new salary. */
  stepUp: number;
  /** Scenarios that include this promotion. Default all three. */
  scenarios?: Scenario[];
}

/**
 * percentOfSalary: a fraction of salary earned in the period. fixed: dollars a year, prorated
 * by days employed. byEmploymentYear: dollars by employment year (the year the period ends in;
 * the last entry repeats), prorated by days employed.
 */
export type AnnualBonus = BonusTiming & (
  | { basis: "percentOfSalary"; amount: ByScenario }
  | { basis: "fixed"; amount: ByScenario }
  | { basis: "byEmploymentYear"; amounts: ByScenario[] }
);

export interface BonusTiming {
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
  /** Default "base". projectScenario only; projectOffer runs all three. */
  scenario?: Scenario;
  /** Employment years to show. Default 5. */
  years?: number;
  /** Indexes tax law after 2026 (not pay growth). Default 0.025. */
  inflation?: number;
  /** Present values are as of this date. The UI passes today; tests pass a fixed date. */
  valuationDate?: ISODate;
  /** Nominal annual discount rate for present values. Default 0.05. */
  discountRate?: number;
  /** Totals window. Default [startDate, startDate + years). compareOffers sets a shared one. */
  window?: { start: ISODate; years: number };
}

/** projectOffer, compareOffers and breakeven need a valuation date. */
export type ValuedOptions = Omit<ProjectionOptions, "scenario"> & { valuationDate: ISODate };

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
  /** Inside the totals window. */
  inWindow: boolean;
  /** (1 + discountRate)^-((date - valuationDate) / 365.25), when a valuation date is given. */
  discountFactor?: number;
}

export interface Money { gross: number; tax: number; net: number }

export interface WindowTotals {
  start: ISODate;
  /** Exclusive. */
  end: ISODate;
  nominal: Money;
  /** Each event discounted by its cash date. Present when a valuation date is given. */
  presentValue?: Money;
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
  /** Totals over the window: nominal, and present value when a valuation date is given. */
  window: WindowTotals;
  /** Present when the offer has a leave date. */
  leave?: LeaveResult;
  /** Input-specific, plain language. */
  warnings: string[];
  /** Assumptions behind these numbers, for the methodology page. */
  assumptions: string[];
}

/** One offer under all three joint scenarios. */
export interface OfferProjection {
  label: string;
  scenarios: Record<Scenario, ScenarioResult>;
  /** Unique warnings across the scenarios. */
  warnings: string[];
}

/** Offers projected over one shared window, with nominal and present-value totals per scenario. */
export interface Comparison {
  window: { start: ISODate; end: ISODate };
  valuationDate: ISODate;
  discountRate: number;
  projections: OfferProjection[];
}

export interface BreakevenResult {
  field: "salary" | "signOn";
  /** Change to B's starting salary (or first sign-on) that ties A; negative if B is already ahead. */
  increase: number;
  /** B's value before and after the change. */
  from: number;
  to: number;
  /** A's base-scenario present value of net pay over the shared window: the target. */
  targetPV: number;
  window: { start: ISODate; end: ISODate };
}
