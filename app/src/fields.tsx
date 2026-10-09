import { createContext, type ReactNode, useContext, useState } from "react";
import { formatIssue } from "../../src/format/index";
import type { OfferIssue } from "../../src/offer/validate";
import type { ByScenario, MonthDay } from "../../src/offer/types";
import { defaultFor, isDefault } from "./defaults";
import { HELP, helpKey } from "./help";
import { all, type AppOffer, getPath, hasRange, type Letter } from "./model";
import type { MetricId } from "./metrics";
import { TickButton, Trace } from "./Tickmarks";
import { Help, type NumberKind, NumberInput, toPercent } from "./ui";

// The ledger's building blocks (docs/ui-design.md §3.3-3.6): a row per field with its help, a cell
// per offer, defaults with a D tickmark, problems shown under the field that caused them, the
// "+ range" control, and the row editor that opens beneath a row, spanning the ledger.

export interface LedgerApi {
  offers: AppOffer[];
  /** Sets draft fields by path. */
  set(o: AppOffer, values: Record<string, unknown>): void;
  /** The validator's problems for each offer. */
  issues: Partial<Record<Letter, OfferIssue[]>>;
  /** The open row editor. */
  editor: { row: string; letter: Letter } | null;
  openEditor(row: string, letter: Letter | null): void;
}

const Ledger = createContext<LedgerApi | null>(null);
export const LedgerProvider = Ledger.Provider;
export function useLedger(): LedgerApi {
  const api = useContext(Ledger);
  if (!api) throw new Error("Ledger fields need a LedgerProvider.");
  return api;
}

/** The DOM id of an offer's field: what "Edit it" focuses. */
export const fieldId = (letter: Letter, path: string) => `in-${letter}-${path.replace(/\./g, "-")}`;
/** The DOM id of a row's hint, for aria-describedby. */
export const hintId = (key: string) => `hint-${key.replace(/\./g, "-")}`;
/** An input's figure id: derivations light it up, and its tickmark opens its own. */
export const inputMetric = (letter: Letter, path: string) => `in.${letter}.${path}` as MetricId;

/** A problem's path is the field's, or inside it ("salary.raise.bear" is in "salary.raise"). */
const within = (path: string, field: string) => path === field || path.startsWith(`${field}.`);

export function issuesAt(api: LedgerApi, letter: Letter, path: string): OfferIssue[] {
  return (api.issues[letter] ?? []).filter((i) => within(i.path, path));
}

const SCENARIO_WORD: Record<string, string> = { bear: "Bear case", bull: "Bull case" };

/** The problems at a field (and inside it), in plain English. */
export function Issues({ letter, path, exclude }: { letter: Letter; path: string; /** Paths shown elsewhere (in an editor). */ exclude?: string }) {
  const api = useLedger();
  const list = issuesAt(api, letter, path).filter((i) => !exclude || !within(i.path, exclude));
  if (!list.length) return null;
  return (
    <ul className="field-errors" role="alert">
      {list.map((i) => {
        const last = i.path.split(".").pop()!;
        return <li key={`${i.path}|${i.code}`}>{SCENARIO_WORD[last] ? `${SCENARIO_WORD[last]}: ` : ""}{formatIssue(i)}</li>;
      })}
    </ul>
  );
}

/** A row's label and its help: the hint, the ⓘ, "How this is used →" and, for a default, "Reset to default". */
export function RowLabel({ k, label }: { k: string; label?: string }) {
  const h = HELP[k];
  const d = defaultFor(k);
  const api = useLedger();
  const changed = d ? api.offers.filter((o) => !isDefault(o.draft, k)) : [];
  return (
    <div className="row-label">
      <span className="row-name">{label ?? h.label}</span>
      <Help hint={h.hint} hintId={hintId(k)} section={h.section} extra={changed.length > 0 && d ? (
        <p className="reset">
          Reset to the default ({d.shown(changed[0].draft)}):{" "}
          {changed.map((o, i) => (
            <span key={o.id}>{i ? " · " : ""}<button type="button" className="link" onClick={() => api.set(o, { [k]: null, ...d.alsoClear })}>
              {o.letter}</button></span>
          ))}
        </p>
      ) : null}>{h.help}</Help>
    </div>
  );
}

/** A row of the ledger: its label and help, and one cell per offer, each lit up when a derivation uses it. */
export function FieldRow({ k, label, children, issues = "all", className = "" }: {
  k: string; label?: string; children: (o: AppOffer) => ReactNode;
  /** "editor": problems inside the row's editor are shown there; the cell says how many. */ issues?: "all" | "editor"; className?: string;
}) {
  const api = useLedger();
  return (
    <div className={`row ${className}`.trim()}>
      <RowLabel k={k} label={label} />
      {api.offers.map((o) => {
        const inside = issuesAt(api, o.letter, k);
        return (
          <Trace key={o.id} id={inputMetric(o.letter, k)} className="cell">
            {children(o)}
            {issues === "all" ? <Issues letter={o.letter} path={k} /> : inside.length > 0 && (
              <p className="field-error" role="alert">{inside.length === 1 ? "1 problem" : `${inside.length} problems`}: open it to fix.</p>
            )}
          </Trace>
        );
      })}
    </div>
  );
}

/** A default's D tickmark: it opens why it's the default. */
export function DefaultTick({ o, path, label }: { o: AppOffer; path: string; label: string }) {
  return isDefault(o.draft, path) ? <TickButton id={inputMetric(o.letter, path)} label={label} /> : null;
}

/** The value a field shows: what's entered, else its default. */
export function shownValue<T>(o: AppOffer, path: string): T | null {
  const v = getPath(o.draft, path);
  return (v ?? (defaultFor(path)?.value as T | undefined) ?? null) as T | null;
}

const unitOf = (kind: NumberKind) => (kind === "percent" ? (x: number) => toPercent(x) : (x: number) => x);
const fromUnit = (kind: NumberKind) => (kind === "percent" ? (x: number) => x / 100 : (x: number) => x);

/** A plain number field over a draft path (percents are fractions in the draft). */
export function NumberField({ o, path, kind, label, unit, placeholder }: {
  o: AppOffer; path: string; kind: NumberKind; label: string; unit?: string; placeholder?: string;
}) {
  const api = useLedger();
  const v = shownValue<number>(o, path);
  const k = helpKey(path);
  return (
    <span className="field">
      <NumberInput id={fieldId(o.letter, path)} kind={kind} label={`Offer ${o.letter} ${label}`} unit={unit} placeholder={placeholder}
        value={v === null ? null : unitOf(kind)(v)} help={k} describedBy={hintId(k)} invalid={issuesAt(api, o.letter, path).length > 0}
        onChange={(x) => api.set(o, { [path]: x === null ? null : fromUnit(kind)(x) })} />
      <DefaultTick o={o} path={path} label={`the default ${label}`} />
    </span>
  );
}

/**
 * A value with an optional range (docs/ui-design.md §3.3): one value (the base case) and a "+ range"
 * link that reveals bear and bull. Without a range all three are equal. A range that's entered always
 * shows, so it's never hidden.
 */
export function RangeField({ o, path, kind, label, unit, blank }: {
  o: AppOffer; path: string; kind: NumberKind; label: string; unit?: string; /** Shown under a blank field ("Not counted"). */ blank?: string;
}) {
  const api = useLedger();
  const stored = getPath(o.draft, path) as ByScenario | null;
  const def = defaultFor(path)?.value as number | undefined;
  const v: ByScenario | null = stored ?? (def !== undefined ? all(def) : null);
  const [open, setOpen] = useState(false);
  const shown = open || hasRange(stored);
  const k = helpKey(path);
  const u = unitOf(kind);
  const f = fromUnit(kind);
  const bad = (s: string) => issuesAt(api, o.letter, `${path}.${s}`).length > 0;
  const setCase = (which: "bear" | "bull") => (x: number | null) =>
    api.set(o, { [path]: { ...(v ?? all(0)), [which]: x === null ? (v?.base ?? 0) : f(x) } });
  return (
    <span className="field range">
      <span className="range-base">
        <NumberInput id={fieldId(o.letter, path)} kind={kind} unit={unit} label={`Offer ${o.letter} ${label}${shown ? ", base case" : ""}`}
          value={v === null ? null : u(v.base)} help={k} describedBy={hintId(k)} invalid={bad("base")}
          onChange={(x) => api.set(o, { [path]: x === null ? null : shown && v ? { ...v, base: f(x) } : all(f(x)) })} />
        <DefaultTick o={o} path={path} label={`the default ${label}`} />
        {shown && <span className="range-tag">base</span>}
      </span>
      {v === null && blank && <span className="sub not-counted">{blank}</span>}
      {shown && v && (
        <span className="range-cases">
          {(["bear", "bull"] as const).map((which) => (
            <span key={which} className="range-case">
              <NumberInput id={fieldId(o.letter, `${path}.${which}`)} kind={kind} unit={unit} label={`Offer ${o.letter} ${label}, ${which} case`}
                value={u(v[which])} help={k} describedBy={hintId(k)} invalid={bad(which)} onChange={setCase(which)} />
              <span className="range-tag">{which}</span>
            </span>
          ))}
        </span>
      )}
      {v !== null && (shown
        ? <button type="button" className="link sub-link" onClick={() => { setOpen(false); api.set(o, { [path]: stored ? all(stored.base) : null }); }}>
            No range</button>
        : <button type="button" className="link sub-link" aria-label={`Add a range to offer ${o.letter} ${label}`} onClick={() => setOpen(true)}>+ range</button>)}
    </span>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date that recurs each year. With `none`, it can be left out ("None"). */
export function MonthDayField({ o, path, label, none }: { o: AppOffer; path: string; label: string; none?: string }) {
  const api = useLedger();
  const v = shownValue<MonthDay>(o, path);
  const k = helpKey(path);
  const invalid = issuesAt(api, o.letter, path).length > 0 || undefined;
  return (
    <span className="field month-day">
      <select id={fieldId(o.letter, path)} aria-label={`Offer ${o.letter} ${label}, month`} data-help={k} aria-describedby={hintId(k)} aria-invalid={invalid}
        value={v ? v.month : ""} onChange={(e) => api.set(o, { [path]: e.target.value === "" ? null : { month: Number(e.target.value), day: v?.day ?? 1 } })}>
        {none !== undefined && <option value="">{none}</option>}
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      {v && (
        <select aria-label={`Offer ${o.letter} ${label}, day`} data-help={k} aria-describedby={hintId(k)} aria-invalid={invalid} value={v.day}
          onChange={(e) => api.set(o, { [path]: { month: v.month, day: Number(e.target.value) } })}>
          {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
        </select>
      )}
      <DefaultTick o={o} path={path} label={`the default ${label}`} />
    </span>
  );
}

/** A choice among a few values (a select), showing its default with a D tickmark. */
export function ChoiceField<T extends string | boolean>({ o, path, label, options }: {
  o: AppOffer; path: string; label: string; options: Array<[T, string]>;
}) {
  const api = useLedger();
  const v = shownValue<T>(o, path);
  const k = helpKey(path);
  return (
    <span className="field">
      <select id={fieldId(o.letter, path)} aria-label={`Offer ${o.letter} ${label}`} data-help={k} aria-describedby={hintId(k)}
        value={String(v)} onChange={(e) => api.set(o, { [path]: options.find(([x]) => String(x) === e.target.value)![0] })}>
        {options.map(([x, text]) => <option key={String(x)} value={String(x)}>{text}</option>)}
      </select>
      <DefaultTick o={o} path={path} label={`the default ${label}`} />
    </span>
  );
}

/** A calendar date; at its default (null) it shows the default date with a D tickmark. */
export function DateField({ o, path, label, fallback }: { o: AppOffer; path: string; label: string; /** The default's date. */ fallback?: string | null }) {
  const api = useLedger();
  const v = (getPath(o.draft, path) as string | null) ?? fallback ?? null;
  const k = helpKey(path);
  return (
    <span className="field">
      <input id={fieldId(o.letter, path)} type="date" aria-label={`Offer ${o.letter} ${label}`} data-help={k} aria-describedby={hintId(k)}
        aria-invalid={issuesAt(api, o.letter, path).length > 0 || undefined} value={v ?? ""} min="2026-01-01"
        onChange={(e) => api.set(o, { [path]: e.target.value || null })} />
      <DefaultTick o={o} path={path} label={`the default ${label}`} />
    </span>
  );
}

/** The button in a cell that opens its row's editor beneath the row. */
export function EditButton({ o, row, label }: { o: AppOffer; row: string; label: string }) {
  const api = useLedger();
  const open = api.editor?.row === row && api.editor.letter === o.letter;
  return (
    <button type="button" id={fieldId(o.letter, row)} className="link edit-button" aria-expanded={open} data-help={helpKey(row)}
      aria-controls={`editor-${row.replace(/\./g, "-")}`} onClick={() => api.openEditor(row, open ? null : o.letter)}>
      {open ? "Close" : label} <span aria-hidden="true">✎</span>
    </button>
  );
}

/**
 * The editor beneath a row, spanning the ledger so the other offers stay in view (W3): vesting
 * tables, promotions, the bonus schedule. One is open at a time.
 */
export function EditorRow({ row, title, children }: { row: string; title: string; children: (o: AppOffer) => ReactNode }) {
  const api = useLedger();
  if (api.editor?.row !== row) return null;
  const o = api.offers.find((x) => x.letter === api.editor!.letter);
  if (!o) return null;
  return (
    <div className={`row-editor offer-${o.letter}`} id={`editor-${row.replace(/\./g, "-")}`} role="group" aria-label={`Offer ${o.letter}: ${title}`}>
      <div className="editor-head">
        <span className="who">{o.letter}</span>
        <span className="editor-title">{title}</span>
        <button type="button" className="got-it" onClick={() => {
          api.openEditor(row, null);
          document.getElementById(fieldId(o.letter, row))?.focus();
        }}>Done</button>
      </div>
      {children(o)}
    </div>
  );
}

/** A column heading inside an editor, with its own hint and help. */
export function EditorHead({ k }: { k: string }) {
  const h = HELP[k];
  return (
    <div className="editor-col">
      <span className="editor-col-name">{h.label}</span>
      <Help hint={h.hint} hintId={hintId(k)} section={h.section}>{h.help}</Help>
    </div>
  );
}
