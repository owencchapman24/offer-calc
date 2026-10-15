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
import { Warnings } from "./Warnings";
import { breakevenJob, cursorJob, leaveJob, paymentsJob } from "./slowJobs";
import { TheWork, type TheWorkProps } from "./TheWork";
import { type CompareRequest, type LeaveCurve, type LeavePanel, type SlowResponse, tieJob, type Ties, workJob } from "./protocol";
import * as Derive from "./derive";
import * as Detailed from "./Detailed";
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
    compare: { offers: inputs, household: toHousehold(household, wagesYear), stays: staysFor(household.stayYears), stayYears: household.stayYears,
      valuationDate: today, inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate },
    rents: offers.map((o) => ({ area: o.draft.costOfLiving.area!, state: o.draft.residence.state! })),
  });
  if (!out.sweep) return { issues: out.issues };
  const noHours = offers.filter((o) => !o.draft.hours.weekly).map((o) => o.letter);
  const view = verdict(out.sweep, letters, basis, household.stayYears, noHours, priceWords(household.pricesIn))!;
  return { today, household, wagesYear, offers, rents: out.rents, results: { sweep: out.sweep, detail: out.detail, view, letters } };
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
 * L-6 with its slow job run, as the worker would: the context with every offer's payments and tax years, and the schedule's
 * props, open on `letter`'s tables.
 */
export function withWork(ctx: WorkContext, letter: Letter = ctx.results!.letters[0]): { ctx: WorkContext; props: TheWorkProps } {
  const compare = compareOf(ctx);
  const job = workJob(compare);
  const out = runJob((post) => paymentsJob({ ...job, gen: 1 }, post));
  if (!out.ok || !("work" in out)) throw new Error(`L-6's job failed: ${out.ok ? "" : out.error}`);
  const next = { ...ctx, results: { ...ctx.results!, work: out.work } };
  return {
    ctx: next,
    props: { ctx: next, sample: true, compare, ready: true, work: { result: out.work, key: JSON.stringify(job), updating: false, error: null, ms: 0 },
      requestSlow: noop, open: true, letter, onOpen: noop, onLetter: noop },
  };
}

/** L-6 open on each offer's tables, in turn. */
export function renderWork(ctx: WorkContext): string {
  const w = withWork(ctx);
  return ctx.results!.letters.map((l) => renderToStaticMarkup(tree(w.ctx, [createElement(TheWork, { key: "w", ...w.props, letter: l })]))).join("\n");
}

/** The comparison's page: About you, the ledger, the lead schedule, L-1 (table view open), the bridge for one offer, L-2 (table view open), L-3 and L-4 when given, and L-5. */
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
    createElement(Warnings, { key: "w", ctx, sample: true }),
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
