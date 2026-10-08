import type { Dispatch } from "react";
import type { Basis } from "../../src/offer/types";
import type { Action } from "./session";
import { cents, dayBefore, dollars, figure, longDate } from "./text";
import { Stamp, Tick, TickLegend } from "./ui";
import { PIPELINE, type StepView, type VerdictView } from "./verdict";

// L · Lead schedule: the verdict, the "winner if you stay" row and the basis pipeline (docs/ui-design.md §4.1-4.2).

const margin = (basis: Basis, lead: NonNullable<StepView["lead"]>) =>
  basis === "perHour" ? `${cents(lead.margin)}` : dollars(lead.perMonth ?? 0);
const per = (basis: Basis) => (basis === "perHour" ? "an hour" : "a month");

export function Lead({ view, stayYears, updating, error, notes, sample, dispatch }: {
  view: VerdictView | null; stayYears: number; updating: boolean; error: string | null; notes: string[];
  sample: boolean; dispatch: Dispatch<Action>;
}) {
  return (
    <section className={`schedule lead${updating ? " is-updating" : ""}`} aria-labelledby="lead-title" aria-busy={updating}>
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
      {view ? <Verdict view={view} stayYears={stayYears} dispatch={dispatch} /> : !error && notes.length === 0 && (
        <p className="note">Working out the comparison…</p>
      )}
      <TickLegend />
    </section>
  );
}

function Verdict({ view, stayYears, dispatch }: { view: VerdictView; stayYears: number; dispatch: Dispatch<Action> }) {
  const { lead, basis, row } = view;
  const step = PIPELINE.find((p) => p.basis === basis)!;
  const pv = basis !== "perHour";
  return (
    <>
      <div className="verdict" aria-live="polite">
        {lead && lead.margin > 0 ? (
          <>
            <p className="verdict-lede">
              <strong className={`who offer-${lead.winnerLetter}`}>{lead.winnerLetter}</strong>
              {basis === "perHour" ? " pays about" : " leaves you about"}
            </p>
            <p className="hero">{margin(basis, lead)} {per(basis)}<Tick kind="recomputed" note={pv
              ? "the PV gap restated as a level monthly amount over your stay (5% discount)"
              : "the gap in dollars per hour worked, nominal"} /></p>
            <p className="verdict-lede">more than <strong className={`who offer-${lead.runnerUpLetter}`}>{lead.runnerUpLetter}</strong>, {step.phrase}.</p>
          </>
        ) : (
          <p className="verdict-lede">The offers tie {step.phrase}.</p>
        )}
        <p className="scope">
          Base case · stay {stayYears} {stayYears === 1 ? "year" : "years"} ({longDate(row.window.start)} – {longDate(dayBefore(row.window.end))})
          {pv ? " · today's dollars" : " · nominal"}
        </p>
        {lead?.closeCall && <p className="close"><Stamp>Close call</Stamp> The lead is under 3% of {lead.winnerLetter}'s value.</p>}
      </div>

      <ol className="ranks" aria-label={`Offers ranked ${step.phrase}`}>
        {view.ranks.map((r) => (
          <li key={r.letter} className={`offer-${r.letter}`}>
            <span className="key" aria-hidden="true" /><span className="rank-letter">{r.letter}</span>
            <span className="rank-value">{basis === "perHour" ? cents(r.value) : figure(r.value)}<Tick kind="recomputed" /></span>
          </li>
        ))}
        <li className="rank-unit">{basis === "perHour" ? "$ an hour, nominal" : basis === "colAdjustedTotal" ? "U.S.-avg $, present value" : "present value"}</li>
      </ol>

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
                  <span className="stays-margin">+{margin(basis, s.lead)}<Tick kind="recomputed" /></span>
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
            <button key={s.basis} type="button" className={`step${s.basis === basis ? " is-selected" : ""}`} aria-pressed={s.basis === basis}
              disabled={!s.lead} title={s.unavailable ?? s.title} onClick={() => dispatch({ type: "basis", basis: s.basis })}>
              <span className="step-name">{s.step}</span>
              {s.lead ? (
                <span className="step-lead">
                  <span className={`who offer-${s.lead.winnerLetter}`}>{s.lead.winnerLetter}</span> +{margin(s.basis, s.lead)}
                  <span className="step-per">{per(s.basis)}</span>
                </span>
              ) : <span className="step-off">{s.unavailable}</span>}
            </button>
          ))}
        </div>
        <p className="disagreement">{view.disagreement}</p>
      </fieldset>
    </>
  );
}
