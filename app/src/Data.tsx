import { type ChangeEvent, type Dispatch, type RefObject, useEffect, useRef, useState } from "react";
import { formatIssue } from "../../src/format/issues";
import type { OfferIssue } from "../../src/offer/validate";
import { exportSession, type ImportResult, readImport } from "./exchange";
import { fieldName } from "./help";
import { type AppOffer, type Missing, toOfferInput } from "./model";
import { priceWords } from "./prices";
import type { EngineResponse } from "./protocol";
import { type Action, type Session, STORAGE_KEY } from "./session";
import { dollars, localToday, longDate } from "./text";
import { Stamp } from "./ui";

// The Data page (#/data, docs/ui-design.md §3.1, §10): what this browser stores, export, import and
// "Delete all data". Loaded only when opened. An import is checked before anything changes: the file's
// format and shape here, every offer's values by the engine's validateOffer in a worker of its own.

type Checked = Extract<ImportResult, { ok: true }> & { issues: Array<{ letter: string; issue: OfferIssue }>; missing: Array<{ letter: string; missing: Missing[] }> };

/** Checks imported offers' values with the engine, in a worker (the main thread never loads the engine). */
function checkOffers(offers: AppOffer[]): Promise<Checked["issues"] & {}> {
  const built = offers.map((o) => ({ o, r: toOfferInput(o) }));
  const complete = built.flatMap((x) => ("offer" in x.r ? [{ letter: x.o.letter, offer: x.r.offer }] : []));
  if (!complete.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<EngineResponse>) => {
      w.terminate();
      resolve(e.data.issues.flatMap((list, i) => list.map((issue) => ({ letter: complete[i].letter, issue }))));
    };
    w.postMessage({ gen: 1, compare: null, check: complete.map((x) => x.offer), rents: [] });
  });
}

/** Where focus goes after a step, so the keyboard never drops to the page: the element that replaced the one used. */
type FocusAfter = "cancelDelete" | "deleteButton" | "review" | "fileInput" | "imported";
type Done = { at: "export" | "import" | "delete"; text: string };

const UI_WORDS: Record<string, string> = { basis: "the basis", theme: "the theme", mode: "quick or detailed mode" };
const FILING = { single: "single", joint: "married, filing jointly", headOfHousehold: "head of household" } as const;

export default function DataPage({ session, dispatch, today, saved, clear }: {
  session: Session; dispatch: Dispatch<Action>; today: string; /** Saving in this browser works. */ saved: boolean;
  /** Deletes what this browser stores. */ clear: () => void;
}) {
  const top = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo(0, 0); top.current?.focus({ preventScroll: true }); }, []);
  const [file, setFile] = useState<{ name: string; result: ImportResult; checked?: Checked } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const focusAfter = useRef<FocusAfter | null>(null);
  const refs: Record<FocusAfter, RefObject<HTMLElement | null>> = {
    cancelDelete: useRef(null), deleteButton: useRef(null), review: useRef(null), fileInput: useRef(null), imported: useRef(null),
  };
  // After each render, move focus where the last step asked (once).
  useEffect(() => {
    const k = focusAfter.current;
    if (!k || !refs[k].current) return;
    focusAfter.current = null;
    refs[k].current.focus();
  });
  const then = (k: FocusAfter) => { focusAfter.current = k; };
  const sample = session.offers.some((o) => o.sample !== null);
  const download = exportSession(session, today);

  const save = () => {
    const url = URL.createObjectURL(new Blob([download.text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = download.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setDone({ at: "export", text: `Saved ${download.fileName}.` });
  };

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setDone(null);
    const result = readImport(await f.text());
    setFile({ name: f.name, result });
    if (!result.ok) return;
    const issues = await checkOffers(result.offers);
    const missing = result.offers.flatMap((o) => { const r = toOfferInput(o); return "missing" in r ? [{ letter: o.letter, missing: r.missing }] : []; });
    setFile({ name: f.name, result, checked: { ...result, issues, missing } });
    then("review");
  };

  const replace = (c: Checked) => {
    dispatch({ type: "replace", household: c.household, offers: c.offers, ...(c.ui ? { ui: c.ui } : {}) });
    setFile(null);
    setDone({ at: "import", text: `Imported ${c.offers.length} ${c.offers.length === 1 ? "offer" : "offers"}. ` });
    then("imported");
  };

  return (
    <div className="data-page">
      <article className="method-body">
        <header className="method-head">
          <h1 ref={top} tabIndex={-1}>Your data</h1>
          <p>Everything you enter stays in this browser. Export it to keep a copy or move it to another browser; import a copy back here.</p>
        </header>

        <section className="method-section" aria-labelledby="data-stored">
          <h2 id="data-stored"><span className="ref">D-1</span> What's stored</h2>
          <p>
            {saved ? "This browser saves" : "This browser isn't saving (a private window, or blocked storage), so nothing is kept after you close the tab. It holds"}{" "}
            {session.offers.length} {session.offers.length === 1 ? "offer" : "offers"} ({session.offers.map((o) => `${o.letter}${o.draft.label ? ` ${o.draft.label}` : ""}`).join(", ")}),
            About you, and your view choices, under the key <code>{STORAGE_KEY}</code>. Nothing is sent anywhere: there's no account,
            no server and no analytics.
          </p>
          {sample && <p><Stamp>Illustrative samples</Stamp> Some offers are samples: illustrative inputs, not market data.</p>}
        </section>

        <section className="method-section" aria-labelledby="data-export">
          <h2 id="data-export"><span className="ref">D-2</span> Export</h2>
          <p>One JSON file with every offer, About you and your view choices. It's versioned, so a later version of this app can read it.</p>
          <p><button type="button" className="got-it data-button" onClick={save}>Download {download.fileName}</button></p>
          {sample && <p className="method-note">The file says it includes sample offers, and its name ends -sample.</p>}
          {done?.at === "export" && <p className="note" role="status">{done.text}</p>}
        </section>

        <section className="method-section" aria-labelledby="data-import">
          <h2 id="data-import"><span className="ref">D-3</span> Import</h2>
          <p>
            Pick an Offer Calc export. It's checked first, and you see what it would replace and any problems with its inputs before
            anything changes.
          </p>
          <p>
            <label className="got-it data-button file-button">
              Choose a file…
              <input ref={refs.fileInput as RefObject<HTMLInputElement>} type="file" accept="application/json,.json" onChange={pick} className="sr-only" />
            </label>
          </p>
          {file && !file.result.ok && (
            <div className="stale" role="alert">
              <p className="stale-head">{file.name} can't be imported, so nothing has changed:</p>
              <ul>{file.result.problems.slice(0, 12).map((p) => <li key={p}>{p}</li>)}</ul>
              {file.result.problems.length > 12 && <p>…and {file.result.problems.length - 12} more.</p>}
            </div>
          )}
          {file?.result.ok && !file.checked && <p className="note">Checking {file.name}…</p>}
          {file?.checked && (
            <Review box={refs.review as RefObject<HTMLDivElement>} name={file.name} c={file.checked} current={session}
              replace={() => replace(file.checked!)} cancel={() => { setFile(null); then("fileInput"); }} />
          )}
          {done?.at === "import" && (
            <p className="note" role="status" tabIndex={-1} ref={refs.imported as RefObject<HTMLParagraphElement>}>{done.text}<a href="#/">See the comparison</a></p>
          )}
        </section>

        <section className="method-section" aria-labelledby="data-delete">
          <h2 id="data-delete"><span className="ref">D-4</span> Delete all data</h2>
          <p>Deletes everything you've entered in this browser and starts again with the sample offers.</p>
          {!confirmDelete ? (
            <p>
              <button type="button" className="got-it data-button" ref={refs.deleteButton as RefObject<HTMLButtonElement>}
                onClick={() => { setConfirmDelete(true); setDone(null); then("cancelDelete"); }}>Delete all data…</button>
            </p>
          ) : (
            <div className="stale" role="alertdialog" aria-labelledby="delete-confirm">
              <p className="stale-head" id="delete-confirm">Delete {session.offers.length} {session.offers.length === 1 ? "offer" : "offers"} and About you? This can't be undone; export first to keep a copy.</p>
              <p className="data-actions">
                <button type="button" className="got-it data-button danger" onClick={() => {
                  clear();
                  dispatch({ type: "reset", today });
                  setConfirmDelete(false);
                  setFile(null);
                  setDone({ at: "delete", text: "Deleted. The sample offers are loaded again." });
                  then("deleteButton");
                }}>Delete</button>
                {/* Focus starts here, on the action that changes nothing. */}
                <button type="button" className="link" ref={refs.cancelDelete as RefObject<HTMLButtonElement>}
                  onClick={() => { setConfirmDelete(false); then("deleteButton"); }}>Cancel</button>
              </p>
            </div>
          )}
          {done?.at === "delete" && <p className="note" role="status">{done.text}</p>}
        </section>
      </article>
    </div>
  );
}

/** What an import would replace, and its problems field by field, before anything changes. */
function Review({ box, name, c, current, replace, cancel }: {
  /** Focus moves here when the review appears. */ box: RefObject<HTMLDivElement>; name: string; c: Checked; current: Session; replace: () => void; cancel: () => void;
}) {
  const h = c.household;
  const offers = (os: AppOffer[]) => os.map((o) => `${o.letter}${o.draft.label ? ` ${o.draft.label}` : ""}`).join(", ");
  const problems = c.issues.length + c.missing.length;
  return (
    <div className="import-review" role="region" aria-label={`Importing ${name}`} tabIndex={-1} ref={box}>
      <p className="stale-head">{name}{c.migratedFrom ? ` (an older export, schema ${c.migratedFrom}, updated as it's read)` : ""}</p>
      <ul>
        <li>Replaces your {current.offers.length} {current.offers.length === 1 ? "offer" : "offers"} ({offers(current.offers)}) with {c.offers.length} from the file: {offers(c.offers)}.</li>
        <li>Replaces About you: {FILING[h.filingStatus]}, a stay of {h.stayYears} {h.stayYears === 1 ? "year" : "years"}, other wages of {dollars(h.otherWagesThisYear)}, {h.healthUsage ?? "medium"} health use, prices in {priceWords(h.pricesIn).name}.</li>
        {c.ui && Object.keys(c.ui).length > 0 && <li>Takes the file's view choices: {Object.keys(c.ui).map((k) => UI_WORDS[k] ?? k).join(", ")}.</li>}
        {c.note && <li>{c.note}</li>}
      </ul>
      {problems > 0 ? (
        <div className="stale">
          <p className="stale-head">Problems with its inputs ({problems}): they'll show at their fields, and the comparison waits until they're fixed.</p>
          <ul>
            {c.missing.map((m) => <li key={m.letter}><strong>{m.letter}</strong> needs {m.missing.join(", ")} to be compared.</li>)}
            {c.issues.map(({ letter, issue }) => (
              <li key={`${letter}|${issue.path}|${issue.code}`}><strong>{letter}</strong> {fieldName(issue.path)}: {formatIssue(issue)}</li>
            ))}
          </ul>
        </div>
      ) : <p className="note">Its inputs check out: no problems found.</p>}
      <p className="data-actions">
        <button type="button" className="got-it data-button" onClick={replace}>Replace everything</button>
        <button type="button" className="link" onClick={cancel}>Cancel</button>
      </p>
      <p className="method-note">Exported {exportedOn(c)}.</p>
    </div>
  );
}

/** The export's date where you are: the file's timestamp is UTC. */
const exportedOn = (c: Checked) => {
  const t = c.exportedAt ? new Date(c.exportedAt) : null;
  return t && !Number.isNaN(t.getTime()) ? longDate(localToday(t)) : "at an unknown time";
};
