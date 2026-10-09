import { createContext, type MouseEvent, type ReactNode, type RefObject, useContext, useEffect, useLayoutEffect } from "react";
import { TICKS, type TickKind, tickWord } from "./ui";
import type { EditTarget, MetricId, WorkContext } from "./metrics";

// The figures and their tickmarks (docs/ui-design.md §8, §9.1): a figure is a button that opens its
// derivation; Trace lets one light up; arrow keys move between them. The popover that shows the work
// and the context's provider live in Tickmarks.tsx.
//
// The schedules that load on first use (L-2 on) import this, so it stays light: React and ui.tsx only.
// No react-dom, and nothing from metrics.ts at run time: a figure's tickmark kind comes from the
// provider (`kind`). Measured 2026-10-09: when a lazy chunk reached react-dom or metrics.ts through
// this module, Rolldown split React, the model and the help text out of the main chunk, for 1-2 kB more
// gzip on every visit. `npm run check-bundle` catches it.

/** What figures read from the page's WorkProvider (Tickmarks.tsx). */
export interface WorkApi {
  ctx: WorkContext;
  /** A figure's tickmark kind (metricKind with the page's context). */
  kind(id: MetricId): TickKind;
  /** The derivation on top of the drill-down stack. */
  openId: MetricId | null;
  traced: ReadonlySet<string>;
  toggle(id: MetricId, anchor: HTMLElement): void;
  push(id: MetricId): void;
  /** "Edit it": open the field's section (and row editor) and focus it. */
  edit(target: EditTarget): void;
}

export const Api = createContext<WorkApi | null>(null);

export const useApi = () => {
  const api = useContext(Api);
  if (!api) throw new Error("Figures need a WorkProvider.");
  return api;
};

const PHRASE: Record<TickKind, (label: string) => string> = {
  recomputed: (l) => `How ${l} was worked out`,
  footed: (l) => `How ${l} was totaled`,
  crossFooted: (l) => `Where else ${l} appears`,
  traced: (l) => `Where ${l} comes from`,
  default: (l) => `Why ${l} is the default`,
  estimate: (l) => `How ${l} was estimated`,
};

/** What a tickmark button does when pressed: open its derivation, or (in a popover) drill down to it. */
function useOpen(id: MetricId, drill: boolean) {
  const api = useApi();
  return (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (drill) api.push(id);
    else api.toggle(id, e.currentTarget);
  };
}

/**
 * A lone audit tickmark, for an input's default or estimate: a small mark in a button at least 24 x 24 px
 * (WCAG 2.5.8, which counts the button's own box). `drill` (inside a popover) opens it on top of the current
 * one, with a way back.
 */
export function TickButton({ id, label, drill = false }: { id: MetricId; label: string; drill?: boolean }) {
  const api = useApi();
  const kind = api.kind(id);
  const open = api.openId === id;
  return (
    <button type="button" className={`tick-btn tick-lone${open ? " is-open" : ""}`} data-tick={id}
      aria-label={`${PHRASE[kind](label)} (${tickWord(kind)})`} aria-haspopup="dialog" aria-expanded={drill ? undefined : open}
      onClick={useOpen(id, drill)}>
      <span className={`tick tick-${kind}`} aria-hidden="true">{TICKS[kind].mark}</span>
    </button>
  );
}

/**
 * A figure and its tickmark, as one button: the whole figure opens its derivation, so the ✓ doesn't
 * have to be found. It wears the wash while a derivation that uses it is open.
 */
export function Fig({ id, label, children, className = "", drill = false }: {
  id: MetricId; label: string; children: ReactNode; className?: string; drill?: boolean;
}) {
  const api = useApi();
  const kind = api.kind(id);
  const open = api.openId === id;
  const cls = `fig tick-btn${api.traced.has(id) ? " is-traced" : ""}${open ? " is-open" : ""} ${className}`.trim();
  return (
    <button type="button" className={cls} data-metric={id} data-tick={id}
      aria-label={`${PHRASE[kind](label)} (${tickWord(kind)})`} aria-haspopup="dialog" aria-expanded={drill ? undefined : open}
      onClick={useOpen(id, drill)}>
      <span className="fig-value">{children}</span><span className={`tick tick-${kind}`} aria-hidden="true">{TICKS[kind].mark}</span>
    </button>
  );
}

/** Marks an input (or anything else) as a figure derivations can light up, without a tickmark of its own. */
export function Trace({ id, children, className = "" }: { id: MetricId; children: ReactNode; className?: string }) {
  const api = useApi();
  return <div className={`trace${api.traced.has(id) ? " is-traced" : ""} ${className}`.trim()} data-trace={id}>{children}</div>;
}

/**
 * Within a schedule, arrow keys move between tickmarks and only one of them is a tab stop (a roving
 * tabindex), so a page full of figures isn't hundreds of tab stops (§9.1).
 */
export function useRovingTicks(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ticks = [...el.querySelectorAll<HTMLButtonElement>("button.tick-btn")];
    const active = ticks.find((t) => t.dataset.active === "1") ?? ticks[0];
    for (const t of ticks) t.tabIndex = t === active ? 0 : -1;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ticks = () => [...el.querySelectorAll<HTMLButtonElement>("button.tick-btn")];
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches?.("button.tick-btn")) return;
      for (const b of ticks()) {
        b.dataset.active = b === t ? "1" : "";
        b.tabIndex = b === t ? 0 : -1;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches?.("button.tick-btn")) return;
      const all = ticks();
      const i = all.indexOf(t as HTMLButtonElement);
      const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1
        : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : null;
      if (next === null) return;
      e.preventDefault();
      all[(next + all.length) % all.length]?.focus();
    };
    el.addEventListener("focusin", onFocus);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("focusin", onFocus);
      el.removeEventListener("keydown", onKey);
    };
  }, [ref]);
}
