import { createElement, type ReactElement } from "react";
import { expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Basis } from "../../src/offer/types";
import { About } from "./About";
import { Breakeven, type BreakevenProps } from "./Breakeven";
import { ByYear } from "./ByYear";
import { asymmetries, asymmetryText } from "./comparability";
import { compute } from "./compute";
import { HELP, LEDGER_SECTIONS } from "./help";
import { Lead } from "./Lead";
import { Leaving, type LeavingProps } from "./Leaving";
import { firstLastDay, leaveAxis, type LeaveBasis } from "./leaveModel";
import { Risk } from "./Risk";
import { breakevenJob, cursorJob, leaveJob, paymentsJob, termsJob as runTerms } from "./slowJobs";
import { TheWork, type TheWorkProps } from "./TheWork";
import {
  type Breakdown, type CompareRequest, cursorJobFor, type LeaveCurve, type LeavePanel, type OfferTerms, type SlowResponse, termsJob, tieJob, type Ties,
  workJob, type WorkOffer,
} from "./protocol";
import { BreakdownSection, OwnPinned, type OwnOffer, OwnRow, partsModule } from "./Breakdown";
import * as Parts from "./BreakdownParts";
import type { PartsProps } from "./BreakdownParts";
import * as Derive from "./derive";
import * as Detailed from "./Detailed";
import * as VerdictCode from "./LeadVerdict";
import { verdictModule } from "./Later";
import { detailedModule, Ledger } from "./Ledger";
import {
  type AppHousehold, type AppOffer, ASSUMPTIONS, DEFAULT_HOUSEHOLD, firstYear, type Letter, type Missing, sampleOffers, toHousehold, toOfferInput,
} from "./model";
import { type Derivation, type MetricId, rentNotes, type WorkContext } from "./metrics";
import { priceWords } from "./prices";
import { initialSession, type UiState } from "./session";
import { derivations, WorkProvider } from "./Tickmarks";
import { verdict } from "./verdict";

// Shared by the app's tests: the samples' comparison as Show the work sees it, and static renders of
// every view of the inputs (quick mode, each detailed section, each row editor). Not part of the app.

// The app loads detailed mode and the derivations on first use (separate chunks); a static render can't
// wait for one, so they're supplied up front.
detailedModule.provide(Detailed);
derivations.provide(Derive);
verdictModule.provide(VerdictCode);
partsModule.provide(Parts);

/** The samples valued on their own start date, as in docs/ui-design.md §4.1-4.2, so the numbers are the design doc's. */
export const VALUATION = "2026-07-13";

/** The offers compared, by letter, and the comparison's work context. `about` changes About you (Prices in, say). */
export function context(basis: Basis = "colAdjustedTotal", tweak: (o: AppOffer[]) => AppOffer[] = (o) => o, stay = 4,
  about: Partial<AppHousehold> = {}): WorkContext {
  const ctx = contextOf(tweak(sampleOffers(VALUATION)), { ...DEFAULT_HOUSEHOLD, ...about, stayYears: stay }, VALUATION, basis);
  if ("issues" in ctx) throw new Error(`The samples don't compare: ${JSON.stringify(ctx.issues)}`);
  return ctx;
}

/** The stays the lead's "if you stay" row compares, as the app asks for them: 2 to 5 years, and yours. */
const staysFor = (stayYears: number) => [...new Set([2, 3, 4, 5, stayYears])].sort((a, b) => a - b);

/**
 * Any offers' work context, as the app builds it on `today`: other wages in the earliest start's calendar year, the stays it
 * compares, the verdict on `basis`. The engine's problems with the inputs instead, when it has any.
 */
export function contextOf(offers: AppOffer[], household: AppHousehold, today: string, basis: Basis = "colAdjustedTotal"):
  WorkContext | { issues: unknown } {
  const inputs = offers.map((o) => {
    const r = toOfferInput(o);
    if (!("offer" in r)) throw new Error(`Offer ${o.letter} is incomplete: ${r.missing.join(", ")}`);
    return r.offer;
  });
  const letters = offers.map((o) => o.letter);
  const wagesYear = firstYear(offers, today);
  const out = compute({
    offers: { offers: inputs, household: toHousehold(household, wagesYear), stays: staysFor(household.stayYears), stayYears: household.stayYears,
      valuationDate: today, inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate },
    ids: letters,
    rents: offers.map((o) => ({ area: o.draft.costOfLiving.area!, state: o.draft.residence.state! })),
  });
  if (!out.breakdowns || out.issues.some((x) => x.length)) return { issues: out.issues };
  // Each offer's breakdown, as the app keeps it: restated at the prices picked once they're a city's or there's a comparison; with the
  // slow jobs its parts ask for run, as the worker would (A-4's cliffs and last day, A-7's payments).
  const prices = priceWords(household.pricesIn);
  const breakdowns = out.breakdowns as Partial<Record<Letter, Breakdown>>;
  const base0 = { today, household, wagesYear, offers, rents: out.rents, own: { breakdowns, withRef: offers.length >= 2 || !prices.us } };
  const base = { ...base0, own: { ...base0.own, ...ownJobs(base0).own } };
  if (!out.sweep) return base;
  const noHours = offers.filter((o) => !o.draft.hours.weekly).map((o) => o.letter);
  const view = verdict(out.sweep, letters, basis, household.stayYears, noHours, prices)!;
  return { ...base, results: { sweep: out.sweep, detail: out.detail, view, letters } };
}

/** One offer's work context, on its own (no comparison): the samples' offer `letter`, as the app has it with that offer alone. */
export function alone(letter: Letter = "A", tweak: (o: AppOffer) => AppOffer = (o) => o, about: Partial<AppHousehold> = {}): WorkContext {
  const o = sampleOffers(VALUATION).find((x) => x.letter === letter)!;
  const ctx = contextOf([tweak({ ...o, letter: "A" })], { ...DEFAULT_HOUSEHOLD, stayYears: 4, ...about }, VALUATION);
  if ("issues" in ctx) throw new Error(`Sample ${letter} doesn't work out: ${JSON.stringify(ctx.issues)}`);
  return ctx;
}

/** The breakdown's offers as the app passes them (App.tsx): each offer with its input and breakdown. */
export function ownOffers(ctx: WorkContext): OwnOffer[] {
  return ctx.offers.map((o) => {
    const r = toOfferInput(o);
    return { offer: o, input: "offer" in r ? r.offer : null, breakdown: ctx.own?.breakdowns[o.letter] ?? null, missing: "missing" in r ? r.missing : [] };
  });
}

/**
 * One offer's page: About you, the ledger, its bottom line (A-1) pinned beside it, and A-2 to A-7 under them with every part's detail
 * open (its slow jobs run, as the worker would).
 */
export function renderAlone(ctx0: WorkContext, opts: { firstUse?: boolean; parts?: (p: PartsOf) => PartsOf } = {}): string {
  const { ctx, parts: given } = withParts(ctx0);
  const parts = opts.parts ? opts.parts(given) : given;
  const session = { ...initialSession(VALUATION), household: ctx.household, offers: ctx.offers };
  const x = ownOffers(ctx)[0];
  const prices = priceWords(ctx.household.pricesIn);
  return renderToStaticMarkup(tree(ctx, [
    createElement(About, { key: "a", session, dispatch: noop, today: ctx.today, wagesYear: ctx.wagesYear }),
    createElement(Ledger, { key: "l", offers: ctx.offers, missing: new Map(), rents: ctx.rents, ui: { mode: "quick" }, dispatch: noop }),
    createElement(OwnPinned, { key: "o", x, prices, withRef: ctx.own!.withRef, updating: false, problems: null, notes: [],
      firstUse: opts.firstUse ?? false, dispatch: noop }),
    createElement(Parts.OwnParts, { key: "p", ...parts, ctx, x, prices }),
  ]));
}

/** The breakdown section with two or more offers, on each offer's tab in turn (A-1 to A-7, every part open), and the ledger's "On its own" row. */
export function renderBreakdowns(ctx0: WorkContext): string {
  const { ctx, parts } = withParts(ctx0);
  const offers = ownOffers(ctx);
  const prices = priceWords(ctx.household.pricesIn);
  return [
    renderToStaticMarkup(tree(ctx, [createElement(Ledger, { key: "l", offers: ctx.offers, missing: new Map(), rents: ctx.rents, ui: { mode: "quick" },
      dispatch: noop, foot: createElement(OwnRow, { offers, prices, dispatch: noop }) })])),
    ...offers.map((x) => renderToStaticMarkup(tree(ctx, [createElement(BreakdownSection, { key: "b", offers, tab: x.offer.letter, prices, updating: false,
      sample: true, dispatch: noop, ctx, parts })]))),
  ].join("\n");
}

/** Every complete offer, as the breakdowns' slow jobs project them (App.tsx's request). */
export function requestOf(ctx: Pick<WorkContext, "offers" | "household" | "wagesYear" | "today">): CompareRequest {
  return {
    offers: ctx.offers.map((o) => (toOfferInput(o) as { offer: CompareRequest["offers"][number] }).offer),
    household: toHousehold(ctx.household, ctx.wagesYear), stays: staysFor(ctx.household.stayYears), stayYears: ctx.household.stayYears,
    valuationDate: ctx.today, inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate,
  };
}

/** A-4's first last day, as the app picks it: six months' work from the earliest start (L-4's, W6). */
const firstDayOf = (ctx: Pick<WorkContext, "offers" | "household">) =>
  firstLastDay(leaveAxis(ctx.offers.map((o) => o.draft.startDate!).sort()[0], ctx.household.stayYears));

/**
 * The breakdowns' slow jobs run, as the worker would: A-7's payments and tax years, A-4's cliffs, and A-4's last day (L-4's panel,
 * six months in from the earliest start), by letter, and the jobs' results as the worker posts them.
 */
function ownJobs(ctx: Pick<WorkContext, "offers" | "household" | "wagesYear" | "today">) {
  const request = requestOf(ctx);
  const letters = ctx.offers.map((o) => o.letter);
  const byLetter = <T,>(xs: T[]) => Object.fromEntries(letters.map((l, i) => [l, xs[i]])) as Partial<Record<Letter, T>>;
  const work = runJob((post) => paymentsJob({ ...workJob(request), gen: 1 }, post));
  const terms = runJob((post) => runTerms({ ...termsJob(request, ctx.today), gen: 1 }, post));
  const at = firstDayOf(ctx);
  const cursor = runJob((post) => cursorJob({ ...cursorJobFor(request, at), gen: 1 }, post));
  if (!work.ok || !("work" in work) || !terms.ok || !("terms" in terms) || !cursor.ok || !("panels" in cursor)) throw new Error("The breakdowns' jobs failed");
  return {
    request, at, work: work.work, terms: terms.terms, panels: cursor.panels,
    own: { work: byLetter<WorkOffer>(work.work), terms: byLetter<OfferTerms>(terms.terms),
      leave: { at, basis: "cash" as const, panels: byLetter<LeavePanel | null>(cursor.panels) } },
  };
}

/** The breakdown's parts' props, as the app passes them, every part's detail open: their slow jobs keyed as they key their requests. */
type PartsOf = Omit<PartsProps, "ctx" | "x" | "prices">;

export function withParts(ctx: WorkContext): { ctx: WorkContext; parts: PartsOf } {
  const request = requestOf(ctx);
  const letters = ctx.offers.map((o) => o.letter);
  const own = ctx.own!;
  const at = own.leave?.at ?? firstDayOf(ctx);
  const list = <T,>(m: Partial<Record<Letter, T>> | undefined) => letters.map((l) => m?.[l] ?? null);
  const slow = <T,>(result: T, key: string) => ({ result, key, updating: false, error: null, ms: 0 });
  const ui = { ...initialSession(VALUATION).ui, parts: { a2: true, a3: true, a4: true, a5: true, a6: true }, work: { open: true } };
  return {
    ctx,
    parts: {
      ui, dispatch: noop, request, ready: true, requestSlow: noop, status: null,
      slow: { work: slow(list(own.work) as WorkOffer[], JSON.stringify(workJob(request))),
        terms: slow(list(own.terms) as OfferTerms[], JSON.stringify(termsJob(request, ctx.today))),
        cursor: slow(list(own.leave?.panels), JSON.stringify(cursorJobFor(request, at))) },
      leave: { at: null, basis: own.leave?.basis ?? "cash", onAt: noop },
    },
  };
}

const noop = () => {};
const tree = (ctx: WorkContext, children: ReactElement[]) => createElement(WorkProvider, { ctx, children });

/** The ledger with these view choices; `tabbed`, as on a phone (one offer at a time). */
export function renderLedger(ctx: WorkContext, ui: Pick<UiState, "mode" | "section" | "editor" | "offerTab">,
  opts: { tabbed?: boolean; missing?: Map<string, Missing[]> } = {}): string {
  return renderToStaticMarkup(tree(ctx, [createElement(Ledger, {
    key: "l", offers: ctx.offers, missing: opts.missing ?? new Map(), rents: ctx.rents, ui, dispatch: noop, tabbed: opts.tabbed,
  })]));
}

/** Every view of the inputs: About you, quick mode, and detailed mode with each section open, and each row editor open for each offer. */
export function renderAllInputs(ctx: WorkContext): string {
  const session = { ...initialSession(VALUATION), household: ctx.household, offers: ctx.offers };
  // About you as it is, and filing jointly (the spouse's wages show then).
  const joint = { ...session, household: { ...session.household, filingStatus: "joint" as const } };
  const parts = [
    renderToStaticMarkup(tree(ctx, [createElement(About, { key: "a", session, dispatch: noop, today: ctx.today, wagesYear: ctx.wagesYear })])),
    renderToStaticMarkup(tree(ctx, [createElement(About, { key: "a", session: joint, dispatch: noop, today: ctx.today, wagesYear: ctx.wagesYear })])),
    renderLedger(ctx, { mode: "quick" }),
  ];
  const editors = [...new Set(Object.values(HELP).flatMap((h) => (h.editor ? [`${h.group}|${h.editor}`] : [])))];
  for (const s of LEDGER_SECTIONS) {
    parts.push(renderLedger(ctx, { mode: "detailed", section: s.id }));
    for (const e of editors) {
      const [group, row] = e.split("|");
      if (group !== s.id) continue;
      for (const o of ctx.offers) parts.push(renderLedger(ctx, { mode: "detailed", section: s.id, editor: { row, letter: o.letter } }));
    }
  }
  return parts.join("\n");
}

/** The comparison's request for the context's offers, as the app sends it. */
export function compareOf(ctx: WorkContext): CompareRequest {
  return {
    offers: ctx.results!.letters.map((l) => (toOfferInput(ctx.offers.find((o) => o.letter === l)!) as { offer: CompareRequest["offers"][number] }).offer),
    household: toHousehold(ctx.household, ctx.wagesYear), stays: staysFor(ctx.household.stayYears), stayYears: ctx.household.stayYears,
    valuationDate: ctx.today,
    inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate,
  };
}

/** Runs a slow job to the end, as the worker's runner would, and returns what it posts. */
export function runJob(job: (post: (r: SlowResponse) => void) => Generator<void>): SlowResponse {
  let out: SlowResponse | null = null;
  const g = job((r) => { out = r; });
  while (!g.next().done) { /* every chunk */ }
  return out!;
}

/**
 * L-4 with its slow jobs run, as the worker would: the context with the panel at `at` (default: six months
 * in), and the schedule's props.
 */
export function withLeave(ctx: WorkContext, at?: string, basis: LeaveBasis = "cash"): { ctx: WorkContext; props: LeavingProps } {
  const r = ctx.results!;
  const axis = leaveAxis(r.view.row.window.start, r.view.row.years);
  const compare = compareOf(ctx);
  const base = { offers: compare.offers, household: compare.household, inflation: compare.inflation };
  const day = at ?? firstLastDay(axis);
  const leave = runJob((post) => leaveJob({ lane: "leave", gen: 1, ...base, end: axis.end }, post));
  const cursor = runJob((post) => cursorJob({ lane: "cursor", gen: 1, ...base, leaveDate: day }, post));
  if (!leave.ok || !cursor.ok || !("curves" in leave) || !("panels" in cursor)) throw new Error("L-4's jobs failed");
  const panels: Array<LeavePanel | null> = cursor.panels;
  const curves: LeaveCurve[] = leave.curves;
  const next = { ...ctx, results: { ...r, leave: { basis, stayEnd: axis.stayEnd, panels } } };
  // Keyed as the schedule keys its requests, so it renders as up to date.
  const slow = <T,>(result: T, key: string) => ({ result, key, updating: false, error: null, ms: 0 });
  return {
    ctx: next,
    props: { ctx: next, sample: true, compare, ready: true, leave: slow(curves, JSON.stringify({ lane: "leave", ...base, end: axis.end })),
      cursor: slow(panels, JSON.stringify({ lane: "cursor", ...base, leaveDate: day })), requestSlow: noop, at: day, basis,
      onAt: noop, onBasis: noop },
  };
}

/**
 * L-3 and the close-call line with their slow jobs run, as the worker would: the context with both results, and L-3's
 * props (without its context). The close-call line's job runs only when the verdict is a close call on a dollar basis.
 */
export function withTies(ctx: WorkContext): { ctx: WorkContext; props: Omit<BreakevenProps, "ctx"> } {
  const r = ctx.results!;
  const compare = compareOf(ctx);
  const basis = r.view.basis === "perHour" ? r.view.perHourOf : r.view.basis;
  const run = (job: ReturnType<typeof tieJob>): Ties => {
    const out = runJob((post) => breakevenJob({ ...job, gen: 1 }, post));
    if (!out.ok || !("ties" in out)) throw new Error(`L-3's job failed: ${out.ok ? "" : out.error}`);
    return out.ties;
  };
  const job = tieJob("breakeven", compare, basis, r.view.row.leads[basis]!);
  const l3 = run(job);
  const lead = r.view.lead;
  const flip = lead?.closeCall && lead.margin > 0 && r.view.basis !== "perHour" ? run(tieJob("flip", compare, r.view.basis, lead)) : undefined;
  return {
    ctx: { ...ctx, results: { ...r, ties: { l3, ...(flip ? { flip } : {}) } } },
    props: { sample: true, compare, ready: true, ties: { result: l3, key: JSON.stringify(job), updating: false, error: null, ms: 0 }, requestSlow: noop },
  };
}

/**
 * A-7 with its slow job run, as the worker would: the context with every offer's payments and tax years, each over its own stay,
 * and A-7's props, open on `letter`'s tables.
 */
export function withWork(ctx: WorkContext, letter: Letter = ctx.offers[0].letter): { ctx: WorkContext; props: TheWorkProps } {
  if (ctx.own?.work) return { ctx, props: { ctx, letter, open: true, onOpen: noop, fresh: true, error: null } };
  const request = requestOf(ctx);
  const out = runJob((post) => paymentsJob({ ...workJob(request), gen: 1 }, post));
  if (!out.ok || !("work" in out)) throw new Error(`A-7's job failed: ${out.ok ? "" : out.error}`);
  const work = Object.fromEntries(ctx.offers.map((o, i) => [o.letter, out.work[i]])) as Partial<Record<Letter, WorkOffer>>;
  const next = { ...ctx, own: { ...ctx.own!, work } };
  return { ctx: next, props: { ctx: next, letter, open: true, onOpen: noop, fresh: true, error: null } };
}

/** Every offer's A-7, open on its tables. */
export function renderWork(ctx: WorkContext): string {
  const w = withWork(ctx);
  return ctx.offers.map((o) => renderToStaticMarkup(tree(w.ctx, [createElement(TheWork, { key: "w", ...w.props, letter: o.letter })]))).join("\n");
}

/** The comparison's page: About you, the ledger, the lead schedule, L-1 (table view open), L-2 (table view open), and L-3 and L-4 when given. */
export function renderPage(ctx: WorkContext, opts: { running?: boolean; bridgeOf?: Letter; ui?: Pick<UiState, "mode" | "section" | "editor">;
  leave?: LeavingProps; ties?: Omit<BreakevenProps, "ctx"> } = {}): string {
  const session = { ...initialSession(VALUATION), household: ctx.household, offers: ctx.offers };
  const ui = { ...session.ui, byYear: { mode: opts.running ? "running" as const : "each" as const, table: true },
    bridge: { letter: opts.bridgeOf ?? "A", year: opts.running ? 2 : 1 } };
  const flip = ctx.results!.ties?.flip;
  return renderToStaticMarkup(tree(ctx, [
    createElement(About, { key: "a", session, dispatch: noop, today: ctx.today, wagesYear: ctx.wagesYear }),
    createElement(Ledger, { key: "l", offers: ctx.offers, missing: new Map(), rents: ctx.rents, ui: opts.ui ?? { mode: "quick" }, dispatch: noop }),
    createElement(Lead, { key: "s", view: ctx.results!.view, letters: ctx.results!.letters, stayYears: ctx.household.stayYears, updating: false, error: null, notes: [],
      sample: true, dispatch: noop, cautions: asymmetries(ctx.offers).map(asymmetryText),
      flip: flip ? { row: flip.rows[0].salary, updating: false, error: null } : null, rentNotes: rentNotes(ctx) }),
    createElement(ByYear, { key: "y", ctx, ui, sample: true, dispatch: noop }),
    createElement(Risk, { key: "r", ctx, sample: true, tableOpen: true }),
    ...(opts.ties ? [createElement(Breakeven, { key: "b", ctx, ...opts.ties })] : []),
    ...(opts.leave ? [createElement(Leaving, { key: "v", ...opts.leave })] : []),
  ]));
}

// ---- figures as displayed ---------------------------------------------------------------------------

export const parseShown = (s: string) => {
  const t = s.replace(/[$,]/g, "").replace(/^\((.*)\)$/, "-$1").replace("−", "-");
  if (t.endsWith("%")) return Number(t.slice(0, -1)) / 100;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  return frac ? Number(frac[1]) / Number(frac[2]) : Number(t);
};
/** Half a unit in the last place shown: "1,234" -> 0.5, "9,166.67" -> 0.005, "30.52027%" -> 0.0000005. */
export const half = (s: string) => {
  const d = s.replace(/[%)]/g, "").split(".")[1]?.length ?? 0;
  return (0.5 * 10 ** -d) / (s.endsWith("%") ? 100 : 1);
};

/**
 * A derivation's lines, worked as displayed: each op applies to the running figure, and each "=" line must be it, to the
 * precision shown (the figure shown is the result rounded). A line with no op after an "=" starts again. Fails with the line.
 */
export function footsAsDisplayed(id: MetricId, d: Derivation) {
  let acc: number | null = null;
  for (const l of d.lines) {
    if (!l.value || l.value === "below $0") { acc = null; continue; }
    const v = parseShown(l.value);
    if (Number.isNaN(v)) { acc = null; continue; }
    if (!l.op || acc === null) { acc = v; continue; }
    switch (l.op) {
      case "+": acc += v; break;
      case "−": acc -= v; break;
      case "×": acc *= v; break;
      case "÷": acc /= v; break;
      case "=":
        // The arithmetic of the figures shown, rounded as the result is shown: no slack for how its operands were rounded.
        expect(Math.abs(acc - v), `${id}: ${l.label} = ${l.value}, worked out ${acc}`).toBeLessThanOrEqual(half(l.value) + 1e-9);
        acc = v;
    }
  }
}
