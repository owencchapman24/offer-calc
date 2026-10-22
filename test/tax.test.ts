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
