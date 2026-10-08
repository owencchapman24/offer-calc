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
  retirement?: Retirement;
  health?: Health;
  perks?: Perks;
  hours?: Hours;
  /** Where you'd live, for cost-of-living comparisons (BEA Regional Price Parities). */
  costOfLiving?: OfferCostOfLiving;
}

export interface OfferCostOfLiving {
  /** BEA GeoFIPS code of the metro area or state-nonmetro portion, e.g. "35620"; see findRppAreas(). */
  area: string;
  /** Your expected rent there when you move in. If omitted, derived from the household reference rent and the housing RPPs. */
  monthlyRent?: number;
  /** Annual rent increase, applied at each lease anniversary (your start date), e.g. 0.04. Default: the inflation option. */
  rentGrowth?: number;
}

/** 401(k): your deferrals, the employer's match and non-elective money, and its vesting. */
export interface Retirement {
  /** Your deferral as a fraction of eligible pay, e.g. 0.06. Capped each calendar year at the 402(g) limit. */
  contributionPct: number;
  /** "pretax" (traditional: lowers taxable wages, not FICA) or "roth" (after tax). Default "pretax". */
  type?: "pretax" | "roth";
  /** Pay that counts for deferrals and the match. Default "salary"; "salaryAndBonus" adds bonuses. */
  eligiblePay?: "salary" | "salaryAndBonus";
  /**
   * Match tiers on your deferral rate, applied per paycheck (no year-end true-up), e.g.
   * 100% of the first 3% + 50% of the next 2%: [{ upToPct: 0.03, rate: 1 }, { upToPct: 0.05, rate: 0.5 }].
   * 50% of everything you defer: [{ upToPct: 1, rate: 0.5 }].
   */
  match?: Array<{ upToPct: number; rate: number }>;
  /** Employer non-elective contribution as a fraction of eligible pay, whatever you defer. */
  nonElectivePct?: number;
  /**
   * How years of vesting service are counted. "elapsedTime" (default): a year completes when you
   * work through the day before each anniversary. "planYearHours": each calendar plan year in
   * which you reach 1,000 hours (from offer.hours) counts, credited the day you reach them, even
   * if you leave before the year ends (29 CFR 2530.200b-1).
   */
  vestingService?: "elapsedTime" | "planYearHours";
  /** Vesting of employer money by completed years of service at the leave date. Default immediate. */
  vesting?:
    | { kind: "immediate" }
    | { kind: "cliff"; years: number }
    /** e.g. [{ years: 2, pct: 0.2 }, { years: 3, pct: 0.4 }, ..., { years: 6, pct: 1 }] */
    | { kind: "graded"; steps: Array<{ years: number; pct: number }> };
}

/** Health plan costs. Amounts are per year, accrued by month while employed. */
export interface Health {
  /** Your premium share, paid pre-tax through a section 125 cafeteria plan. */
  premium: number;
  /** Expected out-of-pocket spending by usage level (household.healthUsage picks one). */
  outOfPocket: { low: number; medium: number; high: number };
  /** Out-of-pocket maximum; expected spending is capped at it. */
  oopMax: number;
  /** Your HSA payroll contributions (pre-tax and FICA-free). Yours to keep, so not a cost. */
  employeeHsa?: number;
  /** Employer HSA contributions ("seed"); offset the health cost. */
  employerHsa?: number;
  /** HSA limit tier. Default "self". */
  coverage?: "self" | "family";
}

/** Tax-free employer perks, valued at face and at their pre-tax cash equivalent. */
export interface Perks {
  /** Section 127 educational assistance or student loan payments per year, tax-free up to the limit. */
  section127?: number;
  /** 132(f) employer-paid transit or parking per month, tax-free up to the monthly limit. */
  commuterMonthly?: number;
}

export interface Hours {
  /** Hours worked per week, by scenario. */
  weekly: ByScenario;
  /** Weeks worked per year. Default 50. */
  weeksPerYear?: number;
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
  /** Which expected out-of-pocket level applies to every offer's health plan. Default "medium". */
  healthUsage?: "low" | "medium" | "high";
  costOfLiving?: HouseholdCostOfLiving;
}

export interface HouseholdCostOfLiving {
  /** Reference location whose dollars results are expressed in. BEA GeoFIPS; default "00000" (U.S.). */
  reference?: string;
  /** Planned savings as a fraction of take-home pay (beyond your 401(k), already out). Default 0. */
  savingsRate?: number;
  /** Your monthly rent in the reference location; used to derive rent where an offer gives none. */
  referenceMonthlyRent?: number;
}

export interface ProjectionOptions {
  /** Default "base". projectScenario only; projectOffer runs all three. */
  scenario?: Scenario;
  /** Employment years to show. Default 5. */
  years?: number;
  /** Indexes tax law after 2026, and is the default rent growth. Never pay growth. Default 0.025. */
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
// The engine returns numbers and codes, never formatted text: src/format turns details, warnings
// and assumptions into words, so the UI owns formatting and the engine stays fast.

export type Component = "salary" | "bonus" | "cash" | "rsu" | "clawback";

/** A new-hire grant (its label), or a refresher (the policy's label, its number and grant date). */
export type RsuGrantRef =
  | { kind: "grant"; label: string }
  | { kind: "refresher"; label?: string; number: number; grantDate: ISODate };

/** How a payment was worked out. */
export type EventDetail =
  /** annual / 12 x days / daysInMonth, for [from, to] (inclusive). */
  | { kind: "salary"; from: ISODate; to: ISODate; annual: number; days: number; daysInMonth: number }
  /** rate x salary earned in the period [periodFrom, periodTo] (inclusive). */
  | { kind: "bonus"; basis: "percentOfSalary"; periodFrom: ISODate; periodTo: ISODate; proratedToLeave: boolean;
      rate: number; salaryEarned: number }
  /** amount x daysEmployed / periodDays; employmentYear says whose amount (byEmploymentYear only). */
  | { kind: "bonus"; basis: "fixed" | "byEmploymentYear"; periodFrom: ISODate; periodTo: ISODate; proratedToLeave: boolean;
      amount: number; employmentYear?: number; daysEmployed: number; periodDays: number }
  | { kind: "cash"; award: string; amount: number }
  /** grantValue x fraction x priceFactor. nominalDate: set when a company vest date moved the tranche. */
  | { kind: "rsu"; grant: RsuGrantRef; tranche: number; tranches: number; grantValue: number; fraction: number;
      priceFactor: number; nominalDate?: ISODate }
  /** -amount x fraction (after tax for a later-year repayment on a net basis). */
  | { kind: "clawback"; award: string; amount: number; fraction: number; basis: "gross" | "net"; sameYear: boolean;
      paidYear: number; repaidYear: number };

/** How a benefit flow was worked out. */
export type BenefitDetail =
  /** Your deferral: rate x pay, capped at the 402(g) limit. */
  | { kind: "deferral"; type: "pretax" | "roth"; rate: number; pay: number; capped: boolean }
  /** Employer money: rate (match + non-elective) x pay. */
  | { kind: "employerContribution"; rate: number; pay: number }
  /** annual / 12 x days / daysInMonth; capped at its annual limit; usage: the out-of-pocket level. */
  | { kind: "accrual"; annual: number; days: number; daysInMonth: number; capped: boolean; usage?: "low" | "medium" | "high" }
  /** monthly x days / daysInMonth (132(f) commuter). */
  | { kind: "monthly"; monthly: number; days: number; daysInMonth: number };

/** A warning about the inputs or the result: a code and the numbers behind it. */
export type OfferWarning =
  | { code: "convenienceRule"; params: { residenceState: string; employerState: string } }
  | { code: "bonusCutoff"; params: { start: ISODate; cutoff: MonthDay; periodFrom: ISODate; periodTo: ISODate } }
  | { code: "bonusForfeited"; params: { leaveDate: ISODate; periodFrom: ISODate; periodTo: ISODate; payDate: ISODate } }
  | { code: "k401Cap"; params: { year: number; limit: number } }
  | { code: "hsaCap"; params: { year: number; limit: number } }
  | { code: "section127Cap"; params: { year: number; limit: number } }
  | { code: "commuterCap"; params: { year: number; monthlyLimit: number } }
  | { code: "clawbackFica"; params: { award: string; paidYear: number; repaidYear: number } }
  | { code: "withholdingShortfall"; params: { year: number; balanceDue: number; supplemental: boolean } };

/** A salary change's reasons; same-day changes multiply. */
export type SalaryChangeReason = { kind: "merit"; rate: number } | { kind: "promotion"; stepUp: number };

type NoParams = Record<string, never>;

/** An assumption behind the numbers, for the methodology page: a code and its numbers. */
export type Assumption =
  | { code: "cashBasis"; params: NoParams }
  | { code: "monthlyAccrual"; params: NoParams }
  | { code: "incrementalTax"; params: NoParams }
  | { code: "residence"; params: { state: string; locality?: "nyc" | "philadelphia" | "flat" } }
  | { code: "projectedLaw"; params: { inflation: number } }
  | { code: "salaryChanges"; params: { scenario: Scenario; changes: Array<{ date: ISODate; annual: number; reasons: SalaryChangeReason[] }> } }
  | { code: "bonus"; params: { scenario: Scenario; basis: "percentOfSalary"; rate: number } }
  | { code: "bonus"; params: { scenario: Scenario; basis: "fixed"; amount: number } }
  | { code: "bonus"; params: { scenario: Scenario; basis: "byEmploymentYear"; amounts: number[] } }
  | { code: "presentValue"; params: { valuationDate: ISODate; discountRate: number } }
  | { code: "rsu"; params: { scenario: Scenario; priceGrowth: number } }
  | { code: "leaveDate"; params: { leaveDate: ISODate } }
  | { code: "retirement"; params: { contributionPct: number; type: "pretax" | "roth"; eligiblePay: "salary" | "salaryAndBonus";
      vestedShare: number; completedYears: number } }
  | { code: "health"; params: { usage: "low" | "medium" | "high" } }
  | { code: "perks"; params: NoParams }
  | { code: "hours"; params: { scenario: Scenario; weekly: number; weeksPerYear: number } }
  | { code: "costOfLiving"; params: { rppVintage: { dataYear: number; release: string }; savingsRate: number; reference: string;
      referenceNonHousing: number; areaNonHousing: number; factor: number; nonHousingFormula: string } }
  | { code: "rent"; params: { monthlyRent: number; source: "input" | "derived"; growth: number; growthSource: "input" | "inflation" } }
  | { code: "colAdjustedTotal"; params: NoParams }
  | { code: "withholding"; params: NoParams };
export type ByComponent = Record<Component, number> & { total: number };

/** One dated payment: the unit of "show the work". Money is rounded to cents. */
export interface CompEvent {
  /** Pay date; a salary event is dated on the last day of the stretch it covers. */
  date: ISODate;
  component: Component;
  /** How it was worked out, as numbers; src/format writes the label and the arithmetic. */
  detail: EventDetail;
  gross: number;
  calendarYear: number;
  /** 1-based. Above `years` means after the reported horizon (kept so its year is taxed in full). */
  employmentYear: number;
  tax: number;
  /** gross - this payment's share of tax. Before premiums and payroll deductions. */
  afterTax: number;
  /** Inside the totals window. */
  inWindow: boolean;
  /** (1 + discountRate)^-((date - valuationDate) / 365.25), when a valuation date is given. */
  discountFactor?: number;
}

export type BenefitKind =
  | "employee401k" | "employer401k" | "premium" | "outOfPocket" | "employeeHsa" | "employerHsa"
  | "section127" | "commuter";

/** A dated benefit flow. Amounts are positive; kind says which way they count. */
export interface BenefitEvent {
  date: ISODate;
  kind: BenefitKind;
  /** How it was worked out, as numbers; src/format writes the label and the arithmetic. */
  detail: BenefitDetail;
  amount: number;
  /** employer401k: the share vested at the leave date (or the window's last day). */
  vested?: number;
  /** Perks: the pre-tax cash raise worth the same after tax, amount / (1 - marginal rate). */
  preTaxEquivalent?: number;
  calendarYear: number;
  employmentYear: number;
  inWindow: boolean;
  discountFactor?: number;
}

/**
 * Cash measures:
 * - afterTaxComp ("after-tax comp", the cash-only basis): gross - tax - your health premiums.
 *   Premiums are a cost of the job's health plan, not compensation.
 * - takeHome: what reaches your bank account. afterTaxComp - your 401(k) deferrals - your HSA
 *   contributions (still your money, just not spendable now).
 */
export interface CashTotals { gross: number; tax: number; premiums: number; afterTaxComp: number; takeHome: number }

/** Non-cash value: vested employer retirement money and perks, less the net health cost. */
export interface BenefitTotals {
  /** Vested employer 401(k) contributions. */
  retirement: number;
  /** Tax-free perks at face value. */
  perks: number;
  /** Premiums + expected out-of-pocket - employer HSA. A cost. */
  healthNet: number;
}

export interface WindowTotals {
  start: ISODate;
  /** Exclusive. */
  end: ISODate;
  /** Cash only. */
  nominal: CashTotals;
  /** Each flow discounted by its date. Present when a valuation date is given. */
  presentValue?: CashTotals;
  benefits: { nominal: BenefitTotals; presentValue?: BenefitTotals };
  /** After-tax comp + vested retirement + perks - out-of-pocket + employer HSA (= gross - tax + retirement + perks - health net). */
  totalRewards: { nominal: number; presentValue?: number };
  /** Discretionary income after rent and the COL-adjusted total, in reference-location dollars. Present with costOfLiving. */
  costOfLiving?: { nominal: CostOfLivingTotals; presentValue?: CostOfLivingTotals };
  /** Hours worked inside the window (each employment year's hours, prorated to its days in the window). Present with hours. */
  hours?: number;
  /** Nominal dollars per hour worked inside the window, on each basis. Present when hours are worked in the window. */
  perHour?: { afterTaxComp: number; totalRewards: number; colAdjustedTotal?: number };
}

/**
 * Cost of living over a stretch of time, in reference-location dollars where noted. Spending money
 * is local, so it's converted by the non-housing RPPs; money not spent locally counts at face value.
 */
export interface CostOfLivingTotals {
  /** Planned savings: savingsRate x take-home. */
  savings: number;
  rent: number;
  /** Take-home - savings - rent: non-housing spending, in local dollars. */
  nonHousingLocal: number;
  /** nonHousingLocal x nonHousingFactor: discretionary income after rent, in reference dollars. */
  discretionaryReference: number;
  /** Expected out-of-pocket health spending x nonHousingFactor. It comes out of the local spending, so it's converted the same way. */
  outOfPocketReference: number;
  /** Money not spent locally, at face value: planned savings, your 401(k) and HSA contributions, vested employer 401(k), employer HSA and perks. */
  faceValue: number;
  /**
   * COL-adjusted total = discretionaryReference - outOfPocketReference + faceValue.
   * Equivalently, total rewards - rent + (nonHousingFactor - 1) x (nonHousingLocal - out-of-pocket).
   */
  total: number;
}

export interface RppUsed { code: string; name: string; allItems: number; housing: number; nonHousing: number }

/** How the cost-of-living adjustment was made for one offer. */
export interface CostOfLivingInfo {
  area: RppUsed;
  reference: RppUsed;
  /** Reference non-housing RPP / area non-housing RPP: multiplies local non-housing dollars. */
  nonHousingFactor: number;
  /** Rent in the first lease year, which starts on your start date. */
  monthlyRent: number;
  rentSource: "input" | "derived";
  /** Annual increase at each lease anniversary. */
  rentGrowth: number;
  rentGrowthSource: "input" | "inflation";
  savingsRate: number;
  /** BEA data year and BEA's release note. */
  rppVintage: { dataYear: number; release: string };
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
  /** gross - tax - your health premiums: the cash-only basis. */
  afterTaxComp: number;
  /** afterTaxComp - your 401(k) deferrals - your HSA contributions: what reaches your bank account. */
  takeHome: number;
  /** Offer-letter view: salary rate at year start + target bonus on it + cash awards paid
   *  in the year + new-hire RSU tranches nominally due in the year, at grant value. No
   *  proration, payout lag, vest-date snapping, price growth or refreshers. */
  quotedTC: number;
  retirement: { employee: number; employerCredited: number; employerVested: number };
  health: { premiums: number; outOfPocket: number; employerHsa: number; employeeHsa: number; net: number };
  perks: { face: number; preTaxEquivalent: number };
  /** After-tax comp + vested employer retirement + perks - out-of-pocket + employer HSA. */
  totalRewards: number;
  /** Hours worked in the year (prorated if employment covers part of it). Present when hours are given. */
  hours?: number;
  /** Dollars per hour worked, on after-tax comp and on total rewards. */
  hourly?: { afterTaxComp: number; totalRewards: number };
  /**
   * Take-home - savings - rent = non-housing spending in local dollars, then deflated by the
   * non-housing RPP: discretionary income after rent, in reference-location dollars. Plus the
   * COL-adjusted total, which adds back money not spent locally at face value.
   */
  costOfLiving?: CostOfLivingTotals;
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
  /** Same-year wage reversal, the IRC 1341 credit, or no relief (a later-year repayment of $3,000 or less). */
  treatment: "sameYearReversal" | "irc1341Credit" | "noRelief";
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
  /** Employer 401(k) money not vested at the leave date. */
  retirementForfeited: number;
}

export type CliffKind = "bonus" | "rsuVest" | "cashAward" | "clawbackStep" | "clawbackCleared" | "retirementVest";

/** A date where your last day starts to matter: leave on or after it to keep what it brings. */
export interface Cliff {
  /** The first last day that keeps it. */
  date: ISODate;
  kind: CliffKind;
  /** The payment's detail, the award whose clawback steps down, or the vesting step reached. */
  detail: EventDetail | { kind: "clawbackStep"; award: string } | { kind: "retirementVest"; vestedShare: number; serviceYears: number };
  /** Gross: the payment or vest, the repayment no longer owed, or the employer 401(k) money that vests. */
  amount: number;
}

export interface NextCliffResult {
  leaveDate: ISODate;
  /** Null when nothing pays, vests or steps down after the leave date within the projection. */
  next: null | {
    date: ISODate;
    /** Days from the leave date to the cliff. */
    daysAway: number;
    /** Everything that lands on that date (a bonus and a vest can share one). */
    cliffs: Cliff[];
    /** Leaving on `date` instead of `leaveDate`, nominal: the extra after-tax comp and total rewards kept. */
    valueOfStaying: { afterTaxComp: number; totalRewards: number };
    /** The cliffs' own part of that: payments after tax, the clawback no longer owed (net of tax relief), and
     *  employer 401(k) money that vests. The rest is pay for the extra days. */
    cliffValue: number;
  };
}

/** One calendar year of withholdingShortfall. Federal income tax only. */
export interface WithholdingYear {
  year: number;
  /** The offer's federal income tax: household tax with the offer minus without it. */
  federalIncomeTax: number;
  /** Estimated federal withholding: salary by the percentage method; bonuses, RSU vests and cash awards at supplemental rates. */
  withheld: { regular: number; supplemental: number; total: number };
  /** federalIncomeTax - withheld.total: owed the next April if positive, refunded if negative. */
  balanceDue: number;
}

export interface WithholdingResult {
  years: WithholdingYear[];
  /** For years whose balance due reaches $1,000. */
  warnings: OfferWarning[];
  /** How withholding was estimated, for the methodology page. */
  assumptions: Assumption[];
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
  /** After-tax comp kept: pay after tax and clawbacks, less premiums. Nominal. */
  afterTaxCompKept: number;
  unvestedRsuForfeited: number;
  /** Employer 401(k) money vested at the leave date. */
  retirementVested: number;
  /** afterTaxCompKept + retirementVested + perks - out-of-pocket + employer HSA. */
  totalRewardsKept: number;
}

export interface ScenarioResult {
  label: string;
  scenario: Scenario;
  events: CompEvent[];
  /** 401(k), health and perk flows. Not wages; their tax effects are in the calendar years' inputs. */
  benefitEvents: BenefitEvent[];
  calendarYears: CalendarYearResult[];
  employmentYears: EmploymentYearResult[];
  /** Totals over the window: nominal, and present value when a valuation date is given. */
  window: WindowTotals;
  /** Present when the offer has a leave date. */
  leave?: LeaveResult;
  /** Present when the offer has costOfLiving. */
  costOfLiving?: CostOfLivingInfo;
  /** Input-specific warnings, as codes and numbers; src/format writes them out. */
  warnings: OfferWarning[];
  /** Assumptions behind these numbers, for the methodology page. */
  assumptions: Assumption[];
}

/** One offer under all three joint scenarios. */
export interface OfferProjection {
  label: string;
  scenarios: Record<Scenario, ScenarioResult>;
  /** Unique warnings across the scenarios. */
  warnings: OfferWarning[];
}

/** Offers projected over one shared window, with nominal and present-value totals per scenario. */
export interface Comparison {
  window: { start: ISODate; end: ISODate };
  valuationDate: ISODate;
  discountRate: number;
  projections: OfferProjection[];
}

/**
 * A comparison basis: after-tax comp ("cash"), total rewards, the COL-adjusted total, or dollars
 * per hour worked (the last step of the pipeline).
 */
export type Basis = "cash" | "totalRewards" | "colAdjustedTotal" | "perHour";

/** Who leads on one basis, and by how much. Offers are indexes in the order passed. */
export interface Lead {
  winner: number;
  runnerUp: number;
  /** Winner minus runner-up: present-value dollars, or dollars per hour for "perHour". */
  margin: number;
  /** The margin as a level monthly amount over the window with the same present value. PV bases only. */
  perMonth?: number;
  /** Margin as a share of the winner's value. */
  share: number;
  /** The lead is under the close-call threshold (3%). */
  closeCall: boolean;
}

/** One stay length in horizonSweep. */
export interface HorizonRow {
  /** Stay length: the comparison window is [earliest start, + years). */
  years: number;
  window: { start: ISODate; end: ISODate };
  /**
   * Each offer's base-scenario value, in the order passed: present value for cash, totalRewards and
   * colAdjustedTotal; nominal dollars per hour worked for perHour. A basis is absent when an offer
   * lacks its inputs (costOfLiving; hours).
   */
  values: Partial<Record<Basis, number[]>>;
  leads: Partial<Record<Basis, Lead>>;
}

export interface HorizonSweep {
  labels: string[];
  valuationDate: ISODate;
  discountRate: number;
  /** What perHour divides by hours: the COL-adjusted total when every offer has costOfLiving, else total rewards. */
  perHourOf: "colAdjustedTotal" | "totalRewards";
  rows: HorizonRow[];
}

/**
 * "tie": `increase` is the change to B's starting salary (or first sign-on) that ties A. It's
 * negative when B is already ahead and could give some up. "alreadyAhead": B leads even at a $0
 * salary (or sign-on), so no change ties; `increase` and `to` are null.
 */
export type BreakevenResult = BreakevenCommon & (
  | { outcome: "tie"; increase: number; to: number }
  | { outcome: "alreadyAhead"; increase: null; to: null }
);

interface BreakevenCommon {
  field: "salary" | "signOn";
  /** What's being tied: after-tax comp, total rewards, or the COL-adjusted total (needs costOfLiving on both offers). */
  basis: "cash" | "totalRewards" | "colAdjustedTotal";
  /** B's starting salary (or first sign-on) as entered. */
  from: number;
  /** B's base-scenario present value minus A's, as entered, on this basis: positive when B is already ahead. */
  aheadBy: number;
  /** A's base-scenario present value over the shared window, on this basis: the target. */
  targetPV: number;
  window: { start: ISODate; end: ISODate };
}
