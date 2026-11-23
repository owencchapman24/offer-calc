import { describe, expect, it } from "vitest";
import { createRunner, inOrder, onFirstUse } from "./jobs";
import { CHUNK_RELOAD_KEY, lazyModule, reloadForChunk } from "./lazy";

// The worker's two lanes (docs/ui-design.md §3.4), stepped by hand: `tick` runs one scheduled step,
// as the worker's event loop would between messages.
function harness() {
  const log: string[] = [];
  const queue: Array<() => void> = [];
  const runner = createRunner<string>((req) => log.push(`fast ${req}`), (step) => queue.push(step));
  const tick = () => queue.shift()?.();
  const drain = () => { while (queue.length) tick(); };
  function* job(name: string, chunks: number) {
    for (let i = 1; i <= chunks; i++) {
      log.push(`${name} ${i}`);
      if (i < chunks) yield;
    }
    log.push(`${name} done`);
  }
  return { log, runner, tick, drain, job, queue };
}

describe("the worker's lanes", () => {
  it("fast: only the newest waiting request runs", () => {
    const h = harness();
    h.runner.fast("1");
    h.runner.fast("2");
    h.runner.fast("3");
    h.drain();
    expect(h.log).toEqual(["fast 3"]);
  });

  it("an edit that arrives mid-job runs before the job's next chunk: it waits at most one chunk", () => {
    const h = harness();
    h.runner.slow("sweep", h.job("sweep", 3));
    h.tick(); // chunk 1
    h.runner.fast("edit");
    h.drain();
    expect(h.log).toEqual(["sweep 1", "fast edit", "sweep 2", "sweep 3", "sweep done"]);
  });

  it("a newer job with the same key replaces the older one between chunks", () => {
    const h = harness();
    h.runner.slow("sweep", h.job("old", 3));
    h.tick();
    h.runner.slow("sweep", h.job("new", 2));
    h.drain();
    expect(h.log).toEqual(["old 1", "new 1", "new 2", "new done"]);
  });

  it("jobs with different keys take turns, a chunk each", () => {
    const h = harness();
    h.runner.slow("a", h.job("a", 2));
    h.runner.slow("b", h.job("b", 2));
    h.drain();
    expect(h.log).toEqual(["a 1", "b 1", "a 2", "a done", "b 2", "b done"]);
  });

  it("schedules one step at a time, and stops when there's nothing left", () => {
    const h = harness();
    h.runner.fast("1");
    h.runner.slow("a", h.job("a", 1));
    expect(h.queue).toHaveLength(1);
    h.drain();
    expect(h.queue).toHaveLength(0);
    expect(h.log).toEqual(["fast 1", "a 1", "a done"]);
  });
});

describe("priority", () => {
  it("a higher-priority job runs before the others' next chunks, to the end; edits still go first", () => {
    const h = harness();
    h.runner.slow("l4", h.job("l4", 3));
    h.runner.slow("l3", h.job("l3", 2));
    h.tick(); // l4's first chunk
    h.runner.slow("flip", h.job("flip", 3), 1);
    h.tick(); // flip 1
    h.runner.fast("edit");
    h.drain();
    expect(h.log).toEqual(["l4 1", "flip 1", "fast edit", "flip 2", "flip 3", "flip done", "l3 1", "l4 2", "l3 2", "l3 done", "l4 3", "l4 done"]);
  });
});

// Code the worker loads on first use (engine.worker.ts): the slow jobs and the engine's optional modules.
describe("loading on first use", () => {
  /** A load the test settles by hand. */
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("loads once, then needs no wait; a failed load is tried again", async () => {
    let calls = 0;
    let fail = true;
    const m = onFirstUse(() => (calls++, fail ? Promise.reject(new Error("offline")) : Promise.resolve("module")));
    await expect(m.load()).rejects.toThrow("offline");
    expect(m.value).toBeUndefined();
    fail = false;
    const a = m.load();
    expect(m.load()).toBe(a); // one load at a time
    await expect(a).resolves.toBe("module");
    expect([m.value, m.load(), calls]).toEqual(["module", null, 2]);
  });

  it("a message with nothing to wait for goes on at once, unless one before it is still waiting", async () => {
    const log: string[] = [];
    const receive = inOrder<string>((m, error) => log.push(error ? `${m}: ${error.message}` : m));
    receive("1", null);
    expect(log).toEqual(["1"]);
    const load = deferred<unknown>();
    receive("2", load.promise);
    receive("3", null); // behind 2
    await settle();
    expect(log).toEqual(["1"]);
    load.resolve(undefined);
    await settle();
    expect(log).toEqual(["1", "2", "3"]);
    receive("4", null); // nothing waiting now: at once
    expect(log).toEqual(["1", "2", "3", "4"]);
  });

  it("a failed load hands its message on with the error, and those behind it go on as usual", async () => {
    const log: string[] = [];
    const receive = inOrder<string>((m, error) => log.push(error ? `${m}: ${error.message}` : m));
    const load = deferred<unknown>();
    receive("1", load.promise);
    receive("2", Promise.resolve());
    load.reject(new Error("offline"));
    await settle();
    expect(log).toEqual(["1: offline", "2"]);
  });
});

describe("a chunk that won't load (audit C24)", () => {
  it("a lazy module whose load fails is tried again on the next load, and arrives", async () => {
    let calls = 0;
    const m = lazyModule(() => (++calls === 1 ? Promise.reject(new Error("chunk gone")) : Promise.resolve({ v: 42 })));
    await expect(m.load()).rejects.toThrow("chunk gone");
    expect(m.get()).toBeNull();
    await expect(m.load()).resolves.toEqual({ v: 42 });
    expect(m.get()).toEqual({ v: 42 });
    expect(calls).toBe(2);
  });

  it("reloads the page once, not again within a minute, and never where it can't record it", () => {
    const mem = new Map<string, string>();
    const tab = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    const t = 1_800_000_000_000;
    expect(reloadForChunk(tab, t)).toBe(true);
    expect(mem.get(CHUNK_RELOAD_KEY)).toBe(String(t));
    // The reloaded page fails too, within the minute: no second reload, so a site that's down doesn't loop.
    expect(reloadForChunk(tab, t + 59_999)).toBe(false);
    // A later deploy, the same tab: it may reload again.
    expect(reloadForChunk(tab, t + 60_000)).toBe(true);
    expect(reloadForChunk(undefined, t)).toBe(false);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
    expect(reloadForChunk(blocked, t)).toBe(false);
  });
});
