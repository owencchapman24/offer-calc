// Engine timings on the sample offers, for the UI's live-update budget (docs/ui-design.md §3.4).
// Usage: npm run bench. Each case is warmed up, then timed; the median run is reported.
import {
  breakeven, cliffs, compareOffers, comparisonWindow, horizonSweep, leaveDateSweep, nextCliff, projectScenario, rentFlip, withholdingShortfall,
} from "../src/offer/index";
import { SAMPLE_HOUSEHOLD as household, SAMPLE_OFFERS as offers } from "../src/samples";
import { compute, type OwnCache } from "../app/src/compute";

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

// The worker's fast lane as the app runs it (app/src/compute.ts): each offer's breakdown, remembered by its inputs, and with two or more
// the comparison (docs/v2-plan.md, item 5).
const request = (os: typeof offers) => ({ offers: { offers: os, household, stays: [2, 3, 4, 5], stayYears: 4, ...opts, discountRate: 0.05 },
  ids: os.map((_, i) => String(i)), rents: [] });
const warm: OwnCache = new Map();
compute(request(offers), warm);
let edits = 0;

const cases = [
  time("fast lane: one offer's breakdown, nothing remembered", 20, () => compute(request([offers[0]]))),
  time("fast lane: 3 offers, nothing remembered", 10, () => compute(request(offers))),
  time("fast lane: an edit to one of 3 offers (B's salary)", 10, () =>
    compute(request([offers[0], { ...offers[1], salary: { ...offers[1].salary, annual: 80_000 + ++edits } }, offers[2]]), warm)),
  time("projectScenario, offer A (bonus by year, 401(k) cliff)", 40, () =>
    projectScenario(offers[0], household, { ...opts, window })),
  time("projectScenario, offer C (RSUs + refreshers)", 40, () =>
    projectScenario(offers[2], household, { ...opts, window })),
  time("compareOffers, 3 offers x 3 scenarios", 10, () => compareOffers(offers, household, { ...opts, horizonYears: 4 })),
  time("breakeven, B to tie A, COL-adjusted basis", 5, () =>
    breakeven(offers[0], offers[1], "salary", household, { ...opts, horizonYears: 4, basis: "colAdjustedTotal" })),
  time("rentFlip, A's rent to tie C (closed form)", 20, () =>
    rentFlip(offers[2], offers[0], household, { ...opts, window: comparisonWindow(offers, 4) })),
  time("leaveDateSweep, offer C, months 1-60", 3, () =>
    leaveDateSweep(offers[2], household, Array.from({ length: 60 }, (_, i) => i + 1), { inflation: 0.025 })),
  time("horizonSweep, 3 offers, stays of 2-5 years", 10, () =>
    horizonSweep(offers, household, [2, 3, 4, 5], opts)),
  time("cliffs, offer A (incl. 401(k) vesting scan)", 10, () => cliffs(offers[0], household, opts)),
  time("nextCliff, offer A from 2027-01-12", 10, () => nextCliff(offers[0], household, "2027-01-12", opts)),
  time("withholdingShortfall, offer C", 20, () => withholdingShortfall(offers[2], household, opts)),
];

const w = Math.max(...cases.map((c) => c.label.length));
console.log(`${"Case".padEnd(w)}  median ms`);
for (const c of cases) console.log(`${c.label.padEnd(w)}  ${c.ms.toFixed(1).padStart(9)}`);
