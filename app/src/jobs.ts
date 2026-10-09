// The engine worker's two lanes (docs/ui-design.md §3.4). A worker can't interrupt its own work, so
// slow jobs (breakeven, the leave sweep) run in chunks and give way between them:
// - fast: every edit's request. Only the newest waiting one is kept, and it runs before the next chunk
//   of any slow job, so an edit waits at most one chunk;
// - slow: generators, one chunk per `next()`. A job is keyed by what it's for; a newer job with the
//   same key replaces the older one, even mid-run, so stale work stops at the next chunk. Jobs with
//   different keys take turns, except that a job with a higher priority runs first (the close-call
//   line's breakeven, ahead of L-3 and L-4). A job posts its own result when it finishes.
// Pure apart from the scheduler, which tests replace.

export interface Runner<F> {
  /** Every edit's request: replaces any request still waiting. */
  fast(req: F): void;
  /** A slow job, run a chunk at a time; replaces a waiting or running job with the same key. Higher priorities run first. */
  slow(key: string, job: Iterator<unknown>, priority?: number): void;
}

/** `schedule` runs a step later, after messages that have already arrived (a macrotask, by default). */
export function createRunner<F>(runFast: (req: F) => void, schedule: (step: () => void) => void = (step) => { setTimeout(step, 0); }): Runner<F> {
  let waiting: { req: F } | null = null;
  const jobs = new Map<string, { job: Iterator<unknown>; priority: number }>();
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
    } else if (jobs.size) {
      // The first job (in line order) of the highest priority.
      let pick: [string, { job: Iterator<unknown>; priority: number }] | null = null;
      for (const entry of jobs) if (!pick || entry[1].priority > pick[1].priority) pick = entry;
      const [key, entry] = pick!;
      jobs.delete(key);
      // Back of the line after its chunk, unless a newer job with the same key arrived meanwhile.
      if (!entry.job.next().done && !jobs.has(key)) jobs.set(key, entry);
    }
    if (waiting || jobs.size) wake();
  }
  return {
    fast(req) {
      waiting = { req };
      wake();
    },
    slow(key, job, priority = 0) {
      jobs.delete(key);
      jobs.set(key, { job, priority });
      wake();
    },
  };
}
