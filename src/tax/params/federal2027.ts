import type { EnactedAmounts } from "./index";

/**
 * Federal amounts published for tax year 2027 so far. Everything else in 2027 is projected from 2026 (paramsForYear), and
 * these are projected on from 2027 for later years.
 *
 * - Brackets, IRC 1(j)(2): Rev. Proc. 2026-35, sec. 3.01, Tables 1 (married filing jointly), 2 (heads of household) and 3
 *   (unmarried individuals), each a lower bound and its rate, as `[taxable income over, rate]`.
 * - Standard deduction, IRC 63(c)(2): $33,200 joint, $24,925 head of household, $16,600 single. Rev. Proc. 2026-35, sec. 3.15(1).
 * - Educational assistance exclusion, IRC 127(a)(2): $5,400 a year (indexed from 2027, Pub. L. 119-21). Rev. Proc. 2026-35,
 *   sec. 3.17.
 * - Qualified transportation fringe, IRC 132(f)(2): $350 a month for transit and commuter vehicles (A) and for parking (B), so
 *   one limit as before. Rev. Proc. 2026-35, sec. 3.18.
 *
 *   Rev. Proc. 2026-35 was released Nov 5, 2026 (IR-2026-133; https://www.irs.gov/pub/irs-drop/rp-26-35.pdf, read 2026-11-10);
 *   its single and joint brackets and standard deductions match the news release. PolicyEngine-US 2.30.3 has no 2027 values for
 *   these (it projects them from 2026's), so there's nothing of its to check them against.
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
 * Not yet published (checked 2026-11-10: the IRS's newsroom and irs-drop listing; see docs/data-refresh.md): the 402(g) notice,
 * the 401(k) elective deferral limit, which Rev. Proc. 2026-35 doesn't set.
 */
export const FEDERAL_2027: EnactedAmounts = {
  standardDeduction: { single: 16_600, joint: 33_200, headOfHousehold: 24_925 },
  brackets: {
    single: [
      [0, 0.1], [12_800, 0.12], [52_025, 0.22], [109_125, 0.24],
      [208_325, 0.32], [264_550, 0.35], [661_375, 0.37],
    ],
    joint: [
      [0, 0.1], [25_600, 0.12], [104_050, 0.22], [218_250, 0.24],
      [416_650, 0.32], [529_100, 0.35], [793_650, 0.37],
    ],
    headOfHousehold: [
      [0, 0.1], [18_250, 0.12], [69_650, 0.22], [109_100, 0.24],
      [208_300, 0.32], [264_550, 0.35], [661_350, 0.37],
    ],
  },
  section127Limit: 5_400,
  commuterMonthlyLimit: 350,
  hsaLimit: { self: 4_500, family: 9_000 },
  socialSecurityWageBase: 192_300,
};
