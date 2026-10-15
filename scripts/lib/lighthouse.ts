// The load-time budget (docs/ui-design.md §10): on Lighthouse's mobile profile, the median Largest Contentful
// Paint of five runs is at most 2.5 s, Google's "good" threshold for LCP. Beside it (audit P3), the median Cumulative
// Layout Shift is at most 0.02 (0 on 2026-10-15; 0.020 once flagged a real shift, found by reading the numbers) and the
// median Total Blocking Time at most 200 ms (45-99 ms on 2026-10-15; Google's "good" is 200 ms).
//
// The time to the first answer (audit P2): the app marks "first-answer" (performance.mark, app/src/Lead.tsx) after the
// frame that first shows a verdict, once the worker has answered. LCP doesn't see it: the LCP element is About you's
// assumptions line, painted before the worker answers. Lighthouse reads the mark from the trace, which simulated throttling
// leaves unthrottled, so it's an observed time, reported beside the observed LCP, not a simulated one. Reported, not
// budgeted, until there's a baseline (docs/v2-plan.md, the performance plan's rule 4); a run without the mark fails,
// since then no verdict was shown.
//
// The bundle check (scripts/lib/bundle.ts) catches a regression in what we ship; this measures what a
// phone user waits for. Lighthouse's mobile profile: a Moto G Power-sized screen, simulated slow 4G
// (150 ms round trips, 1.6 Mbps down) and a 4x CPU slowdown. Simulated throttling replays an unthrottled
// load through a network and CPU model, so it's steadier than real throttling; the median of three runs
// steadies it further. A warm-up run comes first and is discarded: a fresh browser's first load runs cold (on
// CI its Total Blocking Time was 1-1.2 s, against ~70 ms after it), which swung the score by 20 points. The
// performance score and each metric are the median of their own five values, so one slow run moves none of them. Five
// runs, not three (2026-10-15, audit P2): one CI run's three LCPs spread 0.46 s.
//
// The late-fonts pass (`--fonts-late`): the web fonts load with font-display: swap, so when the page paints before they arrive,
// text first shows in the fallback fonts and then swaps. On CI's Linux runner the fallback was a wider font, and the swap moved
// About you's text: CLS 0.047 in 3 of 5 runs once (2026-10-15), and 0 whenever the fonts happened to arrive first. Holding the
// fonts back makes that case happen every time, so the check that the swap moves nothing (styles.css' size-matched fallbacks)
// doesn't depend on a runner's timing. Only CLS is gated there: LCP waits for the swap.

export const FONTS_LATE_MS = 1500;
export const FONTS_LATE_RUNS = 3;

export const LCP_BUDGET_MS = 2500;
export const CLS_BUDGET = 0.02;
export const TBT_BUDGET_MS = 200;
export const RUNS = 5;
/** The app's mark when the first verdict has painted. */
export const FIRST_ANSWER = "first-answer";
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
  /** The elements that shifted, with their scores, as Lighthouse's layout-shifts audit lists them; undefined when none did. */
  shifted?: string[];
  /** From the trace, unthrottled: when LCP happened, and the app's first-answer mark (undefined when there was none). */
  observedLcpMs?: number;
  firstAnswerMs?: number;
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
 * whose report is kept (the median LCP's), and what's wrong: LCP, CLS or TBT over budget, or a run with no first answer.
 */
export function verdict(runs: Run[], budgets = { lcpMs: LCP_BUDGET_MS, cls: CLS_BUDGET, tbtMs: TBT_BUDGET_MS }) {
  const lcpMs = median(runs.map((r) => r.lcpMs), Math.max);
  const score = median(runs.map((r) => r.score), Math.min);
  const cls = median(runs.map((r) => r.cls), Math.max);
  const tbtMs = median(runs.map((r) => r.tbtMs), Math.max);
  const answers = runs.map((r) => r.firstAnswerMs).filter((t): t is number => t !== undefined);
  const firstAnswerMs = median(answers, Math.max);
  const observedLcpMs = median(runs.flatMap((r) => r.observedLcpMs ?? []), Math.max);
  const problems: string[] = [];
  if (!runs.length) problems.push("No runs.");
  if (lcpMs !== undefined && !(lcpMs <= budgets.lcpMs)) problems.push(`LCP ${Math.round(lcpMs)} ms is over its ${budgets.lcpMs} ms budget.`);
  if (cls !== undefined && !(cls <= budgets.cls)) problems.push(`CLS ${cls.toFixed(3)} is over its ${budgets.cls} budget.`);
  if (tbtMs !== undefined && !(tbtMs <= budgets.tbtMs)) problems.push(`TBT ${Math.round(tbtMs)} ms is over its ${budgets.tbtMs} ms budget.`);
  if (answers.length < runs.length) {
    problems.push(`${runs.length - answers.length} of ${runs.length} runs had no "${FIRST_ANSWER}" mark: the page showed no verdict.`);
  }
  return { lcpMs, score, cls, tbtMs, firstAnswerMs, observedLcpMs, median: medianRun(runs), problems, ok: problems.length === 0 };
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
    observedLcpMs: (lhr.audits.metrics?.details as { items?: { observedLargestContentfulPaint?: number }[] } | undefined)
      ?.items?.[0]?.observedLargestContentfulPaint,
    firstAnswerMs: userMark(lhr.audits["user-timings"]?.details, FIRST_ANSWER),
    shifted: layoutShifts(lhr.audits["layout-shifts"]?.details),
  };
}

// The layout-shifts audit lists each shifted element with its score: the selector's last two steps are enough to name it.
function layoutShifts(details: unknown): string[] | undefined {
  const items = (details as { items?: { node?: { selector?: string }; score?: number }[] } | undefined)?.items ?? [];
  const out = items.filter((i) => (i.score ?? 0) >= 0.0005)
    .map((i) => `${(i.node?.selector ?? "?").split(" > ").slice(-2).join(" > ")} ${(i.score ?? 0).toFixed(3)}`);
  return out.length ? out : undefined;
}

// The user-timings audit lists the trace's marks and measures, each with its start time from navigation.
function userMark(details: unknown, name: string): number | undefined {
  const items = (details as { items?: { name?: string; timingType?: string; startTime?: number }[] } | undefined)?.items ?? [];
  return items.find((i) => i.name === name && i.timingType === "Mark")?.startTime;
}

// Lighthouse 13 names the element in the LCP breakdown insight: a list whose node item has a selector.
function lcpSelector(details: unknown): string | undefined {
  const items = (details as { items?: { type?: string; selector?: string }[] } | undefined)?.items ?? [];
  return items.find((i) => i.type === "node")?.selector;
}
