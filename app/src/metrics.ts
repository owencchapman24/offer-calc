import type { RentEstimate } from "../../src/col/rent";
import type { Basis, EmploymentYearResult, HorizonRow, HorizonSweep, Scenario, ValueBasis } from "../../src/offer/types";
import { CITIES } from "../../src/col/cities";
import { isDefault } from "./defaults";
import { type AppHousehold, type AppOffer, DEFAULT_HOUSEHOLD, inNyc, type Letter } from "./model";
import type { LeaveBasis } from "./leaveModel";
import { type LeavePanel, type OfferDetail, rentKey, type StayDetail } from "./protocol";
import type { SectionId } from "./sections";
import { dollars, monthName, percent, shortDate } from "./text";
import type { TickKind } from "./ui";
import type { VerdictView } from "./verdict";

// Show the work (docs/ui-design.md §8, §9.1). Every figure on the page has a metric id; each id maps
// to a tickmark kind, a methodology section and a derivation built from the engine's numbers. Pure:
// no React. This module is what the page needs to render: the ids, each figure's tickmark kind, and
// the view models behind L-1 and the bridge. The derivations themselves (derive.ts) load the first
// time a tickmark is opened. A unit test renders the schedules and fails if a figure's id lacks a
// kind, a section or a derivation.

type L = Letter;
export type AboutField = "filing" | "stay" | "wages" | "healthUsage" | "prices";
export type PvPart = "gross" | "tax" | "premiums" | "takeHome" | "retirement" | "perks" | "healthExtra" | "savings" | "rent" | "faceValue";
/** The bridge's lines, offer letter to after rent (docs/ui-design.md §5, W4). */
export type BridgeLine =
  | "letter" | "salary" | "bonus" | "cash" | "rsu" | "clawback" | "paid" | "tax" | "premiums" | "afterTax"
  | "retirement" | "perks" | "hsa" | "oop" | "totalRewards" | "rent" | "prices" | "total" | "spend" | "saved";

export type MetricId =
  | "hero" // the verdict: the lead a month (or an hour) on the selected basis, for your stay
  | `stay.${number}` // the "if you stay" row
  | `step.${Basis}` // the pipeline's steps, for your stay
  | `pv.${L}.${ValueBasis}` // an offer's total over your stay, present value
  | `ph.${L}` // an offer's dollars per hour worked
  | `avg.${L}.${ValueBasis}` // per hour worked on one dollar basis (pay per extra hour's comparison)
  | `af.${number}` // the annuity factor for a stay
  | `part.${L}.${PvPart}` // one part of a total, as paid and in present value
  | `rpp.${L}.${"us" | "area"}` // a BEA non-housing price index
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
  };
}

/** L-4 for Show the work: what it counts, your stay's last day, and each offer's panel (null before its start). */
export interface LeaveContext { basis: LeaveBasis; stayEnd: string; panels: Array<LeavePanel | null> }

/** How a basis reads inside a sentence or a line. */
export const BASIS_PHRASE: Record<Basis, string> = {
  cash: "after tax", totalRewards: "in total rewards", colAdjustedTotal: "after rent, at U.S. prices", perHour: "per hour worked",
};
/** An input's path within its metric id: "in.A.equity.grants.0.value" -> "equity.grants.0.value". */
export const pathOf = (id: string) => id.split(".").slice(2).join(".");
export const cityName = (code: string | null) => (code ? CITIES.find((c) => c.code === code)?.name ?? code : "");
/** A metro's first city: "New York-Newark-Jersey City, NY-NJ" -> "New York". */
export const shortCity = (name: string) => name.split(/[-,]/)[0].trim();
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
    case "prices": return true;
  }
}
// ---- L-1: by year ------------------------------------------------------------------------------

/** An employment year's value on a basis: dollars as paid that year, or per hour worked. */
export function yearValue(y: EmploymentYearResult, basis: Basis, perHourOf: ValueBasis): number | null {
  switch (basis) {
    case "cash": return y.afterTaxComp;
    case "totalRewards": return y.totalRewards;
    case "colAdjustedTotal": return y.costOfLiving?.total ?? null;
    case "perHour": {
      const v = perHourOf === "colAdjustedTotal" ? y.costOfLiving?.total : y.totalRewards;
      return v !== undefined && y.hours ? v / y.hours : null;
    }
  }
}

export interface ByYear {
  letter: L;
  /** Employment years 1 through your stay. */
  years: Array<{ n: number; start: string; end: string; value: number }>;
  /** The years summed (dollar bases only). */
  sum: number | null;
  /** Your stay's window, as paid; differs from `sum` when a later start runs a year past the window's end. */
  window: number | null;
}

/** One offer's figures for L-1 on the selected basis. */
export function byYear(ctx: WorkContext, letter: L): ByYear {
  const r = res(ctx);
  const d = detailOf(ctx, letter);
  const basis = r.view.basis;
  const n = r.view.row.years;
  const out = d.employmentYears.slice(0, n).flatMap((y) => {
    const value = yearValue(y, basis, r.sweep.perHourOf);
    return value === null ? [] : [{ n: y.year, start: y.start, end: y.end, value }];
  });
  if (basis === "perHour") return { letter, years: out, sum: null, window: null };
  const w = d.window;
  const window = basis === "cash" ? w.nominal.afterTaxComp : basis === "totalRewards" ? w.totalRewards.nominal : w.costOfLiving?.nominal.total ?? null;
  return { letter, years: out, sum: out.reduce((s, y) => s + y.value, 0), window };
}

// ---- the bridge: offer letter to after rent ------------------------------------------------------

export interface BridgeRow {
  id: MetricId;
  line: BridgeLine;
  /** letter: the offer letter; change: what's paid differs from it; subtotal/total: footed. */
  kind: "letter" | "change" | "subtotal" | "less" | "plus" | "total";
  /** Lower case, after "less" or "plus": "first bonus is a stub". */
  label: string;
  /** Signed: what it adds to the running figure. */
  value: number;
  gloss?: string;
}

export interface Bridge {
  letter: L;
  year: number;
  start: string;
  end: string;
  rows: BridgeRow[];
  /** A month: spending money after rent at U.S. prices, and what's saved. Present with a city. */
  spend?: number;
  saved?: number;
}

/** In which employment year a date falls: a date on an anniversary counts toward the year just ended (decision 1). */
export function eyOfDate(ys: EmploymentYearResult[], date: string): number {
  const i = ys.findIndex((y) => date > y.start && date <= y.end);
  return i >= 0 ? i + 1 : date === ys[0]?.start ? 1 : 0;
}

/** A bonus period counts from your start date: a period that began before it is prorated to the days you worked. */
export const workedFrom = (d: OfferDetail, periodFrom: string) => (d.employmentYears[0] && periodFrom < d.employmentYears[0].start ? d.employmentYears[0].start : periodFrom);

/** The bridge for one offer and employment year (docs/ui-design.md §5, W4): every line foots. */
export function bridge(ctx: WorkContext, letter: L, n: number): Bridge {
  const d = detailOf(ctx, letter);
  const y = yearOf(ctx, letter, n);
  const o = offerByLetter(ctx, letter);
  const id = (line: BridgeLine) => `br.${letter}.${n}.${line}` as MetricId;
  const rows: BridgeRow[] = [];
  const q = y.quoted;
  const cashName = o?.draft.cashAwards.length && o.draft.cashAwards.every((a) => /sign/i.test(a.label)) ? "sign-on" : "cash awards";
  const parts = [q.salary && "salary", q.bonus && "target bonus", q.cash && cashName, q.rsu && "RSUs due"].filter(Boolean) as string[];
  rows.push({ id: id("letter"), line: "letter", kind: "letter", label: `Offer letter: ${parts.join(" + ")}`, value: y.quotedTC });

  // Where what's paid in the year differs from the letter, line by line.
  const change = (line: "salary" | "bonus" | "cash" | "rsu", label: string, gloss?: string) => {
    const diff = y.gross[line] - q[line];
    if (Math.abs(diff) >= 0.5) rows.push({ id: id(line), line, kind: "change", label, value: diff, ...(gloss ? { gloss } : {}) });
  };
  change("salary", y.gross.salary > q.salary ? "raises during the year" : "salary not earned this year");
  const bonuses = d.bonuses.filter((b) => b.ey === n);
  const from = (b: (typeof bonuses)[number]) => workedFrom(d, b.periodFrom);
  const stub = (b: (typeof bonuses)[number]) => (Date.parse(b.periodTo) - Date.parse(from(b))) / 86_400_000 < 360;
  const bonusGloss = bonuses.map((b) => `paid ${shortDate(b.date)} for ${monthName(from(b))}–${monthName(b.periodTo)}${stub(b) ? " only" : ""}`).join("; ");
  const nextBonus = d.bonuses.find((b) => b.ey > n);
  change("bonus",
    !bonuses.length ? `no bonus paid in year ${n}` : n === 1 && bonuses.every(stub) && y.gross.bonus < q.bonus ? "first bonus is a stub"
      : y.gross.bonus < q.bonus ? "bonus paid is below the target" : "bonus paid is above the target",
    bonuses.length ? bonusGloss : nextBonus ? `the first is paid ${shortDate(nextBonus.date)}, ${nextBonus.date.slice(0, 4)}` : undefined);
  change("cash", "cash awards paid in another year");
  const vests = d.rsus.filter((v) => v.ey === n);
  const movedOut = d.rsus.some((v) => !v.refresher && v.nominalDate && eyOfDate(d.employmentYears, v.nominalDate) === n && v.ey > n);
  const movedIn = vests.some((v) => !v.refresher && v.nominalDate && eyOfDate(d.employmentYears, v.nominalDate) < n);
  const reasons = [
    ...(movedOut || movedIn ? ["RSUs vest on company dates"] : []),
    ...(vests.some((v) => v.refresher) ? ["refreshers"] : []),
    ...(vests.some((v) => Math.abs(v.priceFactor - 1) > 1e-9) ? ["share-price growth"] : []),
  ];
  change("rsu", reasons.length ? join(reasons) : "RSUs vest on a different schedule",
    vests.length ? `vests ${join([...new Set(vests.map((v) => shortDate(v.date)))])}` : undefined);
  if (y.gross.clawback) rows.push({ id: id("clawback"), line: "clawback", kind: "less", label: "clawback repaid", value: y.gross.clawback });
  rows.push({ id: id("paid"), line: "paid", kind: "subtotal", label: `Paid in year ${n}`, value: y.gross.total });

  const taxYears = d.split.filter((s) => s.ey === n).map((s) => s.year);
  const kinds = d.taxYears.filter((t) => taxYears.includes(t.year));
  const locality = o && inNyc(o.draft) ? "NYC" : "local";
  const who = [
    kinds.some((t) => t.parts.federal) && "federal", kinds.some((t) => t.parts.fica) && "FICA",
    kinds.some((t) => t.parts.state) && (o?.draft.residence.state ?? "state"), kinds.some((t) => t.parts.local) && locality,
  ].filter(Boolean) as string[];
  rows.push({ id: id("tax"), line: "tax", kind: "less", label: "tax", value: -y.tax, gloss: who.join(", ") });
  if (y.health.premiums) rows.push({ id: id("premiums"), line: "premiums", kind: "less", label: "health premiums", value: -y.health.premiums });
  rows.push({ id: id("afterTax"), line: "afterTax", kind: "subtotal", label: "After-tax pay", value: y.afterTaxComp });

  const ret = d.assumptions.find((a) => a.code === "retirement");
  if (y.retirement.employerCredited) {
    const share = ret?.code === "retirement" ? ret.params.vestedShare : y.retirement.employerVested / y.retirement.employerCredited;
    rows.push({ id: id("retirement"), line: "retirement", kind: "plus", label: "employer 401(k)", value: y.retirement.employerVested,
      gloss: share >= 1 ? "vested by the end of your stay" : share > 0 ? `${percent(share)} vested by the end of your stay` : "not vested by the end of your stay" });
  }
  if (y.perks.face) rows.push({ id: id("perks"), line: "perks", kind: "plus", label: "perks", value: y.perks.face, gloss: "tax-free, at face value" });
  if (y.health.employerHsa) rows.push({ id: id("hsa"), line: "hsa", kind: "plus", label: "employer HSA money", value: y.health.employerHsa });
  if (y.health.outOfPocket) rows.push({ id: id("oop"), line: "oop", kind: "less", label: "expected out-of-pocket health costs", value: -y.health.outOfPocket });
  rows.push({ id: id("totalRewards"), line: "totalRewards", kind: "subtotal", label: "Total rewards", value: y.totalRewards });

  const col = y.costOfLiving;
  const info = d.costOfLiving;
  if (!col || !info) return { letter, year: n, start: y.start, end: y.end, rows };
  const monthly = info.monthlyRent * (1 + info.rentGrowth) ** (n - 1);
  rows.push({ id: id("rent"), line: "rent", kind: "less", label: "rent", value: -col.rent,
    gloss: Math.abs(12 * monthly - col.rent) < 1 ? `${dollars(monthly)} a month` : "for the months you work there" });
  // The identity, so the bridge foots: after rent = total rewards - rent + (factor - 1) x (local spending - out-of-pocket).
  const prices = col.total - (y.totalRewards - col.rent);
  const above = 1 / info.nonHousingFactor - 1;
  rows.push({ id: id("prices"), line: "prices", kind: prices < 0 ? "less" : "plus", label: `${shortCity(info.area.name)} prices`, value: prices,
    gloss: `non-housing prices ${percent(Math.abs(above))} ${above >= 0 ? "above" : "below"} the U.S. average` });
  rows.push({ id: id("total"), line: "total", kind: "total", label: "After rent, at U.S. prices", value: col.total });
  return { letter, year: n, start: y.start, end: y.end, rows,
    spend: (col.discretionaryReference - col.outOfPocketReference) / 12, saved: col.faceValue / 12 };
}
