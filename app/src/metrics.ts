import type { RentEstimate } from "../../src/col/rent";
import type { Basis, Component, EmploymentYearResult, HorizonRow, HorizonSweep, RentFlipResult, Scenario, ValueBasis } from "../../src/offer/types";
import { CITIES } from "../../src/col/cities";
import { isDefault } from "./defaults";
import { type AppHousehold, type AppOffer, DEFAULT_HOUSEHOLD, type Letter } from "./model";
import { type PriceWords, priceWords, shortCity, US_PRICES } from "./prices";
import type { LeaveBasis } from "./leaveModel";
import { type LeavePanel, type OfferDetail, rentKey, type StayDetail, type Ties, type WorkOffer } from "./protocol";
import type { SectionId } from "./sections";
import { dollars } from "./text";
import type { TickKind } from "./ui";
import type { VerdictView } from "./verdict";

// Show the work (docs/ui-design.md §8, §9.1). Every figure on the page has a metric id; each id maps
// to a tickmark kind, a methodology section and a derivation built from the engine's numbers. Pure:
// no React. This module is what the page needs to render: the ids, each figure's tickmark kind and
// the lookups. L-1's and the bridge's view models are in byYearModel.ts, which loads with L-1. The
// derivations themselves (derive.ts) load the first time a tickmark is opened. A unit test renders the schedules and fails if a figure's id lacks a
// kind, a section or a derivation.

type L = Letter;
export type AboutField = "filing" | "stay" | "wages" | "healthUsage" | "prices";
export type PvPart = "gross" | "tax" | "premiums" | "takeHome" | "retirement" | "perks" | "healthExtra" | "savings" | "rent" | "faceValue";
/** The bridge's lines, offer letter to after rent (docs/ui-design.md §5, W4). */
export type BridgeLine =
  | "letter" | "salary" | "bonus" | "cash" | "rsu" | "clawback" | "paid" | "tax" | "premiums" | "afterTax"
  | "retirement" | "perks" | "hsa" | "oop" | "totalRewards" | "rent" | "prices" | "total" | "spend" | "saved";
/** L-6's employment-year lines (docs/ui-design.md §4.8): cash; total rewards and hours; after rent. workpaper.ts numbers them. */
export type L6Line =
  | "salary" | "bonus" | "cash" | "rsu" | "clawback" | "gross" | "tax" | "premiums" | "afterTax" | "yours" | "takeHome"
  | "employer" | "oop" | "hsa" | "perks" | "totalRewards" | "hours" | "afterTaxHour" | "totalRewardsHour"
  | "savings" | "rent" | "local" | "atRef" | "oopRef" | "face" | "total" | "totalHour";
/** L-6's calendar-year tax lines: what goes in, then each tax. `rate` is the offer's share ÷ its pay (the offer's column only). */
export type TaxLine =
  | "wages" | "spouse" | "pretax401k" | "section125" | "taxable" | "federal" | "ss" | "medicare" | "state" | "statePayroll" | "local" | "total" | "rate";
/** Each L-6 year line's tickmark: inputs traced, sums footed, the rest worked out. */
const L6_KIND: Record<L6Line, TickKind> = {
  salary: "recomputed", bonus: "recomputed", cash: "recomputed", rsu: "recomputed", clawback: "recomputed", gross: "footed", tax: "recomputed",
  premiums: "traced", afterTax: "footed", yours: "recomputed", takeHome: "footed", employer: "recomputed", oop: "traced", hsa: "traced",
  perks: "traced", totalRewards: "footed", hours: "recomputed", afterTaxHour: "recomputed", totalRewardsHour: "recomputed",
  savings: "recomputed", rent: "traced", local: "footed", atRef: "recomputed", oopRef: "recomputed", face: "recomputed", total: "footed",
  totalHour: "recomputed",
};

export type MetricId =
  | "hero" // the verdict: the lead a month (or an hour) on the selected basis, for your stay
  | `stay.${number}` // the "if you stay" row
  | `step.${Basis}` // the pipeline's steps, for your stay
  | `pv.${L}.${ValueBasis}` // an offer's total over your stay, present value
  | `ph.${L}` // an offer's dollars per hour worked
  | `avg.${L}.${ValueBasis}` // per hour worked on one dollar basis (pay per extra hour's comparison)
  | `af.${number}` // the annuity factor for a stay
  | `part.${L}.${PvPart}` // one part of a total, as paid and in present value
  | `rpp.${L}.${"ref" | "area"}` // a BEA non-housing price index: the prices picked (Prices in), or the offer's city's
  | `extra.${L}${L}.${"hours" | ValueBasis}` // pay per extra hour: more-hours offer, other offer
  | `ey.${L}.${number}` // L-1: one employment year on the selected basis
  | `run.${L}.${number}` // L-1: the running total through a year
  | `eysum.${L}` // L-1's table: the years, footed
  | `br.${L}.${number}.${BridgeLine}` // the bridge
  | `risk.${L}.${Scenario}` // L-2: an offer's total (or per hour) in a scenario, over your stay
  | `drop.${L}` // L-2: the base case less the bear case, a month (or an hour)
  | `win.${Scenario}` // L-2: who leads in a scenario, by how much a month (or an hour)
  | `kept.${L}` // L-4: what you keep if your last day is the one picked (after tax, or total rewards)
  | `repay.${L}` // L-4: clawbacks owed on that last day
  | `forgone.${L}.${number}` // L-4: what was earned toward a bonus that leaving forfeits (the offer's nth)
  | `forfeit.${L}.${"rsu" | "k401"}` // L-4: RSUs or employer 401(k) money not vested by then
  | `next.${L}` // L-4: what staying until the next cliff is worth
  | `nextown.${L}` // L-4: the next cliff's own part of that
  | `stayafter.${L}` // L-4: your stay after tax, as paid (what L-1 counts on the after-tax basis)
  | `recon.${L}` // L-4: leaving on your stay's last day vs the stay
  | `wh.${L}.${number}` // L-5: federal tax a calendar year's withholding falls short of, owed the next April
  | "flip" // the close-call line: the runner-up's starting salary increase that ties the verdict
  | "tie.target" // L-3: the winner's total, which each offer behind it ties to
  | `tie.${L}.${"salary" | "cash" | "rent"}` // L-3: the starting salary, cash award or rent that ties (the winner's: where the runner-up ties)
  | `rentnote.${L}` // the lead's rent note: an offer's rent estimate, on the other side of the rent that flips the verdict
  | `l6y.${L}.${L6Line}.${number | "sum"}` // L-6: a line of an employment year, or of the years added
  | `l6s.${L}.${ValueBasis}.${"after" | "stay" | "pv"}` // L-6: your stay on a basis: what the years run past it, as paid, present value
  | `l6p.${L}.${number}.${"gross" | "tax"}` // L-6: a payment, by its place in the list, and its tax
  | `l6g.${L}.${number | "after"}.${Component | "all"}.${"gross" | "tax"}` // L-6: a year's payments of a kind, added (all: the year's tax)
  | `l6t.${L}.${number}.${TaxLine}.${"with" | "without" | "offer"}` // L-6: a calendar year's tax, with and without the offer
  | `in.${L}.${string}` // an input in the ledger, by its path ("salary.annual", "equity.grants.0.schedule"), or "also"
  | `about.${AboutField}`; // an input in About you

export interface WorkLine {
  op?: "+" | "−" | "×" | "÷" | "=";
  label: string;
  /** The figure, formatted. */
  value?: string;
  /** Opens this figure's own derivation: its tickmark. */
  ref?: MetricId;
  /** The tickmark for a figure with nothing further to open; by default ✓, or ^ under a rule. */
  tick?: TickKind;
  /** A rule above: a subtotal (single) or the total (double). */
  rule?: "single" | "double";
  /** A short gloss after the label, in graphite. */
  note?: string;
}

export interface Derivation {
  kind: TickKind;
  section: SectionId;
  /** "C over A · after rent, at U.S. prices" */
  title: string;
  /** "Base case · stay 4 years (Jul 13, 2027 – Jul 12, 2031) · today's dollars" */
  scope?: string;
  lines: WorkLine[];
  notes: string[];
  /** Figures elsewhere on the page that show the same number: cross-footed. */
  ties: MetricId[];
  /** Figures on the page this one is built from: highlighted while it's open. */
  uses: MetricId[];
  /** For an input: the field "Edit it" opens and focuses. */
  edit?: EditTarget;
  /** "From your inputs": the inputs this figure is built from, each opening its own work (T or D). */
  inputs?: InputRef[];
}

/** An input a derivation is built from, with its value as it reads. */
export interface InputRef { ref: MetricId; label: string; value: string }

/** An offer's input, by its path, or a field in About you. */
export type EditTarget = { letter: Letter; path: string } | { about: AboutField };

/** Everything a derivation can draw on. `results` is present once two or more offers compare. */
export interface WorkContext {
  today: string;
  household: AppHousehold;
  /** The calendar year other wages belong to. */
  wagesYear: number;
  /** Every offer in the ledger. */
  offers: AppOffer[];
  rents: Record<string, RentEstimate>;
  results?: {
    sweep: HorizonSweep;
    /** Your stay's projections; null until the worker has sent them. */
    detail: StayDetail | null;
    view: VerdictView;
    /** Engine order to letters: the offers compared. */
    letters: Letter[];
    /** L-4's panel at the last day picked, once the worker has sent it. */
    leave?: LeaveContext;
    /** Breakevens, once the worker has sent them: the close-call line's and L-3's, as displayed. */
    ties?: { flip?: Ties; l3?: Ties };
    /** L-6's payments and tax years, once the worker has sent them (only while L-6 is open): the offers compared, in order. */
    work?: WorkOffer[];
  };
}

/** L-4 for Show the work: what it counts, your stay's last day, and each offer's panel (null before its start). */
export interface LeaveContext { basis: LeaveBasis; stayEnd: string; panels: Array<LeavePanel | null> }

/** How a basis reads inside a sentence or a line: "after rent, at Charlotte prices" follows "Prices in". */
export const basisPhrase = (p: PriceWords): Record<Basis, string> => ({
  cash: "after tax", totalRewards: "in total rewards", colAdjustedTotal: p.phrase, perHour: "per hour worked",
});
/** The words for the prices the figures are in ("Prices in", About you). */
export const pricesOf = (ctx: WorkContext): PriceWords => priceWords(ctx.household.pricesIn);
/** An input's path within its metric id: "in.A.equity.grants.0.value" -> "equity.grants.0.value". */
export const pathOf = (id: string) => id.split(".").slice(2).join(".");
export const cityName = (code: string | null) => (code ? CITIES.find((c) => c.code === code)?.name ?? code : "");
/** A metro's first city: "New York-Newark-Jersey City, NY-NJ" -> "New York". */
export { shortCity };
export const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ---- the registry ------------------------------------------------------------------------------

/** A figure's tickmark: shown before its derivation is built. */
export function metricKind(id: MetricId, ctx: WorkContext): TickKind {
  const [head, a, b, c] = id.split(".");
  switch (head) {
    case "in": {
      const o = offerByLetter(ctx, a as L);
      const path = pathOf(id);
      if (path === "costOfLiving.monthlyRent") return o?.draft.costOfLiving.monthlyRent === null && rentEstimate(ctx, o) ? "estimate" : "traced";
      return o && isDefault(o.draft, path) ? "default" : "traced";
    }
    case "about": return aboutIsDefault(ctx.household, a as AboutField) ? "default" : "traced";
    case "rpp": return "traced";
    case "run": case "eysum": return "footed";
    case "risk": return b === "base" ? "crossFooted" : "recomputed";
    case "tie": return a === "target" ? "crossFooted" : "recomputed";
    case "rentnote": return "estimate";
    case "l6y":
      if (c === "sum") return "footed";
      if (b === "rent") return offerByLetter(ctx, a as L)?.draft.costOfLiving.monthlyRent === null ? "estimate" : "traced";
      return L6_KIND[b as L6Line];
    case "l6s": return c === "after" ? "recomputed" : "crossFooted";
    case "l6p": return "recomputed";
    case "l6g": return "footed";
    case "l6t": {
      const [, , , line, col] = id.split(".");
      if (line === "total") return "footed";
      if (line === "spouse" || (line === "wages" && col === "without")) return "traced";
      return line === "wages" && col === "offer" ? "footed" : "recomputed";
    }
    case "br":
      switch (c as BridgeLine) {
        case "letter": case "premiums": case "perks": case "hsa": case "oop": return "traced";
        case "rent": return offerByLetter(ctx, a as L)?.draft.costOfLiving.monthlyRent === null ? "estimate" : "traced";
        case "paid": case "afterTax": case "totalRewards": case "total": return "footed";
        default: return "recomputed";
      }
  }
  return "recomputed";
}

// ---- lookups ----------------------------------------------------------------------------------

export function res(ctx: WorkContext) {
  if (!ctx.results) throw new Error("Fill in at least two offers to see the comparison's work.");
  return ctx.results;
}
export function rowFor(ctx: WorkContext, n: number): HorizonRow {
  const row = res(ctx).sweep.rows.find((r) => r.years === n);
  if (!row) throw new Error(`No ${n}-year stay in the comparison.`);
  return row;
}
export function indexOf(ctx: WorkContext, letter: L): number {
  const i = res(ctx).letters.indexOf(letter);
  if (i < 0) throw new Error(`Offer ${letter} isn't in the comparison yet.`);
  return i;
}
/** Your stay's projection for one offer, when the worker has sent it for the stay on screen. */
export function detailOf(ctx: WorkContext, letter: L): OfferDetail {
  const r = res(ctx);
  if (!r.detail || r.detail.years !== r.view.row.years) throw new Error("Still working this out…");
  return r.detail.offers[indexOf(ctx, letter)];
}
export function yearOf(ctx: WorkContext, letter: L, n: number): EmploymentYearResult {
  const y = detailOf(ctx, letter).employmentYears[n - 1];
  if (!y || n > res(ctx).view.row.years) throw new Error(`Year ${n} isn't in your stay.`);
  return y;
}
export function offerByLetter(ctx: WorkContext, letter: L): AppOffer | undefined {
  return ctx.offers.find((o) => o.letter === letter);
}
export function rentEstimate(ctx: WorkContext, o: AppOffer | undefined): RentEstimate | null {
  return o?.draft.costOfLiving.area && o.draft.residence.state ? ctx.rents[rentKey(o.draft.costOfLiving.area, o.draft.residence.state)] ?? null : null;
}
export function aboutIsDefault(h: AppHousehold, f: AboutField): boolean {
  switch (f) {
    case "filing": return h.filingStatus === DEFAULT_HOUSEHOLD.filingStatus;
    case "stay": return h.stayYears === DEFAULT_HOUSEHOLD.stayYears;
    case "wages": return h.otherWagesThisYear === DEFAULT_HOUSEHOLD.otherWagesThisYear;
    case "healthUsage": return !h.healthUsage;
    case "prices": return h.pricesIn === US_PRICES;
  }
}
// ---- the rent note under the verdict ---------------------------------------------------------------

/**
 * "This depends on rent: at HUD's estimate for New York ($2,729), A wins." An offer whose rent you entered, where the rent
 * that would flip the verdict (L-3's rent lever, worked out with your stay's projections) lies between that rent and the
 * estimate: the verdict turns on which is nearer what you'd pay. After rent only, base case, your stay.
 */
export interface RentNote {
  /** Whose rent. */
  letter: L;
  /** Who wins with that rent at the estimate: the offer itself, or for the winner's own rent, the runner-up. */
  wins: L;
  /** The offer it would tie at the rent that flips: the winner, or for the winner, the runner-up. */
  against: L;
  /** The rent as entered (the first lease year's), a month. */
  entered: number;
  estimate: RentEstimate;
  /** The rent that ties `against`, a month, first lease year. */
  flip: Extract<RentFlipResult, { outcome: "tie" }>;
  /** "New York": the estimate's place. */
  city: string;
}

export function rentNotes(ctx: WorkContext): RentNote[] {
  const r = ctx.results;
  const lead = r?.view.lead;
  if (!r || r.view.basis !== "colAdjustedTotal" || !lead || !(lead.margin > 0) || !r.detail || r.detail.years !== r.view.row.years) return [];
  const flips = r.detail.rentFlips;
  if (!flips) return [];
  return r.letters.flatMap((letter, i): RentNote[] => {
    const f = flips[i];
    const info = r.detail!.offers[i]?.costOfLiving;
    const o = offerByLetter(ctx, letter);
    const estimate = rentEstimate(ctx, o);
    // Your own rent, as the projection used it, and the estimate for the same place.
    if (!f || f.flip.outcome !== "tie" || !info || info.rentSource !== "input" || !estimate || o?.draft.costOfLiving.area !== info.area.code) return [];
    const to = f.flip.to;
    if (!((info.monthlyRent - to) * (estimate.monthlyRent - to) < 0)) return [];
    return [{ letter, wins: letter === lead.winnerLetter ? lead.runnerUpLetter : letter, against: r.letters[f.against], entered: info.monthlyRent,
      estimate, flip: f.flip, city: shortCity(info.area.name) }];
  });
}
