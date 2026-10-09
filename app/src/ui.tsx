import { type ReactNode, useId, useState } from "react";
import { figure, parseMoney, parseNumber, parsePercent } from "./text";

// Small building blocks shared by the schedules.

export type TickKind = "recomputed" | "footed" | "crossFooted" | "traced" | "default" | "estimate";

export const TICKS: Record<TickKind, { mark: string; name: string }> = {
  recomputed: { mark: "✓", name: "Recomputed" },
  footed: { mark: "^", name: "Footed" },
  crossFooted: { mark: "<", name: "Cross-footed" },
  traced: { mark: "T", name: "Traced" },
  default: { mark: "D", name: "Default" },
  estimate: { mark: "E", name: "Estimate" },
};
/** A tickmark's name inside a sentence: "cross-footed". */
export const tickWord = (k: TickKind) => (k === "crossFooted" ? "cross-footed" : TICKS[k].name.toLowerCase());

/** A tickmark that opens nothing: for the legend. Figures use Fig and TickButton (figures.tsx), which open their derivation. */
export function Tick({ kind, note }: { kind: TickKind; note?: string }) {
  const t = TICKS[kind];
  return <span className={`tick tick-${kind}`} title={note ? `${t.name}: ${note}` : t.name} aria-hidden="true">{t.mark}</span>;
}

export function TickLegend() {
  return (
    <p className="legend">
      <a className="legend-title" href="#/method/M-13">Tickmarks</a>
      {(Object.keys(TICKS) as TickKind[]).map((k) => (
        <span key={k} className="legend-item"><span className="tick">{TICKS[k].mark}</span> {TICKS[k].name.toLowerCase()}</span>
      ))}
    </p>
  );
}

export function Stamp({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "muted" }) {
  return <span className={`stamp stamp-${tone}`}>{children}</span>;
}

/**
 * An input's help (docs/ui-design.md §3.5): the hint, always visible; the ⓘ toggle, which expands the
 * longer help inline (not a hover tooltip); and "How this is used →", a link to the methodology.
 * `hintId` lets the inputs point at the hint with aria-describedby.
 */
export function Help({ hint, hintId, section, extra, children }: {
  hint: string; hintId?: string; section?: string; /** After the help: "Reset to default". */ extra?: ReactNode; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="help">
      <span className="hint" id={hintId}>{hint}</span>
      <button type="button" className="help-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        aria-label={open ? "Hide help" : "More help"} title={open ? "Hide help" : "More help"}>ⓘ</button>
      {open && (
        <div id={id} className="help-body">
          <p>{children}</p>
          {extra}
          {section && <p><a href={`#/method/${section}`}>How this is used →</a></p>}
        </div>
      )}
    </div>
  );
}

/** What a number field accepts and shows: dollars ("110k"), a percent ("12.5", "-3") or a plain number. */
export type NumberKind = "money" | "percent" | "number";

const PARSE: Record<NumberKind, (t: string) => number | null> = { money: parseMoney, percent: parsePercent, number: parseNumber };
const INVALID: Record<NumberKind, string> = {
  money: "Enter an amount like 110000 or 110k.", percent: "Enter a percent like 10.", number: "Enter a number like 12.",
};

/**
 * A number field: accepts what people type ("110k", "$110,000", "12.5%") while typing, and shows the
 * value formatted otherwise. Blank is null. `help` names its help entry (help.ts); `describedBy` ties
 * the hint to it; `invalid` marks a problem the validator found.
 */
export function NumberInput({ id, kind, value, onChange, label, placeholder, unit, describedBy, help, invalid, invalidNote }: {
  id?: string; kind: NumberKind; value: number | null; onChange: (v: number | null) => void; label: string; placeholder?: string;
  /** Shown after the field ("%", "hrs"); money shows "$" before it. */ unit?: string; describedBy?: string; help?: string;
  invalid?: boolean; invalidNote?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const format = (v: number) => (kind === "money" ? figure(v) : String(v));
  const shown = draft ?? (value === null ? "" : format(value));
  const parsed = draft === null ? value : PARSE[kind](draft);
  const unparsable = parsed !== null && Number.isNaN(parsed);
  const after = kind === "percent" ? unit ?? "%" : unit;
  return (
    <span className={`money num-${kind}`}>
      {kind === "money" && <span className="unit" aria-hidden="true">$</span>}
      <input id={id} aria-label={label} inputMode="decimal" value={shown} placeholder={placeholder} data-help={help}
        aria-invalid={unparsable || invalid || undefined} aria-describedby={describedBy}
        onFocus={() => setDraft(shown)} /* keep the text as shown, so a select-all-and-type replaces it cleanly */
        onChange={(e) => {
          setDraft(e.target.value);
          const v = PARSE[kind](e.target.value);
          if (v === null || !Number.isNaN(v)) onChange(v);
        }}
        onBlur={() => setDraft(null)} />
      {after && <span className="unit" aria-hidden="true">{after}</span>}
      {unparsable && <span className="field-error" role="alert">{invalidNote ?? INVALID[kind]}</span>}
    </span>
  );
}

/** A money field: accepts "110k", "110,000" or "$110000" while typing; shows "110,000" otherwise. Blank is null. */
export function MoneyInput(props: Omit<Parameters<typeof NumberInput>[0], "kind">) {
  return <NumberInput {...props} kind="money" />;
}

/** A fraction as the percent a field shows: 0.07 -> 7 (not 7.000000000000001). */
export const toPercent = (f: number) => +(f * 100).toFixed(8);

/** A percent field over a value in percent units (10 = 10%). */
export function PercentInput(props: Omit<Parameters<typeof NumberInput>[0], "kind">) {
  return <NumberInput {...props} kind="percent" />;
}

/** Why a schedule's figures aren't for the current inputs: being worked out, or the inputs have a problem. */
export type Stale = "updating" | "invalid" | null;

/** A schedule's note while its figures are from earlier inputs (the schedule dims them meanwhile). */
export function StaleNote({ status }: { status: Stale }) {
  return <span className="updating" aria-hidden={!status}>{status === "updating" ? "Updating…" : status === "invalid" ? "Last valid results" : ""}</span>;
}
