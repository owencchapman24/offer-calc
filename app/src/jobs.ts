// The engine worker's two lanes (docs/ui-design.md §3.4). A worker can't interrupt its own work, so
// slow jobs (breakeven, the leave sweep) run in chunks and give way between them:
// - fast: every edit's request. Only the newest waiting one is kept, and it runs before the next chunk
//   of any slow job, so an edit waits at most one chunk;
// - slow: generators, one chunk per `next()`. A job is keyed by what it's for; a newer job with the
//   same key replaces the older one, even mid-run, so stale work stops at the next chunk. Jobs with
//   different keys take turns. A job posts its own result when it finishes.
// Pure apart from the scheduler, which tests replace.

export interface Runner<F> {
  /** Every edit's request: replaces any request still waiting. */
  fast(req: F): void;
  /** A slow job, run a chunk at a time; replaces a waiting or running job with the same key. */
  slow(key: string, job: Iterator<unknown>): void;
}

/** `schedule` runs a step later, after messages that have already arrived (a macrotask, by default). */
export function createRunner<F>(runFast: (req: F) => void, schedule: (step: () => void) => void = (step) => { setTimeout(step, 0); }): Runner<F> {
  let waiting: { req: F } | null = null;
  const jobs = new Map<string, Iterator<unknown>>();
  let scheduled = false;
  const wake = () => {
    if (scheduled) return;
    scheduled = true;
    schedule(step);
  };
  function step() {
    scheduled = false;
    if (waiting) {
      const { req } = waiting;
      waiting = null;
      runFast(req);
    } else {
      const first = jobs.entries().next();
      if (!first.done) {
        const [key, job] = first.value;
        jobs.delete(key);
        // Back of the line after its chunk, unless a newer job with the same key arrived meanwhile.
        if (!job.next().done && !jobs.has(key)) jobs.set(key, job);
      }
    }
    if (waiting || jobs.size) wake();
  }
  return {
    fast(req) {
      waiting = { req };
      wake();
    },
    slow(key, job) {
      jobs.delete(key);
      jobs.set(key, job);
      wake();
    },
  };
}
