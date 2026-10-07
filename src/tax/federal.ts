import { FEDERAL_2026, PAYROLL_2026 } from "./params/federal2026";
import { applySchedule, clamp0 } from "./schedule";
import type { FilingStatus } from "./types";

export function federalIncomeTax(agi: number, status: FilingStatus, deduction = FEDERAL_2026.standardDeduction[status]) {
  const taxableIncome = clamp0(agi - deduction);
  return { taxableIncome, tax: applySchedule(FEDERAL_2026.brackets[status], taxableIncome) };
}

/** OBBBA SALT cap for 2026: $40,400, reduced by 30% of MAGI over $505,000, floor $10,000. */
export function saltCap(magi: number): number {
  return Math.max(10_000, 40_400 - 0.3 * clamp0(magi - 505_000));
}

/**
 * Employee-side FICA. `ficaWages` excludes cafeteria-plan and 132(f) deductions
 * but INCLUDES 401(k) deferrals (they are subject to FICA).
 * Social Security is capped per person; Additional Medicare is a liability on
 * combined wages above the filing-status threshold (what you owe, not what's withheld).
 */
export function payrollTaxes(ficaWagesByPerson: number[], status: FilingStatus) {
  const p = PAYROLL_2026;
  let socialSecurity = 0;
  let medicare = 0;
  for (const w of ficaWagesByPerson) {
    socialSecurity += Math.min(w, p.socialSecurityWageBase) * p.socialSecurityRate;
    medicare += w * p.medicareRate;
  }
  const combined = ficaWagesByPerson.reduce((a, b) => a + b, 0);
  const additionalMedicare = clamp0(combined - p.additionalMedicareThreshold[status]) * p.additionalMedicareRate;
  return { socialSecurity, medicare, additionalMedicare };
}
