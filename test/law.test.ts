import { describe, expect, it } from "vitest";
import { compareOffers } from "../src/offer/index";
import { SAMPLE_HOUSEHOLD, SAMPLE_OFFERS } from "../src/samples";
import { computeTaxes, paramsForYear } from "../src/tax/index";
import { ENACTED as PUBLISHED } from "../src/tax/params/enacted";
import { ENACTED } from "../src/tax/params/index";
import { ENACTED as FROZEN } from "./frozen-enacted";

// The law as published. This is the one test file that runs on src/tax/params/enacted.ts; every other test runs on the frozen
// copy in test/frozen-enacted.ts (vitest.config.ts). It pins every federal amount published for a year after 2026, so it's the
// test meant to fail at a data refresh: update it with the published amounts and their sources (docs/data-refresh.md). No other
// test should move with a refresh; if one does, the refresh changed more than the published amounts.

const at = (year: number, inflation: number) => paramsForYear(year, { inflation });

describe("the law as published", () => {
  it("is what paramsForYear projects from here, not the tests' frozen copy", () => {
    expect(ENACTED).toBe(PUBLISHED);
    expect(ENACTED).not.toBe(FROZEN);
  });

  it("published for years after 2026: 2027's brackets, standard deduction, 127 and 132(f) limits, HSA limits and wage base", () => {
    expect(ENACTED.map(([year, amounts]) => [year, Object.keys(amounts)])).toEqual([[2027, ["standardDeduction", "brackets",
      "section127Limit", "commuterMonthlyLimit", "hsaLimit", "socialSecurityWageBase"]]]);
    for (const inflation of [0, 0.025, 0.1]) {
      const f = at(2027, inflation).federal;
      // IRS Rev. Proc. 2026-35 (Nov 5, 2026): sec. 3.15(1), the standard deduction; sec. 3.01, Tables 1-3, the brackets
      // (taxable income over each amount, and its rate); sec. 3.17, 127's $5,400; sec. 3.18, 132(f)'s $350 a month.
      expect(f.standardDeduction).toEqual({ single: 16_600, joint: 33_200, headOfHousehold: 24_925 });
      expect(f.brackets).toEqual({
        single: [[0, 0.1], [12_800, 0.12], [52_025, 0.22], [109_125, 0.24], [208_325, 0.32], [264_550, 0.35], [661_375, 0.37]],
        joint: [[0, 0.1], [25_600, 0.12], [104_050, 0.22], [218_250, 0.24], [416_650, 0.32], [529_100, 0.35], [793_650, 0.37]],
        headOfHousehold: [[0, 0.1], [18_250, 0.12], [69_650, 0.22], [109_100, 0.24], [208_300, 0.32], [264_550, 0.35],
          [661_350, 0.37]],
      });
      expect([f.section127Limit, f.commuterMonthlyLimit]).toEqual([5_400, 350]);
      // $4,500 and $9,000: IRS Rev. Proc. 2026-24. $192,300: SSA's 2027 COLA fact sheet (Oct 14, 2026).
      expect(f.hsaLimit).toEqual({ self: 4_500, family: 9_000 });
      expect(at(2027, inflation).payroll.socialSecurityWageBase).toBe(192_300);
    }
    // Projected from there, 2028 at 2.5%: the standard deduction 16,600 × 1.025 = 17,015, 33,200 × 1.025 = 34,030 and 24,925 ×
    // 1.025 = 25,548.125; the top single bracket from 661,375 × 1.025 = 677,909.375; 127's 5,400 × 1.025 = 5,535; 132(f)'s
    // 350 × 1.025 = 358.75; the wage base 192,300 × 1.025 = 197,107.50. (From 2026's $184,500, 2027 at 2.5% was 189,112.50.)
    const f28 = at(2028, 0.025).federal;
    expect(f28.standardDeduction.single).toBeCloseTo(17_015, 6);
    expect(f28.standardDeduction.joint).toBeCloseTo(34_030, 6);
    expect(f28.standardDeduction.headOfHousehold).toBeCloseTo(25_548.125, 6);
    expect(f28.brackets.single[6][0]).toBeCloseTo(677_909.375, 6);
    expect(f28.section127Limit).toBeCloseTo(5_535, 6);
    expect(f28.commuterMonthlyLimit).toBeCloseTo(358.75, 6);
    expect(at(2028, 0.025).payroll.socialSecurityWageBase).toBeCloseTo(197_107.5, 6);
  });

  it("taxes 2027 income on Rev. Proc. 2026-35's tables, to the cent at each bracket's lower bound", () => {
    // Wages in Texas (no state income tax, so the standard deduction) = taxable income + the 2027 standard deduction. Each pair is
    // a bracket's lower bound and the tax the table prints there ("$5,987.00 plus 22% of the excess over $52,025").
    const TABLES = {
      joint: [33_200, [[25_600, 2_560], [104_050, 11_974], [218_250, 37_098], [416_650, 84_714], [529_100, 120_698],
        [793_650, 213_290.5]]],
      headOfHousehold: [24_925, [[18_250, 1_825], [69_650, 7_993], [109_100, 16_672], [208_300, 40_480], [264_550, 58_480],
        [661_350, 197_360]]],
      single: [16_600, [[12_800, 1_280], [52_025, 5_987], [109_125, 18_549], [208_325, 42_357], [264_550, 60_349],
        [661_375, 199_237.75]]],
    } as const;
    const fit = (filingStatus: keyof typeof TABLES, wages: number) =>
      computeTaxes({ year: 2027, filingStatus, wages, state: "TX" }, at(2027, 0.025)).federalIncomeTax;
    for (const status of ["joint", "headOfHousehold", "single"] as const) {
      const [sd, rows] = TABLES[status];
      for (const [over, tax] of rows) expect(fit(status, over + sd), `${status} over ${over}`).toBe(tax);
    }
    // $100,000 single: taxable 100,000 − 16,600 = 83,400; 5,987.00 + 22% × (83,400 − 52,025) = 5,987.00 + 6,902.50
    // = 12,889.50. (Projected from 2026 at 2.5% it was 12,949.25: taxable 83,497.50 over brackets from 12,710 and 51,660.)
    expect(fit("single", 100_000)).toBe(12_889.5);
    // $200,000 joint: taxable 166,800; 11,974.00 + 22% × (166,800 − 104,050) = 11,974.00 + 13,805.00 = 25,779.00.
    expect(fit("joint", 200_000)).toBe(25_779);
    // $90,000 head of household: taxable 65,075; 1,825.00 + 12% × (65,075 − 18,250) = 1,825.00 + 5,619.00 = 7,444.00.
    expect(fit("headOfHousehold", 90_000)).toBe(7_444);
  });

  it("with 0% inflation, 2027 differs from 2026 only in the SALT schedule and the amounts published for it", () => {
    const p26 = paramsForYear(2026);
    const p27 = at(2027, 0);
    const published = { salt: null, hsaLimit: null, standardDeduction: null, brackets: null, section127Limit: null,
      commuterMonthlyLimit: null };
    expect({ ...p27.federal, ...published }).toEqual({ ...p26.federal, ...published });
    // The 402(g) notice isn't out, so 2027's limit is projected from 2026's $24,500 (at 0%, unchanged).
    expect(p27.federal.k401Limit).toBe(24_500);
    expect(p27.federal.hsaLimit).toEqual({ self: 4_500, family: 9_000 });
    expect({ ...p27.payroll, socialSecurityWageBase: null }).toEqual({ ...p26.payroll, socialSecurityWageBase: null });
    expect(p27.payroll.socialSecurityWageBase).toBe(192_300);
    expect(p27.federal.salt.cap).toBeCloseTo(40_804, 6);
  });

  it("taxes 2027 wages for Social Security up to $192,300, and caps the states' paid leave there too", () => {
    const tax = (state: string, wages: number) =>
      computeTaxes({ year: 2027, filingStatus: "single", wages, state }, at(2027, 0.025));
    // 6.2% of the base: 192,300 × 0.062 = 11,922.60, SSA's own figure for 2027's maximum.
    expect(tax("TX", 192_300).socialSecurity).toBe(11_922.6);
    expect(tax("TX", 192_301).socialSecurity).toBe(11_922.6);
    expect(tax("TX", 250_000).socialSecurity).toBe(11_922.6);
    // A dollar under: 192,299 × 0.062 = 11,922.538, to the cent 11,922.54.
    expect(tax("TX", 192_299).socialSecurity).toBe(11_922.54);
    // Washington at $200,000: WA Cares 0.58% of all wages, 1,160.00, plus paid leave 0.80716% of the base,
    // 192,300 × 0.0080716 = 1,552.16868; 2,712.16868, to the cent 2,712.17.
    expect(tax("WA", 200_000).statePayrollTax).toBe(2_712.17);
    // Every state whose paid leave is capped at the base (test/params.test.ts has the seven), at $250,000: CO 0.44% × 192,300 =
    // 846.12; CT and ME 0.5% = 961.50; DE 0.4% = 769.20; MA 0.46% = 884.58; OR 0.6% = 1,153.80, plus its transit tax 0.1% ×
    // 250,000 = 250.00, 1,403.80; WA 0.80716% = 1,552.16868, plus WA Cares 0.58% × 250,000 = 1,450.00, 3,002.16868, to the cent
    // 3,002.17.
    const at250k = Object.fromEntries(["CO", "CT", "DE", "MA", "ME", "OR", "WA"].map((s) => [s, tax(s, 250_000).statePayrollTax]));
    expect(at250k).toEqual({ CO: 846.12, CT: 961.5, DE: 769.2, MA: 884.58, ME: 961.5, OR: 1_403.8, WA: 3_002.17 });
  });

  it("works out the samples over 5 years (tax years 2026-2031), every total and every year's tax a finite figure", () => {
    const c = compareOffers(SAMPLE_OFFERS, SAMPLE_HOUSEHOLD, { valuationDate: "2026-07-13", inflation: 0.025, horizonYears: 5 });
    for (const p of c.projections) {
      for (const s of Object.values(p.scenarios)) {
        expect(s.calendarYears.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029, 2030, 2031]);
        for (const y of s.calendarYears) expect(Number.isFinite(y.offerTax) && Number.isFinite(y.offerTaxRate)).toBe(true);
        expect(Number.isFinite(s.window.totalRewards.presentValue)).toBe(true);
        expect(Number.isFinite(s.window.costOfLiving?.presentValue?.total)).toBe(true);
      }
    }
  });
});
