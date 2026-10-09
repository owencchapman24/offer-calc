import { describe, expect, it } from "vitest";
import { medianRun, toRun, verdict, type Run } from "./lighthouse";

const run = (lcpMs: number): Run => ({ score: 90, fcpMs: 1000, lcpMs, tbtMs: 50, cls: 0 });

describe("the Lighthouse budget", () => {
  it("judges the median run's LCP: passes at 2.5 s, fails above it or with no runs", () => {
    expect(medianRun([run(3000), run(1800), run(2100)])?.lcpMs).toBe(2100);
    expect(verdict([run(2500), run(9000), run(1000)]).ok).toBe(true); // median exactly 2,500 ms
    expect(verdict([run(2501), run(2600), run(1000)]).ok).toBe(false);
    expect(verdict([]).ok).toBe(false);
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
      },
    };
    expect(toRun(lhr)).toEqual({ score: 98, fcpMs: 1870, lcpMs: 1871, tbtMs: 91, cls: 0, lcpElement: "p.assumptions" });
    expect(() => toRun({ ...lhr, runtimeError: { code: "NO_FCP" } })).toThrow(/NO_FCP/);
    expect(() => toRun({ ...lhr, audits: { ...lhr.audits, "largest-contentful-paint": {} } })).toThrow(/largest-contentful-paint/);
  });
});
