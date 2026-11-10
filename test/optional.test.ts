import { describe, expect, it, vi } from "vitest";
import { isProvided, needs } from "../src/offer/optional";
import type { OfferInput } from "../src/offer/types";

// The engine's optional modules (src/offer/optional.ts): the worker loads each on first use; the tests and scripts get them all
// up front (test/setup.ts, src/offer/index.ts).

const offer = (o: Partial<OfferInput> = {}): OfferInput => ({ label: "T", residence: { state: "TX" }, employerState: "TX",
  startDate: "2026-07-13", salary: { annual: 100_000 }, ...o });
const espp = { contributionPct: 0.1, discount: 0.15, lookback: true, offeringMonths: 6, offeringsStart: { month: 1, day: 1 } };
const commission: NonNullable<OfferInput["commission"]> = { basis: "fixed", amount: { bear: 40_000, base: 60_000, bull: 80_000 },
  period: "quarter", payAfterDays: 30 };

describe("the engine's optional modules", () => {
  it("an offer needs a module only for the feature it has", () => {
    expect(needs([offer()])).toEqual([]);
    expect(needs([offer({ espp })])).toEqual(["espp"]);
    expect(needs([offer(), offer({ commission })])).toEqual(["commission"]);
    expect(needs([offer({ espp }), offer({ commission })])).toEqual(["commission", "espp"]);
  });

  it("the tests run on the engine in full", () => {
    expect(isProvided("espp") && isProvided("commission")).toBe(true);
  });

  it("an offer whose module isn't loaded is never projected without it; one that doesn't need it is", async () => {
    // A fresh copy of the engine, with nothing provided: as the worker's is before its first offer with an ESPP or commission.
    vi.resetModules();
    const { projectScenario } = await import("../src/offer/project");
    const fresh = await import("../src/offer/optional");
    const household = { filingStatus: "single" as const };
    expect(projectScenario(offer(), household, { years: 1 }).employmentYears).toHaveLength(1);
    expect(() => projectScenario(offer({ espp }), household, { years: 1 })).toThrow("The engine's espp module isn't loaded.");
    expect(() => projectScenario(offer({ commission }), household, { years: 1 })).toThrow("The engine's commission module isn't loaded.");
    fresh.provide("espp", await import("../src/offer/espp"));
    expect(projectScenario(offer({ espp }), household, { years: 1 }).events.some((e) => e.component === "espp")).toBe(true);
  });
});
