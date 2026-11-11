import { describe, expect, it } from "vitest";
import { baselineJson, INCOMES, oracleGrid } from "../scripts/lib/grid";
import { STATES_2026 } from "../src/tax/index";

// The tax engine against its committed baseline (audit T1), in every `npm test` and so in CI: the oracle's grid (every state,
// single and joint, $40k-$320k, and NYC), a few projected years, and Philadelphia's wage tax (scripts/lib/grid.ts). Most
// states' special rules (src/tax/state.ts) have no unit test of their own; this is what fails when a change moves any of them.
//
// A change that moves it is a tax change. If it's meant, update the baseline (`npx vitest run test/grid.test.ts -u`) and
// explain the diff in the pull request; a change to its "grid" section is one the oracle's report can show, so run
// `npm run oracle` too (CLAUDE.md section 8). The comparison takes the file's line endings as LF, as a Windows checkout's CRLF
// is read (vitest normalizes a file snapshot's CRLF when what it's given has none).
//
// The projected years don't move at a data refresh. This test runs in the "frozen law" project (vitest.config.ts), on the
// tests' frozen copy of the amounts published for years after 2026 (test/frozen-enacted.ts, swapped in for
// src/tax/params/enacted.ts). So when FEDERAL_2027 gets the IRS's 2027 brackets, standard deduction and 402(g) limit, these
// rows are still projected from 2026's law, as before: test/law.test.ts is the one test a refresh moves. They move with 2026's
// law, with how a year is projected (paramsForYear), and at the base-year move, which renames the file for its year.
describe("the tax engine's grid baseline", () => {
  const json = baselineJson();

  it("matches test/baselines/grid-2026.json", async () => {
    await expect(json).toMatchFileSnapshot("./baselines/grid-2026.json");
  });

  it("holds the oracle's grid as npm run grid writes it, each state and NYC at every income", () => {
    const { grid } = JSON.parse(json) as { grid: unknown[] };
    expect(JSON.stringify(grid)).toBe(JSON.stringify(oracleGrid()));
    expect(grid).toHaveLength((Object.keys(STATES_2026).length + 1) * 2 * INCOMES.length);
  });
});
