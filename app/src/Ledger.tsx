import { type CSSProperties, type Dispatch, Fragment, type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { CITIES } from "../../src/col/cities";
import type { RentEstimate } from "../../src/col/rent";
import type { OfferWarning } from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";
import { type LedgerApi, LedgerProvider, RowLabel } from "./fields";
import { HELP, helpKey, LEDGER_SECTIONS } from "./help";
import { alsoCounted, type AppOffer, type Letter, LETTERS, type Missing } from "./model";
import { BonusRow, CityRow, RentRow, SalaryRow, StartRow } from "./rows";
import type { Action, LedgerSection, UiState } from "./session";
import { Stamp } from "./ui";
import { lazyModule, useLazyModule } from "./lazy";
import { Trace, useRovingTicks } from "./Tickmarks";

/** Detailed mode's sections, editors and controls: loaded the first time detailed mode is opened (or about to be). */
export const detailedModule = lazyModule(() => import("./Detailed"));

// The offers ledger: offers are columns, fields are rows, so A's salary sits beside B's (docs/ui-design.md
// §3.2). Quick mode asks for five fields; detailed mode adds the sections (§3.3), one open at a time.
// Switching back to quick keeps every detailed value, and the "Also counted" row says what still counts.
// On a phone it shows one offer at a time, chosen by tabs A | B | C | + (W9): every cell says whose it is
// (data-offer), and the stylesheet shows the chosen offer's.

export function Ledger({ offers, missing, rents, issues = {}, warnings = {}, ui, dispatch, tabbed = false, foot = null }: {
  offers: AppOffer[]; missing: Map<string, Missing[]>; rents: Record<string, RentEstimate>;
  /** The validator's problems for each offer. */ issues?: Partial<Record<Letter, OfferIssue[]>>;
  /** The engine's warnings for each offer, shown at their fields. */ warnings?: Partial<Record<Letter, OfferWarning[]>>;
  ui: Pick<UiState, "mode" | "section" | "editor" | "offerTab">; dispatch: Dispatch<Action>;
  /** A phone: one offer at a time, by tabs. */ tabbed?: boolean;
  /** The foot row with two or more offers: "On its own", each offer's bottom line (Breakdown.tsx, loaded beside the worker). */
  foot?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const mode = ui.mode ?? "quick";
  const tab = offers.find((o) => o.letter === ui.offerTab)?.letter ?? offers[0]?.letter ?? "A";
  // Focus to restore once a change to the offers has rendered (a tab added, an offer removed): the tab shown, or an id.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!pending.current) return;
    (document.getElementById(pending.current === "tab" ? `offer-tab-${tab}` : pending.current) ?? document.getElementById("offers-title"))?.focus();
    pending.current = null;
  });
  const select = (letter: Letter) =>
    dispatch({ type: "ui", patch: { offerTab: letter, ...(ui.editor && ui.editor.letter !== letter ? { editor: null } : {}) } });
  const add = () => {
    const free = LETTERS.find((l) => !offers.some((o) => o.letter === l));
    if (!free) return;
    dispatch({ type: "addOffer" });
    select(free);
    pending.current = "tab";
  };
  // The × goes with its offer: focus goes to the tab shown next, or (with every offer showing) the ledger's heading; down to one
  // offer, to its breakdown's heading, where its bottom line now is.
  const remove = (o: AppOffer) => {
    dispatch({ type: "removeOffer", id: o.id });
    pending.current = offers.length === 2 ? "own-title" : tabbed ? "tab" : "offers-title";
  };
  const needs = offers.filter((o) => (missing.get(o.id)?.length ?? 0) > 0 || (issues[o.letter]?.length ?? 0) > 0).map((o) => o.letter);
  const api: LedgerApi = {
    offers, issues, warnings, editor: ui.editor ?? null,
    set: (o, values) => dispatch({ type: "edit", id: o.id, set: values }),
    openEditor: (row, letter) => dispatch({ type: "ui", patch: { editor: letter ? { row, letter } : null } }),
  };
  const setMode = (m: "quick" | "detailed") => dispatch({ type: "ui", patch: { mode: m, editor: null } });
  const detailed = useLazyModule(detailedModule);
  useEffect(() => { if (mode === "detailed" && !detailed) void detailedModule.load(); }, [mode, detailed]);
  const preload = () => { void detailedModule.load(); };
  return (
    <LedgerProvider value={api}>
      <section ref={ref} className="ledger-wrap" aria-labelledby="offers-title">
        <div className="ledger-head">
          <h2 id="offers-title" className="strip-title" tabIndex={-1}>Offers</h2>
          <div className="mode">
            <div className="segmented" role="group" aria-label="Input mode">
              <button type="button" className={mode === "quick" ? "is-on" : ""} aria-pressed={mode === "quick"} onClick={() => setMode("quick")}>Quick</button>
              <button type="button" className={mode === "detailed" ? "is-on" : ""} aria-pressed={mode === "detailed"} onClick={() => setMode("detailed")}
                onPointerEnter={preload} onFocus={preload}>Detailed</button>
            </div>
            <span className="mode-note">{mode === "quick" ? "Five fields per offer." : "Every input, one section at a time."}</span>
          </div>
        </div>
        <datalist id="cities">{CITIES.map((c) => <option key={c.code} value={c.name} />)}</datalist>
        {tabbed && <OfferTabs offers={offers} tab={tab} needs={needs} select={select} add={add} />}
        <div className={`ledger is-${mode}${tabbed ? ` is-tabbed tab-${tab}` : ""}`} style={{ "--cols": offers.length } as CSSProperties}
          {...(tabbed ? { id: "offer-panel", role: "tabpanel", "aria-labelledby": `offer-tab-${tab}` } : {})}>
          <HeadRow offers={offers} missing={missing} remove={remove} set={api.set} />
          {mode === "quick" ? (
            <>
              <SalaryRow />
              <BonusRow />
              <CityRow />
              <StartRow />
              <RentRow rents={rents} />
              <AlsoCounted offers={offers} show={() => setMode("detailed")} preload={preload} />
              {foot}
            </>
          ) : LEDGER_SECTIONS.map((s) => (
            <Fragment key={s.id}>
              <SectionHead id={s.id} title={s.title} holds={s.holds} open={ui.section === s.id} issues={issues}
                toggle={() => dispatch({ type: "ui", patch: { section: ui.section === s.id ? null : s.id, editor: null } })} />
              {ui.section === s.id && (detailed ? <detailed.DetailedSection id={s.id} rents={rents} />
                : <div className="row loading-row"><p className="note">Loading this section…</p></div>)}
            </Fragment>
          )).concat(<Fragment key="foot">{foot}</Fragment>)}
        </div>
        {offers.length < 3 && !tabbed && (
          <button type="button" className="add" onClick={() => dispatch({ type: "addOffer" })}>+ Add an offer to compare (up to 3)</button>
        )}
      </section>
    </LedgerProvider>
  );
}

function HeadRow({ offers, missing, remove, set }: {
  offers: AppOffer[]; missing: Map<string, Missing[]>; remove: (o: AppOffer) => void; set: LedgerApi["set"];
}) {
  return (
    <div className="row row-head">
      <RowLabel k="label" />
      {offers.map((o) => (
        <div key={o.id} className={`cell offer-head offer-${o.letter}`} data-offer={o.letter}>
          <div className="offer-letter">
            <span className="letter">{o.letter}</span>
            {o.sample === "sample" && <Stamp>Sample</Stamp>}
            {o.sample === "edited" && <Stamp>Edited sample</Stamp>}
            {offers.length > 1 && (
              <button type="button" className="remove" onClick={() => remove(o)} aria-label={`Remove offer ${o.letter}`} title={`Remove offer ${o.letter}`}>
                ×</button>
            )}
          </div>
          <input className="offer-label" aria-label={`Offer ${o.letter} name`} placeholder={`Offer ${o.letter}`} data-help="label"
            aria-describedby="hint-label" value={o.draft.label} onChange={(e) => set(o, { label: e.target.value })} />
          {(missing.get(o.id)?.length ?? 0) > 0 && (
            <p className="needs">Needs {missing.get(o.id)!.join(", ")} to be worked out.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The phone's offer tabs (docs/ui-design.md §3.2, W9): a tab list (arrow keys, Home and End move and choose; Tab goes on
 * into the offer), and + to add an offer while there are fewer than three. A tab whose offer needs a fix says so.
 */
function OfferTabs({ offers, tab, needs, select, add }: {
  offers: AppOffer[]; tab: Letter; needs: Letter[]; select: (l: Letter) => void; add: () => void;
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = offers.findIndex((o) => o.letter === tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? offers.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const letter = offers[(next + offers.length) % offers.length].letter;
    select(letter);
    document.getElementById(`offer-tab-${letter}`)?.focus();
  };
  return (
    <div className="offer-tabs">
      <div className="tablist" role="tablist" aria-label="Offers">
        {offers.map((o) => {
          const on = o.letter === tab;
          return (
            <button key={o.id} type="button" role="tab" id={`offer-tab-${o.letter}`} className={`tab offer-${o.letter}${on ? " is-on" : ""}`}
              aria-selected={on} aria-controls="offer-panel" tabIndex={on ? 0 : -1} onClick={() => select(o.letter)} onKeyDown={onKey}>
              <span className="tab-letter">{o.letter}</span>
              <span className="tab-label">{o.draft.label || `Offer ${o.letter}`}</span>
              {needs.includes(o.letter) && <span className="tab-needs"><span aria-hidden="true">⚠</span><span className="sr-only">, needs a fix</span></span>}
            </button>
          );
        })}
      </div>
      {offers.length < 3 && <button type="button" className="tab-add" aria-label="Add an offer to compare" title="Add an offer to compare" onClick={add}>+</button>}
    </div>
  );
}

/** Quick mode's row for what it doesn't show but still counts: hidden inputs never change results silently. */
function AlsoCounted({ offers, show, preload }: { offers: AppOffer[]; show: () => void; preload: () => void }) {
  if (!offers.some((o) => alsoCounted(o.draft).length)) return null;
  return (
    <div className="row">
      <div className="row-label">
        <span className="row-name">Also counted</span>
        <div className="help">
          <span className="hint">Detailed inputs this view hides. They still count.</span>{" "}
          <button type="button" className="link" onClick={show} onPointerEnter={preload} onFocus={preload}>Show</button>
        </div>
      </div>
      {offers.map((o) => {
        const also = alsoCounted(o.draft);
        return <Trace key={o.id} id={`in.${o.letter}.also`} className="cell also" offer={o.letter}>{also.length ? also.join(", ") : "—"}</Trace>;
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
