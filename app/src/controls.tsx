import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatWarning } from "../../src/format/warnings";
import { WARNING_AT } from "./warningAt";
import type { ByScenario, MonthDay } from "../../src/offer/types";
import { defaultFor, isDefault } from "./defaults";
import { DefaultTick, fieldId, hintId, issuesAt, useLedger } from "./fields";
import { HELP, helpKey } from "./help";
import { all, type AppOffer, getPath, hasRange } from "./model";
import { Help, type NumberKind, NumberInput, toPercent } from "./ui";

// Detailed mode's field controls (docs/ui-design.md §3.3-3.6): numbers over a draft path, the "+ range"
// control, month/day, choice and date fields, and the row editor that opens beneath a row. Only
// detailed mode uses them, so they load with it (Detailed.tsx is a separate chunk).

/** The value a field shows: what's entered, else its default. */
export function shownValue<T>(o: AppOffer, path: string): T | null {
  const v = getPath(o.draft, path);
  return (v ?? (defaultFor(path)?.value as T | undefined) ?? null) as T | null;
}

const unitOf = (kind: NumberKind) => (kind === "percent" ? (x: number) => toPercent(x) : (x: number) => x);
const fromUnit = (kind: NumberKind) => (kind === "percent" ? (x: number) => x / 100 : (x: number) => x);

/** A plain number field over a draft path (percents are fractions in the draft). */
export function NumberField({ o, path, kind, label, unit, placeholder, k = helpKey(path), hint = k, blank, fallback }: {
  o: AppOffer; path: string; kind: NumberKind; label: string; unit?: string; placeholder?: string;
  /** Its help, when its path isn't its help key (health.outOfPocket.low is health.outOfPocket's). */ k?: string;
  /** The hint it points at, when its own isn't shown (a clawback's window: the clawback's). */ hint?: string;
  /** Said when it's blank: "Not counted". */ blank?: string;
  /** Its default's value when it depends on the offer (the vacation days it gives: the days you'd take), shown with its D. */
  fallback?: number | null;
}) {
  const api = useLedger();
  const v = shownValue<number>(o, path) ?? fallback ?? null;
  return (
    <span className="field">
      <NumberInput id={fieldId(o.letter, path)} kind={kind} label={`Offer ${o.letter} ${label}`} unit={unit} placeholder={placeholder}
        value={v === null ? null : unitOf(kind)(v)} help={k} describedBy={hintId(hint)} invalid={issuesAt(api, o.letter, path).length > 0}
        onChange={(x) => api.set(o, { [path]: x === null ? null : fromUnit(kind)(x) })} />
      <DefaultTick o={o} path={path} label={`the ${label}`} />
      {v === null && blank && <span className="sub not-counted">{blank}</span>}
    </span>
  );
}

/**
 * Whether an offer has a plan (401(k), health, ESPP): not entered (not counted), entered, or none (entered,
 * as none). Entering one starts it blank, at its defaults.
 */
export function PlanField<T>({ o, path, label, has, none, start }: {
  o: AppOffer; path: "retirement" | "health" | "espp"; label: string; /** "Has a 401(k)" */ has: string; /** "No 401(k)" */ none: string; start: () => T;
}) {
  const api = useLedger();
  const v = getPath(o.draft, path);
  const value = v === null ? "unset" : v === "none" ? "none" : "plan";
  return (
    <span className="field">
      <select id={fieldId(o.letter, path)} aria-label={`Offer ${o.letter} ${label}`} data-help={path} aria-describedby={hintId(path)} value={value}
        onChange={(e) => api.set(o, { [path]: e.target.value === "unset" ? null : e.target.value === "none" ? "none" : start() })}>
        <option value="unset">Not entered</option>
        <option value="plan">{has}</option>
        <option value="none">{none}</option>
      </select>
      {value === "unset" && <span className="sub not-counted">Not counted</span>}
    </span>
  );
}

/** The engine's warnings at a field (warningAt.ts): the remote-work rule under employer state, the limits under the HSA, perks and 401(k). */
export function Warnings({ o, path }: { o: AppOffer; path: string }) {
  const api = useLedger();
  const list = (api.warnings?.[o.letter] ?? []).filter((w) => WARNING_AT[w.code] === path);
  const seen = new Set<string>();
  const unique = list.filter((w) => { const key = w.code; if (seen.has(key)) return false; seen.add(key); return true; });
  if (!unique.length) return null;
  return (
    <div role="note">
      <ul className="field-warnings">
        {unique.map((w) => <li key={w.code}><span aria-hidden="true">⚠</span> {formatWarning(w)}</li>)}
      </ul>
    </div>
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
        <DefaultTick o={o} path={path} label={`the ${label}`} />
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
      <DefaultTick o={o} path={path} label={`the ${label}`} />
    </span>
  );
}

/** A choice among a few values (a select), showing its default with a D tickmark. */
export function ChoiceField<T extends string | boolean>({ o, path, label, options, alsoSet, hint }: {
  o: AppOffer; path: string; label: string; options: Array<[T, string]>; /** Fields a new choice resets (a bonus's amount goes with its basis). */
  alsoSet?: Record<string, unknown>; /** The hint it points at, when its own isn't shown. */ hint?: string;
}) {
  const api = useLedger();
  const v = shownValue<T>(o, path);
  const k = helpKey(path);
  return (
    <span className="field">
      <select id={fieldId(o.letter, path)} aria-label={`Offer ${o.letter} ${label}`} data-help={k} aria-describedby={hintId(hint ?? k)}
        value={String(v)} onChange={(e) => api.set(o, { [path]: options.find(([x]) => String(x) === e.target.value)![0], ...alsoSet })}>
        {options.map(([x, text]) => <option key={String(x)} value={String(x)}>{text}</option>)}
      </select>
      <DefaultTick o={o} path={path} label={`the ${label}`} />
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
      <DefaultTick o={o} path={path} label={`the ${label}`} />
    </span>
  );
}

/** A row editor's name in a sentence, as its editor is titled: "promotions", "401(k) match". */
export const EDITOR_NAMES: Record<string, string> = {
  "salary.promotions": "promotions", "bonus.amounts": "bonus by year", "equity.grants": "RSU grants", "equity.refreshers": "refreshers",
  cashAwards: "sign-on and other cash", "retirement.match": "401(k) match", "retirement.vesting.steps": "401(k) vesting steps",
  otherBenefits: "other benefits",
};

/**
 * What a row editor's button says to a screen reader: what it does, and whose editor ("Edit A's promotions"). On screen it's
 * "Edit" in the offer's column; without its column a screen reader would hear three "Edit" buttons alike.
 */
export const editorButtonName = (action: "Edit" | "Close" | "Add", o: AppOffer, row: string) => `${action} ${o.letter}'s ${EDITOR_NAMES[row] ?? row}`;

/** The button in a cell that opens its row's editor beneath the row. */
export function EditButton({ o, row, label }: { o: AppOffer; row: string; label: "Edit" }) {
  const api = useLedger();
  const open = api.editor?.row === row && api.editor.letter === o.letter;
  return (
    <button type="button" id={fieldId(o.letter, row)} className="link edit-button" aria-expanded={open} data-help={helpKey(row)}
      aria-label={editorButtonName(open ? "Close" : label, o, row)}
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
  const open = api.editor?.row === row ? api.editor.letter : null;
  const box = useRef<HTMLDivElement>(null);
  // Opening an editor moves focus to its first field, so the keyboard doesn't pass the other offers' cells first.
  // ("Edit it" then focuses the field it named: the app's effect runs after this one.)
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>("input, select, textarea") ?? box.current?.querySelector<HTMLElement>(".add-row");
    if (open) first?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  const o = api.offers.find((x) => x.letter === open);
  if (!o) return null;
  return (
    <div ref={box} className={`row-editor offer-${o.letter}`} id={`editor-${row.replace(/\./g, "-")}`} role="group" aria-label={`Offer ${o.letter}: ${title}`}>
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

/** A column heading inside an editor, with its own hint and help, and "Reset to the default" for the rows that changed it. */
export function EditorHead({ k, o, rows = [] }: { k: string; o?: AppOffer; /** The column's fields, by row: [label, path]. */ rows?: Array<[string, string]> }) {
  const h = HELP[k];
  return (
    <div className="editor-col">
      <span className="editor-col-name">{h.label}</span>
      <Help hint={h.hint} hintId={hintId(k)} section={h.section} extra={o ? <ResetFields o={o} fields={rows} /> : null}>{h.help}</Help>
    </div>
  );
}

/** "Reset to the default (...)": for each field given that has a default and isn't at it. */
export function ResetFields({ o, fields }: { o: AppOffer; fields: Array<[string, string]> }) {
  const api = useLedger();
  const changed = fields.filter(([, path]) => defaultFor(path) && !isDefault(o.draft, path));
  if (!changed.length) return null;
  const d = defaultFor(changed[0][1])!;
  return (
    <p className="reset">
      Reset to the default ({d.shown(o.draft)}):{" "}
      {changed.map(([label, path], i) => (
        <span key={path}>{i ? " · " : ""}<button type="button" className="link" onClick={() => api.set(o, { [path.endsWith(".schedule") ? `${path}.tranches` : path]: null })}>
          {label}</button></span>
      ))}
    </p>
  );
}
