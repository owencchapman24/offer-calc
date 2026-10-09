import { type Dispatch, useRef } from "react";
import { formatIssue } from "../../src/format/issues";
import type { Basis } from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";
import { fieldName } from "./help";
import type { EditTarget } from "./metrics";
import type { Letter } from "./model";
import type { Action, UiState } from "./session";
import { cents, dayBefore, dollars, figure, longDate } from "./text";
import { Stamp, TickLegend } from "./ui";
import { BASIS_PHRASE } from "./metrics";
import { Fig, useRovingTicks } from "./Tickmarks";
import { extraHoursView, type ExtraHoursLine, PIPELINE, type StepView, totalsCaption, type VerdictView } from "./verdict";

// L · Lead schedule: the verdict, the "winner if you stay" row and the basis pipeline (docs/ui-design.md §4.1-4.2).

const margin = (basis: Basis, lead: NonNullable<StepView["lead"]>) =>
  basis === "perHour" ? `${cents(lead.margin)}` : dollars(lead.perMonth ?? 0);
const per = (basis: Basis) => (basis === "perHour" ? "an hour" : "a month");
/** A touch screen: the hint says "Tap". */
const touch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export function Lead({ view, letters, stayYears, updating, error, notes, sample, dismissed = {}, dispatch, issues = {}, onFix, cautions = [] }: {
  view: VerdictView | null; letters: Letter[]; stayYears: number; updating: boolean; error: string | null; notes: string[];
  sample: boolean; dismissed?: UiState["dismissed"]; dispatch: Dispatch<Action>;
  /** A cost or benefit counted for some offers but not others, in words: it stays while it applies. */
  cautions?: string[];
  /** Problems with the latest inputs: the results are the last valid ones until they're fixed. */
  issues?: Partial<Record<Letter, OfferIssue[]>>; onFix?: (t: EditTarget) => void;
}) {
  const problems = (Object.entries(issues) as Array<[Letter, OfferIssue[]]>).flatMap(([letter, list]) => list.map((i) => ({ letter, i })));
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  return (
    <section ref={ref} className={`schedule lead${updating ? " is-updating" : ""}`} aria-labelledby="lead-title" aria-busy={updating}>
      <header className="schedule-head">
        <h2 id="lead-title"><span className="ref">L</span> Lead schedule</h2>
        {sample && <Stamp>Illustrative samples</Stamp>}
        <span className="updating" aria-hidden={!updating}>{updating ? "Updating…" : ""}</span>
      </header>
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
      {view ? <Verdict view={view} letters={letters} stayYears={stayYears} dismissed={dismissed} dispatch={dispatch} cautions={cautions} />
        : !error && notes.length === 0 && (
        <p className="note">Working out the comparison…</p>
      )}
      <TickLegend />
    </section>
  );
}

function Verdict({ view, letters, stayYears, dismissed, dispatch, cautions }: {
  view: VerdictView; letters: Letter[]; stayYears: number; dismissed: UiState["dismissed"]; dispatch: Dispatch<Action>; cautions: string[];
}) {
  const { lead, basis, row, perHourOf } = view;
  const step = PIPELINE.find((p) => p.basis === basis)!;
  const pv = basis !== "perHour";
  const extra = extraHoursView(view, letters);
  return (
    <>
      {basis === "colAdjustedTotal" && !dismissed?.afterRent && (
        // The first time this basis is shown (docs/ui-design.md §5, item 5): an inline note, not a modal.
        <div className="first-use" role="note">
          <p>
            This is much lower than your salary on purpose. It's what's left to spend after tax and rent, priced as in an average
            U.S. city, plus what you save.
          </p>
          <p className="first-use-actions">
            <button type="button" className="link" onClick={() => {
              const b = document.getElementById("bridge");
              b?.scrollIntoView({ behavior: "smooth", block: "start" });
              document.getElementById("bridge-title")?.focus({ preventScroll: true });
            }}>See how we get there</button>
            <button type="button" className="got-it" onClick={() => dispatch({ type: "dismiss", hint: "afterRent" })}>Got it</button>
          </p>
        </div>
      )}
      <div className="verdict" aria-live="polite">
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
          <p className="subtitle">Spending money after rent, priced as in an average U.S. city, plus what you save.</p>
        )}
        <p className="scope">
          Base case · stay {stayYears} {stayYears === 1 ? "year" : "years"} ({longDate(row.window.start)} – {longDate(dayBefore(row.window.end))})
          {pv ? " · today's dollars" : " · nominal"}
        </p>
        {lead?.closeCall && <p className="close"><Stamp>Close call</Stamp> The lead is under 3% of {lead.winnerLetter}'s value.</p>}
        {cautions.length > 0 && (
          <div className="caution" role="note" aria-label="Not counted for every offer">
            <p className="caution-head"><span aria-hidden="true">⚠</span> Not counted for every offer</p>
            {cautions.map((c) => <p key={c}>{c}</p>)}
          </div>
        )}
        {!dismissed?.ticks && (
          <p className="hint-ticks">
            <span>{touch() ? "Tap" : "Click"} any figure or <span className="tick" aria-hidden="true">✓</span><span className="sr-only">tickmark</span> to see how it's calculated.</span>
            <button type="button" className="got-it" onClick={() => dispatch({ type: "dismiss", hint: "ticks" })}>Got it</button>
          </p>
        )}
      </div>

      <div className="ranks">
        <p className="ranks-caption" id="ranks-caption">{totalsCaption(basis, stayYears, perHourOf)}</p>
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
          {extra.map((x) => <ExtraLine key={`${x.more}${x.fewer}`} x={x} />)}
        </div>
      )}
    </>
  );
}

const LOWER_PHRASE = { cash: "On after-tax pay", totalRewards: "In total rewards", colAdjustedTotal: "After rent, at U.S. prices" } as const;
const AVERAGE_PHRASE = { cash: "after tax", totalRewards: "in total rewards", colAdjustedTotal: "after rent" } as const;

/** "A asks 1,750 more hours a year than C and leaves you $5,577 a year less after rent, at U.S. prices: more hours for less pay." */
function ExtraLine({ x }: { x: ExtraHoursLine }) {
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
        {asks} and pays <Fig id={`extra.${pair}.${x.basis}`} label={`${rate} for each extra hour`}>{rate}</Fig> for each, {BASIS_PHRASE[x.basis]}.
      </p>
    );
  }
  const gap = dollars(Math.abs(x.gapPerYear));
  const lower = x.lower;
  return (
    <p className="extra-line">
      {asks} and leaves you <Fig id={`extra.${pair}.${x.basis}`} label={`${gap} a year less`}>{gap}</Fig> a year less {BASIS_PHRASE[x.basis]}: more
      hours for less pay.
      {lower && (
        <>
          {" "}{LOWER_PHRASE[lower.basis]}, those extra hours pay{" "}
          <Fig id={`extra.${pair}.${lower.basis}`} label={`${cents(lower.perExtraHour)} each`}>{cents(lower.perExtraHour)}</Fig> each, against {x.more}'s
          average of <Fig id={`avg.${x.more}.${lower.basis}`} label={`${cents(lower.average)} an hour`}>{cents(lower.average)}</Fig> an hour{" "}
          {AVERAGE_PHRASE[lower.basis]}.
        </>
      )}
    </p>
  );
}
