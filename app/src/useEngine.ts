import { useEffect, useRef, useState } from "react";
import type { RentEstimate } from "../../src/col/rent";
import type { HorizonSweep } from "../../src/offer/types";
import type { EngineRequest, EngineResponse } from "./protocol";

export interface EngineState {
  /** The latest comparison for the current inputs, or the previous one while recomputing. */
  sweep: HorizonSweep | null;
  /** Rent estimates by `rentKey(area, state)`. */
  rents: Record<string, RentEstimate>;
  updating: boolean;
  error: string | null;
  ms: number | null;
}

const DEBOUNCE_MS = 200;

/**
 * Runs the engine in a Web Worker. Inputs are debounced; each request gets a generation number and
 * any response for an older generation is dropped, so a slow result never overwrites a newer one.
 * While recomputing, the previous result stays on screen (dimmed by the caller).
 */
export function useEngine(request: Omit<EngineRequest, "gen">): EngineState {
  const worker = useRef<Worker | null>(null);
  const gen = useRef(0);
  const [state, setState] = useState<EngineState>({ sweep: null, rents: {}, updating: true, error: null, ms: null });

  useEffect(() => {
    const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<EngineResponse>) => {
      const r = e.data;
      if (r.gen !== gen.current) return; // stale
      setState((s) => r.ok
        ? { sweep: r.sweep, rents: r.rents, updating: false, error: null, ms: r.sweep ? r.ms : s.ms }
        : { ...s, rents: r.rents, updating: false, error: r.error });
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const key = JSON.stringify(request);
  useEffect(() => {
    setState((s) => ({ ...s, updating: true }));
    const t = setTimeout(() => worker.current?.postMessage({ ...request, gen: ++gen.current }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // The request is compared by value (key), not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
