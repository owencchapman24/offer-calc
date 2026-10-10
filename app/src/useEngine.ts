import { useCallback, useEffect, useRef, useState } from "react";
import type { RentEstimate } from "../../src/col/rent";
import type { HorizonSweep } from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";
import type { EngineRequest, EngineResponse, LeaveCurve, LeavePanel, SlowLane, SlowRequest, SlowResponse, StayDetail, Ties, WorkOffer } from "./protocol";

/** A slow-lane result (L-3, L-4, L-6, the close-call line): the latest one back, the request it answers, and whether a newer one is on its way. */
export interface SlowState<T> {
  result: T | null;
  /** The request `result` answers (requestSlow's key). */
  key: string | null;
  updating: boolean;
  error: string | null;
  /** From the request reaching the worker to its result, the wait for edits included. */
  ms: number | null;
}

export interface EngineState {
  /** The latest comparison for the current inputs, or the previous one while recomputing. */
  sweep: HorizonSweep | null;
  /** Your stay's full projections, from the same request as `sweep`. */
  detail: StayDetail | null;
  /** Rent estimates by `rentKey(area, state)`. */
  rents: Record<string, RentEstimate>;
  updating: boolean;
  error: string | null;
  /** The validator's problems for each checked offer (the request's `check`, in order). */
  issues: OfferIssue[][];
  /** The latest inputs have problems: `sweep` and `detail` are from the last valid ones. */
  invalid: boolean;
  ms: number | null;
  /** L-4's curves and its panel at the cursor (docs/ui-design.md §4.5). */
  leave: SlowState<LeaveCurve[]>;
  cursor: SlowState<Array<LeavePanel | null>>;
  /** The close-call line's breakeven (§4.1) and L-3's (§4.6). */
  flip: SlowState<Ties>;
  breakeven: SlowState<Ties>;
  /** L-6's payments and tax years (§4.8): asked for only while it's open. */
  work: SlowState<WorkOffer[]>;
}

type Body<T> = T extends unknown ? Omit<T, "gen"> : never;
/** A slow job to run: L-4's curves or its panel, breakevens, or L-6's payments. A request with the same key as the last of its lane is skipped. */
export type SlowJob = Body<SlowRequest>;

export interface Engine extends EngineState {
  requestSlow(job: SlowJob, key: string): void;
}

const DEBOUNCE_MS = 200;
const noSlow = { result: null, key: null, updating: false, error: null, ms: null };
const LANES: SlowLane[] = ["leave", "cursor", "flip", "breakeven", "work"];
const slowResult = (r: Extract<SlowResponse, { ok: true }>) => ("curves" in r ? r.curves : "panels" in r ? r.panels : "work" in r ? r.work : r.ties);

/**
 * Runs the engine in a Web Worker. Inputs are debounced; each request gets a generation number and
 * any response for an older generation is dropped, so a slow result never overwrites a newer one.
 * While recomputing, the previous result stays on screen (dimmed by the caller). Slow jobs (L-3, L-4, L-6) go
 * to the same worker's slow lane, each lane with its own generations.
 */
export function useEngine(request: Omit<EngineRequest, "gen">, /** Changes when the offers are replaced wholesale: older results then don't apply. */ revision = 0): Engine {
  const worker = useRef<Worker | null>(null);
  const gen = useRef(0);
  /** The inputs each comparison request was for, and the ones the latest result answers. */
  const sent = useRef(new Map<number, string>());
  const [answered, setAnswered] = useState<string | null>(null);
  const slow = useRef(Object.fromEntries(LANES.map((l) => [l, { gen: 0, key: null as string | null }])) as Record<SlowLane, { gen: number; key: string | null }>);
  /** Slow jobs asked for before the worker started. */
  const queued = useRef<SlowRequest[]>([]);
  const [state, setState] = useState<EngineState>({
    sweep: null, detail: null, rents: {}, updating: true, error: null, issues: [], invalid: false, ms: null,
    leave: noSlow, cursor: noSlow, flip: noSlow, breakeven: noSlow, work: noSlow,
  });
  // An import or "Delete all data" replaces every offer: the last valid results were for offers that are gone.
  const seen = useRef(revision);
  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    for (const l of LANES) slow.current[l].key = null;
    setState((s) => ({ ...s, sweep: null, detail: null, leave: noSlow, cursor: noSlow, flip: noSlow, breakeven: noSlow, work: noSlow }));
  }, [revision]);

  useEffect(() => {
    const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<EngineResponse | SlowResponse>) => {
      const r = e.data;
      if (r.lane !== "compare") {
        const lane = slow.current[r.lane];
        if (r.gen !== lane.gen) return; // a newer job replaced it
        setState((s) => ({ ...s, [r.lane]: {
          result: r.ok ? slowResult(r) : s[r.lane].result, key: r.ok ? lane.key : s[r.lane].key,
          updating: false, error: r.ok ? null : r.error, ms: r.ms,
        } }));
        return;
      }
      if (r.gen !== gen.current) return; // stale
      setAnswered(sent.current.get(r.gen) ?? null);
      sent.current.clear();
      setState((s) => r.ok
        ? { ...s, sweep: r.sweep, detail: r.detail, rents: r.rents, updating: false, error: null, issues: r.issues, invalid: false, ms: r.sweep ? r.ms : s.ms }
        : { ...s, rents: r.rents, updating: false, error: r.error, issues: r.issues, invalid: r.error === null });
    };
    worker.current = w;
    for (const m of queued.current.splice(0)) w.postMessage(m);
    return () => w.terminate();
  }, []);

  const key = JSON.stringify(request);
  useEffect(() => {
    setState((s) => ({ ...s, updating: true }));
    const t = setTimeout(() => {
      sent.current.set(++gen.current, key);
      worker.current?.postMessage({ ...request, lane: "compare", gen: gen.current });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // The request is compared by value (key), not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const requestSlow = useCallback((job: SlowJob, jobKey: string) => {
    const lane = slow.current[job.lane];
    if (lane.key === jobKey) return;
    lane.key = jobKey;
    const message = { ...job, gen: ++lane.gen } as SlowRequest;
    setState((s) => ({ ...s, [job.lane]: { ...s[job.lane], updating: true } }));
    if (worker.current) worker.current.postMessage(message);
    else queued.current.push(message);
  }, []);

  // Updating from the render that changes the inputs, not only once the effect above has run: what waits on a
  // current result (L-4's slow jobs) mustn't start on the old one.
  return { ...state, updating: state.updating || answered !== key, requestSlow };
}
