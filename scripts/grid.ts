// Dumps engine output over an income grid for every state, for oracle comparison.
import { computeTaxes, STATES_2026, type FilingStatus } from "../src/tax/index";

const incomes = Array.from({ length: 15 }, (_, i) => 40_000 + i * 20_000); // 40k..320k
const statuses: FilingStatus[] = ["single", "joint"];
const rows: unknown[] = [];
for (const state of Object.keys(STATES_2026)) {
  for (const filingStatus of statuses) {
    for (const wages of incomes) {
      const r = computeTaxes({ year: 2026, filingStatus, wages, state });
      rows.push({ state, filingStatus, wages, fed: r.federalIncomeTax,
        fica: r.socialSecurity + r.medicare + r.additionalMedicare, st: r.stateIncomeTax, pay: r.statePayrollTax });
    }
  }
  if (state === "NY") {
    for (const filingStatus of statuses) for (const wages of incomes) {
      const r = computeTaxes({ year: 2026, filingStatus, wages, state, locality: { kind: "nyc" } });
      rows.push({ state: "NYC", filingStatus, wages, local: r.localIncomeTax, fed: r.federalIncomeTax, st: r.stateIncomeTax });
    }
  }
}
console.log(JSON.stringify(rows));
