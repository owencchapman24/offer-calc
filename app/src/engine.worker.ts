import { compute } from "./compute";
import { createRunner } from "./jobs";
import type { EngineRequest, EngineResponse } from "./protocol";

// The engine runs here, off the main thread, so typing stays smooth (docs/ui-design.md §3.4). It
// also holds the full BEA and HUD tables: the main thread ships only the slim city list and asks
// here for rent estimates. Requests carry a generation number; while one runs, only the newest
// waiting request is kept. Edits take the fast lane (jobs.ts): they run ahead of any slow job's
// next chunk.

const scope = self as unknown as {
  postMessage(message: EngineResponse): void;
  onmessage: ((e: MessageEvent<EngineRequest>) => void) | null;
};

const runner = createRunner(run);
scope.onmessage = (e) => runner.fast(e.data);

function run(req: EngineRequest) {
  const t = performance.now();
  try {
    const { sweep, detail, rents, issues } = compute(req);
    const ms = performance.now() - t;
    // Problems with the inputs: nothing was compared, and the results keep the last valid state.
    if (issues.some((x) => x.length)) scope.postMessage({ gen: req.gen, ok: false, error: null, issues, rents, ms });
    else scope.postMessage({ gen: req.gen, ok: true, sweep, detail, rents, issues, ms });
  } catch (err) {
    // Rent estimates don't depend on the comparison, so they still come back.
    const { rents } = compute({ ...req, compare: null, check: [] });
    scope.postMessage({ gen: req.gen, ok: false, error: err instanceof Error ? err.message : String(err), issues: [], rents, ms: performance.now() - t });
  }
}
