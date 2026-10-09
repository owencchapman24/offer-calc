import { type RefObject, useEffect, useState, useSyncExternalStore } from "react";

// A module that loads the first time it's needed (a separate chunk), which components then read
// synchronously. Quick-mode visitors who never open detailed mode or a tickmark never download them.

export interface LazyModule<T> {
  /** The module, once loaded. */
  get(): T | null;
  /** Starts loading it (once); resolves with it. */
  load(): Promise<T>;
  /** Supplies it directly: for tests and static renders, which can't wait for a chunk. */
  provide(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function lazyModule<T>(loader: () => Promise<T>): LazyModule<T> {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  const listeners = new Set<() => void>();
  const set = (v: T) => {
    value = v;
    for (const f of listeners) f();
    return v;
  };
  return {
    get: () => value,
    load: () => (value ? Promise.resolve(value) : (pending ??= loader().then(set))),
    provide: (v) => { set(v); },
    subscribe: (f) => {
      listeners.add(f);
      return () => { listeners.delete(f); };
    },
  };
}

/** The module if it's loaded, re-rendering when it arrives; null until then (call load() to start it). */
export function useLazyModule<T>(m: LazyModule<T>): T | null {
  return useSyncExternalStore(m.subscribe, m.get, m.get);
}

/**
 * Starts loading a module when `ref`'s element comes within a screen of the viewport: a schedule below
 * the fold loads as you scroll toward it, so a visit that never gets there doesn't download it.
 */
export function useLoadNear<T>(m: LazyModule<T>, ref: RefObject<Element | null>, loaded: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (loaded || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      void m.load();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void m.load();
      }
    }, { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [m, ref, loaded]);
}

/** Whether the element is on screen or near it: a schedule's slow jobs (L-3, L-4) run only then. */
export function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [on, setOn] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setOn(entries.some((e) => e.isIntersecting)), { rootMargin: "50% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}
