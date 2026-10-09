import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Basis } from "../../src/offer/types";
import { About } from "./About";
import { ByYear } from "./ByYear";
import { asymmetries, asymmetryText } from "./comparability";
import { compute } from "./compute";
import { HELP, LEDGER_SECTIONS } from "./help";
import { Lead } from "./Lead";
import { Risk } from "./Risk";
import * as Derive from "./derive";
import * as Detailed from "./Detailed";
import { detailedModule, Ledger } from "./Ledger";
import { type AppOffer, ASSUMPTIONS, DEFAULT_HOUSEHOLD, type Letter, sampleOffers, toHousehold, toOfferInput } from "./model";
import type { WorkContext } from "./metrics";
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

/** The offers compared, by letter, and the comparison's work context. */
export function context(basis: Basis = "colAdjustedTotal", tweak: (o: AppOffer[]) => AppOffer[] = (o) => o, stay = 4): WorkContext {
  const offers = tweak(sampleOffers(VALUATION));
  const inputs = offers.map((o) => {
    const r = toOfferInput(o);
    if (!("offer" in r)) throw new Error("incomplete sample");
    return r.offer;
  });
  const letters = offers.map((o) => o.letter);
  const household = DEFAULT_HOUSEHOLD;
  const out = compute({
    compare: { offers: inputs, household: toHousehold(household, 2026), stays: [2, 3, 4, 5], stayYears: stay, valuationDate: VALUATION,
      inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate },
    rents: offers.map((o) => ({ area: o.draft.costOfLiving.area!, state: o.draft.residence.state! })),
  });
  if (!out.sweep) throw new Error(`The samples don't compare: ${JSON.stringify(out.issues)}`);
  const view = verdict(out.sweep, letters, basis, stay, offers.filter((o) => !o.draft.hours.weekly).map((o) => o.letter))!;
  return { today: VALUATION, household: { ...household, stayYears: stay }, wagesYear: 2026, offers, rents: out.rents,
    results: { sweep: out.sweep, detail: out.detail, view, letters } };
}

const noop = () => {};
const tree = (ctx: WorkContext, children: ReactElement[]) => createElement(WorkProvider, { ctx, children });

/** The ledger with these view choices. */
export function renderLedger(ctx: WorkContext, ui: Pick<UiState, "mode" | "section" | "editor">): string {
  return renderToStaticMarkup(tree(ctx, [createElement(Ledger, { key: "l", offers: ctx.offers, missing: new Map(), rents: ctx.rents, ui, dispatch: noop })]));
}

/** Every view of the inputs: About you, quick mode, and detailed mode with each section open, and each row editor open for each offer. */
export function renderAllInputs(ctx: WorkContext): string {
  const session = { ...initialSession(VALUATION), household: ctx.household, offers: ctx.offers };
  const parts = [
    renderToStaticMarkup(tree(ctx, [createElement(About, { key: "a", session, dispatch: noop, today: ctx.today, wagesYear: ctx.wagesYear })])),
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

/** The comparison's page: About you, the ledger, the lead schedule, L-1 (table view open), the bridge for one offer, and L-2 (table view open). */
export function renderPage(ctx: WorkContext, opts: { running?: boolean; bridgeOf?: Letter; ui?: Pick<UiState, "mode" | "section" | "editor"> } = {}): string {
  const session = { ...initialSession(VALUATION), household: ctx.household, offers: ctx.offers };
  const ui = { ...session.ui, byYear: { mode: opts.running ? "running" as const : "each" as const, table: true },
    bridge: { letter: opts.bridgeOf ?? "A", year: opts.running ? 2 : 1 } };
  return renderToStaticMarkup(tree(ctx, [
    createElement(About, { key: "a", session, dispatch: noop, today: ctx.today, wagesYear: ctx.wagesYear }),
    createElement(Ledger, { key: "l", offers: ctx.offers, missing: new Map(), rents: ctx.rents, ui: opts.ui ?? { mode: "quick" }, dispatch: noop }),
    createElement(Lead, { key: "s", view: ctx.results!.view, letters: ctx.results!.letters, stayYears: ctx.household.stayYears, updating: false, error: null, notes: [],
      sample: true, dispatch: noop, cautions: asymmetries(ctx.offers).map(asymmetryText) }),
    createElement(ByYear, { key: "y", ctx, ui, sample: true, dispatch: noop }),
    createElement(Risk, { key: "r", ctx, sample: true, tableOpen: true }),
  ]));
}
