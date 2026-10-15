import { describe, expect, it } from "vitest";
import { medianRun, toRun, verdict, type Run } from "./lighthouse";

const run = (lcpMs: number, score = 90, more: Partial<Run> = {}): Run =>
  ({ score, fcpMs: 1000, lcpMs, tbtMs: 50, cls: 0, firstAnswerMs: 400, ...more });

describe("the Lighthouse budget", () => {
  it("judges the median run's LCP: passes at 2.5 s, fails above it or with no runs", () => {
    expect(medianRun([run(3000), run(1800), run(2100)])?.lcpMs).toBe(2100);
    expect(verdict([run(2500), run(9000), run(1000)]).ok).toBe(true); // median exactly 2,500 ms
    expect(verdict([run(2501), run(2600), run(1000)]).problems).toEqual(["LCP 2501 ms is over its 2500 ms budget."]);
    expect(verdict([]).ok).toBe(false);
  });
  it("takes the score's median and LCP's separately, so one slow run moves neither", () => {
    // CI, 2026-10-09: a cold run (77, TBT 1 s) tied the fast one on LCP and was reported as the median run.
    const v = verdict([run(1750, 77), run(2380, 94), run(1750, 99)]);
    expect(v.lcpMs).toBe(1750);
    expect(v.score).toBe(94);
    // Of an even count, the worse middle one: the slower LCP, the lower score.
    expect(verdict([run(1000, 99), run(2000, 80), run(1500, 90), run(1800, 95)])).toMatchObject({ lcpMs: 1800, score: 90 });
  });
  it("gates the median layout shift at 0.02 and the median blocking time at 200 ms, so one bad run fails neither", () => {
    const at = (cls: number, tbtMs: number) => run(1900, 98, { cls, tbtMs });
    expect(verdict([at(0, 50), at(0.02, 200), at(0.5, 900)]).ok).toBe(true); // medians 0.02 and 200 ms, at the budgets
    expect(verdict([at(0.021, 50), at(0.03, 60), at(0, 70)]).problems).toEqual(["CLS 0.021 is over its 0.02 budget."]);
    expect(verdict([at(0, 201), at(0, 250), at(0, 70)]).problems).toEqual(["TBT 201 ms is over its 200 ms budget."]);
  });
  it("reports the first answer's median, and fails a run that never showed a verdict", () => {
    const v = verdict([run(1900, 98, { firstAnswerMs: 380 }), run(1900, 98, { firstAnswerMs: 420 }), run(1900, 98, { firstAnswerMs: 900 })]);
    expect(v).toMatchObject({ ok: true, firstAnswerMs: 420 });
    expect(verdict([run(1900), run(1900, 98, { firstAnswerMs: undefined }), run(1900)]).problems)
      .toEqual(['1 of 3 runs had no "first-answer" mark: the page showed no verdict.']);
  });
  it("reads a Lighthouse result, and refuses one where the page didn't load", () => {
    const lhr = {
      categories: { performance: { score: 0.98 } },
      audits: {
        "first-contentful-paint": { numericValue: 1870 },
        "largest-contentful-paint": { numericValue: 1871 },
        "total-blocking-time": { numericValue: 91 },
        "cumulative-layout-shift": { numericValue: 0 },
        "lcp-breakdown-insight": { details: { type: "list", items: [{ type: "table" }, { type: "node", selector: "p.assumptions" }] } },
        metrics: { details: { type: "debugdata", items: [{ observedLargestContentfulPaint: 152 }] } },
        "user-timings": { details: { type: "table", items: [{ name: "first-answer", timingType: "Mark", startTime: 431.5 }] } },
      },
    };
    expect(toRun(lhr)).toEqual({ score: 98, fcpMs: 1870, lcpMs: 1871, tbtMs: 91, cls: 0, lcpElement: "p.assumptions", observedLcpMs: 152,
      firstAnswerMs: 431.5 });
    expect(toRun({ ...lhr, audits: { ...lhr.audits, "user-timings": { details: { type: "table", items: [] } } } }).firstAnswerMs)
      .toBeUndefined();
    expect(() => toRun({ ...lhr, runtimeError: { code: "NO_FCP" } })).toThrow(/NO_FCP/);
    expect(() => toRun({ ...lhr, audits: { ...lhr.audits, "largest-contentful-paint": {} } })).toThrow(/largest-contentful-paint/);
  });
});
