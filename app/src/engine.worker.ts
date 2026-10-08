import { horizonSweep } from "../../src/offer/compare";
import type { HorizonSweep, Household, OfferInput } from "../../src/offer/types";

// The engine runs here, off the main thread, so typing stays smooth (docs/ui-design.md §3.4).
// Requests carry a generation number; while one runs, only the newest waiting request is kept.

export interface EngineRequest {
  gen: number;
  offers: OfferInput[];
  household: Household;
  /** Stay lengths in years; each is a comparison window from the earliest start. */
  stays: number[];
  valuationDate: string;
  inflation: number;
  discountRate: number;
}

export type EngineResponse =
  | { gen: number; ok: true; sweep: HorizonSweep; ms: number }
  | { gen: number; ok: false; error: string };

const scope = self as unknown as {
  postMessage(message: EngineResponse): void;
  onmessage: ((e: MessageEvent<EngineRequest>) => void) | null;
};

let waiting: EngineRequest | null = null;
let scheduled = false;

scope.onmessage = (e) => {
  waiting = e.data;
  if (!scheduled) {
    scheduled = true;
    setTimeout(run, 0); // lets queued messages arrive first, so stale requests are skipped
  }
};

function run() {
  scheduled = false;
  const req = waiting;
  waiting = null;
  if (!req) return;
  const t = performance.now();
  try {
    const sweep = horizonSweep(req.offers, req.household, req.stays,
      { valuationDate: req.valuationDate, inflation: req.inflation, discountRate: req.discountRate });
    scope.postMessage({ gen: req.gen, ok: true, sweep, ms: performance.now() - t });
  } catch (err) {
    scope.postMessage({ gen: req.gen, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
