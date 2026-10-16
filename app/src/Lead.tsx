import { type Dispatch, useEffect, useRef, useState } from "react";
import { formatIssue } from "../../src/format/issues";
import type { BreakevenResult } from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";
import { fieldName } from "./help";
import type { EditTarget } from "./metrics";
import type { Letter } from "./model";
import type { Action, UiState } from "./session";
import { Stamp, TickLegend } from "./ui";
import type { RentNote } from "./metrics";
import { verdictModule } from "./Later";
import { useLazyModule, useLoadAfterPaint } from "./lazy";
import { useRovingTicks } from "./Tickmarks";
import { marginText as margin, perText as per, placeOf, verdictSentence, type VerdictView } from "./verdict";

// L · Lead schedule: the verdict, the "winner if you stay" row and the basis pipeline (docs/ui-design.md §4.1-4.2).

/** The close-call line's breakeven (§4.1): the last one worked out for this pair of offers, and whether a newer one is on its way. */
export interface FlipLine { row: BreakevenResult | null; updating: boolean; error: string | null }

export { verdictSentence };

/** How long the inputs must rest before a new verdict is announced. */
export const ANNOUNCE_AFTER_MS = 1000;

/**
 * The answer for screen readers (docs/ui-design.md §10): one short sentence in a polite live region, said once the inputs
 * have rested (ANNOUNCE_AFTER_MS after the last result), and only when it changes. The first isn't announced: it's on the page
 * as it loads. `text` is null while it's being worked out. With one offer it's the offer's bottom line (A-1), with two or more
 * the verdict, so the comparison appearing or going says its sentence once (docs/v2-plan.md, item 5). The page holds it (App.tsx).
 */
export function LiveVerdict({ text }: { text: string | null }) {
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
              {placeOf(view, basis)} <span className="bar-figure">+{margin(basis, lead)}</span> {per(basis)}
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

export function Lead({ view, letters, stayYears, updating, error, notes, sample, dismissed = {}, dispatch, issues = {}, onFix, cautions = [], changes = 0,
  warnAt = [], onWarnings, flip = null, rentNotes = [], showBridge }: {
  /** A close call's flip line: present while the lead is a close call on a dollar basis. */
  flip?: FlipLine | null;
  /** Rents the verdict turns on: an entered rent and its estimate on either side of the rent that flips it (after rent only). */
  rentNotes?: RentNote[];
  view: VerdictView | null; letters: Letter[]; stayYears: number; updating: boolean; error: string | null; notes: string[];
  sample: boolean; dismissed?: UiState["dismissed"]; dispatch: Dispatch<Action>;
  /** A cost or benefit counted for some offers but not others, in words: it stays while it applies. */
  cautions?: string[];
  /** How many warnings change these numbers, the offers whose they are (each offer's A-6 lists them), and how to get there. */
  changes?: number; warnAt?: Letter[]; onWarnings?: (letter: Letter) => void;
  /** "See how we get there": the leader's bridge, in its A-2. */
  showBridge?: () => Promise<void>;
  /** Problems with the latest inputs: the results are the last valid ones until they're fixed. */
  issues?: Partial<Record<Letter, OfferIssue[]>>; onFix?: (t: EditTarget) => void;
}) {
  const problems = problemsOf(issues);
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  // The verdict's code (LeadVerdict.tsx): requested once the lead has first painted, beside the worker.
  const m = useLazyModule(verdictModule);
  useLoadAfterPaint(verdictModule);
  return (
    <section ref={ref} id="lead" className={`schedule lead${updating ? " is-updating" : ""}`} aria-labelledby="lead-title" aria-busy={updating}>
      <header className="schedule-head">
        <h2 id="lead-title" tabIndex={-1}><span className="ref">L</span> Lead schedule</h2>
        {sample && <Stamp>Illustrative samples</Stamp>}
        <span className="updating" aria-hidden={!updating}>{updating ? "Updating…" : ""}</span>
      </header>
      {sample && (
        <p className="banner">
          Sample offers: illustrative inputs, not market data. They start next July.{" "}
          <button type="button" className="link" onClick={() => dispatch({ type: "startBlank" })}>Start with my offer</button>
        </p>
      )}
      {notes.map((n) => <p key={n} className="note">{n}</p>)}
      {error && <p className="note error" role="alert">Couldn't compute: {error}</p>}
      <Problems issues={issues} results={!!view} onFix={onFix} />
      {/* With problems and no results, nothing is being worked out: the comparison waits for the fix. */}
      {view && m ? <m.Verdict view={view} letters={letters} stayYears={stayYears} dismissed={dismissed} dispatch={dispatch} cautions={cautions}
        changes={changes} warnAt={warnAt} onWarnings={onWarnings} flip={flip} rentNotes={rentNotes} showBridge={showBridge ?? (() => Promise.resolve())} />
        : !error && notes.length === 0 && problems.length === 0 && (
        <p className="note">Working out the comparison…</p>
      )}
      <TickLegend />
    </section>
  );
}

const problemsOf = (issues: Partial<Record<Letter, OfferIssue[]>>) =>
  (Object.entries(issues) as Array<[Letter, OfferIssue[]]>).flatMap(([letter, list]) => list.map((i) => ({ letter, i })));

/**
 * Problems with the latest inputs, each at its field with "Fix it": the results shown are the last valid ones until they're
 * fixed. The lead schedule shows it, and with one offer its breakdown's head (A-1).
 */
export function Problems({ issues, results, onFix }: {
  issues: Partial<Record<Letter, OfferIssue[]>>; /** Whether there are results from earlier inputs. */ results: boolean; onFix?: (t: EditTarget) => void;
}) {
  const problems = problemsOf(issues);
  if (!problems.length) return null;
  return (
    <div className="stale" role="alert">
      <p className="stale-head">{results ? "These results are for your last valid inputs." : "Nothing to work out yet."} Fix {problems.length === 1 ? "this" : "these"} to update them:</p>
      <ul>
        {problems.map(({ letter, i }) => (
          <li key={`${letter}|${i.path}|${i.code}`}>
            <strong className={`who offer-${letter}`}>{letter}</strong> {fieldName(i.path)}: {formatIssue(i)}{" "}
            {onFix && <button type="button" className="link" onClick={() => onFix({ letter, path: i.path.replace(/\.(bear|base|bull)$/, "") })}>Fix it</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

