import { describe, expect, it } from "vitest";
import { createRunner } from "./jobs";

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
