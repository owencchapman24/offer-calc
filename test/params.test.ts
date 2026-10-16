import { describe, expect, it } from "vitest";
import { computeTaxes, paramsForYear, saltForYear } from "../src/tax/index";
import { saltCap } from "../src/tax/federal";
import { ENACTED } from "../src/tax/params/index";
import { ENACTED as FROZEN } from "./frozen-enacted";

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
  it("runs on the tests' frozen law (test/frozen-enacted.ts), so a data refresh moves no figure a test pins", () => {
    // vitest.config.ts swaps the frozen copy in for src/tax/params/enacted.ts everywhere but test/law.test.ts.
    expect(ENACTED).toBe(FROZEN);
  });
  it("2026 returns enacted 2026 law, not a projection", () => {
    const p = paramsForYear(2026);
    expect(p.year).toBe(2026);
    expect(p.indexFactor).toBe(1);
    expect(p.projected).toBe(false);
    expect(p.federal.standardDeduction.single).toBe(16_100);
    expect(p.federal.salt).toEqual({ cap: 40_400, phaseDown: { threshold: 505_000, rate: 0.3, floor: 10_000 } });
    expect(p.payroll.socialSecurityWageBase).toBe(184_500);
  });
  it("projected params are built once per (year, inflation), shared, and frozen", () => {
    const a = paramsForYear(2028, { inflation: 0.025 });
    expect(paramsForYear(2028, { inflation: 0.025 })).toBe(a);
    expect(paramsForYear(2028, { inflation: 0.03 })).not.toBe(a);
    expect(paramsForYear(2028, { inflation: 0.03 }).federal.standardDeduction.single).toBeCloseTo(16_100 * 1.03 ** 2, 6);
    expect(Object.isFrozen(a.federal.brackets.single)).toBe(true);
    expect(() => { (a.federal as { k401Limit: number }).k401Limit = 1; }).toThrow();
    expect(Object.isFrozen(paramsForYear(2026).states.CA)).toBe(true);
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
    expect(at(2028, 0.025).federal.hsaLimit.self).toBeCloseTo(4_612.5, 6); // from 2027's enacted $4,500 (below)
    expect(p.federal.section127Limit).toBeCloseTo(5_381.25, 6);
    expect(p.federal.commuterMonthlyLimit).toBeCloseTo(348.5, 6);
    expect(paramsForYear(2026).federal).toMatchObject({
      hsaLimit: { self: 4_400, family: 8_750 }, section127Limit: 5_250, commuterMonthlyLimit: 340,
    });
    expect(p.payroll.socialSecurityWageBase).toBeCloseTo(189_112.5, 6);
  });
  it("keeps statutory amounts fixed: Additional Medicare thresholds, non-indexed states, local law", () => {
    const p = at(2028, 0.025);
    const p26 = paramsForYear(2026);
    expect(p.payroll.additionalMedicareThreshold).toEqual({ single: 200_000, joint: 250_000, headOfHousehold: 200_000 });
    for (const code of Object.keys(p26.states)) {
      if (!p26.states[code].indexed) expect(p.states[code]).toBe(p26.states[code]);
    }
    expect(p.local).toBe(p26.local);
  });
  it("CA indexes brackets, standard deduction and exemption credit (R&TC 17041(h), 17073.5(d), 17054(i))", () => {
    const ca = at(2027, 0.025).states.CA;
    expect(ca.single?.[1][0]).toBeCloseTo(11_330 * 1.025, 6);
    expect(ca.joint?.[9][0]).toBeCloseTo(1_519_581 * 1.025, 6);
    expect(ca.stdDeduction?.[0]).toBeCloseTo(5_835 * 1.025, 6);
    expect(ca.exemptionCredit?.[1]).toBeCloseTo(313 * 1.025, 6);
    expect(paramsForYear(2026).states.CA.single?.[1][0]).toBe(11_330);
  });
  it("CA $100k single: $4,959.29 in 2026, $4,850.77 in 2027 at 2.5% (hand-checked)", () => {
    // 2027: taxable 100,000 - 5,980.875 = 94,019.125 over brackets x1.025:
    // 116.1325 + 318.3445 + 636.812 + 1,011.9825 + 1,273.132 + 9.3% x 17,787.825 = 5,010.6712,
    // less exemption credit 159.90 = 4,850.77.
    const ca = (year: number) => computeTaxes({ year, filingStatus: "single", wages: 100_000, state: "CA" },
      at(year, 0.025)).stateIncomeTax;
    expect(ca(2026)).toBe(4_959.29);
    expect(ca(2027)).toBe(4_850.77);
  });
  it("CA credit phase-out threshold is indexed (R&TC 17054.1(f)): $300k single in 2027", () => {
    // Threshold 257,919 x 1.025 = 264,366.975: ceil(35,633.025 / 2,500) = 15 steps x $6 = $90,
    // credit 159.90 - 90 = 69.90 (a flat threshold would give 17 steps and $12 more tax).
    // Tax 3,356.4035 + 9.3% x (294,019.125 - 76,231.30) = 23,610.6712, less 69.90 = 23,540.77.
    const r = computeTaxes({ year: 2027, filingStatus: "single", wages: 300_000, state: "CA" }, at(2027, 0.025));
    expect(r.stateIncomeTax).toBe(23_540.77);
  });
  it("an amount published for a later year is used as published in its year, at any inflation, and later years project from it", () => {
    // The frozen law's one published amount: 2027's HSA limits, $4,500 and $9,000.
    for (const inflation of [0, 0.025, 0.1]) expect(at(2027, inflation).federal.hsaLimit).toEqual({ self: 4_500, family: 9_000 });
    // 2028 at 2.5%: 4,500 x 1.025 = 4,612.50 and 9,000 x 1.025 = 9,225 (from 2026 it would be 4,622.75 and 9,192.97).
    expect(at(2028, 0.025).federal.hsaLimit.self).toBeCloseTo(4_612.5, 9);
    expect(at(2028, 0.025).federal.hsaLimit.family).toBeCloseTo(9_225, 9);
    expect(at(2031, 0.025).federal.hsaLimit.self).toBeCloseTo(4_500 * 1.025 ** 4, 9);
    // An amount not published for 2027 is projected from 2026, as before.
    expect(at(2027, 0.025).federal.standardDeduction.single).toBeCloseTo(16_502.5, 9);
    expect(at(2027, 0.025).payroll.socialSecurityWageBase).toBeCloseTo(189_112.5, 9);
    expect(at(2027, 0.025).projected).toBe(true);
  });
  it("2027 at 2.5%: $100k single in TX owes $12,949.25 federal (hand-checked)", () => {
    // Taxable 100,000 - 16,502.50 = 83,497.50; brackets 12,710 / 51,660:
    // 1,271 + 0.12 x 38,950 + 0.22 x 31,837.50 = 12,949.25
    const r = computeTaxes({ year: 2027, filingStatus: "single", wages: 100_000, state: "TX" }, at(2027, 0.025));
    expect(r.federalIncomeTax).toBe(12_949.25);
    expect(r.warnings).toContainEqual({ code: "projectedLaw", params: { year: 2027 } });
  });
  it("2030 SALT reversion: a $250k NYC single filer who itemizes in 2026 takes the standard deduction", () => {
    const input = { filingStatus: "single", wages: 250_000, state: "NY", locality: { kind: "nyc" } } as const;
    expect(computeTaxes({ ...input, year: 2026 }).itemizes).toBe(true);
    expect(computeTaxes({ ...input, year: 2030 }, at(2030, 0)).itemizes).toBe(false);
  });
  it("state law is held at 2026: NY tax on the same $100k is unchanged in 2027", () => {
    const ny = (year: number) => computeTaxes({ year, filingStatus: "single", wages: 100_000, state: "NY" },
      paramsForYear(year, { inflation: 0.025 })).stateIncomeTax;
    expect(ny(2027)).toBe(ny(2026));
  });
  it("state payroll caps tied to the SS wage base follow it: WA at $300k (every such state: below)", () => {
    // WA Cares 0.58% (uncapped) + WA PFML 0.80716% up to the SS wage base.
    const wa = (year: number) => computeTaxes({ year, filingStatus: "single", wages: 300_000, state: "WA" },
      paramsForYear(year, { inflation: 0.025 })).statePayrollTax;
    expect(wa(2026)).toBeCloseTo(1_740 + 184_500 * 0.0080716, 2);
    expect(wa(2027)).toBeCloseTo(1_740 + 189_112.5 * 0.0080716, 2);
  });
  it("federal-linked state standard deductions: verified states only, equal to federal in 2026", () => {
    const p = paramsForYear(2026);
    const linked = Object.entries(p.states).filter(([, s]) => s.stdDeductionIsFederal);
    expect(linked.map(([code]) => code).sort()).toEqual(["CO", "IA", "MO", "MT", "ND", "NM"]);
    for (const [, s] of linked) {
      expect(s.stdDeduction).toEqual([p.federal.standardDeduction.single, p.federal.standardDeduction.joint]);
    }
  });
  it("CO follows the federal standard deduction: $100k single, 4.4% flat (hand-checked)", () => {
    // 2026: (100,000 - 16,100) x 4.4% = 3,691.60. 2027 at 2.5%: (100,000 - 16,502.50) x 4.4% = 3,673.89.
    const co = (year: number) => computeTaxes({ year, filingStatus: "single", wages: 100_000, state: "CO" },
      paramsForYear(year, { inflation: 0.025 })).stateIncomeTax;
    expect(co(2026)).toBe(3_691.6);
    expect(co(2027)).toBe(3_673.89);
  });
  it("ID is held flat (static IRC conformity): $100k single owes the same in 2027 as 2026", () => {
    const id = (year: number) => computeTaxes({ year, filingStatus: "single", wages: 100_000, state: "ID" },
      paramsForYear(year, { inflation: 0.025 })).stateIncomeTax;
    expect(id(2027)).toBe(id(2026));
  });
  it("rejects params for a different year than the input", () => {
    expect(() => computeTaxes({ year: 2026, filingStatus: "single", wages: 1, state: "TX" }, at(2027, 0))).toThrow();
  });
});

describe("paid leave capped at the Social Security wage base", () => {
  // The seven states whose paid-leave contribution stops at the year's SS wage base (wageCap: "ssWageBase", states2026.ts). In
  // each it's the only capped payroll tax: OR's statewide transit tax (0.1%) and WA Cares (0.58%) are on every dollar.
  const TIED: Record<string, number> = { CO: 0.0044, CT: 0.005, DE: 0.004, MA: 0.0046, ME: 0.005, OR: 0.006, WA: 0.0080716 };
  const UNCAPPED: Record<string, number> = { OR: 0.001, WA: 0.0058 };
  const payroll = (year: number, inflation: number, state: string, wages: number, spouseWages?: number) =>
    computeTaxes({ year, filingStatus: spouseWages === undefined ? "single" : "joint", wages, state,
      ...(spouseWages === undefined ? {} : { spouseWages }) }, paramsForYear(year, { inflation })).statePayrollTax;

  it("are these seven, at these rates: a state newly tied to the base (or no longer) fails here", () => {
    const tied = Object.entries(paramsForYear(2026).states)
      .flatMap(([code, s]) => (s.payroll ?? []).filter((c) => c.wageCap === "ssWageBase").map((c) => [code, c.rate] as const));
    expect(Object.fromEntries(tied)).toEqual(TIED);
  });

  it("2026: each stops at $184,500 (hand-checked at $250,000)", () => {
    // CO 0.44% × 184,500 = 811.80; CT and ME 0.5% = 922.50; DE 0.4% = 738.00; MA 0.46% = 848.70; OR 0.6% = 1,107.00, plus transit
    // 0.1% × 250,000 = 250.00, 1,357.00; WA 0.80716% = 1,489.2102, plus WA Cares 0.58% × 250,000 = 1,450.00, 2,939.2102, to the
    // cent 2,939.21.
    const at250k = Object.fromEntries(Object.keys(TIED).map((s) => [s, payroll(2026, 0.025, s, 250_000)]));
    expect(at250k).toEqual({ CO: 811.8, CT: 922.5, DE: 738, MA: 848.7, ME: 922.5, OR: 1_357, WA: 2_939.21 });
  });

  it("every year 2026-2031, at 0%, 2.5% and 10% inflation, each stops at that year's base, for each worker", () => {
    for (let year = 2026; year <= 2031; year++) {
      for (const inflation of [0, 0.025, 0.1]) {
        const base = paramsForYear(year, { inflation }).payroll.socialSecurityWageBase;
        for (const [state, rate] of Object.entries(TIED)) {
          const other = UNCAPPED[state] ?? 0;
          // Each worker's wages pay the capped rate up to the base and the uncapped rate on all of them.
          const owed = (...workers: number[]) => workers.reduce((t, w) => t + rate * Math.min(w, base) + other * w, 0);
          const where = `${state} ${year} at ${inflation * 100}% (base ${base})`;
          for (const wages of [base - 1_000, base, base + 1_000, 2 * base]) {
            expect(Math.abs(payroll(year, inflation, state, wages) - owed(wages)), `${where}, $${wages}`).toBeLessThanOrEqual(0.005 + 1e-9);
          }
          // Joint, both over the base: each is capped on their own.
          const [you, spouse] = [1.5 * base, 1.2 * base];
          expect(Math.abs(payroll(year, inflation, state, you, spouse) - owed(you, spouse)), `${where}, joint`).toBeLessThanOrEqual(0.005 + 1e-9);
        }
      }
    }
  });

  it("a projected year's base, hand-checked: 2028 at 2.5% is 184,500 × 1.025² = 193,840.3125 (the tests' frozen law)", () => {
    // CO at $250,000: 0.44% × 193,840.3125 = 852.8973..., to the cent 852.90.
    expect(paramsForYear(2028, { inflation: 0.025 }).payroll.socialSecurityWageBase).toBeCloseTo(193_840.3125, 6);
    expect(payroll(2028, 0.025, "CO", 250_000)).toBe(852.9);
  });
});
