import { type Dispatch, type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import type { OfferInput } from "../../src/offer/types";
import type { PartsProps } from "./BreakdownParts";
import { lazyModule, useLazyModule, useLoadNear } from "./lazy";
import type { WorkContext } from "./metrics";
import { inDollars, ownSentence, ownView, type OwnView, prefixOf, shareText, stayText, taxRateText } from "./breakdownModel";
import { Fig, useRovingTicks } from "./figures";
import { type AppOffer, type Letter, type Missing, toOfferInput } from "./model";
import type { PriceWords } from "./prices";
import type { Breakdown } from "./protocol";
import type { Action } from "./session";
import { cents, dollars } from "./text";
import { markFirstAnswer, Stamp, TickLegend, usePrinting } from "./ui";

// An offer's breakdown (docs/v2-plan.md, item 5, stops 5A and 5B): A-1, its bottom line, over its own stay at its own prices, then
// A-2 to A-7 (BreakdownParts.tsx, a chunk of their own, loaded as you scroll toward them). With one offer A-1 is pinned where the
// verdict goes and A-2 to A-7 are a section under the columns; with two or more the breakdown is a section under the columns, one
// offer at a time, and the ledger's "On its own" row gives each offer's bottom line in the common dollars. Loaded once the page has
// painted, beside the worker, not in the main chunk (App.tsx); like the schedules it imports figures.tsx, never Tickmarks.tsx.

/** One offer, as the breakdown needs it: the ledger's offer, its engine input (complete), and its breakdown once worked out. */
export interface OwnOffer { offer: AppOffer; input: OfferInput | null; breakdown: Breakdown | null; missing: Missing[] }

/**
 * The breakdowns' parts, for the page to place (App.tsx): with fewer than two complete offers, the pinned bottom line of the
 * complete one (or the first) and its bars; with two or more, the section under the columns and the ledger's foot row. Also what
 * Show the work reads (`own`) and the live region's sentence with one offer. Here, not in App.tsx, to keep the main chunk light.
 */
export function ownSlots(a: {
  offers: AppOffer[]; /** By offer id, from the worker. */ breakdowns: Record<string, Breakdown>; prices: PriceWords; tab?: Letter;
  stayYears: number; updating: boolean; sample: boolean; notes: string[]; firstUse: boolean; dispatch: Dispatch<Action>;
  /** Problems with the latest inputs, each with "Fix it" (Lead.tsx's, which this chunk mustn't import: it would split the main chunk). */
  problems: ReactNode;
  /** What A-2 to A-7 need beyond the offer and the page's context: the page's state and its slow jobs (BreakdownParts.tsx). */
  parts: Omit<PartsProps, "ctx" | "x" | "prices">;
}) {
  const owned: OwnOffer[] = a.offers.map((o) => {
    const r = toOfferInput(o);
    return { offer: o, input: "offer" in r ? r.offer : null, breakdown: a.breakdowns[o.id] ?? null, missing: "missing" in r ? r.missing : [] };
  });
  const comparing = owned.filter((x) => x.input).length >= 2;
  const alone = comparing ? null : owned.find((x) => x.input) ?? owned[0];
  const breakdowns: Partial<Record<Letter, Breakdown>> = {};
  for (const x of owned) if (x.input && x.breakdown) breakdowns[x.offer.letter] = x.breakdown;
  const tab = owned.find((x) => x.offer.letter === a.tab)?.offer.letter ?? owned[0].offer.letter;
  return {
    /** Each offer's breakdown, by letter; restated at the prices picked once they're a city's or there's a comparison. */
    own: { breakdowns, withRef: comparing || !a.prices.us },
    said: alone ? sentenceOf(alone, a.prices) : null,
    pinned: alone ? <OwnPinned x={alone} prices={a.prices} withRef={!a.prices.us} updating={a.updating}
      problems={a.problems} notes={a.notes} firstUse={a.firstUse} dispatch={a.dispatch} /> : null,
    /** Under the columns, given the page's context: with two or more offers the breakdowns, one at a time; with one, its A-2 to A-7. */
    section: (ctx: WorkContext) => (comparing
      ? <BreakdownSection offers={owned} tab={tab} prices={a.prices} updating={a.updating} sample={a.sample} dispatch={a.dispatch} ctx={ctx} parts={a.parts} />
      : alone?.input && alone.breakdown ? <PartsSection x={alone} prices={a.prices} sample={a.sample} ctx={ctx} parts={a.parts} /> : null),
    foot: comparing ? <OwnRow offers={owned} prices={a.prices} dispatch={a.dispatch} /> : null,
    bar: (place: "top" | "bottom", hidden = false) => (alone
      ? <OwnBar x={alone} prices={a.prices} place={place} stayYears={a.stayYears} updating={a.updating} hidden={hidden} /> : null),
  };
}

/** A-1's figures for an offer, or null until they're worked out (or while it's incomplete). */
export function viewOf(x: OwnOffer, prices: PriceWords, withRef: boolean): OwnView | null {
  if (!x.input || !x.breakdown) return null;
  try {
    return ownView(x.offer.letter, x.breakdown, x.input, prices, withRef);
  } catch {
    return null;
  }
}

/** The live region's sentence with one offer (LiveVerdict, Lead.tsx). */
export const sentenceOf = (x: OwnOffer, prices: PriceWords) => {
  const v = viewOf(x, prices, false);
  return v ? ownSentence(v) : null;
};

const MISSING: Record<Missing, string> = { salary: "a salary", city: "a city", "start date": "a start date" };
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const nameOf = (o: AppOffer) => `${o.letter} · ${o.draft.label || `Offer ${o.letter}`}, on its own`;

/** Goes to an offer's bottom line: its heading takes focus. */
export function toOwn() {
  const h = document.getElementById("own-title");
  h?.scrollIntoView({ block: "start" });
  h?.focus({ preventScroll: true });
}

/**
 * A-1's body: the bottom line over the offer's own stay, year 1 as paid, tax, per hour and the bad case. `compared`: there's a
 * comparison, whose figure (at the prices picked) the restated line names. Each sentence says its dollars once, in words, and its
 * figures go without them; each figure's label keeps them ("New York $7,563"), as a table's heads do (condition 1, as amended on
 * 2026-10-16).
 */
function OwnBody({ v, prices, compared }: { v: OwnView; prices: PriceWords; compared: boolean }) {
  useEffect(markFirstAnswer, []);
  const L = v.letter;
  const $ = (x: number) => inDollars(v.place, x);
  const a = v.month;
  return (
    <div className="own-body">
      {/* One sentence, its parts on lines of their own: the stay and its dollars, the total, and its two parts. */}
      <p className="own-lines">
        <span className="scope own-scope">{stayText(v)}, a month, in today's dollars at {v.place} prices:</span>{" "}
        <span className="own-hero">
          <Fig id={`own.${L}.total`} label={`${$(a.total)} a month over your stay`}>{dollars(a.total)}</Fig>{" "}
          <span className="own-per">a month over your stay</span>
        </span>{" "}
        <span className="own-split">
          = <Fig id={`own.${L}.spend`} label={`${$(a.spend)} a month to spend after rent, over your stay`}>{dollars(a.spend)}</Fig> to spend after rent{" "}
          + <Fig id={`own.${L}.saved`} label={`${$(a.saved)} a month saved, over your stay`}>{dollars(a.saved)}</Fig> saved
        </span>
      </p>
      {a.total < 0 && <p className="note">Rent and tax take more than this offer pays, so there's less than nothing left to spend.</p>}
      {v.ref && (
        <p className="own-ref">
          {compared ? "In the comparison" : "At the prices you picked"}:{" "}
          <Fig id={`own.${L}.total`} label={`${$(a.total)} a month over your stay`}>{dollars(a.total)}</Fig> in {v.place} dollars{" "}
          {v.ref.step >= 0 ? "−" : "+"} <Fig id={`own.${L}.prices`} label={`${v.place} prices, ${dollars(Math.abs(v.ref.step))} a month over your stay`}>
            {dollars(Math.abs(v.ref.step))}</Fig> for {v.place}'s {v.ref.step >= 0 ? "higher" : "lower"} prices{" "}
          = <Fig id={`own.${L}.ref`} label={`${inDollars(v.ref.place, v.ref.month)} a month over your stay`}>{dollars(v.ref.month)}</Fig> in{" "}
          {prices.dollars}, a month over your stay
        </p>
      )}
      {v.year1 && (
        <p className="own-year1">
          Year 1, as paid, in {v.place} dollars:{" "}
          <Fig id={`own.${L}.y1spend`} label={`${$(v.year1.spendMonth)} a month to spend after rent, in year 1`}>{dollars(v.year1.spendMonth)}</Fig> a
          month to spend after rent + <Fig id={`own.${L}.y1saved`} label={`${$(v.year1.savedMonth)} a month saved, in year 1`}>
            {dollars(v.year1.savedMonth)}</Fig> a month saved. {v.differs}
        </p>
      )}
      <p className="own-facts">
        {v.tax && (
          <>Tax: <Fig id={`own.${L}.rate`} label={`${taxRateText(v.tax.rate)} of its pay over your stay, in tax`}>{taxRateText(v.tax.rate)}</Fig> of its
            pay over your stay</>
        )}
        {v.tax && v.hour && " · "}
        {v.hour && (
          <>Per hour worked over your stay, after tax and rent, in {v.place} dollars:{" "}
            <Fig id={`own.${L}.hour`} label={`${v.place} ${cents(v.hour.value)} an hour worked over your stay, after tax and rent`}>
              {cents(v.hour.value)}</Fig></>
        )}
      </p>
      <p className="own-bear">
        {v.bear ? (
          <>Bear case, in {v.place} dollars: <Fig id={`own.${L}.bear`} label={`${$(v.bear.month)} a month over your stay, bear case`}>{dollars(v.bear.month)}</Fig> a
            month over your stay
            {v.bear.drop !== null ? (
              <>, <Fig id={`own.${L}.drop`} label={`${shareText(v.bear.drop)} under the base case, over your stay`}>{shareText(v.bear.drop)}</Fig> under the base
                case over your stay.</>
            ) : v.bear.month === a.total ? ": no range changes anything inside your stay." : "."}
          </>
        ) : <>Bear case: no ranges entered, so it's the base case. Add a range in detailed mode (+ range) to see one.</>}
      </p>
    </div>
  );
}

/** A-1's place while its figures are worked out, or what's missing until they can be. */
function OwnWaiting({ x }: { x: OwnOffer }) {
  return x.missing.length
    ? <p className="note own-missing">Add {andList(x.missing.map((m) => MISSING[m]))} to see {x.offer.letter} on its own.</p>
    : <p className="note own-missing">Working out {x.offer.letter} on its own…</p>;
}

/**
 * One offer: its breakdown's head, pinned where the verdict goes (docs/v2-plan.md, item 5, "How it's reached"), so the answer stays
 * in view as you edit. `problems` and `notes` are the page's, as the lead schedule shows them.
 */
export function OwnPinned({ x, prices, withRef, updating, problems, notes, firstUse, dispatch }: {
  x: OwnOffer; prices: PriceWords; withRef: boolean; updating: boolean; problems: ReactNode; notes: string[];
  /** The first-use note for the after-rent figure, until "Got it". */ firstUse: boolean; dispatch: Dispatch<Action>;
}) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const v = viewOf(x, prices, withRef);
  return (
    <section ref={ref} id="own" className={`schedule own${updating ? " is-updating" : ""}`} aria-labelledby="own-head" aria-busy={updating}>
      <header className="schedule-head">
        <h2 id="own-head">{nameOf(x.offer)}</h2>
        {x.offer.sample === "sample" && <Stamp>Sample</Stamp>}
        {x.offer.sample === "edited" && <Stamp>Edited sample</Stamp>}
        <span className="updating" aria-hidden={!updating}>{updating ? "Updating…" : ""}</span>
      </header>
      {notes.map((n) => <p key={n} className="note">{n}</p>)}
      {problems}
      <h3 id="own-title" className="part-title" tabIndex={-1}><span className="ref">{x.offer.letter}-1</span> The bottom line</h3>
      {v && firstUse && (
        <div className="first-use" role="note">
          <p>
            This is much less than the salary on purpose: it's what's left to spend after tax and rent, plus what you save, a month in
            today's dollars.
          </p>
          <p className="first-use-actions">
            <a href="#/method/M-1">How it's worked out</a>
            <button type="button" className="got-it" onClick={() => dispatch({ type: "dismiss", hint: "afterRent" })}>Got it</button>
          </p>
        </div>
      )}
      {v ? <OwnBody v={v} prices={prices} compared={false} /> : <OwnWaiting x={x} />}
      <TickLegend />
    </section>
  );
}

/**
 * An offer's breakdown, A-2 to A-7 (BreakdownParts.tsx): loaded as you scroll toward it. Here, not in Later.tsx: this chunk importing
 * Later.tsx split modules off the main chunk. The page loads it through this chunk (Later.tsx's loadParts).
 */
export const partsModule = lazyModule(() => import("./BreakdownParts"));

/** A-2 to A-7 for an offer, once their code is here: it loads as you scroll toward them. */
function PartsSlot(props: PartsProps) {
  const m = useLazyModule(partsModule);
  const ref = useRef<HTMLDivElement>(null);
  useLoadNear(partsModule, ref, m !== null);
  return m ? <m.OwnParts {...props} /> : <div ref={ref} className="later parts-slot" />;
}

/** One offer: A-2 to A-7 under the columns, full width, A-1 being pinned beside them (docs/v2-plan.md, item 5, "How it's reached"). */
function PartsSection({ x, prices, sample, ctx, parts }: {
  x: OwnOffer; prices: PriceWords; sample: boolean; ctx: WorkContext; parts: Omit<PartsProps, "ctx" | "x" | "prices">;
}) {
  return (
    <section id="breakdown" className="schedule breakdown parts-only" aria-labelledby="breakdown-title">
      <header className="schedule-head">
        <h2 id="breakdown-title" tabIndex={-1}>{x.offer.letter} · {x.offer.draft.label || `Offer ${x.offer.letter}`}, in full</h2>
        {sample && <Stamp>{x.offer.sample === "edited" ? "Edited sample" : "Sample"}</Stamp>}
      </header>
      <PartsSlot {...parts} ctx={ctx} x={x} prices={prices} />
      <TickLegend />
    </section>
  );
}

/**
 * Two or more offers: the breakdowns, one offer at a time behind a tab list (the offer chosen is the phone's ledger tab too,
 * `ui.offerTab`), before the comparison, with a way past them to it: A-1, then A-2 to A-7.
 */
export function BreakdownSection({ offers, tab, prices, updating, sample, dispatch, ctx, parts }: {
  offers: OwnOffer[]; tab: Letter; prices: PriceWords; updating: boolean; sample: boolean; dispatch: Dispatch<Action>; ctx: WorkContext;
  parts: Omit<PartsProps, "ctx" | "x" | "prices">;
}) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const shown = offers.find((x) => x.offer.letter === tab) ?? offers[0];
  const v = viewOf(shown, prices, true);
  const printing = usePrinting();
  const select = (letter: Letter) => dispatch({ type: "ui", patch: { offerTab: letter } });
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = offers.indexOf(shown);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? offers.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const letter = offers[(next + offers.length) % offers.length].offer.letter;
    select(letter);
    document.getElementById(`own-tab-${letter}`)?.focus();
  };
  return (
    <section ref={ref} id="breakdown" className={`schedule breakdown${updating ? " is-updating" : ""}`} aria-labelledby="breakdown-title"
      aria-busy={updating}>
      <header className="schedule-head">
        <h2 id="breakdown-title" tabIndex={-1}>{nameOf(shown.offer)}</h2>
        {sample && <Stamp>Illustrative samples</Stamp>}
        <button type="button" className="link skip no-print" onClick={skipToComparison}>Skip to the comparison</button>
        <span className="updating" aria-hidden={!updating}>{updating ? "Updating…" : ""}</span>
      </header>
      <div className="tablist own-tabs no-print" role="tablist" aria-label="Offers, one at a time">
        {offers.map((x) => {
          const on = x === shown;
          return (
            <button key={x.offer.id} type="button" role="tab" id={`own-tab-${x.offer.letter}`} className={`tab offer-${x.offer.letter}${on ? " is-on" : ""}`}
              aria-selected={on} aria-controls="own-panel" tabIndex={on ? 0 : -1} onClick={() => select(x.offer.letter)} onKeyDown={onKey}>
              <span className="tab-letter">{x.offer.letter}</span>
              <span className="tab-label">{x.offer.draft.label || `Offer ${x.offer.letter}`}</span>
            </button>
          );
        })}
      </div>
      <div id="own-panel" role="tabpanel" aria-labelledby={`own-tab-${shown.offer.letter}`}>
        <h3 id="own-title" className="part-title" tabIndex={-1}><span className="ref">{shown.offer.letter}-1</span> The bottom line</h3>
        {v ? <OwnBody v={v} prices={prices} compared /> : <OwnWaiting x={shown} />}
        {shown.input && shown.breakdown && <PartsSlot {...parts} ctx={ctx} x={shown} prices={prices} />}
      </div>
      {/* In print, every offer's breakdown, each under its own heading. */}
      {printing && offers.filter((x) => x !== shown).map((x) => {
        const w = viewOf(x, prices, true);
        return (
          <div key={x.offer.id} className="own-print">
            <h3 className="part-title"><span className="ref">{x.offer.letter}-1</span> {nameOf(x.offer)}: the bottom line</h3>
            {w ? <OwnBody v={w} prices={prices} compared /> : <OwnWaiting x={x} />}
            {x.input && x.breakdown && <PartsSlot {...parts} ctx={ctx} x={x} prices={prices} />}
          </div>
        );
      })}
      <TickLegend />
    </section>
  );
}

/** "Skip to the comparison": L-1's place (it loads as you near it), then its heading once it's there. */
function skipToComparison() {
  (document.getElementById("l1-title")?.closest("section") ?? document.querySelector(".l1-slot"))?.scrollIntoView({ block: "start" });
  const focus = (tries: number) => {
    const h = document.getElementById("l1-title");
    if (h) h.focus({ preventScroll: true });
    else if (tries) setTimeout(() => focus(tries - 1), 100);
  };
  focus(20);
}

/**
 * The ledger's foot row with two or more offers: each offer's bottom line, a month over its own stay, in the common dollars (the
 * prices picked), never its own city's, since the row sets offers side by side (condition 1). Each figure's work steps from the
 * offer's own-city figure to the common one, and "Its breakdown" opens it.
 */
export function OwnRow({ offers, prices, dispatch }: { offers: OwnOffer[]; prices: PriceWords; dispatch: Dispatch<Action> }) {
  const unit = prefixOf(prices.unit);
  const open = (letter: Letter) => {
    dispatch({ type: "ui", patch: { offerTab: letter } });
    requestAnimationFrame(() => {
      document.getElementById("breakdown")?.scrollIntoView({ block: "start" });
      document.getElementById(`own-tab-${letter}`)?.focus({ preventScroll: true });
    });
  };
  return (
    <div className="row row-own">
      <div className="row-label">
        <span className="row-name">On its own</span>
        <div className="help"><span className="hint" id="hint-own">A month over its own stay, in today's {prices.dollars}.</span></div>
      </div>
      {offers.map((x) => {
        const v = viewOf(x, prices, true);
        const common = v ? (v.ref ? v.ref.month : v.month.total) : null;
        return (
          <div key={x.offer.id} className="cell own-cell" data-offer={x.offer.letter}>
            {common === null ? <span className="note">—</span> : (
              <Fig id={`alone.${x.offer.letter}`} label={`${x.offer.letter} on its own, ${inDollars(unit, common)} a month over its own stay`}>
                {inDollars(unit, common)}</Fig>
            )}
            {v && <button type="button" className="link own-open" onClick={() => open(x.offer.letter)}
              aria-label={`${x.offer.letter}'s breakdown`}>Its breakdown</button>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The sticky bar with one offer (docs/ui-design.md §3.2, W9): A-1's figure with its dollars, at the top on a tablet and the
 * bottom on a phone ("A New York $7,563 a month · stay 4 yrs"). One button, to A-1.
 */
export function OwnBar({ x, prices, place, stayYears, updating, hidden = false }: {
  x: OwnOffer; prices: PriceWords; place: "top" | "bottom"; stayYears: number; updating: boolean; hidden?: boolean;
}) {
  const v = viewOf(x, prices, false);
  if (!v) return null;
  const stay = place === "top" ? `stay ${stayYears} ${stayYears === 1 ? "year" : "years"}` : `stay ${stayYears} ${stayYears === 1 ? "yr" : "yrs"}`;
  return (
    <div className={`verdict-bar is-${place}${updating ? " is-updating" : ""}${hidden ? " is-hidden" : ""}`} data-bar={place}>
      <button type="button" className="bar-go" onClick={toOwn}>
        <span className="bar-text">
          <strong className={`who offer-${v.letter}`}>{v.letter}</strong>{" "}
          <span className="bar-figure">{inDollars(v.place, v.month.total)}</span> a month{place === "top" ? " over your stay, after rent" : ""}
          <span className="bar-scope"> · {stay}</span>
        </span>
        <span className="bar-to"><span className="sr-only">. Go to its bottom line</span><span className="ref" aria-hidden="true">{v.letter}-1</span></span>
      </button>
    </div>
  );
}
