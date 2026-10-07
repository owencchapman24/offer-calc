import type { FederalParams, PayrollParams, SaltParams } from "./params";
import { applySchedule, clamp0 } from "./schedule";
import type { FilingStatus } from "./types";

export function federalIncomeTax(fed: FederalParams, agi: number, status: FilingStatus, deduction: number) {
  const taxableIncome = clamp0(agi - deduction);
  return { taxableIncome, tax: applySchedule(fed.brackets[status], taxableIncome) };
}

/** OBBBA SALT cap, IRC 164(b)(7): the cap less 30% of MAGI over the threshold, floor $10,000. */
export function saltCap(salt: SaltParams, magi: number): number {
  const p = salt.phaseDown;
  return p ? Math.max(p.floor, salt.cap - p.rate * clamp0(magi - p.threshold)) : salt.cap;
}

/**
 * Employee-side FICA. `ficaWages` excludes cafeteria-plan and 132(f) deductions
 * but INCLUDES 401(k) deferrals (they are subject to FICA).
 * Social Security is capped per person; Additional Medicare is a liability on
 * combined wages above the filing-status threshold (what you owe, not what's withheld).
 */
export function payrollTaxes(p: PayrollParams, ficaWagesByPerson: number[], status: FilingStatus) {
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
