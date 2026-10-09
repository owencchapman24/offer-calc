import { useSyncExternalStore } from "react";

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
