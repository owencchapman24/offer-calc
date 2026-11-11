// The tax engine over a grid of incomes. Two users:
// - scripts/grid.ts (`npm run grid`) writes the oracle's grid, which scripts/oracle.py compares with PolicyEngine-US;
// - test/grid.test.ts compares the oracle's grid and the rows the oracle doesn't cover with the committed baseline,
//   test/baselines/grid-2026.json, in every `npm test`.
// Pure: no I/O, so the test and the script share it. Keep the oracle's rows as they are (their fields, in this order):
// `npm run grid`'s output stays byte-identical, and oracle.py reads it.
import { computeTaxes, paramsForYear, STATES_2026, type FilingStatus, type TaxResult } from "../../src/tax/index";

/** The oracle's year, as scripts/oracle.py's YEAR: both move with the base year (docs/data-refresh.md, "Moving the base year"). */
export const GRID_YEAR = 2026;
/** $40k to $320k in steps of $20k, as oracle.py's axis. */
export const INCOMES: readonly number[] = Array.from({ length: 15 }, (_, i) => 40_000 + i * 20_000);
const STATUSES: readonly FilingStatus[] = ["single", "joint"];

type Row = Record<string, string | number | boolean>;

const fica = (r: TaxResult) => r.socialSecurity + r.medicare + r.additionalMedicare;

/** The oracle's grid: every state, single and joint, at each income; NYC's rows follow NY's. What `npm run grid` writes. */
export function oracleGrid(): Row[] {
  const rows: Row[] = [];
  for (const state of Object.keys(STATES_2026)) {
    for (const filingStatus of STATUSES) {
      for (const wages of INCOMES) {
        const r = computeTaxes({ year: GRID_YEAR, filingStatus, wages, state });
        rows.push({ state, filingStatus, wages, fed: r.federalIncomeTax, fica: fica(r), st: r.stateIncomeTax, pay: r.statePayrollTax });
      }
    }
    if (state === "NY") {
      for (const filingStatus of STATUSES) for (const wages of INCOMES) {
        const r = computeTaxes({ year: GRID_YEAR, filingStatus, wages, state, locality: { kind: "nyc" } });
        rows.push({ state: "NYC", filingStatus, wages, local: r.localIncomeTax, fed: r.federalIncomeTax, st: r.stateIncomeTax });
      }
    }
  }
  return rows;
}

/**
 * Projected years, at the offer model's default inflation (2.5%), for states that project each way:
 * - CA indexes its brackets, standard deduction, exemption credit and thresholds by statute (`indexed`);
 * - CO's standard deduction is the federal one, and its FAMLI premium is capped at the Social Security wage base;
 * - NY holds its 2026 law flat, with a fixed paid-leave cap, and its filers itemize at higher incomes (SALT);
 * - WA has no income tax: federal tax and FICA alone, with its paid leave capped at the wage base.
 * 2027 is the first projected year; 2030 is the first with the SALT cap back at $10,000 (IRC 164(b)(7)).
 */
export const PROJECTED = { years: [2027, 2030], inflation: 0.025, states: ["CA", "CO", "NY", "WA"] } as const;

export function projectedRows(): Row[] {
  const rows: Row[] = [];
  for (const year of PROJECTED.years) {
    const params = paramsForYear(year, { inflation: PROJECTED.inflation });
    for (const state of PROJECTED.states) for (const filingStatus of STATUSES) for (const wages of INCOMES) {
      const r = computeTaxes({ year, filingStatus, wages, state }, params);
      rows.push({ year, state, filingStatus, wages, fed: r.federalIncomeTax, fica: fica(r), st: r.stateIncomeTax, pay: r.statePayrollTax });
    }
  }
  return rows;
}

/** Philadelphia's wage tax, which the oracle doesn't cover: a resident (the app's case) and a commuter (v2 item 4g), 2026. */
export function philadelphiaRows(): Row[] {
  const rows: Row[] = [];
  for (const resident of [true, false]) for (const filingStatus of STATUSES) for (const wages of INCOMES) {
    const r = computeTaxes({ year: GRID_YEAR, filingStatus, wages, state: "PA", locality: { kind: "philadelphia", resident } });
    rows.push({ resident, filingStatus, wages, local: r.localIncomeTax, fed: r.federalIncomeTax, st: r.stateIncomeTax, pay: r.statePayrollTax });
  }
  return rows;
}

/**
 * The baseline as committed (test/baselines/grid-2026.json): JSON, one row a line, so a diff names the rows that moved. Its
 * "grid" is exactly the oracle's grid, so a change there is one the oracle's report can show.
 */
export function baselineJson(): string {
  const sections: Array<[string, Row[]]> = [["grid", oracleGrid()], ["projected", projectedRows()], ["philadelphia", philadelphiaRows()]];
  const body = sections.map(([name, rows]) => `${JSON.stringify(name)}: [\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]`);
  return `{\n${body.join(",\n")}\n}\n`;
}
