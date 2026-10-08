import { estimateRent, type RentEstimate } from "../../src/col/rent";
import { annuityTerms, horizonSweep } from "../../src/offer/compare";
import { projectScenario } from "../../src/offer/project";
import type { HorizonSweep } from "../../src/offer/types";
import { type CompareRequest, type EngineRequest, rentKey, type StayDetail } from "./protocol";

// What the worker computes for each request. Engine values: import this only from the worker (and
// tests), never from the main thread, or the engine and its tables land in the main bundle.

export function compute(req: Omit<EngineRequest, "gen">): { sweep: HorizonSweep | null; detail: StayDetail | null; rents: Record<string, RentEstimate> } {
  const rents: Record<string, RentEstimate> = {};
  for (const { area, state } of req.rents) {
    try {
      rents[rentKey(area, state)] = estimateRent(area, state, { bedrooms: 1 });
    } catch { /* an unknown area just shows no estimate */ }
  }
  const c = req.compare;
  if (!c) return { sweep: null, detail: null, rents };
  const sweep = horizonSweep(c.offers, c.household, c.stays,
    { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate });
  return { sweep, detail: stayDetail(c, sweep.rows[0].window.start), rents };
}

/** Your stay, projected in full for each offer (base case), plus every stay's annuity terms. */
function stayDetail(c: CompareRequest, start: string): StayDetail {
  const options = { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate };
  return {
    years: c.stayYears,
    offers: c.offers.map((o) => {
      const r = projectScenario(o, c.household, { ...options, scenario: "base", window: { start, years: c.stayYears } });
      return { window: r.window, employmentYears: r.employmentYears, costOfLiving: r.costOfLiving, assumptions: r.assumptions, warnings: r.warnings };
    }),
    annuity: Object.fromEntries(c.stays.map((years) => [years, annuityTerms({ start, years }, c.valuationDate, c.discountRate)])),
  };
}
