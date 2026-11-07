import { needs, type OptionalModules, type OptionalName, provide } from "../../src/offer/optional";
import { compute, type OwnCache } from "./compute";
import { createRunner, inOrder, onFirstUse } from "./jobs";
import type { EngineRequest, EngineResponse, SlowRequest, SlowResponse } from "./protocol";

// The engine runs here, off the main thread, so typing stays smooth (docs/ui-design.md §3.4). Each complete offer gets its
// breakdown, over its own stay, remembered by its inputs so an edit projects only the offer edited; two or more offers get the
// comparison too (docs/v2-plan.md, item 5). It
// also holds the full BEA and HUD tables: the main thread ships only the slim city list and asks
// here for rent estimates. Requests carry a generation number; while one runs, only the newest
// waiting request is kept. Edits take the fast lane (jobs.ts): they run ahead of any slow job's
// next chunk. L-4's leave sweep and its panel at the cursor, L-3's breakevens and the close-call line's, A-4's cliffs, and
// A-7's payments and tax years are slow jobs (slowJobs.ts), each replaced by a newer request of its kind.
//
// What the first answer doesn't need loads on first use, so it waits on less (CLAUDE.md, Bundles): the slow jobs (and the
// leave sweeps, cliffs and breakevens only they use) on the first slow request, and each of the engine's optional modules
// (src/offer/optional.ts: an ESPP's, commission's) on the first request with an offer that has one. A request waiting on a
// module holds back those after it, so they run in the order they came.

const scope = self as unknown as {
  postMessage(message: EngineResponse | SlowResponse): void;
  onmessage: ((e: MessageEvent<EngineRequest | SlowRequest>) => void) | null;
};

const slowJobs = onFirstUse(() => import("./slowJobs"));
const optionalModule = <K extends OptionalName>(name: K, importer: () => Promise<OptionalModules[K]>) =>
  onFirstUse(() => importer().then((m) => (provide(name, m), m)));
const modules = {
  commission: optionalModule("commission", () => import("../../src/offer/commission")),
  espp: optionalModule("espp", () => import("../../src/offer/espp")),
};

const runner = createRunner(run);
/** The breakdowns worked out lately, by their inputs. */
const cache: OwnCache = new Map();
const post = (r: SlowResponse) => scope.postMessage(r);

const receive = inOrder(dispatch);
scope.onmessage = (e) => receive(e.data, waitFor(e.data));

/** An edit's request: the fast lane. (A lane that's optional doesn't narrow the union by itself.) */
const isEdit = (m: EngineRequest | SlowRequest): m is EngineRequest => m.lane === undefined || m.lane === "compare";

/** What a request needs loaded first: null when it's all in. (An offer only checked, `check`, needs nothing more.) */
function waitFor(m: EngineRequest | SlowRequest): Promise<unknown> | null {
  const loads = [
    ...(isEdit(m) ? [] : [slowJobs.load()]),
    ...needs(isEdit(m) ? m.offers?.offers ?? [] : m.offers).map((name) => modules[name].load()),
  ].filter((p) => p !== null);
  return loads.length ? Promise.all(loads) : null;
}

/**
 * A request, on its lane. If a module it needed didn't load, an edit still runs (the engine says which module is missing) and a
 * slow job answers with the error, as a job that failed would.
 */
function dispatch(m: EngineRequest | SlowRequest, error?: Error) {
  if (isEdit(m)) return runner.fast(m);
  const s = slowJobs.value;
  if (!s || error) return post({ lane: m.lane, gen: m.gen, ok: false, error: (error ?? new Error("The slow jobs didn't load.")).message, ms: 0 });
  if (m.lane === "leave") runner.slow("leave", s.leaveJob(m, post));
  else if (m.lane === "cursor") runner.slow("cursor", s.cursorJob(m, post));
  else if (m.lane === "work") runner.slow("work", s.paymentsJob(m, post));
  else if (m.lane === "terms") runner.slow("terms", s.termsJob(m, post));
  // The close-call line's breakeven runs ahead of L-3's and L-4's jobs: the lead schedule is always on screen.
  else runner.slow(m.lane, s.breakevenJob(m, post), m.lane === "flip" ? 1 : 0);
}

function run(req: EngineRequest) {
  const t = performance.now();
  try {
    const { sweep, detail, breakdowns, rents, issues } = compute(req, cache);
    const ms = performance.now() - t;
    // Problems with the inputs: nothing was worked out, and the results keep the last valid state.
    if (issues.some((x) => x.length)) scope.postMessage({ lane: "compare", gen: req.gen, ok: false, error: null, issues, rents, ms });
    else scope.postMessage({ lane: "compare", gen: req.gen, ok: true, sweep, detail, breakdowns: breakdowns ?? {}, rents, issues, ms });
  } catch (err) {
    // Rent estimates don't depend on the offers' results, so they still come back.
    const { rents } = compute({ ...req, offers: null, check: [] });
    scope.postMessage({ lane: "compare", gen: req.gen, ok: false, error: err instanceof Error ? err.message : String(err), issues: [], rents, ms: performance.now() - t });
  }
}
