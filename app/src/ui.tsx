import { type ReactNode, useId, useState } from "react";
import { figure, parseMoney, parsePercent } from "./text";

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

/** A tickmark that opens nothing: for the legend. Figures use TickButton (Work.tsx), which opens their derivation. */
export function Tick({ kind, note }: { kind: TickKind; note?: string }) {
  const t = TICKS[kind];
  return <span className={`tick tick-${kind}`} title={note ? `${t.name}: ${note}` : t.name} aria-hidden="true">{t.mark}</span>;
}

export function TickLegend() {
  return (
    <p className="legend">
      <span className="legend-title">Tickmarks</span>
      {(Object.keys(TICKS) as TickKind[]).map((k) => (
        <span key={k} className="legend-item"><span className="tick">{TICKS[k].mark}</span> {TICKS[k].name.toLowerCase()}</span>
      ))}
    </p>
  );
}

export function Stamp({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "muted" }) {
  return <span className={`stamp stamp-${tone}`}>{children}</span>;
}

/** The ⓘ toggle: expands longer help inline (not a hover tooltip). */
export function Help({ hint, children }: { hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="help">
      <span className="hint">{hint}</span>
      <button type="button" className="help-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        title={open ? "Hide help" : "More help"}>ⓘ</button>
      {open && <div id={id} className="help-body">{children}</div>}
    </div>
  );
}

/**
 * A money field: accepts "110k", "110,000" or "$110000" while typing; shows "110,000" otherwise.
 * Blank is null. `placeholder` shows an estimate when the field is blank.
 */
export function MoneyInput({ id, value, onChange, label, placeholder, invalidNote = "Enter an amount like 110000 or 110k." }: {
  id?: string; value: number | null; onChange: (v: number | null) => void; label: string; placeholder?: string; invalidNote?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : figure(value));
  const parsed = draft === null ? value : parseMoney(draft);
  const invalid = parsed !== null && Number.isNaN(parsed);
  return (
    <span className="money">
      <span className="unit" aria-hidden="true">$</span>
      <input id={id} aria-label={label} inputMode="decimal" value={shown} placeholder={placeholder} aria-invalid={invalid || undefined}
        onFocus={() => setDraft(shown)} /* keep the text as shown, so a select-all-and-type replaces it cleanly */
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parseMoney(e.target.value);
          if (v === null || !Number.isNaN(v)) onChange(v);
        }}
        onBlur={() => setDraft(null)} />
      {invalid && <span className="field-error" role="alert">{invalidNote}</span>}
    </span>
  );
}

export function PercentInput({ id, value, onChange, label }: { id?: string; value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : String(value));
  const parsed = draft === null ? value : parsePercent(draft);
  const invalid = parsed !== null && Number.isNaN(parsed);
  return (
    <span className="money">
      <input id={id} aria-label={label} inputMode="decimal" value={shown} placeholder="0" aria-invalid={invalid || undefined}
        onFocus={() => setDraft(shown)}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parsePercent(e.target.value);
          if (v === null || !Number.isNaN(v)) onChange(v);
        }}
        onBlur={() => setDraft(null)} />
      <span className="unit" aria-hidden="true">%</span>
      {invalid && <span className="field-error" role="alert">Enter a percent like 10.</span>}
    </span>
  );
}
