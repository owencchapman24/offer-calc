import { estimateRent, type RentEstimate } from "../../src/col/rent";
import { annuityTerms, horizonSweep, rentFlipFrom } from "../../src/offer/compare";
import { projectScenario } from "../../src/offer/project";
import { withholdingShortfall } from "../../src/offer/withholding";
import { changingWarnings } from "./warningKinds";
import { type OfferIssue, validateOffer } from "../../src/offer/validate";
import type { HorizonSweep, ScenarioResult } from "../../src/offer/types";
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
  return { sweep, detail: stayDetail(c, sweep), rents, issues };
}

/**
 * Your stay, projected in full for each offer (base case), its bear and bull totals, its withholding, how many
 * warnings change the numbers, every stay's annuity terms, and after rent each offer's rent lever.
 */
function stayDetail(c: CompareRequest, sweep: HorizonSweep): StayDetail {
  const options = { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate };
  const start = sweep.rows[0].window.start;
  const window = { start, years: c.stayYears };
  const projections: ScenarioResult[] = [];
  // The calendar years your stay touches: from its start to its last day (the window's end is exclusive).
  const [y, m, d] = start.split("-").map(Number);
  const firstYear = y;
  const lastYear = new Date(Date.UTC(y + c.stayYears, m - 1, d) - 86_400_000).getUTCFullYear();
  const inStay = (year: number) => year >= firstYear && year <= lastYear;
  const offers = c.offers.map((o): OfferDetail => {
      const r = projectScenario(o, c.household, { ...options, scenario: "base", window });
      projections.push(r);
      const cases = {
        bear: projectScenario(o, c.household, { ...options, scenario: "bear", window }).window,
        bull: projectScenario(o, c.household, { ...options, scenario: "bull", window }).window,
      };
      // Withholding, for the calendar years your stay touches (the last one taxed as a full year, as the stay is).
      const wh = withholdingShortfall(o, c.household, { inflation: c.inflation, years: c.stayYears + 1 });
      const withholding = {
        years: wh.years.filter((y) => inStay(y.year)),
        warnings: wh.warnings.filter((w) => w.code === "withholdingShortfall" && inStay(w.params.year)),
      };
      // Payments as posted: each one to the cent, as the engine rounds it, added in whole cents so the sums are exact.
      const cents = (x: number) => Math.round(x * 100);
      const split = new Map<string, OfferDetail["split"][number]>();
      const posted = new Map<number, OfferDetail["posted"][number]>();
      for (const e of r.events) {
        const key = `${e.employmentYear}|${e.calendarYear}`;
        const s = split.get(key) ?? { ey: e.employmentYear, year: e.calendarYear, gross: 0, tax: 0 };
        s.gross += cents(e.gross);
        s.tax += cents(e.tax);
        split.set(key, s);
        const p = posted.get(e.employmentYear) ?? { ey: e.employmentYear, salary: 0, bonus: 0, cash: 0, rsu: 0, clawback: 0, tax: 0 };
        p[e.component] += cents(e.gross);
        p.tax += cents(e.tax);
        posted.set(e.employmentYear, p);
      }
      const dollarsOf = <T extends object>(o: T, keys: Array<keyof T>): T => ({ ...o, ...Object.fromEntries(keys.map((k) => [k, (o[k] as number) / 100])) });
      return {
        window: r.window, cases, withholding, employmentYears: r.employmentYears, costOfLiving: r.costOfLiving, assumptions: r.assumptions, warnings: r.warnings,
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
        split: [...split.values()].map((s) => dollarsOf(s, ["gross", "tax"])),
        posted: [...posted.values()].sort((a, b) => a.ey - b.ey).map((p) => dollarsOf(p, ["salary", "bonus", "cash", "rsu", "clawback", "tax"])),
        bonuses: r.events.flatMap((e) => (e.detail.kind === "bonus"
          ? [{ ey: e.employmentYear, date: e.date, gross: e.gross, periodFrom: e.detail.periodFrom, periodTo: e.detail.periodTo }] : [])),
        rsus: r.events.flatMap((e) => (e.detail.kind === "rsu"
          ? [{ ey: e.employmentYear, date: e.date, gross: e.gross, refresher: e.detail.grant.kind === "refresher", tranche: e.detail.tranche,
            tranches: e.detail.tranches, priceFactor: e.detail.priceFactor, ...(e.detail.nominalDate ? { nominalDate: e.detail.nominalDate } : {}) }] : [])),
      };
  });
  // The rent lever (L-3's, the same closed form) from these projections: for the lead's rent note, at no extra projection.
  const lead = sweep.rows.find((row) => row.years === c.stayYears)?.leads.colAdjustedTotal;
  const rentFlips = lead && projections.every((p) => p.costOfLiving) ? projections.map((p, i) => {
    const against = i === lead.winner ? lead.runnerUp : lead.winner;
    const target = projections[against].window.costOfLiving!.presentValue!.total;
    const atRent = (rent: number) => projectScenario({ ...c.offers[i], costOfLiving: { ...c.offers[i].costOfLiving!, monthlyRent: rent } }, c.household,
      { ...options, scenario: "base", window }).window.costOfLiving!.presentValue!.rent / rent;
    return { against, flip: rentFlipFrom(p, target, window, () => atRent(1000)) };
  }) : undefined;
  return {
    years: c.stayYears,
    offers,
    changes: changingWarnings(offers, lastYear),
    annuity: Object.fromEntries(c.stays.map((years) => [years, annuityTerms({ start, years }, c.valuationDate, c.discountRate)])),
    ...(rentFlips ? { rentFlips } : {}),
  };
}
