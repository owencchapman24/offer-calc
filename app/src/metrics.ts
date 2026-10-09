import type { RentEstimate } from "../../src/col/rent";
import type {
  Basis, ByScenario, CashTotals, EmploymentYearResult, HorizonRow, HorizonSweep, RppUsed, ValueBasis, WindowTotals,
} from "../../src/offer/types";
import { CITIES } from "../../src/col/cities";
import { defaultFor, isDefault } from "./defaults";
import { HELP, helpKey } from "./help";
import {
  alsoCounted, type AppHousehold, type AppOffer, bonusBasis, DEFAULT_HOUSEHOLD, getPath, hasRange, inNyc, type Letter, type OfferDraft, type ScheduleDraft,
} from "./model";
import {
  bonusText, cashAwardsText, employerStateText, healthText, perksText, rangeText, refreshersText, rentGrowthText, retirementText, scheduleText,
} from "./summary";
import { type OfferDetail, rentKey, type StayDetail } from "./protocol";
import type { SectionId } from "./sections";
import { cents, dayBefore, dollars, figure, longDate, monthName, percent, shortDate, signed } from "./text";
import type { TickKind } from "./ui";
import type { VerdictView } from "./verdict";

// Show the work (docs/ui-design.md §8, §9.1). Every figure on the page has a metric id; each id maps
// to a tickmark kind, a methodology section and a derivation built from the engine's numbers. Pure:
// no React. A unit test renders the schedules and fails if a figure's id lacks any of the three.

type L = Letter;
export type AboutField = "filing" | "stay" | "wages" | "prices";
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
}

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
  };
}

type Work = Omit<Derivation, "kind" | "section">;

// ---- names ---------------------------------------------------------------------------------------

/** How a basis reads inside a sentence or a line. */
export const BASIS_PHRASE: Record<Basis, string> = {
  cash: "after tax", totalRewards: "in total rewards", colAdjustedTotal: "after rent, at U.S. prices", perHour: "per hour worked",
};
const TOTAL_NAME: Record<ValueBasis, string> = {
  cash: "after-tax pay", totalRewards: "total rewards", colAdjustedTotal: "after rent, at U.S. prices",
};
const SECTION_OF: Record<ValueBasis, SectionId> = { cash: "M-4", totalRewards: "M-5", colAdjustedTotal: "M-6.3" };
/** Inputs without help of their own (the read-only rows, "also"): their methodology section, by the path's head. */
const INPUT_SECTION: Record<string, SectionId> = {
  salary: "M-2", startDate: "M-7.3", bonus: "M-2", cashAwards: "M-2", equity: "M-3", retirement: "M-5.1", health: "M-5.2", perks: "M-5.3",
  hours: "M-5.4", costOfLiving: "M-6.2", residence: "M-4", employerState: "M-4", also: "M-5",
};
const inputSection = (path: string): SectionId => HELP[helpKey(path)]?.section ?? INPUT_SECTION[path.split(".")[0]] ?? "M-1";
/** An input's path within its metric id: "in.A.equity.grants.0.value" -> "equity.grants.0.value". */
const pathOf = (id: string) => id.split(".").slice(2).join(".");
const ABOUT_SECTION: Record<AboutField, SectionId> = { filing: "M-4", stay: "M-7.3", wages: "M-4", prices: "M-6.1" };
const BRIDGE_SECTION: Record<BridgeLine, SectionId> = {
  letter: "M-2", salary: "M-2", bonus: "M-2", cash: "M-2", rsu: "M-3", clawback: "M-9", paid: "M-1", tax: "M-4", premiums: "M-5.2",
  afterTax: "M-1", retirement: "M-5.1", perks: "M-5.3", hsa: "M-5.2", oop: "M-5.2", totalRewards: "M-1", rent: "M-6.2", prices: "M-6.1",
  total: "M-6.3", spend: "M-6.3", saved: "M-6.3",
};
const BRIDGE_NAME: Record<BridgeLine, string> = {
  letter: "offer letter", salary: "salary line", bonus: "bonus line", cash: "cash awards line", rsu: "RSU line", clawback: "clawback",
  paid: "paid-in-the-year subtotal", tax: "tax", premiums: "premiums", afterTax: "after-tax pay", retirement: "employer 401(k)",
  perks: "perks", hsa: "employer HSA", oop: "out-of-pocket costs", totalRewards: "total rewards", rent: "rent", prices: "price line",
  total: "total after rent", spend: "spending a month", saved: "saving a month",
};
const READ_ONLY_NAME: Record<string, string> = {
  also: "other inputs", cashAwards: "cash awards", retirement: "401(k)", health: "health plan", perks: "perks", employerState: "employer state",
  "costOfLiving.rentGrowth": "rent growth", "hours.weekly": "weekly hours",
};
const inputName = (path: string) => READ_ONLY_NAME[path] ?? HELP[helpKey(path)]?.label.toLowerCase() ?? path;
const ABOUT_NAME: Record<AboutField, string> = { filing: "your filing status", stay: "your stay", wages: "your other wages", prices: "the prices setting" };
const PART: Record<PvPart, { label: string; gloss: string }> = {
  gross: { label: "Gross pay", gloss: "salary, bonuses, cash awards and RSU vests paid in your stay" },
  tax: { label: "Tax", gloss: "federal, Social Security and Medicare, state and local: the offer's share of household tax each calendar year" },
  premiums: { label: "Health premiums", gloss: "your share, paid pre-tax" },
  takeHome: { label: "Take-home pay", gloss: "after-tax pay minus your own 401(k) and HSA contributions" },
  retirement: { label: "Vested employer 401(k)", gloss: "the match and other employer money you'd keep at the end of your stay" },
  perks: { label: "Perks", gloss: "tax-free benefits, at face value" },
  healthExtra: { label: "Health costs beyond premiums", gloss: "expected out-of-pocket spending minus the employer's HSA money" },
  savings: { label: "Planned savings", gloss: "your savings rate times take-home pay" },
  rent: { label: "Rent", gloss: "paid while you work there, rising at each lease anniversary" },
  faceValue: { label: "Saved, at face value", gloss: "money you don't spend locally: your 401(k) and HSA, the vested match, employer HSA, perks, planned savings" },
};
const LONG_TICK: Record<TickKind, string> = {
  recomputed: "recomputed", footed: "footed", crossFooted: "cross-footed", traced: "traced", default: "default", estimate: "estimate",
};
export const tickWord = (k: TickKind) => LONG_TICK[k];
const stepName = (b: Basis) => ({ cash: "After tax", totalRewards: "+ Benefits", colAdjustedTotal: "− Rent & prices", perHour: "Per hour" })[b];

const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const windowText = (row: { window: { start: string; end: string } }) =>
  `${longDate(row.window.start)} – ${longDate(dayBefore(row.window.end))}`;
const cityName = (code: string | null) => (code ? CITIES.find((c) => c.code === code)?.name ?? code : "");
/** A metro's first city: "New York-Newark-Jersey City, NY-NJ" -> "New York". */
const shortCity = (name: string) => name.split(/[-,]/)[0].trim();
const rate2 = (x: number) => `${(x * 100).toFixed(2)}%`;
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

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

/** The methodology section a figure's tickmark leads to. */
export function metricSection(id: MetricId, ctx: WorkContext): SectionId {
  const [head, a, b, c] = id.split(".");
  const basis = ctx.results?.view.basis;
  switch (head) {
    case "hero": case "stay": return basis === "perHour" ? "M-5.4" : "M-7.2";
    case "step": return a === "perHour" ? "M-5.4" : "M-7.2";
    case "pv": return SECTION_OF[b as ValueBasis];
    case "ph": case "avg": return "M-5.4";
    case "af": return "M-7.2";
    case "part": return "M-7.1";
    case "rpp": return "M-6.1";
    case "extra": return "M-5.5";
    case "ey": return !basis || basis === "perHour" ? "M-5.4" : SECTION_OF[basis];
    case "run": case "eysum": return "M-1";
    case "br": return BRIDGE_SECTION[c as BridgeLine];
    case "in": return inputSection(pathOf(id));
    case "about": return ABOUT_SECTION[a as AboutField];
  }
  throw new Error(`Unknown figure: ${id}`);
}

/** Builds a figure's derivation with the current values. Throws if the figure isn't on the page. */
export function derive(id: MetricId, ctx: WorkContext): Derivation {
  const [head, a, b, c] = id.split(".");
  const kind = metricKind(id, ctx);
  const section = metricSection(id, ctx);
  return { kind, section, ...build() };

  function build(): Work {
    switch (head) {
      case "hero": { const r = res(ctx); return marginWork(ctx, r.view.row.years, r.view.basis, id); }
      case "stay": return marginWork(ctx, Number(a), res(ctx).view.basis, id);
      case "step": return marginWork(ctx, res(ctx).view.row.years, a as Basis, id);
      case "pv": return pvWork(ctx, a as L, b as ValueBasis);
      case "ph": return perHourWork(ctx, a as L);
      case "avg": return averageWork(ctx, a as L, b as ValueBasis);
      case "af": return annuityWork(ctx, Number(a));
      case "part": return partWork(ctx, a as L, b as PvPart);
      case "rpp": return rppWork(ctx, a as L, b as "us" | "area");
      case "extra": return extraWork(ctx, a[0] as L, a[1] as L, b as "hours" | ValueBasis);
      case "ey": return yearWork(ctx, a as L, Number(b));
      case "run": return runningWork(ctx, a as L, Number(b));
      case "eysum": return yearsSumWork(ctx, a as L);
      case "br": return bridgeWork(ctx, a as L, Number(b), c as BridgeLine);
      case "in": return inputWork(ctx, a as L, pathOf(id));
      case "about": return aboutWork(ctx, a as AboutField);
    }
    throw new Error(`Unknown figure: ${id}`);
  }
}

/** What a figure is called in a sentence: "C's 4-year total", "the 4-year stay column". */
export function figureName(id: MetricId, ctx: WorkContext): string {
  const [head, a, b, c] = id.split(".");
  switch (head) {
    case "hero": return "the verdict";
    case "stay": return `the ${a}-year stay column`;
    case "step": return `the “${stepName(a as Basis)}” step`;
    case "pv": return `${a}'s ${ctx.results?.view.row.years ?? ""}-year total`;
    case "ph": return `${a}'s per hour`;
    case "avg": return `${a}'s average per hour`;
    case "af": return "the annuity factor";
    case "part": return `${a}'s ${PART[b as PvPart].label.toLowerCase()}`;
    case "rpp": return `${a}'s price index`;
    case "extra": return "the extra-hours line";
    case "ey": return `${a}'s year ${b} in L-1`;
    case "run": return `${a}'s running total through year ${b}`;
    case "eysum": return `${a}'s total in L-1`;
    case "br": return `the bridge's ${BRIDGE_NAME[c as BridgeLine]}`;
    case "in": return `${a}'s ${inputName(pathOf(id))}`;
    case "about": return ABOUT_NAME[a as AboutField];
  }
  return id;
}

/**
 * The popover's one line about highlighting: "Uses and ties to the highlighted figures: C's and A's
 * 4-year totals, the 4-year stay column and the “− Rent & prices” step." Only figures on the page
 * (`onPage`) are named.
 */
export function highlightedSentence(d: Derivation, ctx: WorkContext, onPage: (id: MetricId) => boolean = () => true): string {
  const uses = d.uses.filter(onPage);
  const ties = d.ties.filter(onPage);
  if (!uses.length && !ties.length) return "";
  // "C's 4-year total" and "A's 4-year total" read as "C's and A's 4-year totals".
  const names: string[] = [];
  const groups = new Map<string, string[]>();
  for (const id of [...uses, ...ties]) {
    const name = figureName(id, ctx);
    const m = name.match(/^([ABC])'s (.+)$/);
    if (!m) { if (!names.includes(name)) names.push(name); continue; }
    const key = `§${m[2]}`;
    if (!groups.has(key)) { groups.set(key, []); names.push(key); }
    if (!groups.get(key)!.includes(m[1])) groups.get(key)!.push(m[1]);
  }
  const words = names.map((n) => {
    if (!n.startsWith("§")) return n;
    const letters = groups.get(n)!;
    const what = n.slice(1);
    return letters.length === 1 ? `${letters[0]}'s ${what}` : `${join(letters.map((l) => `${l}'s`))} ${what.endsWith("total") ? `${what}s` : what}`;
  });
  const verb = uses.length && ties.length ? "Uses and ties to" : uses.length ? "Uses" : "Ties to";
  return `${verb} the highlighted figures: ${join(words)}.`;
}

// ---- lookups ----------------------------------------------------------------------------------

function res(ctx: WorkContext) {
  if (!ctx.results) throw new Error("Fill in at least two offers to see the comparison's work.");
  return ctx.results;
}
function rowFor(ctx: WorkContext, n: number): HorizonRow {
  const row = res(ctx).sweep.rows.find((r) => r.years === n);
  if (!row) throw new Error(`No ${n}-year stay in the comparison.`);
  return row;
}
function indexOf(ctx: WorkContext, letter: L): number {
  const i = res(ctx).letters.indexOf(letter);
  if (i < 0) throw new Error(`Offer ${letter} isn't in the comparison yet.`);
  return i;
}
/** Your stay's projection for one offer, when the worker has sent it for the stay on screen. */
function detailOf(ctx: WorkContext, letter: L): OfferDetail {
  const r = res(ctx);
  if (!r.detail || r.detail.years !== r.view.row.years) throw new Error("Still working this out…");
  return r.detail.offers[indexOf(ctx, letter)];
}
function yearOf(ctx: WorkContext, letter: L, n: number): EmploymentYearResult {
  const y = detailOf(ctx, letter).employmentYears[n - 1];
  if (!y || n > res(ctx).view.row.years) throw new Error(`Year ${n} isn't in your stay.`);
  return y;
}
function offerByLetter(ctx: WorkContext, letter: L): AppOffer | undefined {
  return ctx.offers.find((o) => o.letter === letter);
}
function rentEstimate(ctx: WorkContext, o: AppOffer | undefined): RentEstimate | null {
  return o?.draft.costOfLiving.area && o.draft.residence.state ? ctx.rents[rentKey(o.draft.costOfLiving.area, o.draft.residence.state)] ?? null : null;
}
function aboutIsDefault(h: AppHousehold, f: AboutField): boolean {
  switch (f) {
    case "filing": return h.filingStatus === DEFAULT_HOUSEHOLD.filingStatus;
    case "stay": return h.stayYears === DEFAULT_HOUSEHOLD.stayYears;
    case "wages": return h.otherWagesThisYear === DEFAULT_HOUSEHOLD.otherWagesThisYear;
    case "prices": return true;
  }
}
/** The ids that show the same number as (stay, basis): the hero, its stay cell and its pipeline step. */
function sameFigure(ctx: WorkContext, n: number, basis: Basis): MetricId[] {
  const v = res(ctx).view;
  return [
    ...(n === v.row.years && basis === v.basis ? ["hero" as const] : []),
    ...(basis === v.basis ? [`stay.${n}` as const] : []),
    ...(n === v.row.years ? [`step.${basis}` as const] : []),
  ];
}

// ---- prices: the BEA indexes, with enough decimals to foot -----------------------------------------

/**
 * The decimals for an offer's two BEA non-housing indexes: the fewest (3 to 6) at which every
 * "spending × U.S. ÷ local" in its derivations multiplies out to the dollar shown.
 */
function indexDigits(d: OfferDetail): number {
  const info = d.costOfLiving;
  if (!info) return 3;
  const f = info.nonHousingFactor;
  const checks: Array<[number, number]> = [];
  const pv = d.window.costOfLiving?.presentValue;
  if (pv) checks.push([pv.nonHousingLocal, pv.discretionaryReference], [pv.outOfPocketReference / f, pv.outOfPocketReference]);
  for (const y of d.employmentYears) {
    const c = y.costOfLiving;
    if (c) checks.push([c.nonHousingLocal - c.outOfPocketReference / f, c.discretionaryReference - c.outOfPocketReference]);
  }
  for (const digits of [3, 4, 5, 6]) {
    const us = Number(info.reference.nonHousing.toFixed(digits));
    const area = Number(info.area.nonHousing.toFixed(digits));
    if (checks.every(([x, y]) => Math.abs((Math.round(x) * us) / area - Math.round(y)) < 1)) return digits;
  }
  return 6;
}
function indexes(d: OfferDetail) {
  const info = d.costOfLiving!;
  const digits = indexDigits(d);
  return { us: info.reference.nonHousing.toFixed(digits), area: info.area.nonHousing.toFixed(digits), city: shortCity(info.area.name), info };
}
/** "× U.S. non-housing prices ÷ New York's", as two lines, each traced to BEA. */
function priceLines(d: OfferDetail, letter: L): WorkLine[] {
  const x = indexes(d);
  return [
    { op: "×", label: "U.S. non-housing prices (BEA)", value: x.us, ref: `rpp.${letter}.us` },
    { op: "÷", label: `${x.city} non-housing prices (BEA)`, value: x.area, ref: `rpp.${letter}.area` },
  ];
}

// ---- the lead: per month and per hour ------------------------------------------------------------

function marginWork(ctx: WorkContext, n: number, basis: Basis, self: MetricId): Work {
  const r = res(ctx);
  const row = rowFor(ctx, n);
  const lead = row.leads[basis];
  const values = row.values[basis];
  if (!lead || !values) throw new Error("This basis isn't available for these offers.");
  const W = r.letters[lead.winner];
  const R = r.letters[lead.runnerUp];
  const yours = n === r.view.row.years;
  const ties = sameFigure(ctx, n, basis).filter((t) => t !== self);
  const scope = `Base case · stay ${years(n)} (${windowText(row)})`;
  if (basis === "perHour") {
    const of = r.sweep.perHourOf === "colAdjustedTotal" ? "after rent, at U.S. prices" : "in total rewards";
    return {
      title: `${W} over ${R} · per hour worked`, scope: `${scope} · nominal`,
      lines: [
        { label: `${W}: per hour worked`, value: cents(values[lead.winner]), ...(yours ? { ref: `ph.${W}` as MetricId } : {}) },
        { op: "−", label: `${R}: per hour worked`, value: cents(values[lead.runnerUp]), ...(yours ? { ref: `ph.${R}` as MetricId } : {}) },
        { op: "=", label: "More per hour worked", value: cents(lead.margin), rule: "double" },
      ],
      notes: [
        `Per hour isn't discounted: it's each offer's ${n}-year total ${of}, as paid, divided by the hours worked in the window.`,
        "Hours are the softest input, so per hour is a lens, not the verdict: the other steps don't depend on them.",
      ],
      ties, uses: yours ? [`ph.${W}`, `ph.${R}`] : [],
    };
  }
  const months = 12 * n;
  const gap = values[lead.winner] - values[lead.runnerUp];
  const factor = row.annuityFactor;
  const perMonth = lead.perMonth ?? gap / factor;
  const rate = percent(r.sweep.discountRate);
  const terms = r.detail?.annuity[n];
  const span = terms?.length ? ` (${longDate(terms[0].date)} to ${longDate(terms[terms.length - 1].date)})` : "";
  const refFor = (letter: L): Partial<WorkLine> => (yours ? { ref: `pv.${letter}.${basis as ValueBasis}` } : {});
  return {
    title: `${W} over ${R} · ${BASIS_PHRASE[basis]}`, scope: `${scope} · today's dollars`,
    lines: [
      { label: `${W}: ${n}-year total, present value`, value: figure(values[lead.winner]), ...refFor(W) },
      { op: "−", label: `${R}: the same for ${R}`, value: figure(values[lead.runnerUp]), ...refFor(R) },
      { op: "=", label: "Present-value gap", value: figure(gap), rule: "single" },
      { op: "÷", label: `Annuity factor: ${months} month-ends at ${rate} a year`, value: factor.toFixed(4), ref: `af.${n}` },
      { op: "=", label: `A month, for ${months} months`, value: dollars(perMonth), rule: "double" },
    ],
    // The reader's question first (why not just divide?), then what the factor is.
    notes: [
      factor < months - 0.005
        ? `Not ${dollars(gap)} ÷ ${months} = ${dollars(gap / months)}: later dollars are worth less today, so it takes ${dollars(perMonth)} `
          + `a month, every month for ${months} months, to be worth ${dollars(gap)} today.`
        : `Here the factor is ${factor.toFixed(4)}, about the number of months, so the monthly figure is close to ${dollars(gap)} ÷ ${months}.`,
      `The annuity factor is what $1 paid on the last day of each month of the stay${span} is worth today, ${longDate(r.sweep.valuationDate)}: `
        + `each month's dollar is discounted at ${rate} a year for the time until it's paid, and the ${months} values are added up.`,
    ],
    ties, uses: yours ? [`pv.${W}.${basis as ValueBasis}`, `pv.${R}.${basis as ValueBasis}`] : [],
  };
}

function annuityWork(ctx: WorkContext, n: number): Work {
  const r = res(ctx);
  const row = rowFor(ctx, n);
  const terms = r.detail?.annuity[n];
  if (!terms) throw new Error("Still working this out…");
  const rate = percent(r.sweep.discountRate);
  const line = (t: (typeof terms)[number], op?: WorkLine["op"]): WorkLine =>
    ({ ...(op ? { op } : {}), label: longDate(t.date), note: `${figure(t.days)} days from today`, value: t.factor.toFixed(4) });
  const shown = terms.length <= 6 ? terms.map((t, i) => line(t, i ? "+" : undefined))
    : [line(terms[0]), line(terms[1], "+"), line(terms[2], "+"),
      // The middle months are shown as one line: the rest of the total, so the column foots as displayed.
      { op: "+" as const, label: `… ${terms.length - 5} more month-ends`, value: (Number(row.annuityFactor.toFixed(4))
        - [0, 1, 2, terms.length - 2, terms.length - 1].reduce((s, k) => s + Number(terms[k].factor.toFixed(4)), 0)).toFixed(4) },
      line(terms[terms.length - 2], "+"), line(terms[terms.length - 1], "+")];
  return {
    title: `Annuity factor · stay ${years(n)} at ${rate}`, scope: `${terms.length} month-ends, ${windowText(row)}`,
    lines: [...shown, { op: "=", label: "Annuity factor", value: row.annuityFactor.toFixed(4), rule: "double" }],
    notes: [
      `Each month-end's factor is (1 + ${rate})^−(days from today ÷ 365.25): what $1 paid that day is worth today, ${longDate(r.sweep.valuationDate)}.`,
      "Dividing a present-value gap by the sum gives the level amount, paid at each month's end, that's worth the gap today. "
        + "Every payment and vest in the comparison is discounted the same way.",
    ],
    ties: [], uses: [],
  };
}

// ---- an offer's totals ---------------------------------------------------------------------------

function pvWork(ctx: WorkContext, letter: L, basis: ValueBasis): Work {
  const r = res(ctx);
  const d = detailOf(ctx, letter);
  const w = d.window;
  const n = r.view.row.years;
  const pv = w.presentValue!;
  const ben = w.benefits.presentValue!;
  const scope = `Base case · stay ${years(n)} (${windowText(r.view.row)}) · present value as of ${longDate(r.sweep.valuationDate)}`;
  const title = `${letter} · ${n}-year ${TOTAL_NAME[basis]}`;
  const discountNote = `Present value: each payment is discounted from its date to today at ${percent(r.sweep.discountRate)} a year, so later pay counts for less.`;
  if (basis === "cash") {
    return {
      title, scope,
      lines: [
        { label: PART.gross.label, value: figure(pv.gross), ref: `part.${letter}.gross` },
        { op: "−", label: PART.tax.label, value: figure(pv.tax), ref: `part.${letter}.tax` },
        ...(pv.premiums ? [{ op: "−" as const, label: PART.premiums.label, value: figure(pv.premiums), ref: `part.${letter}.premiums` as MetricId }] : []),
        { op: "=", label: "After-tax pay", value: figure(pv.afterTaxComp), rule: "double" },
      ],
      notes: [discountNote, `As paid, without discounting: ${dollars(w.nominal.afterTaxComp)}.`],
      ties: [], uses: [`in.${letter}.salary.annual`, `in.${letter}.bonus.amount`, `in.${letter}.costOfLiving.area`, `in.${letter}.startDate`],
    };
  }
  const healthExtra = ben.healthNet - pv.premiums;
  if (basis === "totalRewards") {
    const adds: WorkLine[] = [
      ...(ben.retirement ? [{ op: "+" as const, label: PART.retirement.label, value: figure(ben.retirement), ref: `part.${letter}.retirement` as MetricId }] : []),
      ...(ben.perks ? [{ op: "+" as const, label: PART.perks.label, value: figure(ben.perks), ref: `part.${letter}.perks` as MetricId }] : []),
      ...(Math.abs(healthExtra) >= 0.5 ? [{ op: healthExtra > 0 ? "−" as const : "+" as const, label: PART.healthExtra.label,
        value: figure(Math.abs(healthExtra)), ref: `part.${letter}.healthExtra` as MetricId }] : []),
    ];
    return {
      title, scope,
      lines: [
        { label: "After-tax pay", value: figure(pv.afterTaxComp), ref: `pv.${letter}.cash` },
        ...adds,
        { op: "=", label: "Total rewards", value: figure(w.totalRewards.presentValue!), rule: "double" },
      ],
      notes: [
        adds.length ? "Total rewards adds the benefits that are worth money to you and takes out health costs beyond the premiums."
          : `Nothing to add: offer ${letter} has no 401(k), perks or health costs entered (quick mode doesn't ask for them yet).`,
        discountNote,
      ],
      ties: [], uses: [`in.${letter}.also`],
    };
  }
  const col = w.costOfLiving?.presentValue;
  const info = d.costOfLiving;
  if (!col || !info) throw new Error(`Offer ${letter} needs a city for this basis.`);
  const x = indexes(d);
  const f = info.nonHousingFactor;
  const oopLocal = col.outOfPocketReference / f;
  const check = w.totalRewards.presentValue! - col.rent + (f - 1) * (col.nonHousingLocal - oopLocal);
  return {
    title, scope: `${scope} · U.S.-average dollars`,
    lines: [
      { label: PART.takeHome.label, value: figure(pv.takeHome), ref: `part.${letter}.takeHome` },
      ...(col.savings ? [{ op: "−" as const, label: PART.savings.label, value: figure(col.savings), ref: `part.${letter}.savings` as MetricId }] : []),
      { op: "−", label: PART.rent.label, value: figure(col.rent), ref: `part.${letter}.rent` },
      { op: "=", label: `Spending money after rent, at ${x.city} prices`, value: figure(col.nonHousingLocal), rule: "single" },
      ...priceLines(d, letter),
      { op: "=", label: "The same spending, at U.S. prices", value: figure(col.discretionaryReference), rule: "single" },
      ...(col.outOfPocketReference ? [{ op: "−" as const, label: "Out-of-pocket health costs, at U.S. prices", value: figure(col.outOfPocketReference),
        note: `${figure(oopLocal)} × ${x.us} ÷ ${x.area}` }] : []),
      { op: "+", label: PART.faceValue.label, value: figure(col.faceValue), ref: `part.${letter}.faceValue` },
      { op: "=", label: "After rent, at U.S. prices", value: figure(col.total), rule: "double" },
    ],
    notes: [
      "Spending money is local; saved money isn't. What's left to spend after rent is priced as in an average U.S. city; what you save counts at face value.",
      `It ties to total rewards: ${figure(w.totalRewards.presentValue!)} − rent ${figure(col.rent)} + (${x.us} ÷ ${x.area} − 1) × `
        + `(spending ${figure(col.nonHousingLocal)} − out-of-pocket ${figure(oopLocal)}) = ${figure(check)}.`,
      discountNote,
    ],
    ties: [], uses: [`in.${letter}.costOfLiving.monthlyRent`, `in.${letter}.costOfLiving.area`],
  };
}

function perHourWork(ctx: WorkContext, letter: L): Work {
  const r = res(ctx);
  const row = r.view.row;
  const i = indexOf(ctx, letter);
  if (!row.hours || !row.values.perHour) throw new Error("Per hour needs hours for every offer.");
  const of = r.sweep.perHourOf;
  const hours = offerByLetter(ctx, letter)?.draft.hours;
  return {
    title: `${letter} · per hour worked`, scope: `Base case · stay ${years(row.years)} (${windowText(row)}) · nominal`,
    lines: [
      { label: `${row.years}-year total ${BASIS_PHRASE[of]}, as paid`, value: figure(row.nominal[of]![i]) },
      { op: "÷", label: "Hours worked in the window", value: figure(row.hours[i]), ...(hours?.weekly ? {
        note: `${hours.weekly.base} a week × ${hours.weeksPerYear ?? 50} weeks a year`, ref: `in.${letter}.also` as MetricId } : {}) },
      { op: "=", label: "Per hour worked", value: cents(row.values.perHour[i]), rule: "double" },
    ],
    notes: ["Per hour isn't discounted: dollars as paid over the stay, divided by the hours worked in it. A later start means fewer hours in the window."],
    ties: [], uses: [`in.${letter}.also`],
  };
}

function averageWork(ctx: WorkContext, letter: L, basis: ValueBasis): Work {
  const row = res(ctx).view.row;
  const i = indexOf(ctx, letter);
  if (!row.hours || !row.nominal[basis]) throw new Error("Needs hours for every offer.");
  return {
    title: `${letter} · per hour worked, ${BASIS_PHRASE[basis]}`, scope: `Base case · stay ${years(row.years)} · nominal`,
    lines: [
      { label: `${row.years}-year total ${BASIS_PHRASE[basis]}, as paid`, value: figure(row.nominal[basis]![i]) },
      { op: "÷", label: "Hours worked in the window", value: figure(row.hours[i]), ref: `in.${letter}.also` },
      { op: "=", label: "Per hour worked, on average", value: cents(row.nominal[basis]![i] / row.hours[i]), rule: "double" },
    ],
    notes: ["The average over every hour worked, to set against what the extra hours pay."],
    ties: [], uses: [`in.${letter}.also`],
  };
}

function partWork(ctx: WorkContext, letter: L, part: PvPart): Work {
  const r = res(ctx);
  const w = detailOf(ctx, letter).window;
  const [nominal, pv] = partValues(w, part);
  const p = PART[part];
  return {
    title: `${letter} · ${p.label.toLowerCase()} over your stay`, scope: `Base case · stay ${years(r.view.row.years)} (${windowText(r.view.row)})`,
    lines: [
      { label: "As paid (nominal)", value: figure(nominal) },
      { label: `Present value today, at ${percent(r.sweep.discountRate)} a year`, value: figure(pv), rule: "single" },
    ],
    notes: [
      `${p.label}: ${p.gloss}.`,
      nominal ? `Each amount is discounted from its date to today, ${longDate(r.sweep.valuationDate)}: `
        + `$1 paid a year from now is worth $${(1 / (1 + r.sweep.discountRate)).toFixed(4)} today.` : "None entered for this offer.",
    ],
    ties: [], uses: part === "rent" ? [`in.${letter}.costOfLiving.monthlyRent`] : part === "gross" ? [`in.${letter}.salary.annual`, `in.${letter}.bonus.amount`] : [],
  };
}

function partValues(w: WindowTotals, part: PvPart): [number, number] {
  const cash = (k: keyof CashTotals): [number, number] => [w.nominal[k], w.presentValue![k]];
  const col = (k: "savings" | "rent" | "faceValue"): [number, number] =>
    [w.costOfLiving?.nominal[k] ?? 0, w.costOfLiving?.presentValue?.[k] ?? 0];
  switch (part) {
    case "gross": case "tax": case "premiums": case "takeHome": return cash(part);
    case "retirement": case "perks": return [w.benefits.nominal[part], w.benefits.presentValue![part]];
    case "healthExtra": return [w.benefits.nominal.healthNet - w.nominal.premiums, w.benefits.presentValue!.healthNet - w.presentValue!.premiums];
    case "savings": case "rent": case "faceValue": return col(part);
  }
}

function rppWork(ctx: WorkContext, letter: L, which: "us" | "area"): Work {
  const d = detailOf(ctx, letter);
  const info = d.costOfLiving;
  if (!info) throw new Error(`Offer ${letter} needs a city.`);
  const p: RppUsed = which === "us" ? info.reference : info.area;
  const x = indexes(d);
  const name = which === "us" ? "United States" : p.name;
  return {
    title: `${name} · non-housing prices`, scope: `BEA Regional Price Parities, ${info.rppVintage.dataYear} · U.S. all items = 100`,
    lines: [
      { label: "All items", value: p.allItems.toFixed(3), tick: "traced" },
      { op: "−", label: "0.16 × housing rents", value: (0.16 * p.housing).toFixed(3), note: `housing rents ${p.housing.toFixed(3)}`, tick: "traced" },
      { op: "=", label: "Everything but rent, weighted", value: (p.allItems - 0.16 * p.housing).toFixed(3), rule: "single" },
      { op: "÷", label: "Its weight", value: "0.84" },
      { op: "=", label: "Non-housing prices", value: which === "us" ? x.us : x.area, rule: "double" },
    ],
    notes: [
      `Traced to BEA's Regional Price Parities: all items and housing rents are BEA's published indexes for ${name}, `
        + `${info.rppVintage.dataYear}. ${info.rppVintage.release}`,
      "Rent is counted separately, at what you'd pay, so only prices other than rent restate your spending. 16% is housing rents' share of BEA's price weights.",
    ],
    ties: [], uses: which === "area" ? [`in.${letter}.costOfLiving.area`] : [],
  };
}

// ---- pay per extra hour --------------------------------------------------------------------------

function extraWork(ctx: WorkContext, more: L, fewer: L, focus: "hours" | ValueBasis): Work {
  const row = res(ctx).view.row;
  const m = indexOf(ctx, more);
  const f = indexOf(ctx, fewer);
  const pair = row.extraHours.find((x) => x.more === m && x.fewer === f);
  if (!pair || !row.hours) throw new Error("These offers' hours don't differ enough to compare.");
  const n = row.years;
  const lines: WorkLine[] = [
    { label: `${more}: hours worked in your stay`, value: figure(row.hours[m]), ref: `in.${more}.also` },
    { op: "−", label: `${fewer}: hours worked`, value: figure(row.hours[f]), ref: `in.${fewer}.also` },
    { op: "=", label: "Extra hours", value: figure(row.hours[m] - row.hours[f]), rule: "single" },
    { op: "÷", label: `${n} ${n === 1 ? "year" : "years"}`, value: String(n) },
    { op: "=", label: "Extra hours a year", value: figure(pair.hoursPerYear), rule: "double" },
  ];
  const notes = ["Nominal, like per hour: dollars as paid over your stay, not present values."];
  if (focus !== "hours") {
    const v = row.nominal[focus]!;
    const gap = v[m] - v[f];
    const rate = pair.perExtraHour[focus];
    lines.push(
      { label: `${more}: ${n}-year total ${BASIS_PHRASE[focus]}, as paid`, value: figure(v[m]), rule: "single" },
      { op: "−", label: `${fewer}: the same`, value: figure(v[f]) },
      { op: "=", label: gap >= 0 ? `${more} pays more` : `${more} pays less`, value: signed(gap), rule: "single" },
      ...(rate !== undefined
        ? [{ op: "÷" as const, label: "Extra hours", value: figure(row.hours[m] - row.hours[f]) },
          { op: "=" as const, label: "Each extra hour pays", value: cents(rate), rule: "double" as const }]
        : [{ op: "÷" as const, label: `${n} ${n === 1 ? "year" : "years"}`, value: String(n) },
          { op: "=" as const, label: "A year", value: signed(pair.gapPerYear[focus]!), rule: "double" as const }]),
    );
    notes.push(rate !== undefined
      ? `Compare it with ${more}'s average per hour on the same basis: if the extra hours pay less than the average, they're cheaper hours.`
      : `${more} asks more hours and pays less ${BASIS_PHRASE[focus]}, so there's no per-hour figure: the extra hours cost you money on this basis.`);
  }
  return {
    title: `${more}'s extra hours, against ${fewer}`, scope: `Base case · stay ${years(n)} (${windowText(row)}) · nominal`,
    lines, notes, ties: [], uses: [`in.${more}.also`, `in.${fewer}.also`],
  };
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

const BASIS_TOTAL_LINE: Record<ValueBasis, BridgeLine> = { cash: "afterTax", totalRewards: "totalRewards", colAdjustedTotal: "total" };

function yearWork(ctx: WorkContext, letter: L, n: number): Work {
  const r = res(ctx);
  const y = yearOf(ctx, letter, n);
  const basis = r.view.basis;
  const scope = `Base case · year ${n} (${longDate(y.start)} – ${longDate(dayBefore(y.end))}) · dollars as paid that year`;
  const br = (line: BridgeLine) => `br.${letter}.${n}.${line}` as MetricId;
  const b = bridge(ctx, letter, n);
  const row = (line: BridgeLine) => b.rows.find((x) => x.line === line);
  const lineFor = (line: BridgeLine, op?: WorkLine["op"]): WorkLine[] => {
    const x = row(line);
    return x ? [{ ...(op ? { op } : {}), label: x.label[0].toUpperCase() + x.label.slice(1), value: figure(Math.abs(x.value)), ref: br(line) }] : [];
  };
  const signedLine = (line: BridgeLine): WorkLine[] => {
    const x = row(line);
    return x ? lineFor(line, x.value < 0 ? "−" : "+") : [];
  };
  if (basis === "perHour") {
    const of = r.sweep.perHourOf;
    const total = of === "colAdjustedTotal" ? y.costOfLiving?.total : y.totalRewards;
    if (total === undefined || !y.hours) throw new Error("Needs hours and a city for this offer.");
    return {
      title: `${letter} · year ${n} · per hour worked`, scope,
      lines: [
        { label: `Year ${n} ${BASIS_PHRASE[of]}`, value: figure(total), ref: br(BASIS_TOTAL_LINE[of]) },
        { op: "÷", label: "Hours worked in the year", value: figure(y.hours), ref: `in.${letter}.also` },
        { op: "=", label: "Per hour worked", value: cents(total / y.hours), rule: "double" },
      ],
      notes: ["Each year is in that year's dollars; the verdict's figures are for the whole stay."],
      ties: [], uses: [],
    };
  }
  const value = yearValue(y, basis, r.sweep.perHourOf)!;
  const lines: WorkLine[] = basis === "cash"
    ? [...lineFor("paid"), ...signedLine("tax"), ...signedLine("premiums")]
    : basis === "totalRewards"
      ? [...lineFor("afterTax"), ...signedLine("retirement"), ...signedLine("perks"), ...signedLine("hsa"), ...signedLine("oop")]
      : [...lineFor("totalRewards"), ...signedLine("rent"), ...signedLine("prices")];
  lines.push({ op: "=", label: TOTAL_NAME[basis][0].toUpperCase() + TOTAL_NAME[basis].slice(1), value: figure(value), rule: "double" });
  return {
    title: `${letter} · year ${n} · ${TOTAL_NAME[basis]}`, scope,
    lines,
    notes: ["Each year is in that year's dollars, as paid; the verdict discounts every payment to today. The bridge under the chart has every line."],
    ties: [br(BASIS_TOTAL_LINE[basis])], uses: [],
  };
}

function runningWork(ctx: WorkContext, letter: L, n: number): Work {
  const b = byYear(ctx, letter);
  const upTo = b.years.filter((y) => y.n <= n);
  return {
    title: `${letter} · running total through year ${n}`, scope: `Base case · ${TOTAL_NAME[res(ctx).view.basis as ValueBasis] ?? ""} · dollars as paid`,
    lines: [
      ...upTo.map((y, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `Year ${y.n}`, value: figure(y.value), ref: `ey.${letter}.${y.n}` })),
      { op: "=", label: `Through year ${n}`, value: figure(upTo.reduce((s, y) => s + y.value, 0)), rule: "double" },
    ],
    notes: ["The running total shows when one offer catches up with another. It's as paid, not discounted."],
    ties: [], uses: upTo.map((y) => `ey.${letter}.${y.n}` as MetricId),
  };
}

function yearsSumWork(ctx: WorkContext, letter: L): Work {
  const b = byYear(ctx, letter);
  if (b.sum === null || b.window === null) throw new Error("Per hour doesn't add up across years.");
  const after = b.window - b.sum;
  return {
    title: `${letter} · your stay, year by year`, scope: `Base case · ${TOTAL_NAME[res(ctx).view.basis as ValueBasis]} · dollars as paid`,
    lines: [
      ...b.years.map((y, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `Year ${y.n}`, value: figure(y.value), ref: `ey.${letter}.${y.n}` })),
      { op: "=", label: "The years, added", value: figure(b.sum), rule: "single" },
      ...(Math.abs(after) >= 1 ? [{ op: "−" as const, label: "After your stay's last day (not counted)", value: figure(-after) },
        { op: "=" as const, label: "Your stay, as paid", value: figure(b.window), rule: "double" as const }] : []),
    ],
    notes: [
      Math.abs(after) >= 1
        ? `${letter} starts after the earliest offer, so its last year runs past the end of your stay; that part isn't counted.`
        : "The years add up to your stay's total as paid.",
      "The rank list's figure is lower: it discounts each payment to today.",
    ],
    ties: [], uses: b.years.map((y) => `ey.${letter}.${y.n}` as MetricId),
  };
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
function eyOfDate(ys: EmploymentYearResult[], date: string): number {
  const i = ys.findIndex((y) => date > y.start && date <= y.end);
  return i >= 0 ? i + 1 : date === ys[0]?.start ? 1 : 0;
}

/** A bonus period counts from your start date: a period that began before it is prorated to the days you worked. */
const workedFrom = (d: OfferDetail, periodFrom: string) => (d.employmentYears[0] && periodFrom < d.employmentYears[0].start ? d.employmentYears[0].start : periodFrom);

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

function bridgeWork(ctx: WorkContext, letter: L, n: number, line: BridgeLine): Work {
  const b = bridge(ctx, letter, n);
  const d = detailOf(ctx, letter);
  const y = yearOf(ctx, letter, n);
  const o = offerByLetter(ctx, letter);
  const scope = `Base case · year ${n} (${longDate(b.start)} – ${longDate(dayBefore(b.end))}) · dollars as paid that year`;
  const title = (what: string) => `${letter} · year ${n} · ${what}`;
  const traced = o?.sample ? "Traced to a sample input (illustrative, not market data)." : "As you entered it.";
  const row = b.rows.find((r) => r.line === line);
  const basis = res(ctx).view.basis;
  const tieIf = (bases: Basis[]): MetricId[] => (bases.includes(basis) ? [`ey.${letter}.${n}`] : []);

  // A subtotal foots the lines since the one before it.
  if (row && (row.kind === "subtotal" || row.kind === "total")) {
    const at = b.rows.indexOf(row);
    let from = at - 1;
    while (from > 0 && b.rows[from].kind !== "subtotal" && b.rows[from].kind !== "letter") from--;
    const lines: WorkLine[] = b.rows.slice(from, at).map((r, i): WorkLine => ({
      ...(i ? { op: r.value < 0 ? "−" as const : "+" as const } : {}), label: r.label[0].toUpperCase() + r.label.slice(1),
      value: figure(i ? Math.abs(r.value) : r.value), ref: r.id,
    }));
    lines.push({ op: "=", label: row.label, value: figure(row.value), rule: "double" });
    return {
      title: title(row.label.toLowerCase()), scope, lines,
      notes: [line === "paid" ? "Footed: the offer letter, line by line to what's paid in the year." : "Footed: the lines above it, added."],
      ties: line === "afterTax" ? tieIf(["cash"]) : line === "totalRewards" ? tieIf(["totalRewards"]) : line === "total" ? tieIf(["colAdjustedTotal"]) : [],
      uses: [],
    };
  }
  switch (line) {
    case "letter": {
      const q = y.quoted;
      return {
        title: title("the offer letter"), scope,
        lines: [
          { label: "Salary at the year's start", value: figure(q.salary), ref: `in.${letter}.salary.annual` },
          ...(q.bonus ? [{ op: "+" as const, label: "Target bonus on it", value: figure(q.bonus), ref: `in.${letter}.bonus.amount` as MetricId }] : []),
          ...(q.cash ? [{ op: "+" as const, label: "Cash awards paid in the year", value: figure(q.cash), ref: `in.${letter}.also` as MetricId }] : []),
          ...(q.rsu ? [{ op: "+" as const, label: "New-hire RSUs due in the year, at grant value", value: figure(q.rsu), ref: `in.${letter}.also` as MetricId }] : []),
          { op: "=", label: "The offer letter's year", value: figure(y.quotedTC), rule: "double" },
        ],
        notes: ["What an offer letter quotes: no proration, payout timing, company vest dates, share-price growth or refreshers. The lines under it in the bridge are those differences."],
        ties: [], uses: [`in.${letter}.salary.annual`, `in.${letter}.bonus.amount`],
      };
    }
    case "salary": case "cash":
      return {
        title: title(line === "salary" ? "salary" : "cash awards"), scope,
        lines: [
          { label: "In the offer letter", value: figure(y.quoted[line]) },
          { label: `Paid in year ${n}`, value: figure(y.gross[line]) },
          { op: "=", label: "Difference", value: signed(y.gross[line] - y.quoted[line]), rule: "double" },
        ],
        notes: [line === "salary" ? "Salary accrues by calendar month at the rate in effect, so a raise during the year shows here."
          : "Cash awards count in the year they're paid."],
        ties: [], uses: [],
      };
    case "bonus": {
      const paid = d.bonuses.filter((x) => x.ey === n);
      return {
        title: title("bonus"), scope,
        lines: [
          ...paid.map((p, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}), label: `Paid ${longDate(p.date)}`,
            note: `for ${longDate(workedFrom(d, p.periodFrom))} – ${longDate(p.periodTo)}`, value: figure(p.gross) })),
          ...(paid.length ? [] : [{ label: `Bonus paid in year ${n}`, value: "0" }]),
          { op: "−", label: "Target bonus in the offer letter", value: figure(y.quoted.bonus), ref: `in.${letter}.bonus.amount`, rule: "single" },
          { op: "=", label: "Difference", value: signed(y.gross.bonus - y.quoted.bonus), rule: "double" },
        ],
        notes: [
          "Bonuses are paid once a year for the work before it, so the first one covers only the months you've worked, and each year's payout is for the year before.",
        ],
        ties: [], uses: [`in.${letter}.bonus.amount`],
      };
    }
    case "rsu": {
      const vests = d.rsus.filter((v) => v.ey === n);
      return {
        title: title("RSUs"), scope,
        lines: [
          ...vests.map((v, i): WorkLine => ({ ...(i ? { op: "+" as const } : {}),
            label: `${v.refresher ? "Refresher" : "New-hire"} tranche ${v.tranche} of ${v.tranches}, ${shortDate(v.date)}`,
            note: v.nominalDate ? `due ${shortDate(v.nominalDate)}; vests on the company's next vest date` : v.priceFactor !== 1 ? `× ${v.priceFactor.toFixed(4)} price growth` : undefined,
            value: figure(v.gross) })),
          ...(vests.length ? [] : [{ label: `RSUs vested in year ${n}`, value: "0" }]),
          { op: "−", label: "New-hire RSUs due in the letter's year", value: figure(y.quoted.rsu), ref: `in.${letter}.also`, rule: "single" },
          { op: "=", label: "Difference", value: signed(y.gross.rsu - y.quoted.rsu), rule: "double" },
        ],
        notes: ["RSUs count as pay on the day they vest and are assumed sold then. The letter counts each tranche on its schedule's date at grant value; "
          + "the company vests on its own dates, with share-price growth, and refreshers come on top."],
        ties: [], uses: [`in.${letter}.also`],
      };
    }
    case "clawback":
      return { title: title("clawback"), scope, lines: [{ label: "Repaid", value: figure(y.gross.clawback) }],
        notes: ["A sign-on or other award repaid on leaving early."], ties: [], uses: [] };
    case "tax": {
      const split = d.split.filter((s) => s.ey === n).sort((a, z) => a.year - z.year);
      const rates = d.taxYears.filter((t) => split.some((s) => s.year === t.year));
      const st = o?.draft.residence.state ?? "State";
      const local = o && inNyc(o.draft) ? "NYC" : "local";
      return {
        title: title("tax"), scope,
        lines: [
          ...split.map((s, i): WorkLine => {
            const t = d.taxYears.find((x) => x.year === s.year);
            return { ...(i ? { op: "+" as const } : {}), label: `On ${figure(s.gross)} paid in ${s.year}`, note: t ? `at ${rate2(t.rate)}` : undefined, value: figure(s.tax) };
          }),
          { op: "=", label: `Tax in year ${n}`, value: figure(y.tax), rule: "double" },
        ],
        notes: [
          "Each payment is taxed at its calendar year's rate for this offer: household tax with the offer minus without it, divided by the offer's pay that year.",
          ...rates.map((t) => `${t.year}: ${rate2(t.rate)} of ${figure(t.gross)} = federal income tax ${rate2(t.parts.federal / t.gross)}, `
            + `Social Security and Medicare ${rate2(t.parts.fica / t.gross)}, ${st} ${rate2(t.parts.state / t.gross)}`
            + `${t.parts.local ? `, ${local} ${rate2(t.parts.local / t.gross)}` : ""}${t.projectedLaw ? " (tax law projected from 2026)" : ""}.`),
        ],
        ties: [], uses: [`in.${letter}.costOfLiving.area`],
      };
    }
    case "premiums": case "perks": case "hsa": case "oop": {
      const v = line === "premiums" ? y.health.premiums : line === "perks" ? y.perks.face : line === "hsa" ? y.health.employerHsa : y.health.outOfPocket;
      const what = { premiums: "your health premiums", perks: "perks", hsa: "the employer's HSA money", oop: "expected out-of-pocket health costs" }[line];
      return {
        title: title(what), scope, lines: [{ label: what[0].toUpperCase() + what.slice(1), value: figure(v), ref: `in.${letter}.also`, tick: "traced" }],
        notes: [traced, line === "oop" ? "Your own estimate at medium usage, capped at the out-of-pocket maximum; held flat each year." : "Held flat each year."],
        ties: [], uses: [`in.${letter}.also`],
      };
    }
    case "retirement": {
      const ret = d.assumptions.find((a) => a.code === "retirement");
      const share = y.retirement.employerCredited ? y.retirement.employerVested / y.retirement.employerCredited : 0;
      return {
        title: title("employer 401(k)"), scope,
        lines: [
          { label: "Employer money credited in the year", value: figure(y.retirement.employerCredited) },
          { op: "×", label: "Vested by the end of your stay", value: percent(share) },
          { op: "=", label: "Counted", value: figure(y.retirement.employerVested), rule: "double" },
        ],
        notes: [ret?.code === "retirement"
          ? `Employer money is ${percent(ret.params.vestedShare)} vested after ${ret.params.completedYears} completed ${ret.params.completedYears === 1 ? "year" : "years"} by the end of your stay; unvested money is forfeited.`
          : "Only the vested share counts."],
        ties: [], uses: [`in.${letter}.also`],
      };
    }
    case "rent": {
      const info = d.costOfLiving!;
      const monthly = info.monthlyRent * (1 + info.rentGrowth) ** (n - 1);
      const rent = y.costOfLiving!.rent;
      const full = Math.abs(12 * monthly - rent) < 1;
      return {
        title: title("rent"), scope,
        lines: full
          ? [{ label: `Rent a month in year ${n}`, value: dollars(monthly), ref: `in.${letter}.costOfLiving.monthlyRent` },
            { op: "×", label: "Months", value: "12" },
            { op: "=", label: `Rent in year ${n}`, value: figure(rent), rule: "double" }]
          : [{ label: `Rent paid in year ${n}`, value: figure(rent), ref: `in.${letter}.costOfLiving.monthlyRent` }],
        notes: [`The first lease year's rent is ${dollars(info.monthlyRent)} a month, rising ${percent(info.rentGrowth)} at each anniversary of your start date `
          + `(${info.rentGrowthSource === "inflation" ? "the inflation rate" : "as entered"}). It's paid only while you work there.`],
        ties: [], uses: [`in.${letter}.costOfLiving.monthlyRent`],
      };
    }
    case "prices": {
      const c = y.costOfLiving!;
      const f = d.costOfLiving!.nonHousingFactor;
      const local = c.nonHousingLocal - c.outOfPocketReference / f;
      const atUs = c.discretionaryReference - c.outOfPocketReference;
      const x = indexes(d);
      return {
        title: title(`${x.city} prices`), scope,
        lines: [
          { label: `Spending after rent and health costs, at ${x.city} prices`, value: figure(local) },
          ...priceLines(d, letter),
          { op: "=", label: "The same spending, at U.S. prices", value: figure(atUs), rule: "single" },
          { op: "−", label: `At ${x.city} prices`, value: figure(local) },
          { op: "=", label: `${x.city} prices`, value: signed(atUs - local), rule: "double" },
        ],
        notes: ["Only spending money is restated: what's left after tax, your 401(k) and HSA, planned savings, rent and health costs. "
          + "Money you save counts at face value, and rent is already what you'd pay."],
        ties: [], uses: [`in.${letter}.costOfLiving.area`],
      };
    }
    case "spend": case "saved": {
      const c = y.costOfLiving!;
      return line === "spend"
        ? { title: title("spending money a month"), scope,
          lines: [
            { label: `Spending money after rent, at U.S. prices, year ${n}`, value: figure(c.discretionaryReference - c.outOfPocketReference) },
            { op: "÷", label: "Months", value: "12" },
            { op: "=", label: "A month", value: dollars(b.spend!), rule: "double" },
          ],
          notes: ["What's left each month for everything but rent and health costs, in U.S.-average dollars."], ties: [], uses: [] }
        : { title: title("saved a month"), scope,
          lines: [
            { label: `Saved in year ${n}, at face value`, value: figure(c.faceValue) },
            { op: "÷", label: "Months", value: "12" },
            { op: "=", label: "A month", value: dollars(b.saved!), rule: "double" },
          ],
          notes: ["Your 401(k) and HSA contributions, the vested match, employer HSA money, perks and planned savings: money not spent locally."],
          ties: [], uses: [] };
    }
  }
  throw new Error(`No ${line} line in year ${n}.`);
}

// ---- inputs ---------------------------------------------------------------------------------------

const SAMPLE_NOTE = "Traced to a sample input (illustrative, not market data).";

function inputWork(ctx: WorkContext, letter: L, path: string): Work {
  const o = offerByLetter(ctx, letter);
  if (!o) throw new Error(`There's no offer ${letter}.`);
  const d = o.draft;
  const traced = o.sample ? SAMPLE_NOTE : "As you entered it.";
  const edit: EditTarget = { letter, path };
  const title = (what: string) => `${letter} · ${what}`;
  const help = HELP[helpKey(path)];
  switch (path) {
    case "costOfLiving.area": {
      const nyc = inNyc(d);
      const state = d.residence.state;
      const where = `${cityName(d.costOfLiving.area)}${state ? ` · live in ${state}` : ""}${nyc ? ", inside New York City" : ""}`;
      return { title: title("where you'd live"), lines: [{ label: "City", value: where, tick: "traced" }],
        notes: [traced, `Taxed as a full-year resident of ${state ?? "that state"}${nyc ? " and New York City" : ""}; `
          + "spending is priced with this metro's BEA price level."], ties: [], uses: [], edit };
    }
    case "costOfLiving.monthlyRent": {
      const est = rentEstimate(ctx, o);
      const rent = d.costOfLiving.monthlyRent;
      if (rent !== null || !est) {
        return { title: title("rent"), lines: [{ label: "Rent a month", value: rent === null ? "—" : dollars(rent), tick: "traced" }],
          notes: [traced, "It rises at each lease anniversary while you work there, by the rent growth under Where you'd live (inflation, 2.5% a year, unless you change it)."],
          ties: [], uses: [], edit };
      }
      return {
        title: title("rent, estimated"),
        lines: est.source === "fmr"
          ? [{ label: `HUD FY${est.fiscalYear} Fair Market Rent, 1 bedroom`, value: dollars(est.monthlyRent), note: est.hudAreaName, tick: "traced" }]
          : [{ label: "U.S. median gross rent (ACS 2024)", value: dollars(est.anchorRent), tick: "traced" },
            { op: "×", label: "Housing price ratio (BEA)", value: est.housingRatio.toFixed(4), tick: "traced" },
            { op: "=", label: "Estimated rent a month", value: dollars(est.monthlyRent), rule: "double" }],
        notes: [
          est.source === "fmr"
            ? "HUD's Fair Market Rent is what recent movers pay for a typical 1-bedroom across the metro: the 40th percentile, utilities included."
            : "No HUD Fair Market Rent covers this area, so the estimate scales the U.S. median rent by BEA's housing price level.",
          "Metro-wide estimates are often below city-center rents: edit it to your actual rent.",
        ],
        ties: [], uses: [], edit,
      };
    }
    case "also": {
      const also = alsoCounted(d);
      return also.length
        ? { title: title("inputs quick mode doesn't show"), lines: also.map((x): WorkLine => ({ label: x })),
          notes: [o.sample ? SAMPLE_NOTE : "As you entered them.", "They still count. Detailed mode shows each one, where you can see and edit it."],
          ties: [], uses: [] }
        : { title: title("inputs quick mode doesn't show"), lines: [{ label: "None: only the fields above count for this offer" }],
          notes: ["Detailed mode adds raises, bonus timing, RSUs and hours, and shows the 401(k), health and perks."], ties: [], uses: [] };
    }
  }
  // At its default: the default, and why.
  const def = defaultFor(path);
  if (def && isDefault(d, path)) {
    return {
      title: title(inputName(path)), lines: [{ label: help?.label ?? inputName(path), value: def.shown(d), tick: "default" }],
      notes: [`A default, not something you entered. ${def.reason}`, "Edit it to change it; its help (ⓘ) can reset it to the default."],
      ties: [], uses: [], edit,
    };
  }
  return {
    title: title(inputName(path)), lines: inputLines(d, path),
    notes: [traced, ...(help ? [help.help.split(/(?<=[.])\s/)[0]] : [])], ties: [], uses: [], edit,
  };
}

/** An input's value as derivation lines: one line, or bear / base / bull when it has a range. */
function inputLines(d: OfferDraft, path: string): WorkLine[] {
  const key = helpKey(path);
  const v = getPath(d, path);
  const fmt = formatterFor(d, key);
  const label = HELP[key]?.label ?? inputName(path);
  const line = (l: string, value: string, note?: string): WorkLine => ({ label: l, value, tick: "traced", ...(note ? { note } : {}) });
  if (isRange(v)) {
    return hasRange(v) ? [line(`${label}, bear case`, fmt(v.bear)), line(`${label}, base case`, fmt(v.base)), line(`${label}, bull case`, fmt(v.bull))]
      : [line(label, fmt(v.base))];
  }
  switch (key) {
    case "salary.promotions":
      return d.salary.promotions.length ? d.salary.promotions.map((p, i) => line(`Promotion ${i + 1}`, p.stepUp === null ? "+—" : `+${percent(p.stepUp)}`,
        `on ${p.on ? longDate(p.on) : "—"}${p.scenarios && p.scenarios.length < 3 ? `, ${p.scenarios.join(" and ")} only` : ""}`)) : [line(label, "None")];
    case "equity.grants":
      return d.equity.grants.length ? d.equity.grants.map((g) => line(g.label || "RSU grant", g.value === null ? "—" : dollars(g.value), scheduleText(g.schedule)))
        : [line(label, "None")];
    case "equity.grants.schedule": case "equity.refreshers.schedule":
      return [line(label, scheduleText(v as ScheduleDraft))];
    case "equity.refreshers": return [line(label, refreshersText(d))];
    case "bonus.amounts":
      return d.bonus.amounts.length ? d.bonus.amounts.map((a, i) => line(`Year ${i + 1}${i === d.bonus.amounts.length - 1 ? ", and after" : ""}`,
        a ? rangeText(a, dollars) : "—")) : [line(label, "None")];
    case "bonus.amount": return [line("Target bonus", bonusText(d))];
    case "cashAwards": return [line("Cash awards", cashAwardsText(d))];
    case "retirement": return [line("401(k)", retirementText(d))];
    case "health": return [line("Health plan", healthText(d))];
    case "perks": return [line("Perks", perksText(d))];
    case "employerState": return [line("Employer state", employerStateText(d))];
    case "costOfLiving.rentGrowth": return [line("Rent growth", rentGrowthText(d, 0.025))];
    case "hours.weekly": return [line(label, "Not counted")];
  }
  if (v === null || v === undefined) return [line(label, "—")];
  if (typeof v === "boolean") return [line(label, v ? "Yes" : "No")];
  if (typeof v === "string") return [line(label, /^\d{4}-\d{2}-\d{2}$/.test(v) ? longDate(v) : v)];
  if (typeof v === "number") return [line(label, fmt(v))];
  if (typeof v === "object" && "month" in v && "day" in v) {
    const md = v as { month: number; day: number };
    return [line(label, `${MONTH_SHORT[md.month - 1] ?? "—"} ${md.day}`)];
  }
  return [line(label, "Entered")];
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isRange = (v: unknown): v is ByScenario => !!v && typeof v === "object" && "base" in v && "bear" in v;
const PERCENT_KEYS = new Set(["salary.raise", "equity.priceGrowth", "salary.promotions.stepUp", "costOfLiving.rentGrowth",
  "equity.grants.schedule.tranches.fraction", "equity.refreshers.schedule.tranches.fraction"]);
const MONTH_KEYS = new Set(["equity.refreshers.firstAfterMonths", "equity.refreshers.everyMonths", "equity.grants.schedule.tranches.month",
  "equity.refreshers.schedule.tranches.month"]);

/** How an input's numbers read: a percent, dollars, hours, weeks or months. */
function formatterFor(d: OfferDraft, key: string): (x: number) => string {
  if (PERCENT_KEYS.has(key) || (key === "bonus.amount" && bonusBasis(d.bonus) === "percentOfSalary")) return percent;
  if (key === "hours.weekly") return (x) => `${x} hours a week`;
  if (key === "hours.weeksPerYear") return (x) => `${x} weeks`;
  if (MONTH_KEYS.has(key)) return (x) => `${x} ${x === 1 ? "month" : "months"}`;
  return dollars;
}

function aboutWork(ctx: WorkContext, field: AboutField): Work {
  const h = ctx.household;
  const isDefault = aboutIsDefault(h, field);
  const tick: TickKind = isDefault ? "default" : "traced";
  switch (field) {
    case "filing":
      return { title: "Filing status", lines: [{ label: "Files as", value: { single: "Single", joint: "Married, filing jointly", headOfHousehold: "Head of household" }[h.filingStatus], tick }],
        notes: [isDefault ? "The default: most new grads file single." : "As you chose it.", "It sets the tax brackets and the standard deduction for every offer."],
        ties: [], uses: [], edit: { about: "filing" } };
    case "stay":
      return { title: "How long you expect to stay", lines: [{ label: "Stay", value: years(h.stayYears), tick }],
        notes: [isDefault ? "The default: a typical first-job tenure. The row under the verdict shows 2 to 5 years." : "As you chose it.",
          "Every offer is compared over the same stretch, starting on the earliest start date; pay after it isn't counted."],
        ties: [], uses: [], edit: { about: "stay" } };
    case "wages":
      return { title: `Other wages in ${ctx.wagesYear}`, lines: [{ label: "From another job", value: dollars(h.otherWagesThisYear), tick }],
        notes: [isDefault ? "The default: none." : "As you entered it.",
          `Pay from another job in ${ctx.wagesYear} is taxed in the same year, so it raises the new job's first-year tax.`],
        ties: [], uses: [], edit: { about: "wages" } };
    case "prices":
      return { title: "Prices in", lines: [{ label: "Dollars", value: "U.S. average", tick: "default" }],
        notes: ["The default: every offer's spending money is priced as in an average U.S. city, so offers in different cities compare in the same dollars."],
        ties: [], uses: [] };
  }
}
