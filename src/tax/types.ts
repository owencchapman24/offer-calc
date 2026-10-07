export type FilingStatus = "single" | "joint" | "headOfHousehold";

/** [lowerBound, rate] pairs. The rate applies to income above lowerBound. */
export type Schedule = ReadonlyArray<readonly [number, number]>;

export type Locality =
  | { kind: "none" }
  | { kind: "nyc" }
  | { kind: "philadelphia"; resident: boolean }
  /** Escape hatch for MD counties, Ohio cities, PA EIT, Detroit, etc. */
  | { kind: "flat"; label: string; rate: number; base: "wages" | "stateTaxableIncome" };

export interface TaxInput {
  year: 2026;
  filingStatus: FilingStatus;
  /** Gross W-2 compensation for the calendar year: salary + bonuses + vested RSUs. */
  wages: number;
  /** Joint filers only. Spouse's gross W-2 compensation. */
  spouseWages?: number;
  /** Traditional (pre-tax) 401(k)/403(b) employee deferrals. Not Roth. */
  pretax401k?: number;
  /** Cafeteria-plan deductions: health/dental/vision premiums, HSA payroll contributions, FSA. */
  section125?: number;
  /** Pre-tax transit/parking under IRC 132(f). */
  commuterPretax?: number;
  /** Real estate taxes paid (counts toward the SALT cap if itemizing). */
  propertyTax?: number;
  /** Mortgage interest, charitable gifts, etc. Used only if itemizing beats the standard deduction. */
  otherItemizedDeductions?: number;
  /** Two-letter state code, or "DC". State of residence. */
  state: string;
  locality?: Locality;
}

export interface TaxResult {
  federalAGI: number;
  federalTaxableIncome: number;
  /** Whether itemizing (mostly SALT under the 2026 $40,400 cap) beat the standard deduction. */
  itemizes: boolean;
  federalIncomeTax: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  stateIncomeTax: number;
  /** Employee-paid state payroll taxes such as CA SDI, MA PFML, WA Cares. */
  statePayrollTax: number;
  localIncomeTax: number;
  totalTax: number;
  /** Gross wages minus all taxes. 401(k) and HSA dollars are still yours, so they count here. */
  afterTaxIncome: number;
  /** What actually hits the bank account: after-tax income minus pre-tax deductions. */
  netPay: number;
  effectiveRate: number;
  /** Combined marginal rate on the next $1,000 of wages, all taxes included. */
  marginalRate: number;
  /** Plain-language caveats triggered by this specific input. */
  warnings: string[];
}
