import { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SECTIONS } from "./sections";
import { TICKS, type TickKind } from "./ui";
import { type Derivation, derive, type MetricId, metricKind, tickWord, type WorkContext } from "./metrics";

// Show the work (docs/ui-design.md §8, §9.1): every figure's tickmark is a button that opens its
// derivation in a popover. While it's open, the figures it uses wear the highlighter wash wherever
// they are on the page, and its own tickmarks drill down. Escape closes it and returns focus.

interface WorkApi {
  ctx: WorkContext;
  /** The derivation on top of the drill-down stack. */
  openId: MetricId | null;
  traced: ReadonlySet<string>;
  toggle(id: MetricId, anchor: HTMLElement): void;
  push(id: MetricId): void;
}

const Api = createContext<WorkApi | null>(null);

export function WorkProvider({ ctx, children }: { ctx: WorkContext; children: ReactNode }) {
  const [stack, setStack] = useState<MetricId[]>([]);
  const anchor = useRef<HTMLElement | null>(null);
  const openId = stack.length ? stack[stack.length - 1] : null;

  let derivation: Derivation | null = null;
  let problem: string | null = null;
  if (openId) {
    try {
      derivation = derive(openId, ctx);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }
  const tracedKey = derivation ? [openId, ...derivation.uses, ...derivation.ties.map((t) => t.id)].join("|") : openId ?? "";
  const traced = useMemo(() => new Set(tracedKey ? tracedKey.split("|") : []), [tracedKey]);

  const close = useCallback((refocus: boolean) => {
    setStack([]);
    if (refocus) anchor.current?.focus();
  }, []);
  const toggle = useCallback((id: MetricId, el: HTMLElement) => {
    setStack((s) => (s.length === 1 && s[0] === id ? [] : [id]));
    anchor.current = el;
  }, []);
  const push = useCallback((id: MetricId) => setStack((s) => (s[s.length - 1] === id ? s : [...s, id])), []);
  const api = useMemo<WorkApi>(() => ({ ctx, openId, traced, toggle, push }), [ctx, openId, traced, toggle, push]);

  return (
    <Api.Provider value={api}>
      {children}
      {openId && (
        <ShowTheWork id={openId} derivation={derivation} problem={problem} anchor={anchor} depth={stack.length}
          back={() => setStack((s) => s.slice(0, -1))} close={close} />
      )}
    </Api.Provider>
  );
}

const useApi = () => {
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

/**
 * An audit tickmark: a button that opens the figure's derivation. `drill` (inside a popover) opens it
 * on top of the current one, with a way back.
 */
export function TickButton({ id, label, drill = false }: { id: MetricId; label: string; drill?: boolean }) {
  const api = useApi();
  const kind = metricKind(id, api.ctx);
  const open = api.openId === id;
  return (
    <button type="button" className={`tick tick-btn tick-${kind}${open ? " is-open" : ""}`} data-tick={id}
      aria-label={`${PHRASE[kind](label)} (${tickWord(kind)})`} aria-haspopup="dialog" aria-expanded={drill ? undefined : open}
      onClick={(e) => {
        e.stopPropagation();
        if (drill) api.push(id);
        else api.toggle(id, e.currentTarget);
      }}>
      {TICKS[kind].mark}
    </button>
  );
}

/** A figure with its tickmark. It wears the wash while a derivation that uses it is open. */
export function Fig({ id, label, children, className = "" }: { id: MetricId; label: string; children: ReactNode; className?: string }) {
  const api = useApi();
  return (
    <span className={`fig${api.traced.has(id) ? " is-traced" : ""} ${className}`.trim()} data-metric={id}>
      {children}<TickButton id={id} label={label} />
    </span>
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

const GAP = 8;

function ShowTheWork({ id, derivation, problem, anchor, depth, back, close }: {
  id: MetricId; derivation: Derivation | null; problem: string | null; anchor: RefObject<HTMLElement | null>; depth: number;
  back: () => void; close: (refocus: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useRovingTicks(box);

  // A tickmark in the results opens beside them, over the inputs, so the figures it lights up stay in
  // view; anywhere else (or on a narrow screen) it opens under the tickmark, inside the side gutters.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const results = a.closest(".results")?.getBoundingClientRect();
      if (results && results.left - 2 * GAP - 16 >= 420) {
        const width = Math.min(560, results.left - 2 * GAP - 16);
        setPos({ top: Math.max(window.scrollY + 16, r.top + window.scrollY - 24), left: results.left + window.scrollX - width - 2 * GAP, width });
        return;
      }
      const width = Math.min(560, vw - 32);
      const left = Math.min(Math.max(16, r.left + window.scrollX - 40), window.scrollX + vw - width - 16);
      setPos({ top: r.bottom + window.scrollY + GAP, left, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, id]);

  // Focus moves into the dialog when it opens and with each drill-down, once it's placed (and visible).
  const placed = pos !== null;
  useEffect(() => {
    if (placed) heading.current?.focus({ preventScroll: true });
  }, [id, placed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t) || t.closest?.("button.tick-btn")) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [close]);

  const d = derivation;
  const style = pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: "hidden" as const };
  return createPortal(
    <div ref={box} className="work" role="dialog" aria-modal="false" aria-labelledby={titleId} style={style}>
      <div className="work-head">
        <h3 id={titleId} ref={heading} tabIndex={-1}>
          <span className="work-kicker">Show the work</span>
          <span className="work-title">{d ? d.title : "Show the work"}</span>
        </h3>
        <button type="button" className="work-close" onClick={() => close(true)} aria-label="Close">×</button>
      </div>
      {depth > 1 && <button type="button" className="link work-back" onClick={back}>← Back</button>}
      {d ? <Body d={d} close={close} /> : <p className="work-note">{problem}</p>}
    </div>,
    document.body,
  );
}

function Body({ d, close }: { d: Derivation; close: (refocus: boolean) => void }) {
  return (
    <>
      {d.scope && <p className="work-scope">{d.scope}</p>}
      <table className="work-lines">
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i} className={l.rule ? `rule-${l.rule}` : undefined}>
              <td className="work-op" aria-hidden={!l.op}>{l.op ?? ""}</td>
              <th scope="row" className="work-label">
                {l.label}{l.note && <span className="work-gloss"> {l.note}</span>}
              </th>
              <td className="work-value">
                {l.value}{l.value && (l.ref ? <TickButton id={l.ref} label={l.value} drill /> : <StaticTick kind="recomputed" />)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.notes.map((n) => <p key={n} className="work-note">{n}</p>)}
      {d.ties.length > 0 && (
        <p className="work-ties">
          <span className="tick">&lt;</span> Ties to {d.ties.map((t) => t.label).join(" and ")}, highlighted on the page.
        </p>
      )}
      {d.uses.length > 0 && <p className="work-ties">The figures it uses are highlighted on the page.</p>}
      <p className="work-foot">
        <span>Methodology {d.section} · {SECTIONS[d.section]}</span>
        {d.edit && (
          <button type="button" className="link" onClick={() => {
            close(false);
            const el = document.getElementById(d.edit!);
            el?.scrollIntoView({ block: "center" });
            el?.focus();
          }}>Edit it</button>
        )}
      </p>
    </>
  );
}

/** A tickmark with nothing further to open: the arithmetic is right there. */
function StaticTick({ kind }: { kind: TickKind }) {
  return <span className={`tick tick-${kind}`} aria-hidden="true">{TICKS[kind].mark}</span>;
}
