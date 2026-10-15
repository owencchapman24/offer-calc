import { describe, expect, it } from "vitest";
import { compareOffers } from "../src/offer/index";
import { SAMPLE_HOUSEHOLD, SAMPLE_OFFERS } from "../src/samples";
import { paramsForYear } from "../src/tax/index";
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

  it("published for years after 2026: 2027's HSA limits, $4,500 and $9,000 (Rev. Proc. 2026-24), and nothing else yet", () => {
    expect(ENACTED.map(([year, amounts]) => [year, Object.keys(amounts)])).toEqual([[2027, ["hsaLimit"]]]);
    for (const inflation of [0, 0.025, 0.1]) expect(at(2027, inflation).federal.hsaLimit).toEqual({ self: 4_500, family: 9_000 });
  });

  it("with 0% inflation, 2027 differs from 2026 only in the SALT schedule and the amounts published for it", () => {
    const p26 = paramsForYear(2026);
    const p27 = at(2027, 0);
    expect({ ...p27.federal, salt: null, hsaLimit: null }).toEqual({ ...p26.federal, salt: null, hsaLimit: null });
    expect(p27.federal.hsaLimit).toEqual({ self: 4_500, family: 9_000 });
    expect(p27.payroll).toEqual(p26.payroll);
    expect(p27.federal.salt.cap).toBeCloseTo(40_804, 6);
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
