import { describe, expect, it } from "vitest";
import { computeTaxes, paramsForYear } from "../src/tax/index";

describe("paramsForYear", () => {
  it("2026 returns enacted 2026 law, not a projection", () => {
    const p = paramsForYear(2026);
    expect(p.year).toBe(2026);
    expect(p.indexFactor).toBe(1);
    expect(p.projected).toBe(false);
    expect(p.federal.standardDeduction.single).toBe(16_100);
    expect(p.federal.salt).toEqual({ cap: 40_400, phaseDown: { threshold: 505_000, rate: 0.3, floor: 10_000 } });
    expect(p.payroll.socialSecurityWageBase).toBe(184_500);
  });
  it("computeTaxes gives the same answer with explicit 2026 params", () => {
    const input = { year: 2026, filingStatus: "joint", wages: 250_000, state: "NY", locality: { kind: "nyc" } } as const;
    expect(computeTaxes(input, paramsForYear(2026))).toEqual(computeTaxes(input));
  });
});
