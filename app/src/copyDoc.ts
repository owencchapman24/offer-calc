import { DATA_YEARS } from "../../src/col/cities";
import { describeSchedule } from "../../src/format/schedule";
import type { AnnualBonus, Equity, ISODate, OfferInput, OfferWarning, ValueBasis, VestingSchedule } from "../../src/offer/types";
import { inSentence, rentTie, scalesText, tieView } from "./breakevenModel";
import { ownView, type OwnView, shareText, taxRateText } from "./breakdownModel";
import { CASES, caseChanges, changeText, dropText, hasRanges, riskCarriers, riskView } from "./cases";
import { asymmetries, asymmetryText } from "./comparability";
import { shownIndexes, shownStay, shownYears } from "./footing";
import { firstLastDay, forfeits, forfeitText, leaveAxis, leaveTerms, onAxis, worked as timeWorked } from "./leaveModel";
import {
  aboutIsDefault, type BridgeLine, detailOf, offerByLetter, ownOf, pricesOf, rentEstimate, rentNotes, res, shortCity, type WorkContext,
} from "./metrics";
import { bridge, cashName as cashNameOf, notesOf, ownShownYear, shownYearOf, yearNotes, yearValue } from "./byYearModel";
import {
  A2_LABEL, arrivalShown, arrivalsOf, benefitsOf, bonusTerms, centsText, cliffCost, cliffLines, cliffName, hundredOf, payRows, rateText,
  taxYearsOf,
} from "./partsModel";
import { ASSUMPTIONS, CITY_TAX, cityTax, type Letter } from "./model";
import { type Breakdown, type CompareRequest, cursorJobFor, type LeavePanel, type OfferDetail, type OfferTerms, termsJob, tieJob, type Ties } from "./protocol";
import { cents, dayBefore, dollars, figure, longDate, percent } from "./text";
import type { SlowJob, SlowState } from "./useEngine";
import { basisSaid, extraHoursView, marginText, perText, pipeline, placeOf, verdictSentence } from "./verdict";
import { withholdingParts } from "./warningAt";
import { stayWarnings, WARNING_KIND } from "./warningKinds";
import { KIND_TITLE, warningWords } from "./warningWords";
import { yearTable } from "./workpaper";
import { daysOffWords, daysText, unpaidVacationText, weeksText } from "./timeOffWords";
import { paidTimeOff } from "./partsModel";

// "Copy as document" (docs/copy-as-document-plan.md): the comparison as a 2-3 page summary someone who has never seen the tool can
// read, for the clipboard as HTML with a plain-text fallback, so it pastes into Google Docs, Word and email with its tables. Since
// stop 5C (docs/v2-plan.md, item 5) also one offer's breakdown, about 3 pages, or with two or more offers each breakdown and then the
// comparison ("both"). One document model (blocks), two renderers, so the two can't disagree. Every figure comes from the view model that draws it on the
// page; what the document adds keeps "the year figures as shown" (CLAUDE.md): a total is the lines above it as shown, and each
// calculation it states in words is listed in `worked`, which the tests check. No tickmarks, workpaper references or "basis".
// Loaded on the first click (App.tsx); no React.

export const SAMPLE_LINE = "Includes sample offers: illustrative inputs, not market data.";
/** One offer's breakdown, when the offer is a sample. */
export const SAMPLE_ONE = "A sample offer: illustrative inputs, not market data.";
const SITE = "https://offer-calc.vercel.app";
const DASH = "–";

// ---- the model ----------------------------------------------------------------------------------------------------------

/** A run of text: plain, bold, or a link (its text is its address). */
export type Run = string | { b: string } | { href: string };
export interface Row {
  label: string;
  cells: string[];
  /** A subtotal or total is the lines above it, as shown; a group row heads the rows after it; a key row is the verdict's. */
  kind?: "subtotal" | "total" | "group" | "key";
}
export interface Table {
  title?: string;
  head: string[];
  rows: Row[];
  /** Its figure columns add up: each subtotal and total is the lines above it (since the last subtotal), as shown. */
  foots?: boolean;
}
export type Block =
  | { kind: "title" | "meta" | "flag" | "heading"; text: string }
  /** A part of the document ("both"): an offer on its own, or the comparison. */
  | { kind: "part"; text: string }
  | { kind: "para" | "note"; runs: Run[] }
  | { kind: "list"; items: string[] }
  | { kind: "table"; table: Table };
/** A calculation the document states, as displayed: `of` combined by `op` is `is` (a percent: the quotient × 100). */
export interface Worked { op: "+" | "−" | "÷"; of: string[]; is: string; percent?: boolean }
export interface Doc { blocks: Block[]; worked: Worked[] }

/** Which document: one offer's breakdown, the comparison (two or more offers), or each breakdown and then the comparison. */
export type DocKind = "breakdown" | "comparison" | "both";
/**
 * How much of a breakdown, as Print… offers (2026-10-17): the summary (its bottom line, where the money goes, pay by year, the key
 * terms and the bad case, about 2 pages), or the full detail (every payment and cliff, leaving early, the benefits and tax by year).
 */
export type DocDetail = "summary" | "full";

/**
 * What the document needs beyond the page's context: the offers (every complete offer, in order, and their letters when there's no
 * comparison to read them from), and the last day for leaving early (L-4's, A-4's). `letter`: the breakdown's offer.
 */
export interface DocOptions {
  offers: OfferInput[]; at: ISODate; picked: boolean; kind?: DocKind; letter?: Letter; letters?: Letter[];
  /** A breakdown's (and "both"'s breakdowns'): the summary unless the full detail is asked for. */
  detail?: DocDetail;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const join = (xs: string[], and = "and") => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);
/** A dollar figure in a table, deductions in parentheses: "(41,484)". */
const paren = (v: number) => (Math.round(v) < 0 ? `(${figure(-v)})` : figure(v));
const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FILING = { single: "single", joint: "married, jointly", headOfHousehold: "head of household" } as const;
const COUNT = ["no", "one", "two", "three"];

/** A change from one figure to another, as shown: "+$9,127", with its percent: "+$9,127 (+8.3%)". */
function change(w: Worked[], from: string, to: string, withPercent: boolean): string {
  const a = num(from);
  const c = num(to) - a;
  const sign = c >= 0 ? "+" : "−";
  const text = `${sign}${dollars(Math.abs(c)).replace("−", "")}`;
  w.push({ op: "−", of: [to, from], is: text });
  if (!withPercent || !a) return text;
  const pct = `${sign}${(Math.abs(c / a) * 100).toFixed(1)}%`;
  w.push({ op: "÷", of: [text, from], is: pct, percent: true });
  return `${text} (${pct})`;
}

/** A figure as displayed, back to a number: "(41,484)" -> -41484, "$1,360" -> 1360, "−$510" -> -510, "8.3%" -> 8.3, "–" -> 0. */
export function num(shown: string): number {
  if (shown === DASH) return 0;
  const t = shown.replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/^[−-]/, "-").replace(/^\+/, "");
  const v = Number(t);
  if (Number.isNaN(v)) throw new Error(`Not a figure: ${shown}`);
  return v;
}

// ---- the document ------------------------------------------------------------------------------------------------------

export function buildDoc(ctx: WorkContext, opts: DocOptions): Doc {
  if (opts.kind === "breakdown") return ownDoc(ctx, opts, opts.letter ?? (opts.letters ?? res(ctx).letters)[0]);
  if (opts.kind === "both") return bothDoc(ctx, opts);
  const r = res(ctx);
  const v = r.view;
  const L = r.letters;
  const n = v.row.years;
  const blocks: Block[] = [];
  const worked: Worked[] = [];
  const add = (b: Block) => blocks.push(b);
  const sample = ctx.offers.some((o) => o.sample !== null);

  // ---- the header
  add({ kind: "title", text: `${cap(COUNT[L.length] ?? String(L.length))} job offers compared` });
  const starts = opts.offers.map((o) => o.startDate);
  const together = starts.every((s) => s === starts[0]);
  const all = L.length === 2 ? "both" : `all ${COUNT[L.length]}`;
  add({ kind: "meta", text: `Made with Offer Calc on ${longDate(ctx.today)}. Base case, if you stay ${years(n)}: ${longDate(v.row.window.start)}`
    + `${together ? `, when ${all} start,` : ""} to ${longDate(dayBefore(v.row.window.end))}.`
    + (together ? "" : ` ${L.map((l, i) => `${l} starts ${longDate(starts[i])}`).join(", ")}.`) });
  if (sample) add({ kind: "flag", text: SAMPLE_LINE });
  comparisonBody(ctx, opts, add, worked);
  closing(add);
  if (sample) add({ kind: "flag", text: SAMPLE_LINE });
  return { blocks, worked };
}

/** The comparison's seven sections. */
function comparisonBody(ctx: WorkContext, opts: DocOptions, add: Add, worked: Worked[]) {
  answer(ctx, add, worked);
  offersSection(ctx, comparisonScope(ctx, opts), add, "2. The offers, as entered");
  bridgeSection(ctx, add, worked);
  yearsSection(ctx, add, worked);
  tiesSection(ctx, opts, add, worked);
  leavingSection(ctx, opts, add, worked);
  assumptions(ctx, comparisonScope(ctx, opts), add, "7. Assumptions");
}

const closing = (add: Add) => add({ kind: "note", runs: [
  "Worked out in your browser by Offer Calc, ", { href: SITE }, ", from the inputs above; nothing was sent anywhere. How each figure is worked out: ",
  { href: `${SITE}/#/method` }, ". Not financial advice.",
] });

/**
 * What "as entered" and the assumptions speak of: the comparison's offers over its window, or one offer over its own stay (`own`:
 * its figures at its own city's prices, the total restated at the prices picked when `withRef`).
 */
interface Scope {
  letters: Letter[];
  offers: OfferInput[];
  details: OfferDetail[];
  years: number;
  discountRate: number;
  lastYear: number;
  anyRange: boolean;
  /** `summary`: its warnings that change the numbers go in the assumptions, as the full detail's section 6 isn't there. */
  own: { place: string; withRef: boolean; summary: boolean } | null;
}

function comparisonScope(ctx: WorkContext, opts: DocOptions): Scope {
  const r = res(ctx);
  return { letters: r.letters, offers: opts.offers, details: r.letters.map((l) => detailOf(ctx, l)), years: r.view.row.years,
    discountRate: r.sweep.discountRate, lastYear: Number(dayBefore(r.view.row.window.end).slice(0, 4)), anyRange: riskView(ctx).anyRange, own: null };
}

type Add = (b: Block) => void;

// ---- 1. The answer -----------------------------------------------------------------------------------------------------

function answer(ctx: WorkContext, add: Add, worked: Worked[]) {
  const r = res(ctx);
  const v = r.view;
  const n = v.row.years;
  const p = pricesOf(ctx);
  const lead = v.lead;
  add({ kind: "heading", text: "1. The answer" });
  const meaning = v.basis === "colAdjustedTotal" ? `That counts what's left to spend after tax and rent, priced as in ${p.city}, plus what you save`
    : v.basis === "cash" ? "That's pay after tax and health premiums"
    : v.basis === "totalRewards" ? "That's after-tax pay plus the employer 401(k), HSA money and perks, less out-of-pocket health costs"
    : `That's ${r.sweep.perHourOf === "colAdjustedTotal" ? `the total ${p.phrase}` : "total rewards"}, as paid, divided by the hours worked`;
  const third = r.letters.length === 3 ? ` ${v.ranks[2].letter} comes third.` : "";
  const dollarsToday = v.basis === "perHour" ? "" : ", in today's dollars";
  add({ kind: "para", runs: [{ b: verdictSentence(v) }, ` ${meaning}, over the ${years(n)}${dollarsToday}.${third}`] });

  // The pipeline in plain English: who pays more, and where the lead changes hands.
  const steps = v.steps.filter((s) => s.lead && s.lead.margin > 0);
  if (steps.length) {
    const winners = steps.map((s) => s.lead!.winnerLetter);
    const order = pipeline(p);
    const counted = (b: string) => order.find((x) => x.basis === b)!.counted;
    const first = `${winners[0]} ${steps[0].basis === "cash" ? "pays more" : `leads ${counted(steps[0].basis)}`}`;
    const turns = steps.slice(1).flatMap((s, i) => (s.lead!.winnerLetter !== winners[i] ? [`${s.lead!.winnerLetter} wins ${counted(s.basis)}`] : []));
    const head = winners.every((w) => w === winners[0]) ? `${winners[0]} leads on every count.` : `${[first, ...turns].join("; ")}.`;
    let detail = "";
    // Rent and prices turning the lead around: the swing, as the two leads shown add.
    const tr = steps.find((s) => s.basis === "totalRewards")?.lead;
    const col = steps.find((s) => s.basis === "colAdjustedTotal")?.lead;
    if (tr && col && tr.winner === col.runnerUp && tr.runnerUp === col.winner) {
      const a = marginText("totalRewards", tr);
      const b = marginText("colAdjustedTotal", col);
      const sum = dollars(num(a) + num(b));
      worked.push({ op: "+", of: [a, b], is: sum });
      detail += `Rent and prices cost ${tr.winnerLetter} about ${sum} a month more than ${col.winnerLetter} over your stay (${a} in total rewards + `
        + `${b} ${basisSaid(v, "colAdjustedTotal")}), which turns ${tr.winnerLetter}'s lead into ${col.winnerLetter}'s.`;
    }
    add({ kind: "para", runs: [{ b: head }, detail ? ` ${detail}` : ""] });
  }

  // Each step's totals: the pipeline as a table.
  const perHourOf = r.sweep.perHourOf;
  const titles: Record<string, string> = {
    cash: "After-tax pay", totalRewards: "Total rewards", colAdjustedTotal: cap(p.phrase),
    perHour: perHourOf === "colAdjustedTotal" ? `${cap(p.phrase)}, per hour worked` : "Total rewards, per hour worked",
  };
  const rows: Row[] = v.steps.filter((s) => s.lead).map((s) => ({
    label: titles[s.basis],
    cells: [
      ...r.letters.map((_, i) => (s.basis === "perHour" ? cents(v.row.values.perHour![i]) : figure(v.row.values[s.basis]![i]))),
      s.lead!.margin > 0 ? `${s.lead!.winnerLetter}, ${marginText(s.basis, s.lead!)} ${perText(s.basis)}` : "tie",
    ],
    ...(s.basis === v.basis ? { kind: "key" as const } : {}),
  }));
  const asPaid = rows.some((x) => /per hour/.test(x.label)) ? "; per hour as paid" : "";
  add({ kind: "table", table: { title: `Each step over your ${n}-year stay: totals in today's dollars${asPaid}`, head: ["", ...r.letters, "Leads by"], rows } });
  if (rows.some((x) => x.label === "Total rewards")) {
    add({ kind: "note", runs: ["Total rewards adds the employer 401(k), HSA money and perks to after-tax pay, less out-of-pocket health costs."] });
  }

  // How long you stay, and the hours.
  const parts: string[] = [];
  const others = v.stays.filter((s) => !s.current && s.lead && s.lead.margin > 0);
  if (lead && lead.margin > 0 && others.length) {
    const close = others.filter((s) => s.lead!.closeCall).map((s) => `at ${years(s.years)}, a close call: under 3% of ${s.lead!.winnerLetter}'s total`);
    const per = perText(v.basis);
    // Its dollars said once, in words, after rent (condition 1, as amended on 2026-10-16).
    const said = placeOf(v, v.basis) ? `, ${basisSaid(v, v.basis)}` : "";
    parts.push(others.every((s) => s.lead!.winnerLetter === lead.winnerLetter)
      ? `If you stay ${join(others.map((s) => String(s.years)), "or")} years instead, ${lead.winnerLetter} still leads: by `
        + `${join(others.map((s) => marginText(v.basis, s.lead!)))} ${per}${said}${close.length ? ` (${close.join("; ")})` : ""}.`
      : `How long you stay changes it${said}: ${others.map((s) => `at ${years(s.years)}, ${s.lead!.winnerLetter} leads by ${marginText(v.basis, s.lead!)} ${per}`
        + `${s.lead!.closeCall ? " (a close call)" : ""}`).join("; ")}.`);
  }
  const pair = lead ? [lead.winnerLetter, lead.runnerUpLetter] : [];
  for (const x of extraHoursView(v, r.letters).filter((e) => pair.includes(e.more) && pair.includes(e.fewer))) {
    const said = basisSaid(v, x.basis);
    const asks = `Over your stay, ${x.more} asks ${figure(x.hoursPerYear)} more hours a year than ${x.fewer}`;
    parts.push(x.perExtraHour !== null ? `${asks} and pays ${cents(x.perExtraHour)} for each, ${said}.`
      : `${asks} and leaves you ${dollars(Math.abs(x.gapPerYear))} a year less, ${said}: more hours for less pay.`);
  }
  if (parts.length) add({ kind: "para", runs: [parts.join(" ")] });

  // A close call: the runner-up's salary that would tie, from L-3's ties (the close-call line's own breakeven).
  if (lead?.closeCall && lead.margin > 0) {
    const row = r.ties?.l3?.rows.find((x) => x.offer === lead.runnerUp && x.against === lead.winner);
    const tie = v.basis !== "perHour" && row?.salary.outcome === "tie"
      ? ` ${dollars(row.salary.increase)} more starting salary for ${lead.runnerUpLetter} would tie.` : "";
    add({ kind: "para", runs: [{ b: "Close call:" }, ` the lead is under 3% of ${lead.winnerLetter}'s total.${tie}`] });
  }

  // If things go badly (L-2), when any offer has a range.
  const risk = riskView(ctx);
  if (risk.anyRange) {
    const said = placeOf(v, v.basis) ? `, in ${p.dollars}` : "";
    const amount = (x: number) => (risk.perHour ? cents(x) : dollars(x / risk.factor));
    const per = risk.perHour ? "an hour" : "a month";
    const H = risk.holdsUp;
    const own = CASES.filter((s) => risk.leads[s].winner === H);
    const rest = new Map<Letter, string[]>();
    for (const s of CASES) if (risk.leads[s].winner !== H) rest.set(risk.leads[s].winner, [...(rest.get(risk.leads[s].winner) ?? []), s]);
    const cases = (ss: string[]) => `${join(ss)} case${ss.length > 1 ? "s" : ""}`;
    const bear = risk.leads.bear;
    let t = `${H} holds up best${rest.size === 0 ? ", and wins in every scenario."
      : `: it wins the ${cases(own)}, and ${join([...rest].map(([w, ss]) => `${w} the ${cases(ss)}`))}.`}`;
    t += bear.margin > (risk.perHour ? 0.005 : 0.5) ? ` In the bear case it leads ${bear.runnerUp} by ${amount(bear.margin)} ${per} over your stay${said}.`
      : ` In the bear case it ties with ${bear.runnerUp}.`;
    const lose = risk.mostToLose;
    if (lose) {
      t += ` ${lose.letter} has the most to lose: ${amount(lose.drop)} ${per} below its base case over your stay${said} (${dropText(lose)})`
        + `${lose.changes.length ? `, because ${riskCarriers(lose.changes)}` : ""}.`;
    }
    for (const l of risk.onlyIfWell) t += ` ${l} comes out ahead only if things go well.`;
    add({ kind: "para", runs: [{ b: "If things go badly" }, ` (every uncertain input at its low value at once, the bear case): ${t}`] });
  }

  // A cost or benefit counted for some offers but not others.
  const counted = new Set(r.letters);
  const cautions = asymmetries(ctx.offers.filter((o) => counted.has(o.letter))).map(asymmetryText);
  if (cautions.length) add({ kind: "para", runs: [{ b: "Not counted for every offer:" }, ` ${cautions.join(" ")}`] });
}

// ---- 2. The offers, as entered ----------------------------------------------------------------------------------------

const monthDay = (m: { month: number; day: number }) => `${MONTHS[m.month - 1]} ${m.day}`;

function bonusText(b: AnnualBonus, stay: number): string {
  let t: string;
  if (b.basis === "percentOfSalary") t = `bonus ${percent(b.amount.base)} of salary`;
  else if (b.basis === "fixed") t = `bonus ${dollars(b.amount.base)} a year`;
  else {
    const xs = b.amounts.map((a) => a.base);
    t = xs.every((x) => x === xs[0]) ? `bonus ${dollars(xs[0])} a year`
      : `bonus ${join(xs.map((x) => dollars(x)))} for years 1–${xs.length}${xs.length < stay ? ", the last repeating" : ""}`;
  }
  return `${t}, paid each ${monthDay(b.payOn)}${b.firstPayoutGuaranteed ? ", the first guaranteed" : ""}`;
}

/** A vesting schedule, precisely: its split by year, its shape, and its cadence. "5/15/40/40 (back-loaded), semiannual after a 1-year cliff" */
export function vestingText(s: VestingSchedule): string {
  const pcts: number[] = [];
  for (const t of s.tranches) {
    const y = Math.max(0, Math.ceil(t.month / 12) - 1);
    pcts[y] = (pcts[y] ?? 0) + t.fraction * 100;
  }
  const ys = Array.from(pcts, (x) => +(x ?? 0).toFixed(1));
  const even = ys.every((x) => Math.abs(x - ys[0]) < 0.05);
  const up = ys.every((x, i) => !i || x >= ys[i - 1] - 0.05);
  const down = ys.every((x, i) => !i || x <= ys[i - 1] + 0.05);
  const shape = ys.length < 2 ? "" : even ? "even" : up ? "back-loaded" : down ? "front-loaded" : "";
  const cadence = describeSchedule(s).split(", ").slice(1).join(", ").replace(/^by year, /, "");
  return `${ys.join("/")}${shape ? ` (${shape})` : ""}${cadence ? `, ${cadence}` : ""}`;
}

function equityText(e: Equity): string {
  const grants = e.grants.map((g) => {
    const name = inSentence(g.label.trim().replace(/\s*RSUs?$/i, ""));
    return `a ${dollars(g.value)} ${name ? `${name} ` : ""}grant vesting ${vestingText(g.schedule)}`;
  });
  const f = e.refreshers;
  if (f && f.value.base > 0) {
    const every = f.everyMonths === 12 ? "each year" : `every ${f.everyMonths} months`;
    const from = f.firstAfterMonths === 12 ? "from the first anniversary" : `from month ${f.firstAfterMonths}`;
    grants.push(`plus ${dollars(f.value.base)} refresher grants ${every} ${from}, each vesting ${vestingText(f.schedule)}`);
  }
  const schedules = [...e.grants.map((g) => g.schedule), ...(f && f.value.base > 0 ? [f.schedule] : [])];
  const dates = schedules[0]?.vestDates;
  const same = dates && schedules.every((s) => JSON.stringify(s.vestDates) === JSON.stringify(dates));
  const on = same ? `, on the company's vest dates (${join(dates.months.map((m) => MONTHS[m - 1]))} ${dates.day})` : "";
  const growth = e.priceGrowth?.base ? `, share price ${e.priceGrowth.base > 0 ? "+" : "−"}${percent(Math.abs(e.priceGrowth.base))} a year` : "";
  return `RSUs: ${grants.join(", ")}${on}${growth}`;
}

function offersSection(ctx: WorkContext, sc: Scope, add: Add, heading: string) {
  const n = sc.years;
  add({ kind: "heading", text: heading });
  const together = sc.offers.every((o) => o.startDate === sc.offers[0].startDate);
  add({ kind: "list", items: sc.letters.map((l, i) => {
    const o = sc.offers[i];
    const draft = offerByLetter(ctx, l)?.draft;
    const d = sc.details[i];
    let pay = `${dollars(o.salary.annual)} salary`;
    const raise = o.salary.raise?.base ?? 0;
    if (raise) pay += `, ${percent(raise)} raises a year${o.salary.raiseOn === "jan1" ? " (each Jan 1)" : ""}`;
    for (const pr of o.salary.promotions ?? []) {
      if ((pr.scenarios ?? CASES).includes("base")) pay += `, a ${percent(pr.stepUp)} promotion on ${longDate(pr.on)}`;
    }
    const parts = [pay];
    if (o.bonus) parts.push(bonusText(o.bonus, n));
    for (const a of o.cashAwards ?? []) parts.push(`${dollars(a.amount)} ${inSentence(a.label.trim() || "cash award")}`);
    if (o.equity && (o.equity.grants.length || (o.equity.refreshers?.value.base ?? 0) > 0)) parts.push(equityText(o.equity));
    parts.push(o.hours ? `${o.hours.weekly.base} hours a week for ${weeksText(o)} weeks a year, after ${daysOffWords(o)}` : `${daysOffWords(o)} a year`);
    const info = d.costOfLiving;
    const city = draft ? cityTax(draft) : null;
    const where = city ? CITY_TAX[city].place : info ? `${shortCity(info.area.name)}, ${o.residence.state}` : o.residence.state;
    const rent = info ? `, rent ${dollars(info.monthlyRent)} a month${info.rentSource === "fmr" ? " (HUD's estimate)" : info.rentSource === "derived" ? " (an estimate)" : ""}` : "";
    parts.push(`${where}${rent}`);
    if (!together) parts.push(`starts ${longDate(o.startDate)}`);
    return `${l}${draft?.label ? `, ${draft.label}` : ""}: ${parts.join("; ")}.`;
  }) });
}

// ---- 3. The bridge, year 1 ------------------------------------------------------------------------------------------

const ORDER: BridgeLine[] = ["letter", "salary", "bonus", "cash", "rsu", "clawback", "paid", "tax", "premiums", "afterTax", "retirement", "perks", "hsa", "oop",
  "totalRewards", "rent", "prices", "total"];
/** A line's label when the offers' own reasons differ: theirs go in the notes. */
const GENERAL: Partial<Record<BridgeLine, string>> = {
  salary: "salary paid differs from the letter", bonus: "bonus paid differs from the target", cash: "cash awards paid in another year",
  rsu: "RSUs vest on a different schedule", prices: "prices other than rent",
};
const TOTALS = new Set<BridgeLine>(["paid", "afterTax", "totalRewards", "total"]);

function bridgeSection(ctx: WorkContext, add: Add, worked: Worked[]) {
  const r = res(ctx);
  const p = pricesOf(ctx);
  // The comparison's bridges, side by side: from rent straight to the prices picked, never through an offer's own city's dollars.
  const bs = r.letters.map((l) => bridge(ctx, l, 1, "comparison"));
  const col = bs.every((b) => b.rows.some((x) => x.line === "total"));
  const at = (i: number, line: BridgeLine) => bs[i].rows.find((x) => x.line === line);
  add({ kind: "heading", text: "3. From the offer letter to what you'd have: year 1" });
  const same = bs.every((b) => b.start === bs[0].start);

  const rows: Row[] = [];
  const notes: string[] = [];
  for (const line of ORDER) {
    if (!col && (line === "rent" || line === "prices" || line === "total")) continue;
    const have = r.letters.flatMap((_, i) => (at(i, line) ? [i] : []));
    if (!have.length) continue;
    const word = (i: number) => {
      const x = at(i, line)!;
      return x.kind === "less" || (x.kind === "change" && x.value < 0) ? "less" : "plus";
    };
    const own = (i: number) => `${word(i)} ${at(i, line)!.label}`;
    const shared = !GENERAL[line] || (line !== "prices" && have.every((i) => own(i) === own(have[0])));
    let text: string;
    if (line === "letter") text = "Offer letter: one year's pay as quoted";
    else if (TOTALS.has(line)) text = at(have[0], line)!.label;
    else if (line === "prices") text = GENERAL.prices!;
    else text = shared ? own(have[0]) : GENERAL[line]!;
    rows.push({ label: text, cells: r.letters.map((_, i) => (at(i, line) ? paren(at(i, line)!.value) : DASH)),
      ...(TOTALS.has(line) ? { kind: line === "total" ? "total" as const : "subtotal" as const } : {}) });
    // The notes: each offer's own reason where the label is general, and the glosses.
    if (line === "letter" || TOTALS.has(line) || line === "perks" || line === "prices"
      || (line === "rent" && have.every((i) => /a month$/.test(at(i, line)!.gloss ?? "")))
      || (line === "retirement" && have.every((i) => at(i, line)!.gloss === "vested by the end of your stay"))) continue;
    const texts = have.map((i) => {
      const x = at(i, line)!;
      return { l: r.letters[i], t: [shared ? "" : x.label, x.gloss].filter(Boolean).join(": ") };
    }).filter((x) => x.t);
    if (!texts.length) continue;
    const groups: Array<{ ls: Letter[]; t: string }> = [];
    for (const x of texts) {
      const g = groups.find((y) => y.t === x.t);
      if (g) g.ls.push(x.l);
      else groups.push({ ls: [x.l], t: x.t });
    }
    const name = cap(shared ? at(have[0], line)!.label : GENERAL[line]!);
    notes.push(`${name}: ${groups.map((g) => `${g.t} (${join(g.ls)})`).join("; ")}.`);
  }
  if (col) {
    const runs = r.letters.map((l) => {
      const info = detailOf(ctx, l).costOfLiving!;
      if (info.area.code === info.reference.code) return `at the prices you picked in ${shortCity(info.area.name)} (${l})`;
      const above = 1 / info.nonHousingFactor - 1;
      return `${percent(Math.abs(above))} ${above >= 0 ? "above" : "below"} ${p.average} in ${shortCity(info.area.name)} (${l})`;
    });
    notes.push(`Prices other than rent run ${join(runs)}. Spending is restated at those prices; savings (your 401(k), the employer's money, HSA money `
      + "and perks) count at face value.");
  }
  add({ kind: "table", table: { title: `${same ? `${longDate(bs[0].start)} – ${longDate(dayBefore(bs[0].end))}` : "Each offer's first year"}, as paid; each `
    + "total adds the lines above it", head: ["", ...r.letters], rows, foots: true } });

  // The offer letter's parts, so it adds up too.
  // Each part named the first time; an offer with the same parts as the one before gives the figures alone.
  let named = "";
  const letterParts = r.letters.map((l) => {
    const q = shownYearOf(ctx, l, 1).quoted;
    const o = offerByLetter(ctx, l);
    const parts = ([[q.salary, "salary"], [q.bonus, "target bonus"], [q.cash, cashNameOf(o)], [q.rsu, "RSUs due"]] as Array<[number, string]>)
      .filter(([x]) => x);
    if (parts.length > 1) worked.push({ op: "+", of: parts.map(([x]) => figure(x)), is: figure(q.letter) });
    const names = parts.map(([, w]) => w).join("|");
    const bare = names === named;
    named = names;
    return `${l} ${parts.map(([x, w]) => (bare ? figure(x) : `${figure(x)} ${w}`)).join(" + ")}`;
  });
  add({ kind: "list", items: [`Offer letter: ${letterParts.join("; ")}.`, ...notes] });
}

// ---- 4. From year 1 to the answer -------------------------------------------------------------------------------------

function yearsSection(ctx: WorkContext, add: Add, worked: Worked[]) {
  const r = res(ctx);
  const v = r.view;
  const n = v.row.years;
  const p = pricesOf(ctx);
  const b: ValueBasis = v.basis === "perHour" ? r.sweep.perHourOf : v.basis;
  const phrase = b === "colAdjustedTotal" ? cap(p.phrase) : b === "cash" ? "After-tax pay" : "Total rewards";
  add({ kind: "heading", text: "4. From year 1 to the answer" });
  const notes = yearNotes(ctx);
  const ds = r.letters.map((l) => detailOf(ctx, l));
  const rows: Row[] = [];
  for (let k = 1; k <= n; k++) {
    const here = notes.filter((x) => x.n === k).map((x) => `${x.letter}: ${x.text}`);
    rows.push({ label: `Year ${k}${here.length ? ` · ${here.join("; ")}` : ""}`, cells: ds.map((d) => {
      const y = shownYears(d)[k - 1];
      const val = y ? yearValue(y, b, r.sweep.perHourOf) : null;
      return val === null ? DASH : paren(val);
    }) });
  }
  const stays = ds.map((d) => shownStay(d, n));
  const after = stays.some((s) => s.after[b]);
  if (after) {
    rows.push({ label: `Years 1–${n}, as paid`, kind: "subtotal", cells: stays.map((s) => paren(s.years[b]!)) });
    rows.push({ label: "less paid after your stay's last day", cells: stays.map((s) => (s.after[b] ? paren(-s.after[b]!) : DASH)) });
  }
  rows.push({ label: "Your stay, as paid", kind: "subtotal", cells: stays.map((s) => paren(s.stay[b]!)) });
  const pv = v.row.values[b]!;
  if (v.basis !== "perHour") {
    rows.push({ label: `less discounted to today, at ${percent(r.sweep.discountRate)} a year`,
      cells: stays.map((s, i) => paren(Math.round(pv[i]) - Math.round(s.stay[b]!))) });
    rows.push({ label: "Your stay, in today's dollars", kind: "total", cells: pv.map((x) => figure(x)) });
  }
  add({ kind: "table", table: { title: `${phrase}, each year of your stay`, head: ["", ...r.letters], rows, foots: true } });

  const lead = v.lead;
  if (!lead || !(lead.margin > 0)) return;
  const W = lead.winnerLetter;
  const R = lead.runnerUpLetter;
  if (v.basis === "perHour") {
    const ph = v.row.values.perHour!;
    const hrs = v.row.hours!;
    const a = cents(ph[lead.winner]);
    const c = cents(ph[lead.runnerUp]);
    const m = cents(lead.margin);
    worked.push({ op: "−", of: [a, c], is: m });
    add({ kind: "para", runs: [`Per hour worked is each total as paid, divided by its hours over your stay (${r.letters.map((l, i) => `${l} ${figure(hrs[i])}`).join(", ")}). `
      + `${W}'s ${a} less ${R}'s ${c} is ${m} an hour over your stay${placeOf(v, "perHour") ? `, in ${p.dollars}` : ""}.`] });
    return;
  }
  const gap = Math.round(pv[lead.winner]) - Math.round(pv[lead.runnerUp]);
  const months = 12 * n;
  const factor = v.row.annuityFactor.toFixed(4);
  const perMonth = marginText(v.basis, lead);
  worked.push({ op: "−", of: [figure(pv[lead.winner]), figure(pv[lead.runnerUp])], is: figure(gap) });
  worked.push({ op: "÷", of: [figure(gap), factor], is: perMonth });
  const at = placeOf(v, v.basis);
  let t = `${at ? `In ${p.dollars}, ` : ""}${W}'s ${figure(pv[lead.winner])} less ${R}'s ${figure(pv[lead.runnerUp])} is ${figure(gap)} today. As a level `
    + `amount each month over your stay, its ${months} months, that's ${perMonth} a month${at ? ` in ${p.dollars}` : ""}: ${figure(gap)} ÷ ${factor}, the value today `
    + `of $1 at each month's end, at ${percent(r.sweep.discountRate)} a year`;
  if (v.row.annuityFactor < months - 0.005) {
    const plain = dollars(gap / months);
    worked.push({ op: "÷", of: [figure(gap), String(months)], is: plain });
    t += ` (not ${figure(gap)} ÷ ${months} = ${plain}: later dollars are worth less today)`;
  }
  add({ kind: "para", runs: [`${t}.`] });
}

// ---- 5. What would change the answer --------------------------------------------------------------------------------

function tiesSection(ctx: WorkContext, opts: DocOptions, add: Add, worked: Worked[]) {
  const r = res(ctx);
  const v = r.view;
  const p = pricesOf(ctx);
  add({ kind: "heading", text: "5. What would change the answer" });
  const ties = r.ties?.l3;
  const tv = ties ? tieView(ties, r.letters, opts.offers) : null;
  if (!ties || !tv) {
    add({ kind: "para", runs: ["Not worked out yet."] });
    return;
  }
  const basisWords = ties.basis === "colAdjustedTotal" ? p.phrase : ties.basis === "cash" ? "after tax" : "in total rewards";
  add({ kind: "para", runs: [`To tie ${tv.winner}'s ${figure(tv.target)} (its ${v.row.years}-year total ${basisWords}, in today's dollars), one input at a `
    + `time, the rest as entered${v.basis === "perHour" ? " (per hour can't be tied by one number, so these tie the total it divides)" : ""}:`] });
  const city = (l: Letter) => {
    const name = detailOf(ctx, l).costOfLiving?.area.name;
    return name ? shortCity(name) : "local";
  };
  const rows: Row[] = [];
  let rents = false;
  for (const x of tv.behind) {
    const l = x.letter;
    const s = x.row.salary;
    rows.push({ label: `${l}: starting salary`, cells: s.outcome === "tie"
      ? [dollars(s.from), dollars(s.to), change(worked, dollars(s.from), dollars(s.to), true)] : [dollars(s.from), "no salary ties", DASH] });
    const c = x.row.cash;
    if (c) {
      const now = x.cash.added ? "$0" : dollars(c.from);
      rows.push({ label: `${l}: ${x.cash.added ? "a sign-on 30 days in" : `${inSentence(x.cash.label)} (${x.cash.paid})`}`, cells: c.outcome === "tie"
        ? [now, dollars(c.to), change(worked, now, dollars(c.to), false)] : [now, "no amount ties", DASH] });
    }
    const rent = x.row.rent;
    if (rent && rent.outcome !== "noRent") {
      rents = true;
      const to = rent.outcome === "tie" ? rentTie(rent, shownIndexes(detailOf(ctx, l))).to : null;
      rows.push({ label: `${l}: ${city(l)} rent, a month`, cells: to !== null
        ? [dollars(rent.from), dollars(to), change(worked, dollars(rent.from), dollars(to), false)] : [dollars(rent.from), "no rent ties", DASH] });
    }
  }
  const W = tv.winner;
  const c = tv.cushion;
  rows.push({ label: `${W}'s cushion, before ${tv.runnerUp} ties`, kind: "group", cells: ["", "", ""] });
  const s = c.row.salary;
  rows.push({ label: `${W}: starting salary`, cells: s.outcome === "tie"
    ? [dollars(s.from), dollars(s.to), change(worked, dollars(s.from), dollars(s.to), true)] : [dollars(s.from), "leads at $0", DASH] });
  if (c.row.cash) {
    const now = c.cash.added ? "$0" : dollars(c.row.cash.from);
    const name = c.cash.added ? "a sign-on" : `${inSentence(c.cash.label)} (${c.cash.paid})`;
    rows.push({ label: `${W}: ${name}`, cells: c.row.cash.outcome === "tie"
      ? [now, dollars(c.row.cash.to), change(worked, now, dollars(c.row.cash.to), false)] : [now, "leads with none", DASH] });
  }
  const rent = c.row.rent;
  if (rent && rent.outcome === "tie") {
    rents = true;
    const to = rentTie(rent, shownIndexes(detailOf(ctx, W))).to;
    rows.push({ label: `${W}: ${city(W)} rent, a month`, cells: [dollars(rent.from), dollars(to), change(worked, dollars(rent.from), dollars(to), false)] });
  }
  add({ kind: "table", table: { head: ["", "Now", "Ties at", "Change"], rows } });
  const scales = [...new Set([...tv.behind, c].map((x) => scalesText(x.letter, x.offer, ties.basis)))];
  add({ kind: "note", runs: [`${rents ? "Rents are for the first lease year. " : ""}${scales.join(" ")} These are what it would take to tie, not advice on what to ask `
    + "for."] });

  // The rent note: an entered rent and its estimate on either side of the rent that flips the verdict.
  const notes = rentNotes(ctx);
  if (notes.length) {
    const clauses = notes.map((x) => {
      const whose = x.wins !== x.letter || notes.some((m) => m !== x && m.city === x.city);
      const where = x.estimate.source === "fmr" ? "HUD's estimate" : "the estimate";
      return `at ${where} for ${whose ? `${x.letter}'s rent in ${x.city}` : x.city} (${dollars(x.estimate.monthlyRent)} a month in the first lease year), ${x.wins} wins`;
    });
    const why = notes.map((x) => (x.wins === x.letter
      ? `${x.letter}'s rent as entered is ${dollars(x.entered)}, and ${x.letter} wins at any ${x.city} rent under ${dollars(x.flip.to!)}.`
      : `${x.letter}'s rent as entered is ${dollars(x.entered)}, and ${x.letter} loses the lead at any ${x.city} rent over ${dollars(x.flip.to!)}.`));
    add({ kind: "para", runs: [{ b: `This depends on rent: ${clauses.join("; ")}.` }, ` ${why.join(" ")}`] });
  }
}

// ---- 6. If you leave early ----------------------------------------------------------------------------------------------

function leavingSection(ctx: WorkContext, opts: DocOptions, add: Add, worked: Worked[]) {
  const r = res(ctx);
  add({ kind: "heading", text: "6. If you leave early" });
  const RULE = "; you must be employed on each payout date";
  const terms = r.letters.map((l, i) => leaveTerms(opts.offers[i], detailOf(ctx, l)));
  const ruled = terms.every((fs) => fs[0]?.endsWith(RULE));
  add({ kind: "list", items: r.letters.map((l, i) => {
    const facts = ruled ? [terms[i][0].slice(0, -RULE.length), ...terms[i].slice(1)] : terms[i];
    return `${l}: ${facts.length ? `${facts.join("; ")}.` : "nothing is lost by leaving early beyond the pay itself."}`;
  }) });
  const panels: Array<LeavePanel | null> | undefined = r.leave?.panels;
  if (!panels || panels.length !== r.letters.length) {
    add({ kind: "para", runs: ["Not worked out yet."] });
    return;
  }
  const axis = leaveAxis(r.view.row.window.start, r.view.row.years);
  const w = timeWorked(axis.start, opts.at);
  const into = `${w.months} ${w.months === 1 ? "month" : "months"}${w.days ? ` and ${w.days} ${w.days === 1 ? "day" : "days"}` : ""} in`;
  const earned = panels.map((x, i) => (x ? forfeits(x.warnings, opts.offers[i].startDate) : []));
  const cell = (f: (x: LeavePanel, i: number) => string) => panels.map((x, i) => (x ? f(x, i) : DASH));
  const some = (x: number, show = dollars) => (x >= 0.5 ? show(x) : DASH);
  const bonusCells = cell((_, i) => {
    const parts = earned[i].map((f) => Math.round(f.earned)).filter((x) => x);
    if (parts.length > 1) worked.push({ op: "+", of: parts.map((x) => dollars(x)), is: dollars(parts.reduce((a, b) => a + b, 0)) });
    return some(parts.reduce((a, b) => a + b, 0));
  });
  const rows: Row[] = [
    { label: "You'd keep, after tax, as paid", cells: panels.map((x) => (x ? dollars(x.afterTaxCompKept) : "not started")) },
    { label: "You'd repay, before tax", cells: cell((x) => some(x.clawbackOwed)) },
    { label: "Bonus earned but not paid", cells: bonusCells },
    { label: "RSUs not yet vested, at grant value", cells: cell((x) => some(x.unvestedRsuForfeited)) },
    { label: "Employer 401(k) not yet vested", cells: cell((x) => some(x.retirementForfeited)) },
    { label: "Unused vacation paid out, before tax (in what you'd keep)", cells: cell((x) => some(x.vacation.paid)) },
    { label: "The next payout or vest", cells: cell((x) => (x.next ? longDate(x.next.date) : "none")) },
    { label: "Staying until then adds (after tax, that included)", cells: cell((x) => (x.next ? `+${dollars(x.next.valueOfStaying.afterTaxComp)}` : DASH)) },
  ];
  add({ kind: "table", table: { title: `If your last day were ${longDate(opts.at)}, ${into}${opts.picked ? " (the day picked in Offer Calc)" : ""}`,
    head: ["", ...r.letters], rows } });

  const notes: string[] = [];
  const bonuses = earned.flatMap((fs, i) => {
    const parts = fs.filter((f) => Math.round(f.earned));
    return parts.length ? [`${r.letters[i]} ${parts.map((f) => `${dollars(f.earned)} ${f.all ? `for ${f.period}` : `toward ${f.period}`}`).join(" + ")}`] : [];
  });
  if (bonuses.length) notes.push(`Bonus earned but not paid, and so forfeited${ruled ? " (each bonus is paid only if you're still employed on its payout date)" : ""}: `
    + `${bonuses.join("; ")}.`);
  // A warning that leaving sets off, once, with the offers it's for.
  const warns = new Map<string, Letter[]>();
  panels.forEach((x, i) => {
    for (const w of x?.warnings ?? []) {
      if (w.code !== "clawbackFica") continue;
      const t = `repaying the ${inSentence(w.params.award)} in ${w.params.repaidYear} for pay received in ${w.params.paidYear}, the Social Security and `
        + "Medicare tax on it isn't refunded automatically, and there's no state relief.";
      warns.set(t, [...(warns.get(t) ?? []), r.letters[i]]);
    }
  });
  for (const [t, ls] of warns) notes.push(`${join(ls)}: ${t}`);
  notes.push("Offer Calc's Leaving early section shows any other last day.");
  add({ kind: "list", items: notes });
}

// ---- 7. Assumptions ---------------------------------------------------------------------------------------------------

function assumptions(ctx: WorkContext, sc: Scope, add: Add, heading: string) {
  const n = sc.years;
  const h = ctx.household;
  const p = pricesOf(ctx);
  const def = (f: Parameters<typeof aboutIsDefault>[1]) => (aboutIsDefault(h, f) ? " (the default)" : "");
  const ds = sc.details;
  const letters = sc.letters;
  add({ kind: "heading", text: heading });
  const items: string[] = [
    `Base case: every input ${sc.anyRange ? "at its middle value" : "as entered"}. Your stay: ${years(n)}${def("stay")}; pay after it isn't counted.`,
    `Today's dollars: each payment discounted at ${percent(sc.discountRate)} a year to ${longDate(ctx.today)}. Inflation, ${percent(ASSUMPTIONS.inflation)} a `
      + "year, moves tax brackets and rent, never pay.",
    `Tax: 2026 law, later years projected; filing ${FILING[h.filingStatus]}${def("filing")}; ${h.otherWagesThisYear
      ? `${dollars(h.otherWagesThisYear)} of other wages in ${ctx.wagesYear}` : "no other wages"}${def("wages")}${h.filingStatus === "joint"
      ? `; ${h.spouseWages ? `your spouse's wages of ${dollars(h.spouseWages)} in ${ctx.wagesYear}, growing with inflation` : "no spouse's wages"}${def("spouse")}`
      : ""}; ${letters.length === 1 ? "the offer" : "each offer"} taxed where you'd live, for the whole year.`,
  ];
  const infos = ds.map((d) => d.costOfLiving);
  if (infos.some(Boolean)) {
    const yours = letters.filter((_, i) => infos[i]?.rentSource === "input");
    const est = letters.filter((_, i) => infos[i] && infos[i]!.rentSource !== "input");
    const growth = [...new Set(infos.flatMap((x) => (x ? [x.rentGrowth] : [])))];
    const estimates = [...new Map(letters.flatMap((l) => {
      const e = rentEstimate(ctx, offerByLetter(ctx, l));
      const name = ds[letters.indexOf(l)].costOfLiving?.area.name;
      return e && name && e.source === "fmr" ? [[shortCity(name), `${dollars(e.monthlyRent)} in ${shortCity(name)}`] as const] : [];
    })).values()];
    // One offer's breakdown is at its own city's prices; the comparison restates spending at the prices picked.
    const prices = sc.own ? `the figures are at ${sc.own.place}'s own prices${sc.own.withRef ? `, the total also restated as in ${p.city}${def("prices")}` : ""}`
      : `spending is restated as in ${p.city}${def("prices")}`;
    items.push(`Rent: ${[yours.length ? `yours${letters.length > 1 ? ` for ${join(yours)}` : ""}` : "", est.length ? `an estimate${letters.length > 1 ? ` for ${join(est)}` : ""}` : ""]
      .filter(Boolean).join("; ")}, rising ${growth.length === 1 ? `${percent(growth[0])} a year` : "as entered"} at each lease anniversary.${estimates.length
        ? ` HUD's 1-bedroom estimate${sc.own ? "" : "s"} (FY${DATA_YEARS.fmr}), a month: ${join(estimates)}.` : ""} Prices: BEA's ${DATA_YEARS.rpp} `
      + `Regional Price Parities; ${prices}.`);
  }
  const savings = infos.find((x) => x)?.savingsRate ?? 0;
  items.push(`${cap(h.healthUsage ?? "medium")} health use${def("healthUsage")}; ${savings ? `${percent(savings)} of take-home pay saved` : "no savings beyond the 401(k)"}; `
    + `your 401(k) money counts at face value (no tax on withdrawal, no growth)${sc.offers.some((o) => o.equity) ? "; RSUs are sold as they vest" : ""}.`);
  // One offer's full detail lists its warnings in its own section (6); its summary, here.
  if (!sc.own || sc.own.summary) {
    letters.forEach((l, i) => {
      for (const g of stayWarnings(ds[i].warnings, sc.lastYear)) {
        if (WARNING_KIND[g[0].code] === "changes") items.push(`This changes ${l}'s numbers: ${warningWords(g)}`);
      }
    });
  }
  items.push("Not modeled: layoffs, moving or working in another state, private-company equity, and more (see the methodology).");
  add({ kind: "list", items });
}

// ---- One offer's breakdown (docs/v2-plan.md, item 5, "Copy as document, for one offer") ------------------------------------
// A-1 to A-6 for a reader who has never seen the tool, over the offer's own stay and at its own city's prices (B3, B4): a sentence
// says its dollars once, in words; a table's after-rent rows name their prices; every rate and share states its period. As the
// comparison's document: no tickmarks or references, every total adding up as displayed, every calculation it states in `worked`.

/** One offer, as its breakdown shows it: its input, its own stay's projection, and A-1's figures. */
interface Own { L: Letter; o: OfferInput; b: Breakdown; d: OfferDetail; v: OwnView; n: number; name: string; withRef: boolean }

function ownFor(ctx: WorkContext, opts: DocOptions, L: Letter): Own {
  const letters = opts.letters ?? res(ctx).letters;
  const o = opts.offers[letters.indexOf(L)];
  if (!o) throw new Error(`Offer ${L} isn't complete.`);
  const b = ownOf(ctx, L);
  const withRef = ctx.own?.withRef ?? false;
  const label = offerByLetter(ctx, L)?.draft.label?.trim();
  return { L, o, b, d: b.detail, v: ownView(L, b, o, pricesOf(ctx), withRef), n: b.years, name: label ? `${L}, ${label}` : `Offer ${L}`, withRef };
}

function ownScope(x: Own, summary: boolean): Scope {
  return { letters: [x.L], offers: [x.o], details: [x.d], years: x.n, discountRate: x.b.discountRate, lastYear: Number(dayBefore(x.b.window.end).slice(0, 4)),
    anyRange: hasRanges(x.o), own: { place: x.v.place, withRef: x.withRef, summary } };
}

/**
 * One offer's breakdown, on its own: its summary, about 2 pages, or its full detail, about 3 (sample A in Word, 2026-10-17: see
 * docs/ui-design.md §12).
 */
function ownDoc(ctx: WorkContext, opts: DocOptions, L: Letter): Doc {
  const x = ownFor(ctx, opts, L);
  const blocks: Block[] = [];
  const worked: Worked[] = [];
  const add = (b: Block) => blocks.push(b);
  const sample = (offerByLetter(ctx, L)?.sample ?? null) !== null;
  add({ kind: "title", text: `${x.name}: one job offer, worked out` });
  add({ kind: "meta", text: `Made with Offer Calc on ${longDate(ctx.today)}. Base case, if you stay ${years(x.n)}: ${longDate(x.b.window.start)}, `
    + `when it starts, to ${longDate(dayBefore(x.b.window.end))}.` });
  if (sample) add({ kind: "flag", text: SAMPLE_ONE });
  const summary = (opts.detail ?? "summary") === "summary";
  ownSections(ctx, opts, x, add, worked);
  offersSection(ctx, ownScope(x, summary), add, summary ? "5. The offer, as entered" : "7. The offer, as entered");
  assumptions(ctx, ownScope(x, summary), add, summary ? "6. Assumptions" : "8. Assumptions");
  closing(add);
  if (sample) add({ kind: "flag", text: SAMPLE_ONE });
  return { blocks, worked };
}

/** With two or more offers: each offer's breakdown in turn, then the comparison, its tables in the common dollars (condition 1). */
function bothDoc(ctx: WorkContext, opts: DocOptions): Doc {
  const r = res(ctx);
  const blocks: Block[] = [];
  const worked: Worked[] = [];
  const add = (b: Block) => blocks.push(b);
  const sample = ctx.offers.some((o) => o.sample !== null);
  const L = r.letters;
  add({ kind: "title", text: `${cap(COUNT[L.length] ?? String(L.length))} job offers, each on its own, then compared` });
  // Each breakdown's sections, then the comparison's own "as entered" and assumptions for all of them.
  add({ kind: "meta", text: `Made with Offer Calc on ${longDate(ctx.today)}. Base case, if you stay ${years(r.view.row.years)}. Each offer on its own is over `
    + "its own stay, from its start, at its own city's prices; the comparison is over the same years for every offer, in the same dollars." });
  if (sample) add({ kind: "flag", text: SAMPLE_LINE });
  for (const l of L) {
    const x = ownFor(ctx, { ...opts, letters: L }, l);
    add({ kind: "part", text: `${x.name}, on its own` });
    ownSections(ctx, { ...opts, letters: L }, x, add, worked);
  }
  add({ kind: "part", text: "The comparison" });
  comparisonBody(ctx, opts, add, worked);
  closing(add);
  if (sample) add({ kind: "flag", text: SAMPLE_LINE });
  return { blocks, worked };
}

/** The full detail: A-1 to A-6, as sections 1 to 6. The summary: A-1 to A-4 in short, as sections 1 to 4, and what the full adds. */
function ownSections(ctx: WorkContext, opts: DocOptions, x: Own, add: Add, worked: Worked[]) {
  const full = opts.detail === "full";
  bottomLine(ctx, x, add, worked);
  whereItGoes(ctx, x, add, worked, full);
  payByYear(ctx, x, add, worked, full);
  termsSection(ctx, opts, x, add, worked, full);
  if (full) {
    benefitsSection(ctx, x, add, worked);
    taxSection(x, add, worked);
  } else {
    add({ kind: "note", runs: ["The full detail adds year 1's bridge from the offer letter, every payment and every cliff by date, what you'd keep if you "
      + "left on a given day, the benefits by year, tax by calendar year, and the warnings."] });
  }
}

// ---- 1. The bottom line (A-1)

function bottomLine(ctx: WorkContext, x: Own, add: Add, worked: Worked[]) {
  const { L, v, n } = x;
  const m = v.month;
  const p = pricesOf(ctx);
  add({ kind: "heading", text: "1. The bottom line" });
  worked.push({ op: "+", of: [dollars(m.spend), dollars(m.saved)], is: dollars(m.total) });
  add({ kind: "para", runs: [
    { b: `${L} leaves you about ${dollars(m.total)} a month over your stay, after rent, in ${v.place} dollars: ${dollars(m.spend)} to spend and `
      + `${dollars(m.saved)} saved.` },
    ` That's what's left to spend after tax and rent, plus what you save, over the ${years(n)}, in today's dollars, at ${v.place}'s own prices.`
      + (m.total < 0 ? " Rent and tax take more than this offer pays, so there's less than nothing left to spend." : ""),
  ] });
  if (v.ref) {
    const step = dollars(Math.abs(v.ref.step));
    worked.push({ op: v.ref.step >= 0 ? "−" : "+", of: [dollars(m.total), step], is: dollars(v.ref.month) });
    add({ kind: "para", runs: [`${ctx.results ? "In the comparison" : "At the prices you picked"}: ${dollars(m.total)} a month in ${v.place} dollars, `
      + `${v.ref.step >= 0 ? "less" : "plus"} ${step} for ${v.place}'s ${v.ref.step >= 0 ? "higher" : "lower"} prices, is ${dollars(v.ref.month)} a month over your `
      + `stay in ${p.dollars}.`] });
  }
  const facts: string[] = [];
  if (v.year1) {
    facts.push(`In year 1, as paid, in ${v.place} dollars: ${dollars(v.year1.spendMonth)} a month to spend after rent and ${dollars(v.year1.savedMonth)} `
      + `a month saved. ${v.differs}`);
  }
  if (v.hour) {
    worked.push({ op: "÷", of: [figure(v.hour.total), figure(v.hour.hours)], is: cents(v.hour.value) });
    facts.push(`Per hour worked over your stay, after tax and rent, in ${v.place} dollars: ${cents(v.hour.value)}, its after-rent total as paid, `
      + `${figure(v.hour.total)}, ÷ the ${figure(v.hour.hours)} hours worked.`);
  }
  if (facts.length) add({ kind: "para", runs: [facts.join(" ")] });
}

// ---- 2. Where the money goes (A-2)

function whereItGoes(ctx: WorkContext, x: Own, add: Add, worked: Worked[], full: boolean) {
  const { L, v, n } = x;
  add({ kind: "heading", text: "2. Where the money goes: year 1" });
  const h = hundredOf(x.d, 1);
  if (!h) {
    add({ kind: "para", runs: ["Needs a city and pay in year 1."] });
    return;
  }
  add({ kind: "para", runs: [`Paid to you in year 1 (${longDate(h.start)} – ${longDate(dayBefore(h.end))}): ${dollars(h.paid)}, as paid. Where each $100 of `
    + "it goes:"] });
  for (const q of h.parts) if (q.part !== "spend") worked.push({ op: "÷", of: [figure(q.dollars), figure(h.paid)], is: centsText(q.cents), percent: true });
  add({ kind: "table", table: {
    head: ["", "Of each $100 of year-1 pay", "$, as paid in year 1"],
    rows: [...h.parts.map((q): Row => ({ label: cap(A2_LABEL[q.part]), cells: [centsText(q.cents), paren(q.dollars)] })),
      { label: "Paid to you", kind: "total", cells: ["$100.00", figure(h.paid)] }],
    foots: true,
  } });
  const spend = h.parts.find((q) => q.part === "spend")!.dollars;
  worked.push({ op: "÷", of: [figure(spend), "12"], is: dollars(spend / 12) });
  const notes = [`Tax is your household's tax with the offer less without it; health costs are your premiums and expected out-of-pocket costs; saved is `
    + `your 401(k) and HSA and any planned savings. Left to spend, ${figure(spend)} ÷ 12, is ${dollars(spend / 12)} a month in year 1, after rent, in `
    + `${v.place} dollars.`];
  const adds = [h.credited ? `${dollars(h.credited)} of 401(k) money` : "", h.hsa ? `${dollars(h.hsa)} of HSA money` : "", h.perks ? `${dollars(h.perks)} of perks` : ""]
    .filter(Boolean);
  const share = h.vestedShare;
  const vested = !h.credited || share === null ? "" : share >= 1 ? ` By the end of your ${n}-year stay, all of its 401(k) money has vested.` : share > 0
    ? ` By the end of your ${n}-year stay, ${Math.round(share * 100)}% of its 401(k) money has vested.`
    : ` None of its 401(k) money has vested by the end of your ${n}-year stay: leave then and it's left behind.`;
  notes.push(adds.length ? `Outside the $100, the employer adds ${join(adds)} in year 1, on top.${vested}`
    : "The employer adds nothing on top in year 1: no 401(k) money, HSA money or perks entered.");
  add({ kind: "para", runs: [notes.join(" ")] });
  if (!full) return;

  // Year 1's bridge (A-2's "Show the bridge"): from the offer letter to after rent at its own prices, then the prices picked.
  const br = bridge(ctx, L, 1);
  const rows = br.rows.map((row): Row => {
    const lead = row.kind === "less" || row.kind === "plus" || row.kind === "change" ? `${row.value < 0 ? "less" : "plus"} ` : "";
    return { label: `${lead}${row.label}${row.gloss ? ` (${row.gloss})` : ""}`, cells: [paren(row.value)],
      ...(row.kind === "subtotal" || row.kind === "total" ? { kind: row.kind } : {}) };
  });
  add({ kind: "table", table: { title: "From the offer letter to after rent, year 1, as paid: each total adds the lines above it", head: ["", "Year 1"], rows,
    foots: true } });
  const q = ownShownYear(ctx, L, 1).quoted;
  const parts = ([[q.salary, "salary"], [q.bonus, "target bonus"], [q.cash, cashNameOf(offerByLetter(ctx, L))], [q.rsu, "RSUs due"]] as Array<[number, string]>)
    .filter(([y]) => y);
  if (parts.length > 1) {
    worked.push({ op: "+", of: parts.map(([y]) => figure(y)), is: figure(q.letter) });
    add({ kind: "list", items: [`The offer letter: ${parts.map(([y, w]) => `${figure(y)} ${w}`).join(" + ")} = ${figure(q.letter)}.`] });
  }
}

// ---- 3. Pay by year, and when it arrives (A-3)

function payByYear(ctx: WorkContext, x: Own, add: Add, worked: Worked[], full: boolean) {
  const { L, o, n } = x;
  add({ kind: "heading", text: full ? "3. Pay by year, and when it arrives" : "3. Pay by year" });
  const t = yearTable(ctx, L);
  const pr = payRows(t);
  const kinds = pr.filter((r) => r.line !== "gross");
  const pay = pr.find((r) => r.line === "gross")!;
  const line = (label: string, k: number | "sum", kind?: "subtotal"): Row => {
    const cells = kinds.map((r) => paren(k === "sum" ? r.sum : r.values[k]));
    const total = figure(k === "sum" ? pay.sum : pay.values[k]);
    if (kinds.length > 1) worked.push({ op: "+", of: cells, is: total });
    return { label, cells: [...cells, total], ...(kind ? { kind } : {}) };
  };
  add({ kind: "table", table: {
    title: "Pay by employment year, as paid ($): each year's pay adds its kinds, and the years add up",
    head: ["", ...kinds.map((r) => r.label), "Pay"],
    rows: [...t.years.map((y, k) => line(`Year ${y.n}`, k)), line(`Years 1–${t.n}`, "sum", "subtotal")],
    foots: true,
  } });
  const notes = notesOf(x.d, n);
  if (notes.length) add({ kind: "list", items: notes.map((nt) => `Year ${nt.n}: ${nt.text}.`) });
  const month = dollars(o.salary.annual / 12);
  worked.push({ op: "÷", of: [dollars(o.salary.annual), "12"], is: month });
  const arrivals = arrivalsOf(x.d, n);
  add({ kind: "para", runs: [`Salary is paid monthly: ${dollars(o.salary.annual)} ÷ 12 = ${month} a month at its starting salary.${!arrivals.length
    ? " Nothing else is paid in your stay: no bonus, cash award or RSU vest entered." : full ? " Every other payment in your stay, by date:" : ""}`] });
  if (arrivals.length && full) {
    add({ kind: "list", items: arrivals.map((a) => `${longDate(a.date)}: ${a.label}, ${dollars(arrivalShown(a))}, in year ${a.ey}${a.note ? ` (${a.note})` : ""}.`) });
  }
}

// ---- 4. Terms that can bite (A-4)

function termsSection(ctx: WorkContext, opts: DocOptions, x: Own, add: Add, worked: Worked[], full: boolean) {
  const { L, o, d, v } = x;
  add({ kind: "heading", text: full ? "4. Terms that can bite" : "4. The key terms, and the bad case" });
  const facts = [...leaveTerms(o, d), ...bonusTerms(o)];
  if (facts.length) add({ kind: "list", items: facts.map((f) => `${cap(f)}.`) });
  else add({ kind: "para", runs: ["No bonus, cash award, RSU or 401(k) vesting entered: nothing in its terms to lose by leaving early."] });

  const paras: string[] = [];
  const terms: OfferTerms | undefined = ctx.own?.terms?.[L];
  if (!terms) paras.push("Its cliffs: not worked out yet.");
  else {
    const from = terms.from === o.startDate ? `from its start, ${longDate(o.startDate)}` : `from today, ${longDate(terms.from)}`;
    const next = terms.next;
    if (!next) paras.push(`No cliff ${from} to the end of its stay: nothing pays, vests or stops being repaid by then.`);
    else {
      const what = next.cliffs.map(cliffName).join(" and ");
      if (terms.kept) {
        const at = dollars(terms.kept.at);
        const first = dollars(terms.kept.from);
        const value = dollars(Math.round(terms.kept.at) - Math.round(terms.kept.from));
        worked.push({ op: "−", of: [at, first], is: value });
        paras.push(`The next cliff ${from}: ${longDate(next.date)}, ${what}. Staying until it is worth ${value} after tax, as paid: you'd keep ${at} if you `
          + `left that day, against ${first} if you left on ${longDate(terms.from)}.`);
      } else {
        paras.push(`The next cliff ${from}: ${longDate(next.date)}, ${what}. Staying until it is worth ${dollars(next.valueOfStaying.afterTaxComp)} after tax, `
          + "as paid.");
      }
    }
  }

  // If you left on a day: A-4's (and L-4's) last day, its panel for this offer (the full detail's).
  if (full) {
    const at = ctx.own?.leave?.at ?? opts.at;
    const panel = ctx.own?.leave?.panels[L];
    if (panel === undefined) paras.push("Leaving early: not worked out yet.");
    else if (panel === null) paras.push(`If your last day were ${longDate(at)}, ${L} wouldn't have started by then.`);
    else {
      const w = timeWorked(o.startDate, panel.leaveDate);
      const into = `${w.months} ${w.months === 1 ? "month" : "months"}${w.days ? ` and ${w.days} ${w.days === 1 ? "day" : "days"}` : ""} in`;
      const lost = [panel.retirementForfeited >= 0.5 ? `${dollars(panel.retirementForfeited)} of 401(k) money` : "",
        panel.unvestedRsuForfeited >= 0.5 ? `${dollars(panel.unvestedRsuForfeited)} of RSUs (at grant value)` : ""].filter(Boolean);
      const bonuses = forfeits(panel.warnings, o.startDate).map((f) => {
        const t = forfeitText(f);
        return `; ${t.before}${dollars(f.earned)}${t.after} is forfeited`;
      });
      const v = panel.vacation;
      const vacation = v.paid >= 0.5 ? `with ${dollars(v.paid)} before tax for ${daysText(v.banked)} of unused vacation paid out, ` : "";
      const unpaid = unpaidVacationText(v);
      paras.push(`If your last day were ${longDate(panel.leaveDate)}, ${into}${opts.picked ? " (the day picked in Offer Calc)" : ""}: you'd keep `
        + `${dollars(panel.afterTaxCompKept)} after tax, as paid, ${vacation}${panel.clawbackOwed >= 0.5 ? `repay ${dollars(panel.clawbackOwed)},` : "repay nothing,"} and `
        + `${lost.length ? `leave ${lost.join(" and ")} behind` : "leave nothing behind"}${bonuses.join("")}${unpaid ? `; ${unpaid}` : ""}. Offer Calc shows `
        + "any other last day.");
    }
  }

  // The bad case: bear and bull, a month over its stay at its own prices, and what goes wrong in the bear case.
  if (!hasRanges(o)) paras.push("Bad case: no ranges entered, so the bear and bull cases are the base case.");
  else if (v.bear) {
    const changes = caseChanges(o, "bear", x.b.window.end, false);
    paras.push(`Bad case, after rent, in ${v.place} dollars: ${dollars(v.bear.month)} a month over your stay${v.bear.drop !== null
      ? `, ${shareText(v.bear.drop)} under the base case` : ""}${v.bull ? `; in the bull case, ${dollars(v.bull.month)} a month over your stay` : ""}. `
      + (changes.length ? `In the bear case, ${changes.map(changeText).join("; ")}.` : "Nothing entered changes inside its stay in the bear case."));
  }
  for (const t of paras) add({ kind: "para", runs: [t] });

  // Every cliff inside its stay, dated (the full detail's).
  const lines = terms && full ? cliffLines(terms.cliffs) : [];
  if (lines.length) {
    add({ kind: "para", runs: ["Every cliff in its stay, by date, and what leaving the day before it gives up:"] });
    add({ kind: "list", items: lines.map((c) => (c.kind === "steps"
      ? `${longDate(c.from)} – ${longDate(c.until)}: the ${inSentence(c.award.trim() || "award")}'s clawback shrinks ${dollars(c.perMonth)} each month worked.`
      : `${longDate(c.cliff.date)}: ${cliffName(c.cliff)}, ${dollars(c.cliff.amount)} before tax: ${cliffCost(c.cliff)}.`)) });
  }
}

// ---- 5. What the benefits are worth (A-5)

const BENEFIT_HEAD: Partial<Record<string, string>> = { employer: "401(k), vested", hsa: "HSA money", perks: "Perks", oop: "Out-of-pocket" };

function benefitsSection(ctx: WorkContext, x: Own, add: Add, worked: Worked[]) {
  const { L, o, n } = x;
  add({ kind: "heading", text: "5. What the benefits are worth" });
  const t = yearTable(ctx, L);
  const bx = benefitsOf(t);
  const month = dollars(bx.addedSum / (12 * n));
  worked.push({ op: "÷", of: [figure(bx.addedSum), String(12 * n)], is: month });
  const notes = [`Over its ${n}-year stay, the benefits add ${dollars(bx.addedSum)} to after-tax pay, as paid: ${figure(bx.addedSum)} ÷ ${12 * n} months = `
    + `${month} a month over your stay${bx.creditedSum ? `, with ${dollars(bx.creditedSum)} of employer 401(k) money credited` : ""}.`];
  if (!o.retirement) notes.push("No 401(k) entered: its match isn't counted.");
  if (!o.health) notes.push("No health plan entered: premiums and out-of-pocket costs aren't counted.");
  if (o.health?.oopMax) notes.push(`A bad health year costs up to the plan's out-of-pocket maximum, ${dollars(o.health.oopMax)}, in any year of your stay, `
    + "on top of the premiums.");
  const pto = paidTimeOff(o);
  notes.push(`Paid time off: ${daysOffWords(o)}, ${pto.days} ${pto.days === 1 ? "day" : "days"} a year; ${dollars(pto.value)} of its starting salary a year `
    + "is for those days, which salary already counts.");
  add({ kind: "para", runs: [notes.join(" ")] });
  const cols = bx.rows.filter((r) => BENEFIT_HEAD[r.line]);
  if (!cols.length) return;
  const line = (label: string, k: number | "sum", kind?: "subtotal"): Row => {
    const cells = cols.map((r) => paren(k === "sum" ? r.sum : r.values[k]));
    const total = paren(k === "sum" ? bx.addedSum : bx.added[k]);
    if (cols.length > 1) worked.push({ op: "+", of: cells, is: total });
    return { label, cells: [...cells, total], ...(kind ? { kind } : {}) };
  };
  add({ kind: "table", table: {
    title: "What the benefits add to after-tax pay, by employment year, as paid ($)",
    head: ["", ...cols.map((r) => BENEFIT_HEAD[r.line]!), "Added"],
    rows: [...t.years.map((y, k) => line(`Year ${y.n}`, k)), line(`Years 1–${t.n}`, "sum", "subtotal")],
    foots: true,
  } });
  add({ kind: "note", runs: ["Not in these: your health premiums, already out of after-tax pay, and your own 401(k) and HSA, which are your pay, saved."] });
}

// ---- 6. Tax by year, and warnings (A-6)

/** "Federal withholding falls short of the federal income tax on its pay by $1,109 for 2029 and $1,656 for 2030, …": A-6's line. */
function shortfallText(d: OfferDetail, warnings: OfferWarning[]): string {
  const ys = warnings.flatMap((w) => (w.code === "withholdingShortfall" ? [w.params] : []));
  const shorts = ys.map((p) => {
    const y = d.withholding.years.find((q) => q.year === p.year);
    return `${dollars(y ? withholdingParts(y).short : p.balanceDue)} for ${p.year}`;
  });
  return `Federal withholding falls short of the federal income tax on its pay by ${join(shorts)}, owed ${ys.length > 1 ? "each following April"
    : `in April ${ys[0].year + 1}`}${ys.some((y) => y.supplemental) ? ": bonuses and RSU vests are withheld at the flat 22% supplemental rate, below the real "
    + "rate on them" : ""}. Raising your withholding on Form W-4 spreads it out.`;
}

function taxSection(x: Own, add: Add, worked: Worked[]) {
  const { d, v, b } = x;
  add({ kind: "heading", text: "6. Tax by year, and warnings" });
  if (v.tax) {
    worked.push({ op: "÷", of: [figure(v.tax.tax), figure(v.tax.gross)], is: taxRateText(v.tax.rate), percent: true });
    add({ kind: "para", runs: [`Tax takes ${taxRateText(v.tax.rate)} of its pay over your stay: its tax, ${figure(v.tax.tax)}, ÷ its pay, ${figure(v.tax.gross)}, `
      + "as paid. Its tax is your household's tax with the offer less without it, so it isn't your top rate."] });
  }
  const rows = taxYearsOf(d, b.window);
  const kinds = ([["federal", "Federal"], ["fica", "FICA"], ["state", "State"], ["local", "Local"]] as const)
    .filter(([k]) => k === "federal" || k === "fica" || rows.some((r) => r.values[k]));
  add({ kind: "table", table: {
    title: "Tax by calendar year, as paid ($): each year's tax by kind, and its rate, of that calendar year's pay",
    head: ["", "Pay", ...kinds.map(([, name]) => name), "Tax", "Rate"],
    rows: rows.map((r): Row => {
      const parts = kinds.map(([k]) => figure(r.values[k]));
      worked.push({ op: "+", of: parts, is: figure(r.values.tax) });
      worked.push({ op: "÷", of: [figure(r.values.tax), figure(r.values.gross)], is: rateText(r.rate), percent: true });
      return { label: `${r.year}${r.projectedLaw ? "*" : ""}`, cells: [figure(r.values.gross), ...parts, figure(r.values.tax), rateText(r.rate)] };
    }),
  } });
  if (rows.some((r) => r.projectedLaw)) add({ kind: "note", runs: ["* Tax law projected from 2026's."] });
  const lastYear = Number(dayBefore(b.window.end).slice(0, 4));
  const groups = stayWarnings([...d.warnings, ...d.withholding.warnings], lastYear);
  if (!groups.length) {
    add({ kind: "para", runs: ["No warnings over its stay. Checked: the 401(k), HSA and perk limits, the bonus cutoff, an employer state's remote-work rule, "
      + "and federal withholding against the tax on bonuses and RSU vests."] });
    return;
  }
  const items: string[] = [];
  for (const kind of ["changes", "notModeled", "cash"] as const) {
    for (const g of groups.filter((y) => WARNING_KIND[y[0].code] === kind)) {
      items.push(`${KIND_TITLE[kind]}: ${g[0].code === "withholdingShortfall" ? shortfallText(d, g) : warningWords(g)}`);
    }
  }
  add({ kind: "para", runs: ["Warnings over its stay:"] });
  add({ kind: "list", items });
}

// ---- getting one offer's breakdown ready: A-4's cliffs and its last day, as A-4 asks for them, so they share the results

// ---- the renderers --------------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const runText = (x: Run) => (typeof x === "string" ? x : "b" in x ? x.b : x.href);
const runHtml = (x: Run) => (typeof x === "string" ? esc(x) : "b" in x ? `<b>${esc(x.b)}</b>` : `<a href="${esc(x.href)}">${esc(x.href)}</a>`);
/** A figure, or a figure-like cell, sits right; words sit left. */
const isFigure = (c: string) => c === DASH || /^[−+(]?\$?\d/.test(c);
const CELL = "border:1px solid #999;padding:0.5pt 5pt;vertical-align:top";

/** A cell's text in a paragraph with no spacing of its own: Word otherwise gives each cell its Normal style's space after. */
const cellP = (html: string) => `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9.5pt">${html}</p>`;

function tableHtml(t: Table): string {
  const out: string[] = [];
  if (t.title) out.push(`<p style="margin:8pt 0 3pt"><b>${esc(t.title)}</b></p>`);
  out.push('<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;margin:0 0 6pt">');
  const first = t.rows.find((x) => x.kind !== "group")?.cells ?? [];
  // A header row Word repeats on each page the table runs onto.
  out.push(`<thead><tr>${t.head.map((h, i) => `<th style="${CELL};text-align:${i && isFigure(first[i - 1] ?? "") ? "right" : "left"}">${cellP(esc(h))}</th>`).join("")}</tr></thead><tbody>`);
  for (const row of t.rows) {
    const top = row.kind === "subtotal" ? "border-top:2px solid #000;" : row.kind === "total" ? "border-top:3px double #000;" : "";
    const bold = row.kind && row.kind !== "group" ? (s: string) => `<b>${s}</b>` : (s: string) => s;
    if (row.kind === "group") {
      out.push(`<tr><td colspan="${t.head.length}" style="${CELL}">${cellP(`<b>${esc(row.label)}</b>`)}</td></tr>`);
      continue;
    }
    out.push(`<tr><td style="${CELL};${top}">${cellP(bold(esc(row.label)))}</td>${row.cells.map((c) =>
      `<td style="${CELL};${top}text-align:${isFigure(c) ? "right" : "left"};white-space:nowrap">${cellP(bold(esc(c)))}</td>`).join("")}</tr>`);
  }
  out.push("</tbody></table>");
  return out.join("");
}

/** The document as HTML for the clipboard: inline styles only, no classes, scripts or images, so it pastes into Docs, Word and email. */
export function toHtml(doc: Doc): string {
  const o = ['<div style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.2">'];
  for (const b of doc.blocks) {
    switch (b.kind) {
      case "title": o.push(`<h1 style="font-size:16pt;margin:0 0 4pt">${esc(b.text)}</h1>`); break;
      case "meta": o.push(`<p style="margin:0 0 6pt">${esc(b.text)}</p>`); break;
      case "flag": o.push(`<p style="margin:6pt 0"><b>${esc(b.text)}</b></p>`); break;
      case "part": o.push(`<h1 style="font-size:14pt;margin:16pt 0 4pt;border-bottom:1.5pt solid #000">${esc(b.text)}</h1>`); break;
      case "heading": o.push(`<h2 style="font-size:12.5pt;margin:8pt 0 2pt">${esc(b.text)}</h2>`); break;
      case "para": o.push(`<p style="margin:3pt 0">${b.runs.map(runHtml).join("")}</p>`); break;
      case "note": o.push(`<p style="margin:2pt 0 6pt;font-size:10pt">${b.runs.map(runHtml).join("")}</p>`); break;
      case "list": o.push(`<ul style="margin:2pt 0 4pt">${b.items.map((i) => `<li style="font-size:10pt;margin:0 0 1pt">${esc(i)}</li>`).join("")}</ul>`); break;
      case "table": o.push(tableHtml(b.table)); break;
    }
  }
  o.push("</div>");
  return o.join("\n");
}

const WIDTH = 80;
/** Words wrapped to `w` columns. */
function wrap(text: string, w: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > w) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line];
}

function tableText(t: Table): string[] {
  const labels = t.rows.map((x) => (x.kind || /^[A-Z]/.test(x.label) ? x.label : `  ${x.label}`));
  const cols = t.head.length - 1;
  const ws = Array.from({ length: cols }, (_, i) => Math.max(t.head[i + 1].length, ...t.rows.filter((x) => x.kind !== "group").map((x) => x.cells[i].length)));
  const figures = ws.reduce((a, w) => a + w + 2, 0);
  const w0 = Math.min(Math.max(t.head[0].length, ...labels.map((x, i) => (t.rows[i].kind === "group" ? 0 : x.length))), Math.max(20, WIDTH - figures));
  const line = (label: string, cells: string[]) => (label.padEnd(w0) + cells.map((c, i) => `  ${c.padStart(ws[i])}`).join("")).trimEnd();
  const out: string[] = [];
  if (t.title) out.push(t.title);
  out.push(line(t.head[0], t.head.slice(1)));
  t.rows.forEach((row, k) => {
    if (row.kind === "group") {
      out.push(row.label);
      return;
    }
    if (row.kind === "subtotal" || row.kind === "total") out.push(" ".repeat(w0) + ws.map((w) => `  ${(row.kind === "total" ? "=" : "-").repeat(w)}`).join(""));
    const indent = labels[k].startsWith("  ") ? "  " : "";
    const parts = wrap(labels[k].trim(), w0 - indent.length).map((x) => indent + x);
    parts.slice(0, -1).forEach((x) => out.push(x));
    out.push(line(parts[parts.length - 1], row.cells));
  });
  return out;
}

/** The document as plain text: headings in capitals, tables as space-aligned columns, prose left for the destination to wrap. */
export function toText(doc: Doc): string {
  const o: string[] = [];
  for (const b of doc.blocks) {
    switch (b.kind) {
      case "title": o.push(b.text.toUpperCase(), ""); break;
      case "meta": o.push(b.text, ""); break;
      case "flag": o.push(`*** ${b.text} ***`, ""); break;
      case "part": o.push("=".repeat(Math.min(WIDTH, b.text.length)), b.text.toUpperCase(), "=".repeat(Math.min(WIDTH, b.text.length)), ""); break;
      case "heading": o.push(b.text.toUpperCase(), "-".repeat(b.text.length), ""); break;
      case "para": case "note": o.push(b.runs.map(runText).join(""), ""); break;
      case "list": o.push(...b.items.map((i) => `- ${i}`), ""); break;
      case "table": o.push(...tableText(b.table), ""); break;
    }
  }
  return `${o.join("\n").trimEnd()}\n`;
}

export function docFiles(ctx: WorkContext, opts: DocOptions): { html: string; text: string } {
  const doc = buildDoc(ctx, opts);
  return { html: toHtml(doc), text: toText(doc) };
}

// ---- getting it ready -----------------------------------------------------------------------------------------------------

/** What the page has when the copy starts, read again as it waits: the latest results and the slow lane's. */
export interface Live {
  work: WorkContext;
  compare: CompareRequest | null;
  /** The comparison is current and valid. */
  ready: boolean;
  breakeven: SlowState<Ties>;
  cursor: SlowState<Array<LeavePanel | null>>;
  /** L-4's (and A-4's) last day, if one was picked. */
  leaveAt: ISODate | null;
  /** Every complete offer, as the breakdowns' jobs ask for them, and their letters in its order. */
  request: CompareRequest | null;
  letters: Letter[];
  /** Every complete offer's breakdown is current and valid. */
  ownReady: boolean;
  /** A-4's cliffs, each offer's. */
  terms: SlowState<OfferTerms[]>;
}

const PATIENCE_MS = 15_000;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const byLetter = <T,>(letters: Letter[], xs: T[]): Partial<Record<Letter, T>> => Object.fromEntries(letters.map((l, i) => [l, xs[i]]));

/**
 * Asks the worker for what the document needs beyond the page's results, as the page's parts ask, so they share the results: for
 * the comparison, L-3's ties and L-4's panel at its last day; for a breakdown, A-4's cliffs and its panel at A-4's last day ("both":
 * the comparison's last day for every part). Waits for them, then builds the document. `get` reads the page's latest state.
 */
export async function prepare(get: () => Live, requestSlow: (job: SlowJob, key: string) => void, kind: DocKind = "comparison", letter?: Letter,
  detail: DocDetail = "summary"): Promise<{ html: string; text: string }> {
  const until = Date.now() + PATIENCE_MS;
  for (;;) {
    const s = get();
    const files = kind === "breakdown" ? ownFiles(s, requestSlow, letter, detail) : comparisonFiles(s, requestSlow, kind, letter, detail);
    if (files) return files;
    if (Date.now() > until) throw new Error(kind === "breakdown" ? "The breakdown took too long to work out." : "The comparison took too long to work out.");
    await sleep(100);
  }
}

/** A-4's cliffs and its panel at `at`, asked for; each offer's, by letter, once they're back for these inputs. */
function ownJobs(s: Live, requestSlow: (job: SlowJob, key: string) => void, at: ISODate, cursorAsked = false) {
  if (!s.ownReady || !s.request) return null;
  const terms = termsJob(s.request, s.work.today);
  const termsKey = JSON.stringify(terms);
  requestSlow(terms, termsKey);
  const cursor = cursorJobFor(s.request, at);
  const cursorKey = JSON.stringify(cursor);
  if (!cursorAsked) requestSlow(cursor, cursorKey);
  const n = s.letters.length;
  if (!(s.terms.key === termsKey && !s.terms.updating && s.terms.result?.length === n)) return null;
  if (!(s.cursor.key === cursorKey && !s.cursor.updating && s.cursor.result?.length === n)) return null;
  return { terms: byLetter(s.letters, s.terms.result), leave: { at, basis: "cash" as const, panels: byLetter(s.letters, s.cursor.result) } };
}

function ownFiles(s: Live, requestSlow: (job: SlowJob, key: string) => void, letter: Letter | undefined, detail: DocDetail) {
  if (!s.request) return null;
  // A-4's last day: the one picked, or six months after the earliest start (L-4's first).
  const earliest = s.request.offers.map((o) => o.startDate).sort()[0];
  const at = s.leaveAt ?? firstLastDay(leaveAxis(earliest, s.request.stayYears));
  const jobs = ownJobs(s, requestSlow, at);
  if (!jobs || !s.work.own) return null;
  const ctx: WorkContext = { ...s.work, own: { ...s.work.own, ...jobs } };
  return docFiles(ctx, { offers: s.request.offers, at, picked: s.leaveAt !== null, kind: "breakdown", letter: letter ?? s.letters[0], letters: s.letters,
    detail });
}

function comparisonFiles(s: Live, requestSlow: (job: SlowJob, key: string) => void, kind: DocKind, letter: Letter | undefined, detail: DocDetail) {
  const r = s.work.results;
  if (!(s.ready && s.compare && r)) return null;
  const basis: ValueBasis = r.view.basis === "perHour" ? r.view.perHourOf : r.view.basis;
  const lead = r.view.row.leads[basis];
  const axis = leaveAxis(r.view.row.window.start, r.view.row.years);
  const at = onAxis(axis, s.leaveAt ?? firstLastDay(axis));
  const ties = lead ? tieJob("breakeven", s.compare, basis, lead) : null;
  const cursor = cursorJobFor(s.compare, at);
  const tiesKey = ties && JSON.stringify(ties);
  const cursorKey = JSON.stringify(cursor);
  if (ties) requestSlow(ties, tiesKey!);
  requestSlow(cursor, cursorKey);
  const tiesFresh = !ties || (s.breakeven.key === tiesKey && !s.breakeven.updating && s.breakeven.result);
  const cursorFresh = s.cursor.key === cursorKey && !s.cursor.updating && s.cursor.result?.length === r.letters.length;
  // "Both": each breakdown's A-4 too, at the comparison's last day (the same job as L-4's, so asked once).
  const jobs = kind === "both" ? ownJobs(s, requestSlow, at, true) : null;
  if (!(tiesFresh && cursorFresh) || (kind === "both" && !(jobs && s.work.own))) return null;
  const ctx: WorkContext = { ...s.work, ...(jobs ? { own: { ...s.work.own!, ...jobs } } : {}), results: { ...r, ties: { ...r.ties, ...(ties ? { l3: s.breakeven.result! } : {}) },
    leave: { basis: "cash", stayEnd: axis.stayEnd, panels: s.cursor.result! } } };
  return docFiles(ctx, { offers: s.compare.offers, at, picked: s.leaveAt !== null, kind, letter, letters: r.letters, detail });
}
