import type { EnactedAmounts } from "./index";

/**
 * Federal amounts published for tax year 2027 so far. Everything else in 2027 is projected from 2026 (paramsForYear), and
 * these are projected on from 2027 for later years.
 *
 * - HSA contribution limit (employee + employer), IRC 223(b)(2): $4,500 self-only, $9,000 family. Source: IRS Rev. Proc.
 *   2026-24, sec. 3.01(1) (released May 29, 2026; https://www.irs.gov/pub/irs-drop/rp-26-24.pdf). PolicyEngine-US 2.30.3 has
 *   no HSA contribution-limit parameter to check it against.
 *
 * Not yet published (checked 2026-10-12; see docs/data-refresh.md): the annual inflation revenue procedure
 * (brackets, standard deduction, 127, 132(f)), the 402(g) notice, and SSA's 2027 wage base.
 */
export const FEDERAL_2027: EnactedAmounts = {
  hsaLimit: { self: 4_500, family: 9_000 },
};
