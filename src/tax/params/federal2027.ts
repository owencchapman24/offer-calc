import type { EnactedAmounts } from "./index";

/**
 * Federal amounts published for tax year 2027 so far. Everything else in 2027 is projected from 2026 (paramsForYear), and
 * these are projected on from 2027 for later years.
 *
 * - HSA contribution limit (employee + employer), IRC 223(b)(2): $4,500 self-only, $9,000 family. Source: IRS Rev. Proc.
 *   2026-24, sec. 3.01(1) (released May 29, 2026; https://www.irs.gov/pub/irs-drop/rp-26-24.pdf). PolicyEngine-US 2.30.3 has
 *   no HSA contribution-limit parameter to check it against.
 * - Social Security wage base (the contribution and benefit base), 42 U.S.C. 430: $192,300. Source: SSA, "2027 Cost-of-Living
 *   Adjustment (COLA) Fact Sheet", Maximum Taxable Earnings (https://www.ssa.gov/news/en/cola/factsheets/2027.html), announced
 *   Oct 14, 2026 with the 3.6% COLA (https://www.ssa.gov/news/en/press/releases/2026-10-14.html); the same on
 *   https://www.ssa.gov/oact/cola/cbb.html ("For earnings in 2027, this base is $192,300"), both read 2026-10-15. State payroll
 *   taxes capped at it (`wageCap: "ssWageBase"`) follow. PolicyEngine-US 2.30.3 has $192,600 for 2027, a CBO forecast (its
 *   gov/irs/payroll/social_security/cap.yaml), not SSA's determination.
 *
 * Not yet published (checked 2026-10-15: the IRS's newsroom and irs-drop listing; see docs/data-refresh.md): the annual
 * inflation revenue procedure (brackets, standard deduction, 127, 132(f)) and the 402(g) notice.
 */
export const FEDERAL_2027: EnactedAmounts = {
  hsaLimit: { self: 4_500, family: 9_000 },
  socialSecurityWageBase: 192_300,
};
