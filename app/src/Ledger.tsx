import { type CSSProperties, type Dispatch, Fragment, useRef } from "react";
import { CITIES } from "../../src/col/cities";
import type { RentEstimate } from "../../src/col/rent";
import type { OfferIssue } from "../../src/offer/validate";
import { DetailedSection } from "./Detailed";
import { type LedgerApi, LedgerProvider, RowLabel } from "./fields";
import { HELP, helpKey, LEDGER_SECTIONS } from "./help";
import { alsoCounted, type AppOffer, type Letter, type Missing } from "./model";
import { BonusRow, CityRow, RentRow, SalaryRow, StartRow } from "./rows";
import type { Action, LedgerSection, UiState } from "./session";
import { Stamp } from "./ui";
import { Trace, useRovingTicks } from "./Tickmarks";

// The offers ledger: offers are columns, fields are rows, so A's salary sits beside B's (docs/ui-design.md
// §3.2). Quick mode asks for five fields; detailed mode adds the sections (§3.3), one open at a time.
// Switching back to quick keeps every detailed value, and the "Also counted" row says what still counts.

export function Ledger({ offers, missing, rents, issues = {}, ui, dispatch }: {
  offers: AppOffer[]; missing: Map<string, Missing[]>; rents: Record<string, RentEstimate>;
  /** The validator's problems for each offer. */ issues?: Partial<Record<Letter, OfferIssue[]>>;
  ui: Pick<UiState, "mode" | "section" | "editor">; dispatch: Dispatch<Action>;
}) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const mode = ui.mode ?? "quick";
  const api: LedgerApi = {
    offers, issues, editor: ui.editor ?? null,
    set: (o, values) => dispatch({ type: "edit", id: o.id, set: values }),
    openEditor: (row, letter) => dispatch({ type: "ui", patch: { editor: letter ? { row, letter } : null } }),
  };
  const setMode = (m: "quick" | "detailed") => dispatch({ type: "ui", patch: { mode: m, editor: null } });
  return (
    <LedgerProvider value={api}>
      <section ref={ref} className="ledger-wrap" aria-labelledby="offers-title">
        <div className="ledger-head">
          <h2 id="offers-title" className="strip-title">Offers</h2>
          <div className="mode">
            <div className="segmented" role="group" aria-label="Input mode">
              <button type="button" className={mode === "quick" ? "is-on" : ""} aria-pressed={mode === "quick"} onClick={() => setMode("quick")}>Quick</button>
              <button type="button" className={mode === "detailed" ? "is-on" : ""} aria-pressed={mode === "detailed"} onClick={() => setMode("detailed")}>
                Detailed</button>
            </div>
            <span className="mode-note">{mode === "quick" ? "Five fields per offer." : "Every input, one section at a time."}</span>
          </div>
        </div>
        <datalist id="cities">{CITIES.map((c) => <option key={c.code} value={c.name} />)}</datalist>
        <div className={`ledger is-${mode}`} style={{ "--cols": offers.length } as CSSProperties}>
          <HeadRow offers={offers} missing={missing} dispatch={dispatch} />
          {mode === "quick" ? (
            <>
              <SalaryRow />
              <BonusRow />
              <CityRow />
              <StartRow />
              <RentRow rents={rents} />
              <AlsoCounted offers={offers} show={() => setMode("detailed")} />
            </>
          ) : LEDGER_SECTIONS.map((s) => (
            <Fragment key={s.id}>
              <SectionHead id={s.id} title={s.title} holds={s.holds} open={ui.section === s.id} issues={issues}
                toggle={() => dispatch({ type: "ui", patch: { section: ui.section === s.id ? null : s.id, editor: null } })} />
              {ui.section === s.id && <DetailedSection id={s.id} rents={rents} />}
            </Fragment>
          ))}
        </div>
        {offers.length < 3 && (
          <button type="button" className="add" onClick={() => dispatch({ type: "addOffer" })}>+ Add an offer (up to 3)</button>
        )}
      </section>
    </LedgerProvider>
  );
}

function HeadRow({ offers, missing, dispatch }: { offers: AppOffer[]; missing: Map<string, Missing[]>; dispatch: Dispatch<Action> }) {
  return (
    <div className="row row-head">
      <RowLabel k="label" />
      {offers.map((o) => (
        <div key={o.id} className={`cell offer-head offer-${o.letter}`}>
          <div className="offer-letter">
            <span className="letter">{o.letter}</span>
            {o.sample === "sample" && <Stamp>Sample</Stamp>}
            {o.sample === "edited" && <Stamp>Edited sample</Stamp>}
            {offers.length > 2 && (
              <button type="button" className="remove" onClick={() => dispatch({ type: "removeOffer", id: o.id })}
                aria-label={`Remove offer ${o.letter}`} title={`Remove offer ${o.letter}`}>×</button>
            )}
          </div>
          <input className="offer-label" aria-label={`Offer ${o.letter} name`} placeholder={`Offer ${o.letter}`} data-help="label"
            aria-describedby="hint-label" value={o.draft.label} onChange={(e) => dispatch({ type: "edit", id: o.id, set: { label: e.target.value } })} />
          {(missing.get(o.id)?.length ?? 0) > 0 && (
            <p className="needs">Needs {missing.get(o.id)!.join(", ")} to be compared.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Quick mode's row for what it doesn't show but still counts: hidden inputs never change results silently. */
function AlsoCounted({ offers, show }: { offers: AppOffer[]; show: () => void }) {
  if (!offers.some((o) => alsoCounted(o.draft).length)) return null;
  return (
    <div className="row">
      <div className="row-label">
        <span className="row-name">Also counted</span>
        <div className="help">
          <span className="hint">Detailed inputs this view hides. They still count.</span>{" "}
          <button type="button" className="link" onClick={show}>Show</button>
        </div>
      </div>
      {offers.map((o) => {
        const also = alsoCounted(o.draft);
        return <Trace key={o.id} id={`in.${o.letter}.also`} className="cell also">{also.length ? also.join(", ") : "—"}</Trace>;
      })}
    </div>
  );
}

/** A section's heading row: it opens the section (closing the open one) and flags problems inside it. */
function SectionHead({ id, title, holds, open, issues, toggle }: {
  id: LedgerSection; title: string; holds: string; open: boolean; issues: Partial<Record<Letter, OfferIssue[]>>; toggle: () => void;
}) {
  const flagged = (Object.entries(issues) as Array<[Letter, OfferIssue[]]>)
    .filter(([, list]) => list.some((i) => sectionOfPath(i.path) === id)).map(([l]) => l);
  return (
    <div className={`section-head${open ? " is-open" : ""}`}>
      <button type="button" className="section-toggle" aria-expanded={open} id={`section-head-${id}`} onClick={toggle}>
        <span className="section-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span className="section-title">{title}</span>
        <span className="section-holds">{holds}</span>
      </button>
      {flagged.length > 0 && <span className="section-flag">Needs a fix: {flagged.join(", ")}</span>}
    </div>
  );
}

const SECTION_OF_HEAD: Record<string, LedgerSection> = {
  salary: "pay", startDate: "pay", bonus: "bonus", cashAwards: "cash", equity: "equity", retirement: "retirement", health: "health",
  perks: "perks", hours: "hours", costOfLiving: "where", residence: "where", employerState: "where", leaveDate: "pay",
};

/** The detailed-mode section an input path belongs to. */
export function sectionOfPath(path: string): LedgerSection | null {
  const group = HELP[helpKey(path)]?.group;
  if (group && group !== "about" && group !== "head") return group;
  return SECTION_OF_HEAD[path.split(".")[0]] ?? null;
}
