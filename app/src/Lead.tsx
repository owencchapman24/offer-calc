import { type Dispatch, useContext, useEffect, useRef, useState } from "react";
import { formatIssue } from "../../src/format/issues";
import type { BreakevenResult } from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";
import { fieldName } from "./help";
import type { EditTarget } from "./metrics";
import type { Letter } from "./model";
import type { Action, UiState } from "./session";
import { cents, dayBefore, dollars, figure, longDate } from "./text";
import { Stamp, TickLegend, TickSetting } from "./ui";
import { basisPhrase, type RentNote } from "./metrics";
import { showBridge } from "./Later";
import type { PriceWords } from "./prices";
import { Fig, useRovingTicks } from "./Tickmarks";
import {
  extraHoursView, type ExtraHoursLine, marginText as margin, perText as per, pipeline, totalsCaption, verdictSentence, type VerdictView,
} from "./verdict";

// L · Lead schedule: the verdict, the "winner if you stay" row and the basis pipeline (docs/ui-design.md §4.1-4.2).

/** The close-call line's breakeven (§4.1): the last one worked out for this pair of offers, and whether a newer one is on its way. */
export interface FlipLine { row: BreakevenResult | null; updating: boolean; error: string | null }

export { verdictSentence };

/** How long the inputs must rest before a new verdict is announced. */
export const ANNOUNCE_AFTER_MS = 1000;

/**
 * The verdict for screen readers (docs/ui-design.md §10): one short sentence in a polite live region, said once the inputs
 * have rested (ANNOUNCE_AFTER_MS after the last result), and only when it changes. The first verdict isn't announced: it's
 * on the page as it loads. `text` is null while the verdict is being worked out.
 */
function LiveVerdict({ text }: { text: string | null }) {
  const [said, setSaid] = useState("");
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (text === null) return;
    if (last.current === null) {
      last.current = text;
      return;
    }
    if (text === last.current) return;
    const t = setTimeout(() => {
      last.current = text;
      setSaid(text);
    }, ANNOUNCE_AFTER_MS);
    return () => clearTimeout(t);
  }, [text]);
  return <p id="verdict-live" className="sr-only" role="status">{said}</p>;
}

/** Goes to the lead schedule: its heading takes focus, below a sticky bar's scroll padding. */
export function toLead() {
  document.getElementById("lead")?.scrollIntoView({ block: "start" });
  document.getElementById("lead-title")?.focus({ preventScroll: true });
}

/**
 * The sticky verdict bar (docs/ui-design.md §3.2, W9): at the top on a tablet, where it has room for the sentence; at the
 * bottom on a phone, short ("C +$487 a month · stay 4 yrs"). It's one button, to the lead schedule (L), where the figures
 * and their tickmarks are. `hidden`: out of the way (a phone's keyboard is up), and out of the tab order.
 */
export function VerdictBar({ view, stayYears, place, updating, hidden = false }: {
  view: VerdictView; stayYears: number; place: "top" | "bottom"; updating: boolean; hidden?: boolean;
}) {
  const { lead, basis } = view;
  const stay = place === "top" ? `stay ${stayYears} ${stayYears === 1 ? "year" : "years"}` : `stay ${stayYears} ${stayYears === 1 ? "yr" : "yrs"}`;
  return (
    <div className={`verdict-bar is-${place}${updating ? " is-updating" : ""}${hidden ? " is-hidden" : ""}`} data-bar={place}>
      <button type="button" className="bar-go" onClick={toLead}>
        <span className="bar-text">
          {place === "top" ? verdictSentence(view).replace(/\.$/, "") : lead && lead.margin > 0 ? (
            <>
              <strong className={`who offer-${lead.winnerLetter}`}>{lead.winnerLetter}</strong><span className="sr-only"> leads by</span>{" "}
              <span className="bar-figure">+{margin(basis, lead)}</span> {per(basis)}
            </>
          ) : "The offers tie"}
          {lead?.closeCall && <>{" "}<Stamp>Close call</Stamp></>}
          <span className="bar-scope"> · {stay}</span>
        </span>
        <span className="bar-to"><span className="sr-only">. Go to the lead schedule</span><span className="ref" aria-hidden="true">L</span></span>
      </button>
    </div>
  );
}

/** A touch screen: the hint says "Tap". */
const touch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export function Lead({ view, letters, stayYears, updating, error, notes, sample, dismissed = {}, dispatch, issues = {}, onFix, cautions = [], changes = 0,
  onWarnings, flip = null, rentNotes = [] }: {
  /** A close call's flip line: present while the lead is a close call on a dollar basis. */
  flip?: FlipLine | null;
  /** Rents the verdict turns on: an entered rent and its estimate on either side of the rent that flips it (after rent only). */
  rentNotes?: RentNote[];
  view: VerdictView | null; letters: Letter[]; stayYears: number; updating: boolean; error: string | null; notes: string[];
  sample: boolean; dismissed?: UiState["dismissed"]; dispatch: Dispatch<Action>;
  /** A cost or benefit counted for some offers but not others, in words: it stays while it applies. */
  cautions?: string[];
  /** How many warnings change these numbers (L-5 lists them), and how to get there. */
  changes?: number; onWarnings?: () => void;
  /** Problems with the latest inputs: the results are the last valid ones until they're fixed. */
  issues?: Partial<Record<Letter, OfferIssue[]>>; onFix?: (t: EditTarget) => void;
}) {
  const problems = (Object.entries(issues) as Array<[Letter, OfferIssue[]]>).flatMap(([letter, list]) => list.map((i) => ({ letter, i })));
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  return (
    <section ref={ref} id="lead" className={`schedule lead${updating ? " is-updating" : ""}`} aria-labelledby="lead-title" aria-busy={updating}>
      <header className="schedule-head">
        <h2 id="lead-title" tabIndex={-1}><span className="ref">L</span> Lead schedule</h2>
        {sample && <Stamp>Illustrative samples</Stamp>}
        <span className="updating" aria-hidden={!updating}>{updating ? "Updating…" : ""}</span>
      </header>
      <LiveVerdict text={view && !updating && !error ? verdictSentence(view) : null} />
      {sample && (
        <p className="banner">
          Sample offers: illustrative inputs, not market data. They start next July.{" "}
          <button type="button" className="link" onClick={() => dispatch({ type: "startBlank" })}>Start with my offers</button>
        </p>
      )}
      {notes.map((n) => <p key={n} className="note">{n}</p>)}
      {error && <p className="note error" role="alert">Couldn't compute: {error}</p>}
      {problems.length > 0 && (
        <div className="stale" role="alert">
          <p className="stale-head">{view ? "These results are for your last valid inputs." : "Nothing to compare yet."} Fix {problems.length === 1 ? "this" : "these"} to update them:</p>
          <ul>
            {problems.map(({ letter, i }) => (
              <li key={`${letter}|${i.path}|${i.code}`}>
                <strong className={`who offer-${letter}`}>{letter}</strong> {fieldName(i.path)}: {formatIssue(i)}{" "}
                {onFix && <button type="button" className="link" onClick={() => onFix({ letter, path: i.path.replace(/\.(bear|base|bull)$/, "") })}>Fix it</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* With problems and no results, nothing is being worked out: the comparison waits for the fix. */}
      {view ? <Verdict view={view} letters={letters} stayYears={stayYears} dismissed={dismissed} dispatch={dispatch} cautions={cautions}
        changes={changes} onWarnings={onWarnings} flip={flip} rentNotes={rentNotes} />
        : !error && notes.length === 0 && problems.length === 0 && (
        <p className="note">Working out the comparison…</p>
      )}
      <TickLegend />
    </section>
  );
}

function Verdict({ view, letters, stayYears, dismissed, dispatch, cautions, changes, onWarnings, flip, rentNotes }: {
  changes: number; onWarnings?: () => void; flip: FlipLine | null; rentNotes: RentNote[];
  view: VerdictView; letters: Letter[]; stayYears: number; dismissed: UiState["dismissed"]; dispatch: Dispatch<Action>; cautions: string[];
}) {
  const { lead, basis, row, perHourOf, prices } = view;
  const step = pipeline(prices).find((p) => p.basis === basis)!;
  const pv = basis !== "perHour";
  const extra = extraHoursView(view, letters);
  const marksHidden = useContext(TickSetting)?.hidden ?? false;
  return (
    <>
      {basis === "colAdjustedTotal" && !dismissed?.afterRent && (
        // The first time this basis is shown (docs/ui-design.md §5, item 5): an inline note, not a modal.
        <div className="first-use" role="note">
          <p>
            This is much lower than your salary on purpose. It's what's left to spend after tax and rent, priced as in {prices.city},
            plus what you save.
          </p>
          <p className="first-use-actions">
            <button type="button" className="link" onClick={() => void showBridge()}>See how we get there</button>
            <button type="button" className="got-it" onClick={() => dispatch({ type: "dismiss", hint: "afterRent" })}>Got it</button>
          </p>
        </div>
      )}
      <div className="verdict">
        {lead && lead.margin > 0 ? (
          <>
            <p className="verdict-lede">
              <strong className={`who offer-${lead.winnerLetter}`}>{lead.winnerLetter}</strong>
              {basis === "perHour" ? " pays about" : " leaves you about"}
            </p>
            <p className="hero"><Fig id="hero" label={`${margin(basis, lead)} ${per(basis)}`}>{margin(basis, lead)} {per(basis)}</Fig></p>
            <p className="verdict-lede">more than <strong className={`who offer-${lead.runnerUpLetter}`}>{lead.runnerUpLetter}</strong>, {step.phrase}.</p>
          </>
        ) : (
          <p className="verdict-lede">The offers tie {step.phrase}.</p>
        )}
        {basis === "colAdjustedTotal" && (
          <p className="subtitle">Spending money after rent, priced as in {prices.city}, plus what you save.</p>
        )}
        <p className="scope">
          Base case · stay {stayYears} {stayYears === 1 ? "year" : "years"} ({longDate(row.window.start)} – {longDate(dayBefore(row.window.end))})
          {pv ? " · today's dollars" : " · nominal"}
        </p>
        {lead?.closeCall && (
          <p className={`close${flip?.updating ? " is-updating" : ""}`}>
            <Stamp>Close call</Stamp> The lead is under 3% of {lead.winnerLetter}'s value.
            {flip?.row?.outcome === "tie" && (
              <>{" "}<Fig id="flip" label={`${dollars(flip.row.increase)} more starting salary for ${lead.runnerUpLetter}`}>{dollars(flip.row.increase)}</Fig> more
                starting salary for <strong className={`who offer-${lead.runnerUpLetter}`}>{lead.runnerUpLetter}</strong> would tie.</>
            )}
            {flip && !flip.row && flip.updating && " Working out what would tie…"}
            {flip?.row && flip.updating && <span className="updating"> Updating…</span>}
          </p>
        )}
        {rentNotes.length > 0 && <RentNoteLine notes={rentNotes} />}
        {changes > 0 && (
          <p className="lead-pointer">
            <span className="warn-icon" aria-hidden="true">⚠</span> {changes === 1 ? "A warning changes" : `${changes} warnings change`} these
            numbers.{" "}
            {onWarnings && <button type="button" className="link" onClick={onWarnings}>See L-5</button>}
          </p>
        )}
        {cautions.length > 0 && (
          <div className="caution" role="note" aria-label="Not counted for every offer">
            <p className="caution-head"><span aria-hidden="true">⚠</span> Not counted for every offer</p>
            {cautions.map((c) => <p key={c}>{c}</p>)}
          </div>
        )}
        {!dismissed?.ticks && (
          <p className="hint-ticks">
            {marksHidden ? <span>{touch() ? "Tap" : "Click"} any underlined figure to see how it's calculated.</span>
              : <span>{touch() ? "Tap" : "Click"} any figure or <span className="tick" aria-hidden="true">✓</span><span className="sr-only">tickmark</span> to see how it's calculated.</span>}
            <button type="button" className="got-it" onClick={() => dispatch({ type: "dismiss", hint: "ticks" })}>Got it</button>
          </p>
        )}
      </div>

      <div className="ranks">
        <p className="ranks-caption" id="ranks-caption">{totalsCaption(basis, stayYears, perHourOf, prices)}</p>
        <ol aria-labelledby="ranks-caption">
          {view.ranks.map((r) => {
            const text = basis === "perHour" ? cents(r.value) : figure(r.value);
            return (
              <li key={r.letter} className={`offer-${r.letter}`}>
                <span className="key" aria-hidden="true" /><span className="rank-letter">{r.letter}</span>
                <Fig id={basis === "perHour" ? `ph.${r.letter}` : `pv.${r.letter}.${basis}`} label={`${r.letter}'s ${text}`} className="rank-value">{text}</Fig>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="stays" role="table" aria-label="Winner if you stay">
        <div role="row" className="stays-row">
          <span role="rowheader" className="stays-label">If you stay</span>
          {view.stays.map((s) => (
            <span role="columnheader" key={s.years} className={`stays-years${s.current ? " is-current" : ""}`}>{s.years} {s.years === 1 ? "yr" : "yrs"}</span>
          ))}
        </div>
        <div role="row" className="stays-row">
          <span role="rowheader" className="stays-label stays-sub">Leads by</span>
          {view.stays.map((s) => (
            <span role="cell" key={s.years} className={`stays-cell${s.current ? " is-current" : ""}`}>
              {s.lead && s.lead.margin > 0 ? (
                <>
                  <span className={`who offer-${s.lead.winnerLetter}`}>{s.lead.winnerLetter}</span>
                  <Fig id={`stay.${s.years}`} label={`${s.lead.winnerLetter} +${margin(basis, s.lead)} ${per(basis)} if you stay ${s.years} years`}
                    className="stays-margin">+{margin(basis, s.lead)}</Fig>
                  <span className="stays-per">{s.lead.closeCall ? <Stamp>Close call</Stamp> : per(basis)}</span>
                </>
              ) : <span className="stays-per">tie</span>}
            </span>
          ))}
        </div>
      </div>

      <fieldset className="pipeline">
        <legend>Basis: the pipeline, left to right</legend>
        <div className="steps">
          {view.steps.map((s) => (
            <div key={s.basis} className={`step${s.basis === basis ? " is-selected" : ""}${s.lead ? "" : " is-off"}`}>
              {/* The button stretches over the whole step; the tickmark sits above it. */}
              <button type="button" className="step-select" aria-pressed={s.basis === basis} disabled={!s.lead} title={s.unavailable ?? s.title}
                onClick={() => dispatch({ type: "basis", basis: s.basis })}>
                <span className="step-name">{s.step}</span>
                <span className="sr-only">{s.title}</span>
              </button>
              {s.lead ? (
                <span className="step-lead">
                  <span className={`who offer-${s.lead.winnerLetter}`}>{s.lead.winnerLetter}</span>{" "}
                  <Fig id={`step.${s.basis}`} label={`${s.lead.winnerLetter} +${margin(s.basis, s.lead)} ${per(s.basis)}, ${s.title}`}>+{margin(s.basis, s.lead)}</Fig>
                  <span className="step-per">{per(s.basis)}</span>
                </span>
              ) : <span className="step-off">{s.unavailable}</span>}
            </div>
          ))}
        </div>
        <p className="disagreement">{view.disagreement}</p>
      </fieldset>

      {extra.length > 0 && (
        <div className="extra">
          <p className="extra-title">Extra hours</p>
          {extra.map((x) => <ExtraLine key={`${x.more}${x.fewer}`} x={x} prices={prices} />)}
        </div>
      )}
    </>
  );
}

/**
 * "This depends on rent: at HUD's estimate for New York ($2,729), A wins." One clause per offer whose rent the verdict turns on,
 * each on its own (the others keep their rents). It names the offer when the rent isn't the winner-to-be's own, or two offers
 * share the city.
 */
function RentNoteLine({ notes }: { notes: RentNote[] }) {
  const shared = (n: RentNote) => notes.some((m) => m !== n && m.city === n.city);
  return (
    <p className="rent-note">
      This depends on rent:{" "}
      {notes.map((n, i) => {
        const whose = n.wins !== n.letter || shared(n);
        const where = n.estimate.source === "fmr" ? "HUD's estimate" : "the estimate";
        const text = dollars(n.estimate.monthlyRent);
        return (
          <span key={n.letter}>
            {i > 0 && "; "}at {where} for {whose ? <><strong className={`who offer-${n.letter}`}>{n.letter}</strong>'s rent in {n.city}</> : n.city}{" "}
            (<Fig id={`rentnote.${n.letter}`} label={`${where} for ${whose ? `${n.letter}'s rent in ` : ""}${n.city}, ${text} a month`}>
              {text}</Fig>), <strong className={`who offer-${n.wins}`}>{n.wins}</strong> wins
          </span>
        );
      })}
      .
    </p>
  );
}

const LOWER_PHRASE = { cash: "On after-tax pay", totalRewards: "In total rewards" } as const;
const AVERAGE_PHRASE = { cash: "after tax", totalRewards: "in total rewards", colAdjustedTotal: "after rent" } as const;

/** "A asks 1,750 more hours a year than C and leaves you $5,577 a year less after rent, at U.S. prices: more hours for less pay." */
function ExtraLine({ x, prices }: { x: ExtraHoursLine; prices: PriceWords }) {
  const phrase = basisPhrase(prices);
  const lowerPhrase = (b: ExtraHoursLine["basis"]) => (b === "colAdjustedTotal" ? prices.phrase[0].toUpperCase() + prices.phrase.slice(1) : LOWER_PHRASE[b]);
  const pair = `${x.more}${x.fewer}` as `${Letter}${Letter}`;
  const hoursText = figure(x.hoursPerYear);
  const asks = (
    <><strong className={`who offer-${x.more}`}>{x.more}</strong> asks{" "}
      <Fig id={`extra.${pair}.hours`} label={`${hoursText} more hours a year`}>{hoursText}</Fig> more hours a year than{" "}
      <strong className={`who offer-${x.fewer}`}>{x.fewer}</strong></>
  );
  if (x.perExtraHour !== null) {
    const rate = cents(x.perExtraHour);
    return (
      <p className="extra-line">
        {asks} and pays <Fig id={`extra.${pair}.${x.basis}`} label={`${rate} for each extra hour`}>{rate}</Fig> for each, {phrase[x.basis]}.
      </p>
    );
  }
  const gap = dollars(Math.abs(x.gapPerYear));
  const lower = x.lower;
  return (
    <p className="extra-line">
      {asks} and leaves you <Fig id={`extra.${pair}.${x.basis}`} label={`${gap} a year less`}>{gap}</Fig> a year less {phrase[x.basis]}: more
      hours for less pay.
      {lower && (
        <>
          {" "}{lowerPhrase(lower.basis)}, those extra hours pay{" "}
          <Fig id={`extra.${pair}.${lower.basis}`} label={`${cents(lower.perExtraHour)} each`}>{cents(lower.perExtraHour)}</Fig> each, against {x.more}'s
          average of <Fig id={`avg.${x.more}.${lower.basis}`} label={`${cents(lower.average)} an hour`}>{cents(lower.average)}</Fig> an hour{" "}
          {AVERAGE_PHRASE[lower.basis]}.
        </>
      )}
    </p>
  );
}
