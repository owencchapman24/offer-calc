import { estimateRent, type RentEstimate } from "../../src/col/rent";
import { annuityTerms, horizonSweep } from "../../src/offer/compare";
import { projectScenario } from "../../src/offer/project";
import { type OfferIssue, validateOffer } from "../../src/offer/validate";
import type { HorizonSweep } from "../../src/offer/types";
import { type CompareRequest, type EngineRequest, type OfferDetail, rentKey, type StayDetail } from "./protocol";

// What the worker computes for each request. Engine values: import this only from the worker (and
// tests), never from the main thread, or the engine and its tables land in the main bundle.

export function compute(req: Omit<EngineRequest, "gen">): {
  sweep: HorizonSweep | null; detail: StayDetail | null; rents: Record<string, RentEstimate>; issues: OfferIssue[][];
} {
  const rents: Record<string, RentEstimate> = {};
  for (const { area, state } of req.rents) {
    try {
      rents[rentKey(area, state)] = estimateRent(area, state, { bedrooms: 1 });
    } catch { /* an unknown area just shows no estimate */ }
  }
  const c = req.compare;
  // Every problem, at its field, before anything is computed (the engine's own throws are the backstop).
  const issues = (req.check ?? c?.offers ?? []).map((o) => validateOffer(o, c?.household));
  if (!c || issues.some((x) => x.length)) return { sweep: null, detail: null, rents, issues };
  const sweep = horizonSweep(c.offers, c.household, c.stays,
    { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate });
  return { sweep, detail: stayDetail(c, sweep.rows[0].window.start), rents, issues };
}

/** Your stay, projected in full for each offer (base case), its bear and bull totals, and every stay's annuity terms. */
function stayDetail(c: CompareRequest, start: string): StayDetail {
  const options = { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate };
  const window = { start, years: c.stayYears };
  return {
    years: c.stayYears,
    offers: c.offers.map((o): OfferDetail => {
      const r = projectScenario(o, c.household, { ...options, scenario: "base", window });
      const cases = {
        bear: projectScenario(o, c.household, { ...options, scenario: "bear", window }).window,
        bull: projectScenario(o, c.household, { ...options, scenario: "bull", window }).window,
      };
      const split = new Map<string, OfferDetail["split"][number]>();
      for (const e of r.events) {
        const key = `${e.employmentYear}|${e.calendarYear}`;
        const s = split.get(key) ?? { ey: e.employmentYear, year: e.calendarYear, gross: 0, tax: 0 };
        s.gross += e.gross;
        s.tax += e.tax;
        split.set(key, s);
      }
      return {
        window: r.window, cases, employmentYears: r.employmentYears, costOfLiving: r.costOfLiving, assumptions: r.assumptions, warnings: r.warnings,
        taxYears: r.calendarYears.map((y) => {
          const w = y.withOffer.result;
          const wo = y.withoutOffer.result;
          return {
            year: y.year, gross: y.offerGross.total, tax: y.offerTax, rate: y.offerTaxRate, projectedLaw: y.projectedLaw,
            parts: {
              federal: w.federalIncomeTax - wo.federalIncomeTax,
              fica: w.socialSecurity + w.medicare + w.additionalMedicare - (wo.socialSecurity + wo.medicare + wo.additionalMedicare),
              state: w.stateIncomeTax + w.statePayrollTax - (wo.stateIncomeTax + wo.statePayrollTax),
              local: w.localIncomeTax - wo.localIncomeTax,
            },
          };
        }),
        split: [...split.values()],
        bonuses: r.events.flatMap((e) => (e.detail.kind === "bonus"
          ? [{ ey: e.employmentYear, date: e.date, gross: e.gross, periodFrom: e.detail.periodFrom, periodTo: e.detail.periodTo }] : [])),
        rsus: r.events.flatMap((e) => (e.detail.kind === "rsu"
          ? [{ ey: e.employmentYear, date: e.date, gross: e.gross, refresher: e.detail.grant.kind === "refresher", tranche: e.detail.tranche,
            tranches: e.detail.tranches, priceFactor: e.detail.priceFactor, ...(e.detail.nominalDate ? { nominalDate: e.detail.nominalDate } : {}) }] : [])),
      };
    }),
    annuity: Object.fromEntries(c.stays.map((years) => [years, annuityTerms({ start, years }, c.valuationDate, c.discountRate)])),
  };
}
