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
  it("rejects years before 2026, fractional years, and projections without inflation", () => {
    expect(() => paramsForYear(2025)).toThrow();
    expect(() => paramsForYear(2026.5)).toThrow();
    expect(() => paramsForYear(2027)).toThrow(/inflation/);
    expect(() => computeTaxes({ year: 2027, filingStatus: "single", wages: 100_000, state: "TX" })).toThrow(/inflation/);
  });
  it("computeTaxes gives the same answer with explicit 2026 params", () => {
    const input = { year: 2026, filingStatus: "joint", wages: 250_000, state: "NY", locality: { kind: "nyc" } } as const;
    expect(computeTaxes(input, paramsForYear(2026))).toEqual(computeTaxes(input));
  });
});

describe("projected years (federal indexed, state held at 2026)", () => {
  const at = (year: number, inflation: number) => paramsForYear(year, { inflation });

  it("indexes federal amounts at (1 + inflation)^(year - 2026), unrounded", () => {
    const p = at(2027, 0.025);
    expect(p.projected).toBe(true);
    expect(p.indexFactor).toBeCloseTo(1.025, 12);
    expect(at(2030, 0.025).indexFactor).toBeCloseTo(1.025 ** 4, 12);
    expect(p.federal.standardDeduction.single).toBeCloseTo(16_502.5, 6);
    expect(p.federal.brackets.single[1][0]).toBeCloseTo(12_710, 6);
    expect(p.federal.brackets.single[1][1]).toBe(0.12);
    expect(p.federal.k401Limit).toBeCloseTo(25_112.5, 6);
    expect(p.payroll.socialSecurityWageBase).toBeCloseTo(189_112.5, 6);
  });
  it("keeps statutory amounts fixed: Additional Medicare thresholds, state and local law", () => {
    const p = at(2028, 0.025);
    expect(p.payroll.additionalMedicareThreshold).toEqual({ single: 200_000, joint: 250_000, headOfHousehold: 200_000 });
    expect(p.states).toBe(paramsForYear(2026).states);
    expect(p.local).toBe(paramsForYear(2026).local);
  });
  it("with 0% inflation, 2027 differs from 2026 only in the SALT schedule", () => {
    const p26 = paramsForYear(2026);
    const p27 = at(2027, 0);
    expect({ ...p27.federal, salt: null }).toEqual({ ...p26.federal, salt: null });
    expect(p27.payroll).toEqual(p26.payroll);
    expect(p27.federal.salt.cap).toBeCloseTo(40_804, 6);
  });
  it("2027 at 2.5%: $100k single in TX owes $12,949.25 federal (hand-checked)", () => {
    // Taxable 100,000 - 16,502.50 = 83,497.50; brackets 12,710 / 51,660:
    // 1,271 + 0.12 x 38,950 + 0.22 x 31,837.50 = 12,949.25
    const r = computeTaxes({ year: 2027, filingStatus: "single", wages: 100_000, state: "TX" }, at(2027, 0.025));
    expect(r.federalIncomeTax).toBe(12_949.25);
    expect(r.warnings.some((w) => w.includes("2027 tax law is projected"))).toBe(true);
  });
  it("2030 SALT reversion: a $250k NYC single filer who itemizes in 2026 takes the standard deduction", () => {
    const input = { filingStatus: "single", wages: 250_000, state: "NY", locality: { kind: "nyc" } } as const;
    expect(computeTaxes({ ...input, year: 2026 }).itemizes).toBe(true);
    expect(computeTaxes({ ...input, year: 2030 }, at(2030, 0)).itemizes).toBe(false);
  });
  it("rejects params for a different year than the input", () => {
    expect(() => computeTaxes({ year: 2026, filingStatus: "single", wages: 1, state: "TX" }, at(2027, 0))).toThrow();
  });
});
