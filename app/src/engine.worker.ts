import { estimateRent, type RentEstimate } from "../../src/col/rent";
import { horizonSweep } from "../../src/offer/compare";
import { type EngineRequest, type EngineResponse, rentKey } from "./protocol";

// The engine runs here, off the main thread, so typing stays smooth (docs/ui-design.md §3.4). It
// also holds the full BEA and HUD tables: the main thread ships only the slim city list and asks
// here for rent estimates. Requests carry a generation number; while one runs, only the newest
// waiting request is kept.

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
  const rents: Record<string, RentEstimate> = {};
  for (const { area, state } of req.rents) {
    try {
      rents[rentKey(area, state)] = estimateRent(area, state, { bedrooms: 1 });
    } catch { /* an unknown area just shows no estimate */ }
  }
  try {
    const c = req.compare;
    const sweep = c ? horizonSweep(c.offers, c.household, c.stays,
      { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate }) : null;
    scope.postMessage({ gen: req.gen, ok: true, sweep, rents, ms: performance.now() - t });
  } catch (err) {
    scope.postMessage({ gen: req.gen, ok: false, error: err instanceof Error ? err.message : String(err), rents, ms: performance.now() - t });
  }
}
