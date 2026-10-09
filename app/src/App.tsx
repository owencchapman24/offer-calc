import { lazy, Suspense, useEffect, useMemo, useReducer, useState } from "react";
import { DATA_YEARS } from "../../src/col/cities";
import { rentKey, tieJob } from "./protocol";
import { About } from "./About";
import { asymmetries, asymmetryText } from "./comparability";
import { ByYear } from "./ByYear";
import { Lead } from "./Lead";
import { BreakevenSlot, LeavingSlot, RiskSlot, WarningsSlot } from "./Later";
import type { LeaveBasis } from "./leaveModel";
import type { OfferWarning } from "../../src/offer/types";
import type { OfferIssue } from "../../src/offer/validate";
import { fieldId } from "./fields";
import { HELP, helpKey } from "./help";
import { Ledger as LedgerView, sectionOfPath } from "./Ledger";
import { ASSUMPTIONS, firstYear, type Letter, type Missing, toHousehold, toOfferInput } from "./model";
import { clearSession, type KeyValueStore, loadSession, reducer, saveSession, type Theme } from "./session";
import type { EditTarget, WorkContext } from "./metrics";
import { dayBefore, localToday } from "./text";
import type { Stale } from "./ui";
import { WorkProvider } from "./Tickmarks";
import { useEngine } from "./useEngine";
import { SECTIONS, type SectionId } from "./sections";
import { verdict } from "./verdict";

const STAYS = [2, 3, 4, 5];
/** Quick mode's fields: "Edit it" focuses them where they are, in either mode. */
const QUICK_FIELDS = new Set(["salary.annual", "bonus.amount", "costOfLiving.area", "startDate", "costOfLiving.monthlyRent", "label"]);
const ABOUT_FIELDS = { filing: "about-filing", stay: "stay", wages: "about-wages", healthUsage: "about-health", prices: "about-filing" } as const;
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
  const [session, dispatch] = useReducer(reducer, undefined, () => loadSession(storage(), today));
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSaved(saveSession(storage(), session)), 500);
    return () => clearTimeout(t);
  }, [session]);

  const theme = themeOverride() ?? session.ui.theme;
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

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

  // "Edit it" (and "Fix it"): show the field (its mode, section and row editor), then focus it.
  const [focus, setFocus] = useState<string | null>(null);
  const edit = (t: EditTarget) => {
    if ("about" in t) { setFocus(ABOUT_FIELDS[t.about]); return; }
    const key = helpKey(t.path);
    const quick = QUICK_FIELDS.has(key) && (session.ui.mode ?? "quick") === "quick";
    if (!quick) {
      const editor = HELP[key]?.editor;
      dispatch({ type: "ui", patch: { mode: "detailed", section: sectionOfPath(t.path), editor: editor ? { row: editor, letter: t.letter } : null } });
    }
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
    ? verdict(engine.sweep, letters, session.ui.basis, stayYears, noHours) : null;
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
  const work: WorkContext = {
    today, household: session.household, wagesYear, offers: session.offers, rents: engine.rents,
    ...(view && engine.sweep ? { results: { sweep: engine.sweep, detail: engine.detail, view, letters, ...leave, ties } } : {}),
  };

  return (
    <WorkProvider ctx={work} onEdit={edit} onOpen={() => { if (!session.ui.dismissed?.ticks) dispatch({ type: "dismiss", hint: "ticks" }); }}>
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
      </header>

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

          <main className="workpaper">
            <LedgerView offers={session.offers} missing={missing} rents={engine.rents} issues={issues} warnings={warnings} ui={session.ui}
              dispatch={dispatch} />
            <div className="results">
              <Lead view={view} letters={letters} stayYears={stayYears} updating={engine.updating} error={engine.error} notes={notes}
                sample={sample} dismissed={session.ui.dismissed} dispatch={dispatch} issues={engine.invalid ? issues : {}} onFix={edit}
                cautions={cautions} changes={changes} onWarnings={toWarnings} flip={flip} />
            </div>
          </main>
          {work.results && <ByYear ctx={work} ui={session.ui} sample={sample} dispatch={dispatch} status={stale} />}
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
        </>
      )}

      <footer className="colophon">
        <div className="theme" role="radiogroup" aria-label="Theme">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? "is-on" : ""}
              onClick={() => dispatch({ type: "theme", theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <p>
          {saved ? "Saved in this browser only; nothing leaves this device." : "This browser isn't saving (private window?): your entries last until you close the tab."}{" "}
          <button type="button" className="link" onClick={() => dispatch({ type: "loadSamples", today })}>Reload the samples</button>
        </p>
        <p className="sources">
          Tax law 2026 (later years projected) · Prices: BEA Regional Price Parities {DATA_YEARS.rpp} · Rent estimates: HUD Fair
          Market Rents FY{DATA_YEARS.fmr} · Engine{engine.ms !== null ? `: ${engine.ms.toFixed(0)} ms in a Web Worker` : " in a Web Worker"}.
          Not financial advice.
        </p>
      </footer>
    </div>
    </WorkProvider>
  );
}
