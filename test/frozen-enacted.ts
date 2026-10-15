import type { EnactedAmounts } from "../src/tax/params/index";

/**
 * The tests' frozen law: src/tax/params/enacted.ts as it stood on 2026-10-15, when the only federal amounts published for a
 * year after 2026 were 2027's HSA limits (IRS Rev. Proc. 2026-24). vitest.config.ts swaps this module in for that one in
 * every test but test/law.test.ts, so the figures the tests pin (the samples' outputs, hand-checked projected years) are worked
 * out under the same law whatever has been published since.
 *
 * Don't update it at a data refresh: a refresh changes enacted.ts and law.test.ts, and no other test. It moves only with the
 * base year (docs/data-refresh.md, "Moving the base year"), when the tests' hand-checked values are redone anyway.
 */
export const ENACTED: ReadonlyArray<readonly [year: number, amounts: EnactedAmounts]> = [
  [2027, { hsaLimit: { self: 4_500, family: 9_000 } }],
];
