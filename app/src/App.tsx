import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DATA_YEARS } from "../../src/col/cities";
import { rentKey, tieJob } from "./protocol";
import { About } from "./About";
import { asymmetries, asymmetryText } from "./comparability";
import { Lead, VerdictBar } from "./Lead";
import { PHONE, TABLET, useFocusClearOfBars, useKeyboardUp, useMedia } from "./media";
import { BreakevenSlot, ByYearSlot, LeavingSlot, loadLater, RiskSlot, TheWorkSlot, WarningsSlot } from "./Later";
import type { LeaveBasis } from "./leaveModel";
import type { OfferWarning } from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";
import { fieldId } from "./fields";
import { HELP, helpKey } from "./help";
import { Ledger as LedgerView, sectionOfPath } from "./Ledger";
import { ASSUMPTIONS, firstYear, type Letter, type Missing, toHousehold, toOfferInput } from "./model";
import { NewerSave } from "./Recovery";
import { clearSession, type KeyValueStore, loadSession, reducer, type SaveStatus, saveSession, type Theme, type Ticks } from "./session";
import { type EditTarget, rentNotes, type WorkContext } from "./metrics";
import { priceWords } from "./prices";
import { dayBefore, localToday, longDate } from "./text";
import { Printing, type PrintScope, type Stale, TickSetting } from "./ui";
import { WorkProvider } from "./Tickmarks";
import { type Engine, useEngine } from "./useEngine";
import type { Live } from "./copyDoc";
import { SECTIONS, type SectionId } from "./sections";
import { verdict } from "./verdict";

const STAYS = [2, 3, 4, 5];
/** Quick mode's fields: "Edit it" focuses them where they are, in either mode. */
const QUICK_FIELDS = new Set(["salary.annual", "bonus.amount", "costOfLiving.area", "startDate", "costOfLiving.monthlyRent", "label"]);
const ABOUT_FIELDS = {
  filing: "about-filing", stay: "stay", wages: "about-wages", spouse: "about-spouse", healthUsage: "about-health", prices: "about-prices",
} as const;
// The methodology is code-split: it loads when you open it.
const Methodology = lazy(() => import("./Methodology"));
// The Data page (export, import, delete) loads when it's opened too.
const DataPage = lazy(() => import("./Data"));

function storage(): KeyValueStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** ?theme=light|dark previews a theme for this visit without saving it. */
const themeOverride = (): Theme | null => {
  const t = new URLSearchParams(window.location.search).get("theme");
  return t === "light" || t === "dark" ? t : null;
};

/** Hash routes, so static hosting needs no rewrites: #/ (compare), #/method or #/method/M-7.2 (methodology), #/data (your data). */
function parseRoute(hash: string): { page: "compare" } | { page: "data" } | { page: "method"; section: SectionId | null } {
  if (/^#\/data/.test(hash)) return { page: "data" };
  const m = hash.match(/^#\/method(?:\/(M-[\d.]+))?/);
  if (!m) return { page: "compare" };
  return { page: "method", section: m[1] && m[1] in SECTIONS ? (m[1] as SectionId) : null };
}

function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parseRoute(hash);
}

export function App() {
  const today = useMemo(() => localToday(), []);
  const route = useRoute();
  const page = route.page;
  // Back on the comparison from the methodology, start at the top.
  useEffect(() => { if (page === "compare") window.scrollTo(0, 0); }, [page]);
  const [loaded] = useState(() => loadSession(storage(), today));
  const [session, dispatch] = useReducer(reducer, loaded.session);
  // A newer version's save is never saved over: the page says so (NewerSave) while it's there.
  const [saved, setSaved] = useState<SaveStatus>(loaded.newer !== null ? "newer" : "saved");
  // Phones show one offer at a time and the verdict bar at the bottom; tablets, the bar at the top (docs/ui-design.md §3.2).
  const phone = useMedia(PHONE);
  const tablet = useMedia(TABLET);
  const keyboardUp = useKeyboardUp();
  useFocusClearOfBars();

  useEffect(() => {
    const t = setTimeout(() => setSaved(saveSession(storage(), session)), 500);
    return () => clearTimeout(t);
  }, [session]);

  const theme = themeOverride() ?? session.ui.theme;
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  // Tickmarks hidden (docs/ui-design.md §9.1): the stylesheet hides the marks; every figure stays as it is, a button that opens
  // its work, with a dotted underline.
  const ticks: Ticks = session.ui.ticks ?? "shown";
  useEffect(() => {
    if (ticks === "hidden") document.documentElement.dataset.ticks = "hidden";
    else delete document.documentElement.dataset.ticks;
  }, [ticks]);
  const tickSetting = useMemo(() => ({ hidden: ticks === "hidden", show: () => dispatch({ type: "ui", patch: { ticks: "shown" } }) }), [ticks]);

  // Print (docs/ui-design.md §9.5): the page laid out for print (the root's "printing" class, and the Printing context: every
  // schedule expanded, holding the summary or the full workpaper). The Print button offers the choice (the summary first), then
  // gets every schedule ready; the browser's own print (Ctrl+P) lays out what's loaded as it starts, synchronously, so the charts
  // are drawn at the print width before the page is printed, holding the last choice made (the summary until one is).
  const [printing, setPrinting] = useState<PrintScope | null>(null);
  const [scope, setScope] = useState<PrintScope>("summary");
  const scopeNow = useRef(scope);
  scopeNow.current = scope;
  const [choosing, setChoosing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const printToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = () => {
      document.documentElement.classList.add("printing");
      flushSync(() => setPrinting((p) => p ?? scopeNow.current));
    };
    const after = () => {
      document.documentElement.classList.remove("printing");
      setPrinting(null);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const print = async () => {
    if (preparing) return;
    setChoosing(false);
    printToggle.current?.focus();
    setPreparing(true);
    try {
      const m = await import("./print");
      await m.printPage(() => {
        document.documentElement.classList.add("printing");
        setPrinting(scope);
      }, loadLater);
    } finally {
      setPreparing(false);
    }
  };

  const stayYears = session.household.stayYears;
  const wagesYear = firstYear(session.offers, today);
  const built = session.offers.map((o) => ({ o, r: toOfferInput(o) }));
  const complete = built.flatMap((x) => ("offer" in x.r ? [{ o: x.o, offer: x.r.offer }] : []));
  const missing = new Map<string, Missing[]>(built.flatMap((x) => ("missing" in x.r ? [[x.o.id, x.r.missing] as [string, Missing[]]] : [])));
  const compare = complete.length >= 2 ? {
    offers: complete.map((x) => x.offer),
    household: toHousehold(session.household, wagesYear),
    stays: [...new Set([...STAYS, stayYears])].sort((a, b) => a - b),
    stayYears,
    valuationDate: today, inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate,
  } : null;
  // Rent estimates come from the worker, which holds the HUD and BEA tables.
  const rents = [...new Map(session.offers.flatMap((o) => {
    const area = o.draft.costOfLiving.area;
    const state = o.draft.residence.state;
    return area && state ? [[rentKey(area, state), { area, state }] as const] : [];
  })).values()];
  const engine = useEngine({ compare, rents, check: complete.map((x) => x.offer) }, session.revision ?? 0);
  // The validator's problems, by offer: the engine checks the complete offers, in order.
  const issues: Partial<Record<Letter, OfferIssue[]>> = {};
  complete.forEach((x, i) => { if (engine.issues[i]?.length) issues[x.o.letter] = engine.issues[i]; });

  // "Edit it" (and "Fix it"): show the field (its offer's tab on a phone, its mode, section and row editor), then focus it.
  const [focus, setFocus] = useState<string | null>(null);
  const edit = (t: EditTarget) => {
    if ("about" in t) { setFocus(ABOUT_FIELDS[t.about]); return; }
    const key = helpKey(t.path);
    const quick = QUICK_FIELDS.has(key) && (session.ui.mode ?? "quick") === "quick";
    const editor = HELP[key]?.editor;
    dispatch({ type: "ui", patch: quick ? { offerTab: t.letter, ...(session.ui.editor?.letter !== t.letter ? { editor: null } : {}) }
      : { offerTab: t.letter, mode: "detailed", section: sectionOfPath(t.path), editor: editor ? { row: editor, letter: t.letter } : null } });
    setFocus(fieldId(t.letter, t.path));
  };
  // After the render that shows it (the DOM is committed when effects run).
  useEffect(() => {
    if (!focus) return;
    // A field without an input of its own (a read-only row) focuses its section's heading.
    const section = focus.startsWith("in-") ? sectionOfPath(focus.split("-").slice(2).join(".")) : null;
    const el = document.getElementById(focus) ?? (section ? document.getElementById(`section-head-${section}`) : null);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
    setFocus(null);
  }, [focus, session.ui]);
  const letters = complete.map((x) => x.o.letter);
  const noHours = complete.filter((x) => !x.o.draft.hours.weekly).map((x) => x.o.letter);
  const view = engine.sweep && engine.sweep.labels.length === letters.length
    ? verdict(engine.sweep, letters, session.ui.basis, stayYears, noHours, priceWords(session.household.pricesIn)) : null;
  // The engine's warnings for your stay (the remote-work rule, limits), by offer, for the fields they're about.
  const warnings: Partial<Record<Letter, OfferWarning[]>> = {};
  if (view && engine.detail) letters.forEach((l, i) => { if (engine.detail!.offers[i]?.warnings.length) warnings[l] = engine.detail!.offers[i].warnings; });
  // Warnings that change your numbers: the lead points to L-5, which lists every warning.
  const changes = view ? engine.detail?.changes ?? 0 : 0;
  const toWarnings = () => {
    document.getElementById("l5")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // L-5 loads as it nears the screen: its heading takes focus once it's there.
    const focus = (tries: number) => {
      const h = document.getElementById("l5-title");
      if (h) h.focus({ preventScroll: true });
      else if (tries) setTimeout(() => focus(tries - 1), 100);
    };
    focus(20);
  };
  // A cost or benefit counted for some offers but not others: the lead schedule says so.
  const cautions = asymmetries(complete.map((x) => x.o)).map(asymmetryText);

  const notes: string[] = [];
  if (complete.length < 2) notes.push("Fill in at least two offers to compare them.");
  for (const x of complete) {
    if (x.offer.startDate < today) notes.push(`Offer ${x.o.letter} starts before today, so its present value counts pay already received.`);
  }
  const sample = session.offers.some((o) => o.sample !== null);
  // L-4's last day and what it counts: this visit only.
  const [leaveAt, setLeaveAt] = useState<string | null>(null);
  const [leaveBasis, setLeaveBasis] = useState<LeaveBasis>("cash");
  const panels = engine.cursor.result;
  const leave = view && panels?.length === letters.length
    ? { leave: { basis: leaveBasis, stayEnd: dayBefore(view.row.window.end), panels } } : {};
  // The schedules after the lead show their figures from earlier inputs dimmed, and say why.
  const stale: Stale = engine.updating ? "updating" : engine.invalid ? "invalid" : null;
  const ready = !engine.updating && !engine.invalid && !!engine.sweep;
  // The close-call line (docs/ui-design.md §4.1): the runner-up's salary that ties, from the slow lane, ahead of L-3 and L-4.
  // Breakeven isn't defined per hour, so the line is for the dollar bases only.
  const lead = view?.lead;
  const flipJob = compare && view && lead?.closeCall && lead.margin > 0 && view.basis !== "perHour" ? tieJob("flip", compare, view.basis, lead) : null;
  const flipKey = flipJob && JSON.stringify(flipJob);
  const { requestSlow } = engine;
  useEffect(() => {
    if (ready && flipJob) requestSlow(flipJob, flipKey!);
    // The job is compared by value (its key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, flipKey, requestSlow]);
  const flipRow = engine.flip.result?.basis === view?.basis ? engine.flip.result?.rows[0] : undefined;
  const flip = flipJob && lead ? {
    // The last one worked out, while it's for this pair of offers.
    row: flipRow && flipRow.offer === lead.runnerUp && flipRow.against === lead.winner ? flipRow.salary : null,
    updating: engine.flip.key !== flipKey || engine.flip.updating, error: engine.flip.error,
  } : null;
  const ties = {
    ...(flip?.row && engine.flip.result ? { flip: engine.flip.result } : {}),
    ...(engine.breakeven.result ? { l3: engine.breakeven.result } : {}),
  };
  // L-6, the work (docs/ui-design.md §4.8): closed by default; its payments and tax years come only while it's open.
  const workOpen = session.ui.work?.open ?? false;
  const workLetter = session.ui.work?.letter ?? null;
  const payments = (workOpen || printing) && engine.work.result?.length === letters.length ? { work: engine.work.result } : {};
  const work: WorkContext = {
    today, household: session.household, wagesYear, offers: session.offers, rents: engine.rents,
    ...(view && engine.sweep ? { results: { sweep: engine.sweep, detail: engine.detail, view, letters, ...leave, ties, ...payments } } : {}),
  };
  // "Copy as document" (docs/copy-as-document-plan.md): waits while the inputs have a problem, and says why. It reads the page as it
  // is when its figures come back (`live`), not as it was when the button was pressed.
  const incomplete = session.offers.filter((o) => missing.has(o.id)).map((o) => o.letter);
  const copyBlocked = copyBlock({ compare: !!compare, view: !!view, invalid: !!engine.invalid, error: !!engine.error, incomplete });
  const live = useRef<Live | null>(null);
  live.current = { work, compare, ready, breakeven: engine.breakeven, cursor: engine.cursor, leaveAt };

  return (
    <WorkProvider ctx={work} onEdit={edit} onOpen={() => { if (!session.ui.dismissed?.ticks) dispatch({ type: "dismiss", hint: "ticks" }); }}>
    <TickSetting.Provider value={tickSetting}>
    <Printing.Provider value={printing}>
    <div className="page">
      <header className="masthead">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">✓</span>
          <span className="brand-name">Offer Calc</span>
        </a>
        <p className="tagline">Job offers compared the way they'd pay out: after tax, after rent and prices, per hour, year by year.</p>
        <nav className="pages" aria-label="Pages">
          <a href="#/" aria-current={route.page === "compare" ? "page" : undefined}>Compare</a>
          <a href="#/method" aria-current={route.page === "method" ? "page" : undefined}>Methodology</a>
          <a href="#/data" aria-current={route.page === "data" ? "page" : undefined}>Data</a>
        </nav>
        {route.page === "compare" && (
          <p className="print-bar no-print">
            {/* Ctrl+P prints only what's loaded: the button offers a summary or the full workpaper, then loads every schedule and works
                them out first. */}
            <button ref={printToggle} type="button" className="link" aria-expanded={choosing} aria-controls="print-choice"
              onClick={() => setChoosing(!choosing)}>Print…</button>
            <span className="print-status" role="status">{preparing ? "Getting every schedule ready…" : ""}</span>
            <CopyDocument blocked={copyBlocked?.why ?? null} quietly={copyBlocked ? !copyBlocked.shown : false} live={live}
              requestSlow={requestSlow} results={engine.sweep} />
          </p>
        )}
        {route.page === "compare" && choosing && (
          <PrintChoice scope={scope} onScope={setScope} onPrint={() => void print()}
            onCancel={() => { setChoosing(false); printToggle.current?.focus(); }} />
        )}
      </header>
      {saved === "newer" && <NewerSave schema={loaded.newer} />}

      {route.page === "method" ? (
        <Suspense fallback={<p className="note">Loading the methodology…</p>}>
          <Methodology ctx={work} section={route.section} sample={sample} />
        </Suspense>
      ) : route.page === "data" ? (
        <Suspense fallback={<p className="note">Loading…</p>}>
          <DataPage session={session} dispatch={dispatch} today={today} saved={saved} clear={() => { clearSession(storage()); }} />
        </Suspense>
      ) : (
        <>
          <About session={session} dispatch={dispatch} today={today} wagesYear={wagesYear} />
          {tablet && view && <VerdictBar view={view} stayYears={stayYears} place="top" updating={engine.updating} />}

          <main className="workpaper">
            <LedgerView offers={session.offers} missing={missing} rents={engine.rents} issues={issues} warnings={warnings} ui={session.ui}
              dispatch={dispatch} tabbed={phone && !printing} />
            <div className="results">
              <Lead view={view} letters={letters} stayYears={stayYears} updating={engine.updating} error={engine.error} notes={notes}
                sample={sample} dismissed={session.ui.dismissed} dispatch={dispatch} issues={engine.invalid ? issues : {}} onFix={edit}
                cautions={cautions} changes={changes} onWarnings={toWarnings} flip={flip} rentNotes={rentNotes(work)} />
            </div>
          </main>
          {work.results && <ByYearSlot ctx={work} ui={session.ui} sample={sample} dispatch={dispatch} status={stale} />}
          {work.results && <RiskSlot ctx={work} sample={sample} status={stale} />}
          {work.results && (
            <BreakevenSlot ctx={work} sample={sample} compare={compare} ready={ready} status={stale} ties={engine.breakeven} requestSlow={requestSlow} />
          )}
          {work.results && (
            <LeavingSlot ctx={work} sample={sample} compare={compare} ready={ready} status={stale}
              leave={engine.leave} cursor={engine.cursor} requestSlow={engine.requestSlow} at={leaveAt} basis={leaveBasis} onAt={setLeaveAt}
              onBasis={setLeaveBasis} />
          )}
          {work.results && <WarningsSlot ctx={work} sample={sample} status={stale} />}
          {work.results && (
            <TheWorkSlot ctx={work} sample={sample} compare={compare} ready={ready} status={stale} work={engine.work} requestSlow={requestSlow}
              open={workOpen} letter={workLetter} onOpen={(open) => dispatch({ type: "ui", patch: { work: { ...session.ui.work, open } } })}
              onLetter={(letter) => dispatch({ type: "ui", patch: { work: { open: true, letter } } })} />
          )}
        </>
      )}

      <footer className="colophon">
        <div className="settings no-print">
          {/* Native radios: arrow keys move and choose, and Tab stops once, on the one chosen. */}
          <fieldset className="theme">
            <legend className="sr-only">Theme</legend>
            {(["system", "light", "dark"] as Theme[]).map((t) => (
              <label key={t} className={theme === t ? "is-on" : ""}>
                <input type="radio" name="theme" value={t} checked={theme === t} className="sr-only" onChange={() => dispatch({ type: "theme", theme: t })} />
                {t[0].toUpperCase() + t.slice(1)}
              </label>
            ))}
          </fieldset>
          <fieldset className="theme">
            <legend className="sr-only">Tickmarks</legend>
            {(["shown", "hidden"] as Ticks[]).map((t) => (
              <label key={t} className={ticks === t ? "is-on" : ""}>
                <input type="radio" name="ticks" value={t} checked={ticks === t} className="sr-only" onChange={() => dispatch({ type: "ui", patch: { ticks: t } })} />
                {t === "shown" ? "Show tickmarks" : "Hide tickmarks"}
              </label>
            ))}
          </fieldset>
        </div>
        {/* In print, the footer says what the page is: samples or not, when, and the data's vintages (below). */}
        {sample && <p className="print-only">Includes sample offers: illustrative inputs, not market data.</p>}
        <p className="print-only">Printed {longDate(today)} from Offer Calc. Everything was worked out in this browser, from the inputs above.</p>
        <p className="no-print">
          {saved === "saved" ? "Saved in this browser only; nothing leaves this device."
            : saved === "newer" ? "Not saving: this browser holds a newer version's save (above), which this page won't save over."
            : "This browser isn't saving (private window?): your entries last until you close the tab."}{" "}
          <button type="button" className="link" onClick={() => dispatch({ type: "loadSamples", today })}>Reload the samples</button>
        </p>
        <p className="sources">
          Tax law 2026 (later years projected) · Prices: BEA Regional Price Parities {DATA_YEARS.rpp} · Rent estimates: HUD Fair
          Market Rents FY{DATA_YEARS.fmr} · Engine{engine.ms !== null && <span className="no-print">: {engine.ms.toFixed(0)} ms</span>} in a Web Worker.
          Not financial advice.
        </p>
        <p className="rights">© 2026 Owen Chapman. All rights reserved.</p>
      </footer>
      {/* Last on the page, so it sticks to the bottom of the screen all the way down (W9). */}
      {route.page === "compare" && phone && view && (
        <VerdictBar view={view} stayYears={stayYears} place="bottom" updating={engine.updating} hidden={keyboardUp} />
      )}
    </div>
    </Printing.Provider>
    </TickSetting.Provider>
    </WorkProvider>
  );
}

/**
 * Why "Copy as document" waits, if it does: a problem with the offers, said beside the button; or, while the comparison is first
 * being worked out (two offers are complete, its results aren't in yet), a reason said only to screen readers. Shown, that reason
 * was "Fill in at least two offers…", which wasn't so, and on a phone it wrapped onto a line of its own and was gone a moment later,
 * moving everything under it up 24 px (a layout shift of 0.020 in Lighthouse's mobile run, 2026-10-13).
 */
export function copyBlock(s: { compare: boolean; view: boolean; invalid: boolean; error: boolean; incomplete: string[] }):
  { why: string; shown: boolean } | null {
  if (!s.compare) return { why: "Fill in at least two offers to copy the comparison.", shown: true };
  if (s.invalid) return { why: "Fix the problems listed under the verdict to copy the comparison.", shown: true };
  if (s.error) return { why: "The comparison couldn't be worked out, so there's nothing to copy.", shown: true };
  if (s.incomplete.length) return { why: `Fill in or remove offer ${s.incomplete.join(" and ")} to copy the comparison.`, shown: true };
  if (!s.view) return { why: "Working out the comparison…", shown: false };
  return null;
}

type CopyState = "working" | "copied" | "again" | "failed" | null;
const COPY_SAID: Record<Exclude<CopyState, null>, string> = {
  working: "Getting the document ready…",
  copied: "Copied: paste it into a document or an email.",
  again: "Ready. Press Copy now to put it on the clipboard.",
  failed: "This browser wouldn't copy it. Print… gives the same figures.",
};

/**
 * "Copy as document": the comparison as a 2-3 page summary on the clipboard, HTML with a plain-text fallback. The click writes to
 * the clipboard at once, with the document as a promise its code (copyDoc.ts, loaded now) keeps once the slow lane has what it
 * needs, since Safari allows a write only inside the click. A browser that won't take that gets "Copy now", which copies the ready
 * document through a copy event. Disabled (aria-disabled, so it stays focusable and says why) while the inputs have a problem.
 */
function CopyDocument({ blocked, quietly = false, live, requestSlow, results }: {
  blocked: string | null; /** The reason is for screen readers only (copyBlock). */ quietly?: boolean;
  live: { current: Live | null }; requestSlow: Engine["requestSlow"];
  /** The comparison on the page: a new one makes what was copied, or got ready, an earlier comparison's. */
  results: unknown;
}) {
  const [state, setState] = useState<CopyState>(null);
  const ready = useRef<{ html: string; text: string } | null>(null);
  useEffect(() => {
    setState((s) => (s === "working" ? s : null));
    ready.current = null;
  }, [results, blocked]);
  const copy = () => {
    if (blocked || state === "working") return;
    setState("working");
    const doc = import("./copyDoc").then((m) => m.prepare(() => live.current!, requestSlow));
    const blob = (type: "text/html" | "text/plain") => doc.then((d) => new Blob([type === "text/html" ? d.html : d.text], { type }));
    let wrote: Promise<void>;
    try {
      wrote = navigator.clipboard.write([new ClipboardItem({ "text/html": blob("text/html"), "text/plain": blob("text/plain") })]);
    } catch (e) {
      wrote = Promise.reject(e);
    }
    wrote.then(() => setState("copied"), () => doc.then((d) => {
      ready.current = d;
      setState("again");
    }, () => setState("failed")));
  };
  const copyNow = () => {
    const d = ready.current;
    if (!d) return;
    const put = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/html", d.html);
      e.clipboardData?.setData("text/plain", d.text);
      e.preventDefault();
    };
    document.addEventListener("copy", put, { once: true });
    const ok = document.execCommand("copy");
    document.removeEventListener("copy", put);
    setState(ok ? "copied" : "failed");
  };
  return (
    <>
      <button type="button" className="link" aria-disabled={blocked ? true : undefined} aria-describedby={blocked ? "copy-why" : undefined}
        onClick={copy}>Copy as document</button>
      {state === "again" && <button type="button" className="link" onClick={copyNow}>Copy now</button>}
      <span className="print-status" role="status">{state ? COPY_SAID[state] : ""}</span>
      {blocked && <span id="copy-why" className={quietly ? "sr-only" : "print-status"}>{blocked}</span>}
    </>
  );
}

const SCOPES: Array<{ scope: PrintScope; name: string; hint: string }> = [
  { scope: "summary", name: "Summary", hint: "every schedule, with L-6's tables but not its list of every payment" },
  { scope: "full", name: "Full workpaper", hint: "adds every payment, to the cent: many more pages" },
];

/**
 * The Print button's choice (docs/ui-design.md §9.5): a summary (the default) or the full workpaper, then Print. Under the masthead,
 * not a dialog: focus starts on the choice, and Escape or Cancel goes back to the Print button.
 */
function PrintChoice({ scope, onScope, onPrint, onCancel }: {
  scope: PrintScope; onScope(s: PrintScope): void; onPrint(): void; onCancel(): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLInputElement>("input:checked")?.focus(); }, []);
  return (
    <div id="print-choice" className="print-choice no-print" ref={box} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}>
      <fieldset>
        <legend>What to print</legend>
        {SCOPES.map((x) => (
          <label key={x.scope} className="print-scope">
            <input type="radio" name="print-scope" value={x.scope} checked={scope === x.scope} onChange={() => onScope(x.scope)} />
            <span><strong>{x.name}</strong> <span className="print-hint">{x.hint}</span></span>
          </label>
        ))}
      </fieldset>
      <p className="data-actions">
        <button type="button" className="got-it data-button" onClick={onPrint}>Print</button>
        <button type="button" className="link" onClick={onCancel}>Cancel</button>
      </p>
    </div>
  );
}
