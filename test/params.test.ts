import { describe, expect, it } from "vitest";
import { computeTaxes, paramsForYear, saltForYear } from "../src/tax/index";
import { saltCap } from "../src/tax/federal";

describe("SALT cap schedule, IRC 164(b)(7)", () => {
  it("2026: $40,400, phase-down above $505,000", () => {
    expect(saltForYear(2026)).toEqual({ cap: 40_400, phaseDown: { threshold: 505_000, rate: 0.3, floor: 10_000 } });
  });
  it("2027-2029: cap and threshold grow 1% a year, unrounded", () => {
    expect(saltForYear(2027).cap).toBeCloseTo(40_804, 6);
    expect(saltForYear(2027).phaseDown?.threshold).toBeCloseTo(510_050, 6);
    expect(saltForYear(2028).cap).toBeCloseTo(41_212.04, 6);
    expect(saltForYear(2029).cap).toBeCloseTo(41_624.1604, 6);
    expect(saltForYear(2029).phaseDown?.threshold).toBeCloseTo(520_302.005, 6);
  });
  it("2029 phase-down: $600k MAGI loses 30% of the excess over $520,302.005", () => {
    expect(saltCap(saltForYear(2029), 600_000)).toBeCloseTo(41_624.1604 - 0.3 * (600_000 - 520_302.005), 6);
  });
  it("2030 on: reverts to $10,000 with no phase-down, at any income", () => {
    for (const y of [2030, 2031]) {
      expect(saltForYear(y)).toEqual({ cap: 10_000 });
      expect(saltCap(saltForYear(y), 50_000)).toBe(10_000);
      expect(saltCap(saltForYear(y), 2_000_000)).toBe(10_000);
    }
  });
});

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
