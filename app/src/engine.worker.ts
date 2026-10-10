import { compute } from "./compute";
import { createRunner } from "./jobs";
import type { EngineRequest, EngineResponse, SlowRequest, SlowResponse } from "./protocol";
import { breakevenJob, cursorJob, leaveJob, paymentsJob } from "./slowJobs";

// The engine runs here, off the main thread, so typing stays smooth (docs/ui-design.md §3.4). It
// also holds the full BEA and HUD tables: the main thread ships only the slim city list and asks
// here for rent estimates. Requests carry a generation number; while one runs, only the newest
// waiting request is kept. Edits take the fast lane (jobs.ts): they run ahead of any slow job's
// next chunk. L-4's leave sweep and its panel at the cursor, L-3's breakevens and the close-call line's, and L-6's
// payments and tax years are slow jobs (slowJobs.ts), each replaced by a newer request of its kind.

const scope = self as unknown as {
  postMessage(message: EngineResponse | SlowResponse): void;
  onmessage: ((e: MessageEvent<EngineRequest | SlowRequest>) => void) | null;
};

const runner = createRunner(run);
const post = (r: SlowResponse) => scope.postMessage(r);
scope.onmessage = (e) => {
  const m = e.data;
  if (m.lane === "leave") runner.slow("leave", leaveJob(m, post));
  else if (m.lane === "cursor") runner.slow("cursor", cursorJob(m, post));
  else if (m.lane === "work") runner.slow("work", paymentsJob(m, post));
  else if (isEdit(m)) runner.fast(m);
  // The close-call line's breakeven runs ahead of L-3's and L-4's jobs: the lead schedule is always on screen.
  else runner.slow(m.lane, breakevenJob(m, post), m.lane === "flip" ? 1 : 0);
};

/** An edit's request: the fast lane. (A lane that's optional doesn't narrow the union by itself.) */
const isEdit = (m: EngineRequest | SlowRequest): m is EngineRequest => m.lane === undefined || m.lane === "compare";

function run(req: EngineRequest) {
  const t = performance.now();
  try {
    const { sweep, detail, rents, issues } = compute(req);
    const ms = performance.now() - t;
    // Problems with the inputs: nothing was compared, and the results keep the last valid state.
    if (issues.some((x) => x.length)) scope.postMessage({ lane: "compare", gen: req.gen, ok: false, error: null, issues, rents, ms });
    else scope.postMessage({ lane: "compare", gen: req.gen, ok: true, sweep, detail, rents, issues, ms });
  } catch (err) {
    // Rent estimates don't depend on the comparison, so they still come back.
    const { rents } = compute({ ...req, compare: null, check: [] });
    scope.postMessage({ lane: "compare", gen: req.gen, ok: false, error: err instanceof Error ? err.message : String(err), issues: [], rents, ms: performance.now() - t });
  }
}
