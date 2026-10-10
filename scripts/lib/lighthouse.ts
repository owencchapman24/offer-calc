// The load-time budget (docs/ui-design.md §10): on Lighthouse's mobile profile, the median Largest Contentful
// Paint of three runs is at most 2.5 s, Google's "good" threshold for LCP.
//
// The bundle check (scripts/lib/bundle.ts) catches a regression in what we ship; this measures what a
// phone user waits for. Lighthouse's mobile profile: a Moto G Power-sized screen, simulated slow 4G
// (150 ms round trips, 1.6 Mbps down) and a 4x CPU slowdown. Simulated throttling replays an unthrottled
// load through a network and CPU model, so it's steadier than real throttling; the median of three runs
// steadies it further. A warm-up run comes first and is discarded: a fresh browser's first load runs cold (on
// CI its Total Blocking Time was 1-1.2 s, against ~70 ms after it), which swung the score by 20 points. The
// performance score and LCP are each the median of their own three values, so one slow run moves neither.

export const LCP_BUDGET_MS = 2500;
export const RUNS = 3;
/** Runs before the measured ones, discarded. */
export const WARMUP_RUNS = 1;

export interface Run {
  /** The performance category's score, 0-100. */
  score: number;
  fcpMs: number;
  lcpMs: number;
  tbtMs: number;
  cls: number;
  /** The LCP element's selector, as Lighthouse reports it. */
  lcpElement?: string;
}

/** The run with the median LCP (the middle one of an odd count; the slower middle one of an even count): its report is kept. */
export function medianRun(runs: Run[]): Run | undefined {
  const sorted = [...runs].sort((a, b) => a.lcpMs - b.lcpMs);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The median of some values (the middle one of an odd count; of an even count, the worse middle one, by `worse`). */
function median(xs: number[], worse: (a: number, b: number) => number): number | undefined {
  if (!xs.length) return undefined;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : worse(sorted[mid - 1], sorted[mid]);
}

/**
 * The measured runs' medians, each taken on its own (LCP's and the score's need not come from the same run), the run
 * whose report is kept (the median LCP's), and whether the median LCP is within the budget.
 */
export function verdict(runs: Run[], budgetMs = LCP_BUDGET_MS) {
  const lcpMs = median(runs.map((r) => r.lcpMs), Math.max);
  const score = median(runs.map((r) => r.score), Math.min);
  return { lcpMs, score, median: medianRun(runs), ok: lcpMs !== undefined && Number.isFinite(lcpMs) && lcpMs <= budgetMs };
}

/** A Lighthouse result (its `lhr`) as a run. Throws if Lighthouse couldn't measure the page. */
export function toRun(lhr: {
  runtimeError?: { code: string; message?: string };
  categories: Record<string, { score: number | null } | undefined>;
  audits: Record<string, { numericValue?: number; details?: unknown } | undefined>;
}): Run {
  if (lhr.runtimeError) throw new Error(`Lighthouse couldn't load the page: ${lhr.runtimeError.code} ${lhr.runtimeError.message ?? ""}`);
  const num = (id: string) => {
    const v = lhr.audits[id]?.numericValue;
    if (v === undefined || !Number.isFinite(v)) throw new Error(`Lighthouse returned no value for ${id}.`);
    return v;
  };
  const score = lhr.categories.performance?.score;
  if (score === null || score === undefined) throw new Error("Lighthouse returned no performance score.");
  return {
    score: Math.round(score * 100),
    fcpMs: num("first-contentful-paint"),
    lcpMs: num("largest-contentful-paint"),
    tbtMs: num("total-blocking-time"),
    cls: num("cumulative-layout-shift"),
    lcpElement: lcpSelector(lhr.audits["lcp-breakdown-insight"]?.details),
  };
}

// Lighthouse 13 names the element in the LCP breakdown insight: a list whose node item has a selector.
function lcpSelector(details: unknown): string | undefined {
  const items = (details as { items?: { type?: string; selector?: string }[] } | undefined)?.items ?? [];
  return items.find((i) => i.type === "node")?.selector;
}
