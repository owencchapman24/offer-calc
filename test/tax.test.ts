import { describe, expect, it } from "vitest";
import { computeTaxes } from "../src/tax/index";

const single = (wages: number, state: string, extra = {}) =>
  computeTaxes({ year: 2026, filingStatus: "single", wages, state, ...extra });

describe("federal", () => {
  it("matches the published 2026 example: $100k single owes $13,170", () => {
    expect(single(100_000, "TX").federalIncomeTax).toBe(13_170);
  });
  it("caps Social Security at the $184,500 wage base", () => {
    expect(single(300_000, "TX").socialSecurity).toBe(11_439);
  });
  it("applies 0.9% Additional Medicare above $200k", () => {
    expect(single(300_000, "TX").additionalMedicare).toBe(900);
  });
  it("excludes 401(k) from income tax but not FICA", () => {
    const base = single(100_000, "TX");
    const k = single(100_000, "TX", { pretax401k: 10_000 });
    expect(k.federalAGI).toBe(90_000);
    expect(k.socialSecurity).toBe(base.socialSecurity);
  });
  it("taxes statutory option income (an ESPP lot's spread) as wages for income tax, not FICA (IRC 3121(a)(22))", () => {
    // $100,000 of wages, $1,058.82 of it an ESPP purchase's spread: income tax on all of it ($13,170, the published example);
    // Social Security and Medicare on $98,941.18: 6.2% = 6,134.35 and 1.45% = 1,434.65, 7.65% x 1,058.82 = 81.00 less.
    const base = single(100_000, "TX");
    const espp = single(100_000, "TX", { statutoryOptionIncome: 1_058.82 });
    expect(espp.federalAGI).toBe(100_000);
    expect(espp.federalIncomeTax).toBe(13_170);
    expect([espp.socialSecurity, espp.medicare]).toEqual([6_134.35, 1_434.65]);
    expect(base.totalTax - espp.totalTax).toBeCloseTo(81, 2);
  });
});

describe("state", () => {
  it("SC Act 110: $100k AGI -> 5.21% x TI - $966 with SCIAD fully phased out", () => {
    expect(single(100_000, "SC").stateIncomeTax).toBe(4_244);
  });
  it("no-income-tax states owe zero state income tax", () => {
    for (const st of ["TX", "FL", "TN", "WA", "NV"]) expect(single(150_000, st).stateIncomeTax).toBe(0);
  });
  it("MA's 4% surtax starts above 2026's $1,107,750 of taxable income, single or joint", () => {
    // Taxable income = wages - the exemption - FICA's deduction (capped at $2,000 a person, reached at these wages):
    // single 1,124,150 - 4,400 - 2,000 = 1,117,750; joint 1,128,550 - 8,800 - 2,000 = 1,117,750 (only one earner).
    // 5% x 1,117,750 = 55,887.50, plus 4% x (1,117,750 - 1,107,750 = 10,000) = 400: 56,287.50. 2025's threshold ($1,083,150)
    // would add 4% x 24,600 = 984 more.
    expect(single(1_124_150, "MA").stateIncomeTax).toBe(56_287.5);
    expect(computeTaxes({ year: 2026, filingStatus: "joint", wages: 1_128_550, state: "MA" }).stateIncomeTax).toBe(56_287.5);
    // At the threshold exactly, no surtax: 5% x 1,107,750 = 55,387.50.
    expect(single(1_114_150, "MA").stateIncomeTax).toBe(55_387.5);
  });
  it("WA payroll: WA Cares 0.58% + PFML on wages", () => {
    expect(single(100_000, "WA").statePayrollTax).toBeCloseTo(580 + 807.16, 1);
  });
});

describe("local and itemizing", () => {
  it("NYC resident tax is charged on NY taxable income", () => {
    const r = single(100_000, "NY", { locality: { kind: "nyc" } });
    expect(r.localIncomeTax).toBeGreaterThan(3_000);
    expect(r.localIncomeTax).toBeLessThan(3_700);
  });
  it("itemizes SALT for a high earner in NYC", () => {
    expect(single(250_000, "NY", { locality: { kind: "nyc" } }).itemizes).toBe(true);
  });
  it("does not itemize for a mid earner in Texas", () => {
    expect(single(100_000, "TX").itemizes).toBe(false);
  });
});
