// Engine timings on the sample offers, for the UI's live-update budget (docs/ui-design.md §3.4).
// Usage: npm run bench. Each case is warmed up, then timed; the median run is reported.
import { breakeven, compareOffers, leaveDateSweep, projectScenario } from "../src/offer/index";
import { SAMPLE_HOUSEHOLD as household, SAMPLE_OFFERS as offers } from "../src/samples";

const valuationDate = "2026-07-13";
const opts = { inflation: 0.025, valuationDate };
const window = { start: "2026-07-13", years: 4 };

function time(label: string, runs: number, f: () => unknown): { label: string; ms: number } {
  f(); // warm-up
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    f();
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  return { label, ms: ms[Math.floor(ms.length / 2)] };
}

const cases = [
  time("projectScenario, offer A (bonus by year, 401(k) cliff)", 40, () =>
    projectScenario(offers[0], household, { ...opts, window })),
  time("projectScenario, offer C (RSUs + refreshers)", 40, () =>
    projectScenario(offers[2], household, { ...opts, window })),
  time("compareOffers, 3 offers x 3 scenarios", 10, () => compareOffers(offers, household, { ...opts, horizonYears: 4 })),
  time("breakeven, B to tie A, COL-adjusted basis", 5, () =>
    breakeven(offers[0], offers[1], "salary", household, { ...opts, horizonYears: 4, basis: "colAdjustedTotal" })),
  time("leaveDateSweep, offer C, months 1-60", 3, () =>
    leaveDateSweep(offers[2], household, Array.from({ length: 60 }, (_, i) => i + 1), { inflation: 0.025 })),
];

const w = Math.max(...cases.map((c) => c.label.length));
console.log(`${"Case".padEnd(w)}  median ms`);
for (const c of cases) console.log(`${c.label.padEnd(w)}  ${c.ms.toFixed(1).padStart(9)}`);
