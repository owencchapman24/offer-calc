import { federalIncomeTax } from "../tax/federal";
import { paramsForYear } from "../tax/index";
import { projectScenario } from "./project";
import type { Household, OfferInput, OfferWarning, ProjectionOptions, WithholdingResult, WithholdingYear } from "./types";

// Withholding vs liability (roadmap 5): a cash-timing warning, not a change to any total. The
// projection already computes what you owe; this estimates what your employer withholds, so the
// difference is what's due (or refunded) the April after each year. Federal income tax only.

/** IRS Pub. 15 (2026) section 7: the optional flat rate on supplemental wages. Still 22%: P.L. 119-21 made the 2017 rates permanent. */
export const SUPPLEMENTAL_RATE = 0.22;
/** Pub. 15 section 7 / Treas. Reg. 31.3402(g)-1(a)(2): mandatory rate on supplemental wages over $1 million in a calendar year. */
export const SUPPLEMENTAL_HIGH_RATE = 0.37;
export const SUPPLEMENTAL_HIGH_THRESHOLD = 1_000_000;
/** IRC 6654(e)(1): no estimated-tax penalty when the balance due is under $1,000, so warn from there. */
const WARN_AT = 1_000;

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Federal income tax withheld from the offer's pay vs the offer's federal income tax, per calendar year.
 * - Salary: monthly payroll under the IRS percentage method (Pub. 15-T, 2020+ Form W-4 with your filing
 *   status and no other entries). It withholds each month's taxable pay, annualized, at the tax on that
 *   annual amount with the standard deduction, divided by 12. A partial first year is over-withheld,
 *   since each paycheck is treated as a full year's pay.
 * - Bonuses, RSU vests and cash awards: supplemental wages, flat 22%, and 37% on the year's supplemental
 *   pay over $1 million.
 * - Pre-tax 401(k) deferrals and cafeteria-plan amounts come out of the pay they're taken from.
 */
export function withholdingShortfall(offer: OfferInput, household: Household, options: ProjectionOptions = {}): WithholdingResult {
  const inflation = options.inflation ?? 0.025;
  const r = projectScenario(offer, household, options);
  const status = household.filingStatus;
  const bonusDeferrals = offer.retirement?.eligiblePay === "salaryAndBonus";
  const years: WithholdingYear[] = [];
  const warnings: OfferWarning[] = [];
  for (const cy of r.calendarYears) {
    const inYear = r.events.filter((e) => e.calendarYear === cy.year);
    const salary = inYear.filter((e) => e.component === "salary");
    // Taxable other benefits are paid with salary, so withheld as part of each paycheck (Pub. 15 section 7).
    const regularPay = inYear.filter((e) => e.component === "salary" || e.component === "benefit");
    const supplemental = inYear.filter((e) => e.component === "bonus" || e.component === "rsu" || e.component === "cash");
    if (regularPay.length + supplemental.length === 0) continue;
    const sum = (list: typeof inYear) => list.reduce((s, e) => s + e.gross, 0);
    const salaryPay = sum(salary);
    const bonusPay = sum(supplemental.filter((e) => e.component === "bonus"));

    // Deferrals come from salary (and bonuses, if they're eligible pay); cafeteria-plan amounts from salary.
    const deferrals = cy.withOffer.input.pretax401k ?? 0;
    const fromSalary = deferrals * (salaryPay / (salaryPay + (bonusDeferrals ? bonusPay : 0) || 1));
    const fromBonus = deferrals - fromSalary;
    const salaryTaxableShare = salaryPay > 0
      ? Math.max(0, salaryPay - fromSalary - (cy.withOffer.input.section125 ?? 0)) / salaryPay : 0;

    const params = paramsForYear(cy.year, { inflation });
    const annualTax = (wages: number) =>
      federalIncomeTax(params.federal, wages, status, params.federal.standardDeduction[status]).tax;
    const byMonth = new Map<string, number>();
    for (const e of regularPay) {
      const taxable = e.component === "salary" ? e.gross * salaryTaxableShare : e.gross;
      byMonth.set(e.date.slice(0, 7), (byMonth.get(e.date.slice(0, 7)) ?? 0) + taxable);
    }
    let regular = 0;
    for (const pay of byMonth.values()) regular += annualTax(12 * pay) / 12;

    let supplementalWithheld = 0;
    let soFar = 0;
    for (const e of supplemental) {
      const taxable = e.gross - (e.component === "bonus" && bonusPay > 0 ? fromBonus * (e.gross / bonusPay) : 0);
      const over = Math.max(0, soFar + taxable - SUPPLEMENTAL_HIGH_THRESHOLD) - Math.max(0, soFar - SUPPLEMENTAL_HIGH_THRESHOLD);
      supplementalWithheld += SUPPLEMENTAL_RATE * (taxable - over) + SUPPLEMENTAL_HIGH_RATE * over;
      soFar += taxable;
    }

    const owed = cy.withOffer.result.federalIncomeTax - cy.withoutOffer.result.federalIncomeTax;
    const withheld = regular + supplementalWithheld;
    const balanceDue = owed - withheld;
    years.push({
      year: cy.year,
      federalIncomeTax: round2(owed),
      withheld: { regular: round2(regular), supplemental: round2(supplementalWithheld), total: round2(withheld) },
      balanceDue: round2(balanceDue),
    });
    if (balanceDue >= WARN_AT) {
      // An ESPP purchase's gain needs no withholding (IRC 421(b)): it's in what's owed, not in what's withheld.
      const espp = inYear.some((e) => e.component === "espp");
      warnings.push({ code: "withholdingShortfall", params: { year: cy.year, balanceDue, supplemental: supplementalWithheld > 0,
        ...(espp ? { espp } : {}) } });
    }
  }
  return {
    years,
    warnings,
    assumptions: [{ code: "withholding", params: {} }],
  };
}
