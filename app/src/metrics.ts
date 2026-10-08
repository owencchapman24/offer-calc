import type { RentEstimate } from "../../src/col/rent";
import type { Basis, CashTotals, HorizonRow, HorizonSweep, ValueBasis, WindowTotals } from "../../src/offer/types";
import { alsoCounted, type AppHousehold, type AppOffer, DEFAULT_HOUSEHOLD, type Letter, NYC_METRO } from "./model";
import { rentKey, type StayDetail } from "./protocol";
import type { SectionId } from "./sections";
import { cents, dayBefore, dollars, figure, hours, longDate, percent, signed } from "./text";
import type { TickKind } from "./ui";
import type { VerdictView } from "./verdict";
import { CITIES } from "../../src/col/cities";

// Show the work (docs/ui-design.md §8, §9.1). Every figure on the page has a metric id; each id maps
// to a tickmark kind, a methodology section and a derivation built from the engine's numbers. Pure:
// no React. A unit test renders the schedules and fails if a figure's id lacks any of the three.

type L = Letter;
export type InputField = "salary" | "bonus" | "bonusTiming" | "city" | "start" | "rent" | "also";
export type AboutField = "filing" | "stay" | "wages" | "prices";
export type PvPart = "gross" | "tax" | "premiums" | "takeHome" | "retirement" | "perks" | "healthExtra" | "savings" | "rent" | "faceValue";

export type MetricId =
  | "hero" // the verdict: the lead a month (or an hour) on the selected basis, for your stay
  | `stay.${number}` // the "if you stay" row
  | `step.${Basis}` // the pipeline's steps, for your stay
  | `pv.${L}.${ValueBasis}` // an offer's total over your stay, present value
  | `ph.${L}` // an offer's dollars per hour worked
  | `avg.${L}.${ValueBasis}` // per hour worked on one dollar basis (pay per extra hour's comparison)
  | `af.${number}` // the annuity factor for a stay
  | `part.${L}.${PvPart}` // one part of a total, as paid and in present value
  | `factor.${L}` // the non-housing price factor
  | `extra.${L}${L}.${"hours" | ValueBasis}` // pay per extra hour: more-hours offer, other offer
  | `in.${L}.${InputField}` // an input in the ledger
  | `about.${AboutField}`; // an input in About you

export interface WorkLine {
  op?: "+" | "−" | "×" | "÷" | "=";
  label: string;
  /** The figure, formatted. */
  value?: string;
  /** Opens this figure's own derivation: its tickmark. */
  ref?: MetricId;
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
  ties: Array<{ label: string; id: MetricId }>;
  /** Figures on the page this one is built from: highlighted while it's open. */
  uses: MetricId[];
  /** For an input: the id of the field "Edit it" focuses. */
  edit?: string;
}

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

// ---- names ---------------------------------------------------------------------------------------

/** How a basis reads inside a sentence or a line. */
export const BASIS_PHRASE: Record<Basis, string> = {
  cash: "after tax", totalRewards: "in total rewards", colAdjustedTotal: "after rent, at U.S. prices", perHour: "per hour worked",
};
const TOTAL_NAME: Record<ValueBasis, string> = {
  cash: "after-tax pay", totalRewards: "total rewards", colAdjustedTotal: "after rent, at U.S. prices",
};
const SECTION_OF: Record<ValueBasis, SectionId> = { cash: "M-4", totalRewards: "M-5", colAdjustedTotal: "M-6.3" };
const INPUT_SECTION: Record<InputField, SectionId> = {
  salary: "M-2", bonus: "M-2", bonusTiming: "M-2", city: "M-6.1", start: "M-7.3", rent: "M-6.2", also: "M-5",
};
const ABOUT_SECTION: Record<AboutField, SectionId> = { filing: "M-4", stay: "M-7.3", wages: "M-4", prices: "M-6.1" };
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

const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const windowText = (row: { window: { start: string; end: string } }) =>
  `${longDate(row.window.start)} – ${longDate(dayBefore(row.window.end))}`;
const cityName = (code: string | null) => (code ? CITIES.find((c) => c.code === code)?.name ?? code : "");
/** A metro's first city: "New York-Newark-Jersey City, NY-NJ" -> "New York". */
const shortCity = (name: string) => name.split(/[-,]/)[0].trim();

// ---- the registry ------------------------------------------------------------------------------

/** A figure's tickmark: shown before its derivation is built. */
export function metricKind(id: MetricId, ctx: WorkContext): TickKind {
  const [head, a, b] = id.split(".");
  if (head === "in") {
    const o = offerByLetter(ctx, a as L);
    if (b === "bonusTiming") return "default";
    if (b === "rent") return o?.quick.rent === null && rentEstimate(ctx, o) ? "estimate" : "traced";
    return "traced";
  }
  if (head === "about") return aboutIsDefault(ctx.household, a as AboutField) ? "default" : "traced";
  return "recomputed";
}

/** The methodology section a figure's tickmark leads to. */
export function metricSection(id: MetricId, ctx: WorkContext): SectionId {
  const [head, a, b] = id.split(".");
  switch (head) {
    case "hero": return ctx.results?.view.basis === "perHour" ? "M-5.4" : "M-7.2";
    case "stay": return ctx.results?.view.basis === "perHour" ? "M-5.4" : "M-7.2";
    case "step": return a === "perHour" ? "M-5.4" : "M-7.2";
    case "pv": return SECTION_OF[b as ValueBasis];
    case "ph": case "avg": return "M-5.4";
    case "af": return "M-7.2";
    case "part": return "M-7.1";
    case "factor": return "M-6.1";
    case "extra": return "M-5.5";
    case "in": return INPUT_SECTION[b as InputField];
    case "about": return ABOUT_SECTION[a as AboutField];
  }
  throw new Error(`Unknown figure: ${id}`);
}

/** Builds a figure's derivation with the current values. Throws if the figure isn't on the page. */
export function derive(id: MetricId, ctx: WorkContext): Derivation {
  const [head, a, b] = id.split(".");
  const kind = metricKind(id, ctx);
  const section = metricSection(id, ctx);
  const d = build();
  return { kind, section, ...d };

  function build(): Omit<Derivation, "kind" | "section"> {
    switch (head) {
      case "hero": { const r = res(ctx); return marginWork(ctx, r.view.row.years, r.view.basis, id); }
      case "stay": return marginWork(ctx, Number(a), res(ctx).view.basis, id);
      case "step": return marginWork(ctx, res(ctx).view.row.years, a as Basis, id);
      case "pv": return pvWork(ctx, a as L, b as ValueBasis);
      case "ph": return perHourWork(ctx, a as L);
      case "avg": return averageWork(ctx, a as L, b as ValueBasis);
      case "af": return annuityWork(ctx, Number(a));
      case "part": return partWork(ctx, a as L, b as PvPart);
      case "factor": return factorWork(ctx, a as L);
      case "extra": return extraWork(ctx, a[0] as L, a[1] as L, b as "hours" | ValueBasis);
      case "in": return inputWork(ctx, a as L, b as InputField);
      case "about": return aboutWork(ctx, a as AboutField);
    }
    throw new Error(`Unknown figure: ${id}`);
  }
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
function detailOf(ctx: WorkContext, letter: L) {
  const r = res(ctx);
  if (!r.detail || r.detail.years !== r.view.row.years) throw new Error("Still working this out…");
  return r.detail.offers[indexOf(ctx, letter)];
}
function offerByLetter(ctx: WorkContext, letter: L): AppOffer | undefined {
  return ctx.offers.find((o) => o.letter === letter);
}
function rentEstimate(ctx: WorkContext, o: AppOffer | undefined): RentEstimate | null {
  return o?.quick.area && o.quick.state ? ctx.rents[rentKey(o.quick.area, o.quick.state)] ?? null : null;
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
function sameFigure(ctx: WorkContext, n: number, basis: Basis): Array<{ label: string; id: MetricId }> {
  const v = res(ctx).view;
  const out: Array<{ label: string; id: MetricId }> = [];
  if (n === v.row.years && basis === v.basis) out.push({ label: "the verdict", id: "hero" });
  if (basis === v.basis) out.push({ label: `If you stay ${years(n)}`, id: `stay.${n}` });
  if (n === v.row.years) out.push({ label: `the pipeline's “${stepName(basis)}” step`, id: `step.${basis}` });
  return out;
}
const stepName = (b: Basis) => ({ cash: "After tax", totalRewards: "+ Benefits", colAdjustedTotal: "− Rent & prices", perHour: "Per hour" })[b];

// ---- the lead: per month and per hour ------------------------------------------------------------

function marginWork(ctx: WorkContext, n: number, basis: Basis, self: MetricId): Omit<Derivation, "kind" | "section"> {
  const r = res(ctx);
  const row = rowFor(ctx, n);
  const lead = row.leads[basis];
  const values = row.values[basis];
  if (!lead || !values) throw new Error("This basis isn't available for these offers.");
  const W = r.letters[lead.winner];
  const R = r.letters[lead.runnerUp];
  const yours = n === r.view.row.years;
  const ties = sameFigure(ctx, n, basis).filter((t) => t.id !== self);
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
    notes: [
      `The annuity factor is what $1 paid on the last day of each month of the stay${span} is worth today, ${longDate(r.sweep.valuationDate)}: `
        + `each month's dollar is discounted at ${rate} a year for the time until it's paid, and the ${months} values are added up.`,
      factor < months - 0.005
        ? `Not ${dollars(gap)} ÷ ${months} = ${dollars(gap / months)}: later dollars are worth less today, so it takes ${dollars(perMonth)} `
          + `a month, every month for ${months} months, to be worth ${dollars(gap)} today.`
        : `Here the factor is ${factor.toFixed(4)}, about the number of months, so the monthly figure is close to ${dollars(gap)} ÷ ${months}.`,
    ],
    ties, uses: yours ? [`pv.${W}.${basis as ValueBasis}`, `pv.${R}.${basis as ValueBasis}`] : [],
  };
}

function annuityWork(ctx: WorkContext, n: number): Omit<Derivation, "kind" | "section"> {
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
      `Dividing a present-value gap by the sum gives the level amount, paid at each month's end, that's worth the gap today. `
        + `Every payment and vest in the comparison is discounted the same way.`,
    ],
    ties: [], uses: [],
  };
}

// ---- an offer's totals ---------------------------------------------------------------------------

function pvWork(ctx: WorkContext, letter: L, basis: ValueBasis): Omit<Derivation, "kind" | "section"> {
  const r = res(ctx);
  const d = detailOf(ctx, letter);
  const w = d.window;
  const n = r.view.row.years;
  const pv = w.presentValue!;
  const ben = w.benefits.presentValue!;
  const scope = `Base case · stay ${years(n)} (${windowText(r.view.row)}) · present value as of ${longDate(r.sweep.valuationDate)}`;
  const title = `${letter} · ${n}-year ${TOTAL_NAME[basis]}`;
  const discountNote = `Present value: each payment is discounted from its date to today at ${percent(r.sweep.discountRate)} a year, so later pay counts for less.`;
  const ties: Derivation["ties"] = [];
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
      ties, uses: [`in.${letter}.salary`, `in.${letter}.bonus`, `in.${letter}.city`, `in.${letter}.start`],
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
      ties, uses: [`in.${letter}.also`],
    };
  }
  const col = w.costOfLiving?.presentValue;
  const info = d.costOfLiving;
  if (!col || !info) throw new Error(`Offer ${letter} needs a city for this basis.`);
  const f = info.nonHousingFactor;
  const oopLocal = col.outOfPocketReference / f;
  const check = w.totalRewards.presentValue! - col.rent + (f - 1) * (col.nonHousingLocal - oopLocal);
  return {
    title, scope: `${scope} · U.S.-average dollars`,
    lines: [
      { label: PART.takeHome.label, value: figure(pv.takeHome), ref: `part.${letter}.takeHome` },
      ...(col.savings ? [{ op: "−" as const, label: PART.savings.label, value: figure(col.savings), ref: `part.${letter}.savings` as MetricId }] : []),
      { op: "−", label: PART.rent.label, value: figure(col.rent), ref: `part.${letter}.rent` },
      { op: "=", label: `Spending money after rent, at ${shortCity(info.area.name)} prices`, value: figure(col.nonHousingLocal), rule: "single" },
      { op: "×", label: "Price factor", value: f.toFixed(6), ref: `factor.${letter}`, note: `U.S. ${info.reference.nonHousing.toFixed(3)} ÷ ${info.area.nonHousing.toFixed(3)}` },
      { op: "=", label: "The same spending, at U.S. prices", value: figure(col.discretionaryReference) },
      ...(col.outOfPocketReference ? [{ op: "−" as const, label: "Out-of-pocket health costs, at U.S. prices", value: figure(col.outOfPocketReference),
        note: `${figure(oopLocal)} × ${f.toFixed(6)}` }] : []),
      { op: "+", label: PART.faceValue.label, value: figure(col.faceValue), ref: `part.${letter}.faceValue` },
      { op: "=", label: "After rent, at U.S. prices", value: figure(col.total), rule: "double" },
    ],
    notes: [
      "Spending money is local; saved money isn't. What's left to spend after rent is priced as in an average U.S. city; what you save counts at face value.",
      `It ties to total rewards: ${figure(w.totalRewards.presentValue!)} − rent ${figure(col.rent)} + (${f.toFixed(6)} − 1) × (spending ${figure(col.nonHousingLocal)} − out-of-pocket ${figure(oopLocal)}) = ${figure(check)}.`,
      discountNote,
    ],
    ties: [{ label: "total rewards, by the check above", id: `pv.${letter}.totalRewards` }],
    uses: [`in.${letter}.rent`, `in.${letter}.city`],
  };
}

function perHourWork(ctx: WorkContext, letter: L): Omit<Derivation, "kind" | "section"> {
  const r = res(ctx);
  const row = r.view.row;
  const i = indexOf(ctx, letter);
  if (!row.hours || !row.values.perHour) throw new Error("Per hour needs hours for every offer.");
  const of = r.sweep.perHourOf;
  const o = offerByLetter(ctx, letter);
  const weekly = o?.base?.hours;
  return {
    title: `${letter} · per hour worked`, scope: `Base case · stay ${years(row.years)} (${windowText(row)}) · nominal`,
    lines: [
      { label: `${row.years}-year total ${BASIS_PHRASE[of]}, as paid`, value: figure(row.nominal[of]![i]) },
      { op: "÷", label: "Hours worked in the window", value: figure(row.hours[i]), ...(weekly ? {
        note: `${weekly.weekly.base} a week × ${weekly.weeksPerYear ?? 50} weeks a year`, ref: `in.${letter}.also` as MetricId } : {}) },
      { op: "=", label: "Per hour worked", value: cents(row.values.perHour[i]), rule: "double" },
    ],
    notes: ["Per hour isn't discounted: dollars as paid over the stay, divided by the hours worked in it. A later start means fewer hours in the window."],
    ties: [], uses: [`in.${letter}.also`],
  };
}

function averageWork(ctx: WorkContext, letter: L, basis: ValueBasis): Omit<Derivation, "kind" | "section"> {
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

function partWork(ctx: WorkContext, letter: L, part: PvPart): Omit<Derivation, "kind" | "section"> {
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
    ties: [], uses: part === "rent" ? [`in.${letter}.rent`] : part === "gross" ? [`in.${letter}.salary`, `in.${letter}.bonus`] : [],
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

function factorWork(ctx: WorkContext, letter: L): Omit<Derivation, "kind" | "section"> {
  const info = detailOf(ctx, letter).costOfLiving;
  if (!info) throw new Error(`Offer ${letter} needs a city.`);
  const nh = (a: { allItems: number; housing: number }) => `(${a.allItems.toFixed(3)} − 0.16 × ${a.housing.toFixed(3)}) ÷ 0.84`;
  return {
    title: `${letter} · price factor`, scope: `BEA Regional Price Parities ${info.rppVintage.dataYear}`,
    lines: [
      { label: "U.S. non-housing price level", value: info.reference.nonHousing.toFixed(3), note: nh(info.reference) },
      { op: "÷", label: `${info.area.name}, non-housing`, value: info.area.nonHousing.toFixed(3), note: nh(info.area), ref: `in.${letter}.city` },
      { op: "=", label: "Price factor", value: info.nonHousingFactor.toFixed(6), rule: "double" },
    ],
    notes: [
      `Prices other than rent are ${info.nonHousingFactor < 1 ? "higher" : "lower"} in ${shortCity(info.area.name)} than in an average U.S. city, `
        + `so a dollar spent there buys what ${info.nonHousingFactor.toFixed(4)} buys at U.S.-average prices. Rent is counted separately, at what you'd pay.`,
      "Non-housing price level = (all items − 0.16 × housing) ÷ 0.84: 16% is housing rents' share of BEA's price weights.",
      `${info.rppVintage.release}`,
    ],
    ties: [], uses: [`in.${letter}.city`],
  };
}

// ---- pay per extra hour --------------------------------------------------------------------------

function extraWork(ctx: WorkContext, more: L, fewer: L, focus: "hours" | ValueBasis): Omit<Derivation, "kind" | "section"> {
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

// ---- inputs ---------------------------------------------------------------------------------------

const SAMPLE_NOTE = "Traced to a sample input (illustrative, not market data).";

function inputWork(ctx: WorkContext, letter: L, field: InputField): Omit<Derivation, "kind" | "section"> {
  const o = offerByLetter(ctx, letter);
  if (!o) throw new Error(`There's no offer ${letter}.`);
  const q = o.quick;
  const traced = o.sample ? SAMPLE_NOTE : "As you entered it.";
  const edit = `in-${letter}-${field}`;
  const title = (what: string) => `${letter} · ${what}`;
  switch (field) {
    case "salary":
      return { title: title("salary"), lines: [{ label: "Starting salary, per year, before tax", value: q.salary === null ? "—" : dollars(q.salary) }],
        notes: [traced, "Pay accrues by calendar month. Raises and promotions are separate inputs (detailed mode, coming soon)."], ties: [], uses: [], edit };
    case "bonus": {
      const b = q.bonus;
      const value = b.kind === "schedule" ? "by employment year" : b.value === null || b.value === 0 ? "none"
        : b.kind === "percent" ? `${b.value}% of salary` : `${dollars(b.value)} a year`;
      return { title: title("bonus"), lines: [{ label: "Target bonus", value }],
        notes: [traced, "The first bonus is prorated for the part of the year you work."], ties: [], uses: [], edit };
    }
    case "bonusTiming":
      return { title: title("bonus timing"), lines: [{ label: "Paid each year on", value: "Mar 15" }, { label: "For", value: "the prior calendar year" }],
        notes: ["A default, not something you entered: it's the most common pattern. Detailed mode (coming soon) will let you change it.",
          "A July start gets a partial first bonus about eight months later."], ties: [], uses: [], edit: `in-${letter}-bonus` };
    case "city": {
      const where = `${cityName(q.area)}${q.state ? ` · live in ${q.state}` : ""}${q.area === NYC_METRO && q.state === "NY" && q.nyc ? ", inside New York City" : ""}`;
      return { title: title("where you'd live"), lines: [{ label: "City", value: where }],
        notes: [traced, `Taxed as a full-year resident of ${q.state ?? "that state"}${q.nyc && q.area === NYC_METRO && q.state === "NY" ? " and New York City" : ""}; `
          + "spending is priced with this metro's BEA price level."], ties: [], uses: [], edit };
    }
    case "start":
      return { title: title("start date"), lines: [{ label: "First day of work", value: q.startDate ? longDate(q.startDate) : "—" }],
        notes: [traced, "Comparisons start on the earliest start date, so a later start counts as pay you don't get yet."], ties: [], uses: [], edit };
    case "rent": {
      const est = rentEstimate(ctx, o);
      if (q.rent !== null || !est) {
        return { title: title("rent"), lines: [{ label: "Rent a month", value: q.rent === null ? "—" : dollars(q.rent) }],
          notes: [traced, "It rises with inflation (2.5% a year) at each lease anniversary while you work there."], ties: [], uses: [], edit };
      }
      return {
        title: title("rent, estimated"),
        lines: est.source === "fmr"
          ? [{ label: `HUD FY${est.fiscalYear} Fair Market Rent, 1 bedroom`, value: dollars(est.monthlyRent), note: est.hudAreaName }]
          : [{ label: "U.S. median gross rent (ACS 2024)", value: dollars(est.anchorRent) },
            { op: "×", label: "Housing price ratio (BEA)", value: est.housingRatio.toFixed(4) },
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
      const also = alsoCounted(o);
      return also.length
        ? { title: title("inputs quick mode doesn't show"), lines: also.map((s) => ({ label: s })),
          notes: [SAMPLE_NOTE, "They still count. Detailed mode (coming soon) will let you see and edit them."], ties: [], uses: [] }
        : { title: title("inputs quick mode doesn't show"), lines: [{ label: "None: only the fields above count for this offer" }],
          notes: ["Detailed mode (coming soon) adds RSUs, 401(k), health, perks and hours."], ties: [], uses: [] };
    }
  }
}

function aboutWork(ctx: WorkContext, field: AboutField): Omit<Derivation, "kind" | "section"> {
  const h = ctx.household;
  const isDefault = aboutIsDefault(h, field);
  switch (field) {
    case "filing":
      return { title: "Filing status", lines: [{ label: "Files as", value: { single: "Single", joint: "Married, filing jointly", headOfHousehold: "Head of household" }[h.filingStatus] }],
        notes: [isDefault ? "The default: most new grads file single." : "As you chose it.", "It sets the tax brackets and the standard deduction for every offer."],
        ties: [], uses: [], edit: "about-filing" };
    case "stay":
      return { title: "How long you expect to stay", lines: [{ label: "Stay", value: years(h.stayYears) }],
        notes: [isDefault ? "The default: a typical first-job tenure. The row under the verdict shows 2 to 5 years." : "As you chose it.",
          "Every offer is compared over the same stretch, starting on the earliest start date; pay after it isn't counted."],
        ties: [], uses: [], edit: "stay" };
    case "wages":
      return { title: `Other wages in ${ctx.wagesYear}`, lines: [{ label: "From another job", value: dollars(h.otherWagesThisYear) }],
        notes: [isDefault ? "The default: none." : "As you entered it.",
          `Pay from another job in ${ctx.wagesYear} is taxed in the same year, so it raises the new job's first-year tax.`],
        ties: [], uses: [], edit: "about-wages" };
    case "prices":
      return { title: "Prices in", lines: [{ label: "Dollars", value: "U.S. average" }],
        notes: ["The default: every offer's spending money is priced as in an average U.S. city, so offers in different cities compare in the same dollars."],
        ties: [], uses: [] };
  }
}
