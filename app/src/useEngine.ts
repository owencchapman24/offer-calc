import { useEffect, useRef, useState } from "react";
import type { HorizonSweep } from "../../src/offer/types";
import type { EngineRequest, EngineResponse } from "./engine.worker";

export interface EngineState {
  /** The latest result for the current inputs, or the previous one while recomputing. */
  sweep: HorizonSweep | null;
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
export function useEngine(request: Omit<EngineRequest, "gen"> | null): EngineState {
  const worker = useRef<Worker | null>(null);
  const gen = useRef(0);
  const [state, setState] = useState<EngineState>({ sweep: null, updating: false, error: null, ms: null });

  useEffect(() => {
    const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<EngineResponse>) => {
      const r = e.data;
      if (r.gen !== gen.current) return; // stale
      setState(r.ok ? { sweep: r.sweep, updating: false, error: null, ms: r.ms }
        : (s) => ({ ...s, updating: false, error: r.error }));
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const key = request ? JSON.stringify(request) : null;
  useEffect(() => {
    if (!request) {
      gen.current++;
      setState({ sweep: null, updating: false, error: null, ms: null });
      return;
    }
    setState((s) => ({ ...s, updating: true }));
    const t = setTimeout(() => worker.current?.postMessage({ ...request, gen: ++gen.current }), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // The request is compared by value (key), not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
