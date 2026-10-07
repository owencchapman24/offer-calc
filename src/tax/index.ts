import { federalIncomeTax, payrollTaxes, saltCap } from "./federal";
import { localTax } from "./local";
import { paramsForYear, type TaxParams } from "./params";
import { round2, clamp0 } from "./schedule";
import { stateTax } from "./state";
import type { TaxInput, TaxResult } from "./types";

export * from "./types";
export { STATES_2026 } from "./params/states2026";
export { paramsForYear, saltForYear } from "./params";
export type { TaxParams, FederalParams, PayrollParams, SaltParams, LocalParams } from "./params";

interface Pass {
  itemized: boolean;
  deduction: number;
  fed: { taxableIncome: number; tax: number };
  state: ReturnType<typeof stateTax>;
  local: ReturnType<typeof localTax>;
  incomeTaxes: number; // federal + state + local income taxes (excludes FICA/payroll)
}

function computeOnce(input: TaxInput, params: TaxParams): Omit<TaxResult, "marginalRate"> {
  if (input.year !== params.year) throw new Error(`Tax year ${input.year} doesn't match params for ${params.year}.`);
  const status = input.filingStatus;
  const k401 = input.pretax401k ?? 0;
  const s125 = input.section125 ?? 0;
  const commute = input.commuterPretax ?? 0;
  const spouse = status === "joint" ? input.spouseWages ?? 0 : 0;
  const propertyTax = input.propertyTax ?? 0;
  const otherItemized = input.otherItemizedDeductions ?? 0;

  // Box 1 (income-tax) wages exclude 401(k), cafeteria-plan and 132(f) amounts.
  // FICA wages exclude cafeteria-plan and 132(f) amounts but INCLUDE 401(k) deferrals.
  const ficaWages = clamp0(input.wages - s125 - commute);
  const ficaByWorker = spouse > 0 ? [ficaWages, spouse] : [ficaWages];
  const federalAGI = clamp0(input.wages + spouse - k401 - s125 - commute);
  const fica = payrollTaxes(params.payroll, ficaByWorker, status);
  const ficaByPerson = ficaByWorker.map((w) => payrollTaxes(params.payroll, [w], "single"))
    .map((f) => f.socialSecurity + f.medicare);
  if (status === "joint" && ficaByPerson.length === 1) ficaByPerson.push(0);

  const run = (deduction: number, itemized: boolean, exIncomeTax: number): Pass => {
    const fed = federalIncomeTax(params.federal, federalAGI, status, deduction);
    const state = stateTax(params, input.state, {
      status, federalAGI, pretax401k: k401, federalIncomeTax: fed.tax, ficaByPerson,
      itemizingFederally: itemized, federalItemizedExIncomeTax: exIncomeTax,
    }, ficaByWorker);
    const local = localTax(params.local, input.locality, {
      status, federalAGI, localWageBase: ficaWages, stateTaxableIncome: state.taxableIncome, stateCode: input.state,
    });
    return { itemized, deduction, fed, state, local, incomeTaxes: fed.tax + state.tax + local.tax };
  };

  // Path A: standard deduction.
  const std = run(params.federal.standardDeduction[status], false, 0);

  // Path B: itemize. SALT depends on state/local tax, which can depend on the federal choice,
  // so iterate to a fixed point (converges in 2-3 passes).
  let itm = std;
  let stateLocal = std.state.tax + std.local.tax;
  const cap = saltCap(params.federal.salt, federalAGI);
  for (let i = 0; i < 4; i++) {
    const salt = Math.min(cap, clamp0(stateLocal) + propertyTax);
    const incomeTaxShare = salt * (clamp0(stateLocal) / Math.max(1, clamp0(stateLocal) + propertyTax));
    const itemizedTotal = salt + otherItemized;
    itm = run(itemizedTotal, true, itemizedTotal - incomeTaxShare);
    stateLocal = itm.state.tax + itm.local.tax;
  }

  // A real filer picks whichever election minimizes total income tax (federal + state + local).
  const best = itm.incomeTaxes < std.incomeTaxes ? itm : std;

  const warnings = [...best.state.warnings, ...best.local.warnings];
  if (best.itemized) warnings.push(`Itemizing beats the standard deduction here (SALT and other deductions total $${Math.round(best.deduction).toLocaleString()}).`);
  const k401Limit = params.federal.k401Limit;
  if (k401 > k401Limit) {
    warnings.push(`401(k) deferral exceeds the ${params.year} limit of $${k401Limit.toLocaleString("en-US")}.`);
  }
  if (federalAGI > 400_000) warnings.push("Alternative minimum tax is not modeled; check AMT above roughly $400k of income.");
  if (params.projected) {
    warnings.push(`${params.year} tax law is projected from 2026: federal amounts indexed for inflation, state and local law held at 2026.`);
  }

  const totalTax = best.fed.tax + fica.socialSecurity + fica.medicare + fica.additionalMedicare
    + best.state.tax + best.state.payrollTax + best.local.tax;
  const gross = input.wages + spouse;
  const afterTaxIncome = gross - totalTax;

  return {
    federalAGI: round2(federalAGI),
    federalTaxableIncome: round2(best.fed.taxableIncome),
    itemizes: best.itemized,
    federalIncomeTax: round2(best.fed.tax),
    socialSecurity: round2(fica.socialSecurity),
    medicare: round2(fica.medicare),
    additionalMedicare: round2(fica.additionalMedicare),
    stateIncomeTax: round2(best.state.tax),
    statePayrollTax: round2(best.state.payrollTax),
    localIncomeTax: round2(best.local.tax),
    totalTax: round2(totalTax),
    afterTaxIncome: round2(afterTaxIncome),
    netPay: round2(afterTaxIncome - k401 - s125 - commute),
    effectiveRate: gross > 0 ? totalTax / gross : 0,
    warnings,
  };
}

/** Annual tax liability (not paycheck withholding) for one household in one tax year. */
export function computeTaxes(input: TaxInput, params: TaxParams = paramsForYear(input.year)): TaxResult {
  const base = computeOnce(input, params);
  const bumped = computeOnce({ ...input, wages: input.wages + 1_000 }, params);
  return { ...base, marginalRate: (bumped.totalTax - base.totalTax) / 1_000 };
}
