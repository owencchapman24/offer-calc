import { estimateRent, type RentEstimate } from "../../src/col/rent";
import { annuityFactor, annuityTerms, horizonSweep, rentFlipFrom } from "../../src/offer/compare";
import { projectScenario } from "../../src/offer/project";
import { withholdingShortfall } from "../../src/offer/withholding";
import { changingWarnings } from "./warningKinds";
import { type OfferIssue, validateOffer } from "../../src/offer/validate";
import type { Household, HorizonSweep, ISODate, OfferInput, ScenarioResult, ValuedOptions } from "../../src/offer/types";
import { type Breakdown, type CompareRequest, type EngineRequest, type OfferDetail, rentKey, type StayDetail } from "./protocol";

// What the worker computes for each request. Engine values: import this only from the worker (and
// tests), never from the main thread, or the engine and its tables land in the main bundle.

/** An offer's breakdown and its base-case projection (the comparison's rent lever reads it), as the worker keeps them. */
export interface Own { key: string; breakdown: Breakdown; base: ScenarioResult }

/**
 * The breakdowns worked out lately, by their inputs (the offer, About you, the stay, today and the assumptions): an edit to one
 * offer projects that offer alone (docs/v2-plan.md, item 5, "The worker"). The worker keeps one for the session; a test can pass
 * its own. Up to `CACHED` are kept, the least recently used going first.
 */
export type OwnCache = Map<string, Own>;
const CACHED = 12;

export interface Computed {
  /** The comparison: null under two offers. */
  sweep: HorizonSweep | null;
  detail: StayDetail | null;
  /** Each offer's breakdown, by its id (the request's `ids`, or its place in the order); null when nothing was computed. */
  breakdowns: Record<string, Breakdown> | null;
  rents: Record<string, RentEstimate>;
  issues: OfferIssue[][];
  /** How many offers were projected afresh for their breakdowns (the rest were remembered). */
  projected: number;
}

export function compute(req: Omit<EngineRequest, "gen">, cache: OwnCache = new Map()): Computed {
  const rents: Record<string, RentEstimate> = {};
  for (const { area, state } of req.rents) {
    try {
      rents[rentKey(area, state)] = estimateRent(area, state, { bedrooms: 1 });
    } catch { /* an unknown area just shows no estimate */ }
  }
  const c = req.offers;
  // Every problem, at its field, before anything is computed (the engine's own throws are the backstop).
  const issues = (req.check ?? c?.offers ?? []).map((o) => validateOffer(o, c?.household));
  if (!c || !c.offers.length || issues.some((x) => x.length)) return { sweep: null, detail: null, breakdowns: null, rents, issues, projected: 0 };
  let projected = 0;
  const own = c.offers.map((o) => {
    const key = JSON.stringify([o, c.household, c.stayYears, c.valuationDate, c.inflation, c.discountRate]);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    projected++;
    const made = ownStay(o, c, key);
    cache.set(key, made);
    while (cache.size > CACHED) cache.delete(cache.keys().next().value!);
    return made;
  });
  const breakdowns = Object.fromEntries(own.map((x, i) => [req.ids?.[i] ?? String(i), x.breakdown]));
  if (c.offers.length < 2) return { sweep: null, detail: null, breakdowns, rents, issues, projected };
  const sweep = horizonSweep(c.offers, c.household, c.stays,
    { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate });
  return { sweep, detail: stayDetail(c, sweep, own), breakdowns, rents, issues, projected };
}

/** One offer over its own stay (B3): from its own start, for your stay's years. */
function ownStay(o: OfferInput, c: CompareRequest, key: string): Own {
  const options = { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate };
  const window = { start: o.startDate, years: c.stayYears };
  const { detail, base } = offerDetail(o, c.household, options, window);
  return {
    key, base,
    breakdown: {
      window: { start: base.window.start, end: base.window.end }, years: c.stayYears, detail,
      annuityFactor: annuityFactor(window, c.valuationDate, c.discountRate), annuity: annuityTerms(window, c.valuationDate, c.discountRate),
      valuationDate: c.valuationDate, discountRate: c.discountRate,
    },
  };
}

/**
 * One offer's base-case projection over a window, in full, with its bear and bull totals, its withholding for the calendar
 * years the window touches, and its payments as posted: what Show the work, L-1, the bridge and the breakdown explain.
 */
function offerDetail(o: OfferInput, household: Household, options: ValuedOptions, window: { start: ISODate; years: number }):
  { detail: OfferDetail; base: ScenarioResult } {
  const r = projectScenario(o, household, { ...options, scenario: "base", window });
  const cases = {
    bear: projectScenario(o, household, { ...options, scenario: "bear", window }).window,
    bull: projectScenario(o, household, { ...options, scenario: "bull", window }).window,
  };
  // The calendar years the window touches: from its start to its last day (the window's end is exclusive).
  const [y, m, d] = window.start.split("-").map(Number);
  const lastYear = new Date(Date.UTC(y + window.years, m - 1, d) - 86_400_000).getUTCFullYear();
  const inStay = (year: number) => year >= y && year <= lastYear;
  // Withholding, for the calendar years your stay touches (the last one taxed as a full year, as the stay is).
  const wh = withholdingShortfall(o, household, { inflation: options.inflation, years: window.years + 1 });
  const withholding = {
    years: wh.years.filter((x) => inStay(x.year)),
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
  const dollarsOf = <T extends object>(x: T, keys: Array<keyof T>): T => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, (x[k] as number) / 100])) });
  const detail: OfferDetail = {
    window: r.window, cases, withholding, employmentYears: r.employmentYears, costOfLiving: r.costOfLiving, assumptions: r.assumptions, warnings: r.warnings,
    taxYears: r.calendarYears.map((t) => {
      const w = t.withOffer.result;
      const wo = t.withoutOffer.result;
      return {
        year: t.year, gross: t.offerGross.total, tax: t.offerTax, rate: t.offerTaxRate, projectedLaw: t.projectedLaw,
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
    cash: r.events.flatMap((e) => (e.detail.kind === "cash" ? [{ ey: e.employmentYear, date: e.date, gross: e.gross, award: e.detail.award }] : [])),
  };
  return { detail, base: r };
}

/**
 * Your stay over the comparison's window, projected in full for each offer (base case), its bear and bull totals, its
 * withholding, how many warnings change the numbers, every stay's annuity terms, and after rent each offer's rent lever. An
 * offer that starts on the window's start is its own breakdown's projection, so it isn't projected again.
 */
function stayDetail(c: CompareRequest, sweep: HorizonSweep, own: Own[]): StayDetail {
  const options = { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate };
  const start = sweep.rows[0].window.start;
  const window = { start, years: c.stayYears };
  const [y, m, d] = start.split("-").map(Number);
  const lastYear = new Date(Date.UTC(y + c.stayYears, m - 1, d) - 86_400_000).getUTCFullYear();
  const made = c.offers.map((o, i) => (o.startDate === start
    ? { detail: own[i].breakdown.detail, base: own[i].base } : offerDetail(o, c.household, options, window)));
  const offers = made.map((x) => x.detail);
  const projections = made.map((x) => x.base);
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
