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

  it("published for years after 2026: 2027's HSA limits and Social Security wage base, and nothing else yet", () => {
    expect(ENACTED.map(([year, amounts]) => [year, Object.keys(amounts)])).toEqual([[2027, ["hsaLimit", "socialSecurityWageBase"]]]);
    for (const inflation of [0, 0.025, 0.1]) {
      // $4,500 and $9,000: IRS Rev. Proc. 2026-24. $192,300: SSA's 2027 COLA fact sheet (Oct 14, 2026).
      expect(at(2027, inflation).federal.hsaLimit).toEqual({ self: 4_500, family: 9_000 });
      expect(at(2027, inflation).payroll.socialSecurityWageBase).toBe(192_300);
    }
    // Projected from there: 2028 at 2.5% is 192,300 × 1.025 = 197,107.50. (From 2026's $184,500, 2027 at 2.5% was 189,112.50.)
    expect(at(2028, 0.025).payroll.socialSecurityWageBase).toBeCloseTo(197_107.5, 6);
  });

  it("with 0% inflation, 2027 differs from 2026 only in the SALT schedule and the amounts published for it", () => {
    const p26 = paramsForYear(2026);
    const p27 = at(2027, 0);
    expect({ ...p27.federal, salt: null, hsaLimit: null }).toEqual({ ...p26.federal, salt: null, hsaLimit: null });
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
