// The load-time budget (docs/ui-design.md §10): on Lighthouse's mobile profile, the median run's Largest
// Contentful Paint is at most 2.5 s, Google's "good" threshold for LCP.
//
// The bundle check (scripts/lib/bundle.ts) catches a regression in what we ship; this measures what a
// phone user waits for. Lighthouse's mobile profile: a Moto G Power-sized screen, simulated slow 4G
// (150 ms round trips, 1.6 Mbps down) and a 4x CPU slowdown. Simulated throttling replays an unthrottled
// load through a network and CPU model, so it's steadier than real throttling; the median of three runs
// steadies it further.

export const LCP_BUDGET_MS = 2500;
export const RUNS = 3;

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

/** The run with the median LCP (the middle one of an odd count; the slower middle one of an even count). */
export function medianRun(runs: Run[]): Run | undefined {
  const sorted = [...runs].sort((a, b) => a.lcpMs - b.lcpMs);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The median run and whether its LCP is within the budget. */
export function verdict(runs: Run[], budgetMs = LCP_BUDGET_MS) {
  const median = medianRun(runs);
  return { median, ok: median !== undefined && Number.isFinite(median.lcpMs) && median.lcpMs <= budgetMs };
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
