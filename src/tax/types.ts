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
  /** 2026 or later. Years after 2026 need params from paramsForYear(year, { inflation }). */
  year: number;
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
  /**
   * Ordinary income from a statutory option or an employee stock purchase plan's shares (IRC 421(b), 423): an ESPP lot sold the
   * day it's bought. It's part of `wages` (W-2 box 1, so income tax) but not FICA wages (IRC 3121(a)(22)), nor the state payroll
   * or local wage bases that follow them here. CA SDI and DE's paid leave exclude it, as FICA does (EDD DE 231SK; 19 Del. C.
   * 3701(24)); OR's transit tax (on income-tax wages), and likely WA's PFML and WA Cares, RI's TDI and MN's paid leave, reach it:
   * a known gap (CLAUDE.md section 10). Philadelphia's wage tax leans to excluding it (Phila. Code 19-1501(8)(f)).
   */
  statutoryOptionIncome?: number;
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
  /** Caveats triggered by this specific input, as codes and numbers (formatted outside the engine). */
  warnings: TaxWarning[];
}

/** A tax-engine caveat: a code and the numbers behind it. */
export type TaxWarning =
  /** Itemizing beats the standard deduction; `deduction` is SALT plus other itemized deductions. */
  | { code: "itemizing"; params: { deduction: number } }
  | { code: "k401OverLimit"; params: { year: number; limit: number } }
  | { code: "amtNotModeled"; params: Record<string, never> }
  /** Tax law for `year` is projected from 2026. */
  | { code: "projectedLaw"; params: { year: number } }
  | { code: "nycNonresident"; params: Record<string, never> }
  | { code: "phillyNonresident"; params: Record<string, never> }
  | { code: "flatLocalRate"; params: { label: string; rate: number } }
  | { code: "headOfHouseholdState"; params: Record<string, never> }
  | { code: "ctPersonalCredit"; params: Record<string, never> }
  /** A state's standing caveat, from the state data (`StateSpec.notes`). */
  | { code: "stateNote"; params: { state: string; note: string } };
