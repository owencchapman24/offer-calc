import { type Dispatch, useContext, useEffect } from "react";
import type { Letter } from "./model";
import type { Action, UiState } from "./session";
import { cents, dayBefore, dollars, figure, longDate } from "./text";
import { markFirstAnswer, Stamp, TickSetting } from "./ui";
import { basisPhrase, type RentNote } from "./metrics";
import type { PriceWords } from "./prices";
import { Fig } from "./figures";
import type { FlipLine } from "./Lead";
import {
  extraHoursView, type ExtraHoursLine, leadAmount, marginText as margin, perText as per, pipeline, placeOf, totalsCaption, type VerdictView,
} from "./verdict";

// L · Lead schedule's verdict (docs/ui-design.md §4.1-4.2): the sentence, the rank list, the "winner if you stay" row, the basis
// pipeline and pay per extra hour. Out of the main chunk: it can't show before the worker's first answer anyway, so it loads beside
// the worker (Lead.tsx starts it), as A-1 does, which keeps the main thread in budget (docs/v2-plan.md, "Performance plan"). Like
// the schedules, it imports figures.tsx, never Tickmarks.tsx.

/** A touch screen: the hint says "Tap". */
const touch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export function Verdict({ view, letters, stayYears, dismissed, dispatch, cautions, changes, onWarnings, flip, rentNotes, showBridge }: {
  changes: number; onWarnings?: () => void; flip: FlipLine | null; rentNotes: RentNote[];
  /** "See how we get there": the bridge, under L-1 (Later.tsx, which this chunk mustn't import). */ showBridge: () => Promise<void>;
  view: VerdictView; letters: Letter[]; stayYears: number; dismissed: UiState["dismissed"]; dispatch: Dispatch<Action>; cautions: string[];
}) {
  const { lead, basis, row, perHourOf, prices } = view;
  const step = pipeline(prices).find((p) => p.basis === basis)!;
  // Each figure names its dollars (condition 1): the prices picked after rent, "$" before rent and prices.
  const place = (b: typeof basis) => placeOf(view, b);
  const amount = (b: typeof basis, x: string) => `${place(b)} ${x}`.trim();
  const pv = basis !== "perHour";
  const extra = extraHoursView(view, letters);
  const marksHidden = useContext(TickSetting)?.hidden ?? false;
  useEffect(markFirstAnswer, []);
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
          // One sentence, its parts on lines of their own.
          <p className="verdict-sentence">
            <span className="verdict-lede">
              <strong className={`who offer-${lead.winnerLetter}`}>{lead.winnerLetter}</strong>
              {basis === "perHour" ? " pays about" : " leaves you about"}
            </span>{" "}
            <span className="hero"><Fig id="hero" label={`${leadAmount(view, basis, lead)} ${per(basis)} over your stay`}>
              {place(basis) && <span className="hero-place">{place(basis)} </span>}{margin(basis, lead)} {per(basis)}</Fig></span>{" "}
            <span className="verdict-lede">more than <strong className={`who offer-${lead.runnerUpLetter}`}>{lead.runnerUpLetter}</strong> over your stay,{" "}
              {step.phrase}.</span>
          </p>
        ) : (
          <p className="verdict-lede">The offers tie over your stay, {step.phrase}.</p>
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
            <Stamp>Close call</Stamp> The lead is under 3% of {lead.winnerLetter}'s value over your stay.
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
                <Fig id={basis === "perHour" ? `ph.${r.letter}` : `pv.${r.letter}.${basis}`}
                  label={`${r.letter}'s ${amount(basis, basis === "perHour" ? `${cents(r.value)} an hour worked over your stay` : dollars(r.value))}`}
                  className="rank-value">{text}</Fig>
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
          <span role="rowheader" className="stays-label stays-sub">Leads by{place(basis) && `, ${prices.unit}`}</span>
          {view.stays.map((s) => (
            <span role="cell" key={s.years} className={`stays-cell${s.current ? " is-current" : ""}`}>
              {s.lead && s.lead.margin > 0 ? (
                <>
                  <span className={`who offer-${s.lead.winnerLetter}`}>{s.lead.winnerLetter}</span>
                  <Fig id={`stay.${s.years}`} label={`${s.lead.winnerLetter} leads by ${leadAmount(view, basis, s.lead)} ${per(basis)} if you stay ${s.years} years`}
                    className="stays-margin">+{margin(basis, s.lead)}</Fig>
                  <span className="stays-per">{s.lead.closeCall ? <Stamp>Close call</Stamp> : per(basis)}</span>
                </>
              ) : <span className="stays-per">tie</span>}
            </span>
          ))}
        </div>
      </div>

      <fieldset className="pipeline">
        <legend>Basis: the pipeline, left to right, over your stay</legend>
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
                  <Fig id={`step.${s.basis}`} label={`${s.lead.winnerLetter} leads by ${leadAmount(view, s.basis, s.lead)} ${per(s.basis)} over your stay, ${s.title}`}>
                    +{margin(s.basis, s.lead)}</Fig>
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
          {extra.map((x) => <ExtraLine key={`${x.more}${x.fewer}`} x={x} prices={prices} place={place(x.basis)} />)}
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
        const month = `${text} a month in the first lease year`;
        return (
          <span key={n.letter}>
            {i > 0 && "; "}at {where} for {whose ? <><strong className={`who offer-${n.letter}`}>{n.letter}</strong>'s rent in {n.city}</> : n.city}{" "}
            (<Fig id={`rentnote.${n.letter}`} label={`${where} for ${whose ? `${n.letter}'s rent in ` : ""}${n.city}, ${month}`}>
              {text}</Fig> a month in the first lease year), <strong className={`who offer-${n.wins}`}>{n.wins}</strong> wins
          </span>
        );
      })}
      .
    </p>
  );
}

const LOWER_PHRASE = { cash: "On after-tax pay", totalRewards: "In total rewards" } as const;
const AVERAGE_PHRASE = { cash: "after tax", totalRewards: "in total rewards", colAdjustedTotal: "after rent" } as const;

/**
 * "Over your stay, A asks 1,750 more hours a year than C and leaves you U.S.-avg $5,577 a year less, after rent, at U.S. prices: more
 * hours for less pay." `place`: the dollars its figures are in, after rent.
 */
function ExtraLine({ x, prices, place }: { x: ExtraHoursLine; prices: PriceWords; place: string }) {
  const phrase = basisPhrase(prices);
  const lowerPhrase = (b: ExtraHoursLine["basis"]) => (b === "colAdjustedTotal" ? prices.phrase[0].toUpperCase() + prices.phrase.slice(1) : LOWER_PHRASE[b]);
  const pair = `${x.more}${x.fewer}` as `${Letter}${Letter}`;
  const hoursText = figure(x.hoursPerYear);
  const at = (b: ExtraHoursLine["basis"], v: string) => `${b === "colAdjustedTotal" ? prices.unit.slice(0, -2) : ""} ${v}`.trim();
  const asks = (
    <>Over your stay, <strong className={`who offer-${x.more}`}>{x.more}</strong> asks{" "}
      <Fig id={`extra.${pair}.hours`} label={`${hoursText} more hours a year over your stay`}>{hoursText}</Fig> more hours a year than{" "}
      <strong className={`who offer-${x.fewer}`}>{x.fewer}</strong></>
  );
  if (x.perExtraHour !== null) {
    const rate = `${place} ${cents(x.perExtraHour)}`.trim();
    return (
      <p className="extra-line">
        {asks} and pays <Fig id={`extra.${pair}.${x.basis}`} label={`${rate} for each extra hour over your stay`}>{rate}</Fig> for each, {phrase[x.basis]}.
      </p>
    );
  }
  const gap = `${place} ${dollars(Math.abs(x.gapPerYear))}`.trim();
  const lower = x.lower;
  return (
    <p className="extra-line">
      {asks} and leaves you <Fig id={`extra.${pair}.${x.basis}`} label={`${gap} a year less over your stay`}>{gap}</Fig> a year less, {phrase[x.basis]}: more
      hours for less pay.
      {lower && (
        <>
          {" "}{lowerPhrase(lower.basis)}, those extra hours pay{" "}
          <Fig id={`extra.${pair}.${lower.basis}`} label={`${at(lower.basis, cents(lower.perExtraHour))} each, over your stay`}>
            {at(lower.basis, cents(lower.perExtraHour))}</Fig> each, against {x.more}'s
          average of <Fig id={`avg.${x.more}.${lower.basis}`} label={`${at(lower.basis, cents(lower.average))} an hour over your stay`}>
            {at(lower.basis, cents(lower.average))}</Fig> an hour{" "}
          {AVERAGE_PHRASE[lower.basis]}.
        </>
      )}
    </p>
  );
}
