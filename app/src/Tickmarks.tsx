import { type ReactNode, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Api, Fig, useApi, useRovingTicks, type WorkApi } from "./figures";
import { sectionTitle } from "./sections";
import { TICKS, type TickKind } from "./ui";
import { lazyModule, useLazyModule } from "./lazy";
import { type Derivation, type EditTarget, type MetricId, metricKind, pricesOf, type WorkContext } from "./metrics";

// The figures themselves (Fig, TickButton, Trace, the roving tabindex) are in figures.tsx.
export { Fig, TickButton, Trace, useRovingTicks } from "./figures";

/** The derivations (derive.ts): loaded the first time a tickmark is hovered, focused or opened. */
export const derivations = lazyModule(() => import("./derive"));

// Show the work (docs/ui-design.md §8, §9.1): every figure's tickmark is a button that opens its
// derivation in a popover. While it's open, the figures it uses wear the highlighter wash wherever
// they are on the page, and its own tickmarks drill down. Escape closes it and returns focus.

export function WorkProvider({ ctx, children, onOpen, onEdit }: {
  ctx: WorkContext; children: ReactNode; /** Called when a derivation opens. */ onOpen?: () => void;
  /** Shows and focuses an input: the app opens its section first. */ onEdit?: (target: EditTarget) => void;
}) {
  const [stack, setStack] = useState<MetricId[]>([]);
  const anchor = useRef<HTMLElement | null>(null);
  const openId = stack.length ? stack[stack.length - 1] : null;
  const work = useLazyModule(derivations);

  // A tickmark hovered or focused is about to be opened: load the derivations then, not on page load.
  useEffect(() => {
    if (work) return;
    const intent = (e: Event) => { if ((e.target as Element).closest?.(".tick-btn")) void derivations.load(); };
    document.addEventListener("pointerover", intent);
    document.addEventListener("focusin", intent);
    return () => {
      document.removeEventListener("pointerover", intent);
      document.removeEventListener("focusin", intent);
    };
  }, [work]);
  useEffect(() => { if (openId && !work) void derivations.load(); }, [openId, work]);

  let derivation: Derivation | null = null;
  let problem: string | null = null;
  if (openId && work) {
    try {
      derivation = work.derive(openId, ctx);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  } else if (openId) problem = "Working it out…";
  const tracedKey = derivation ? [openId, ...derivation.uses, ...derivation.ties].join("|") : openId ?? "";
  const traced = useMemo(() => new Set(tracedKey ? tracedKey.split("|") : []), [tracedKey]);

  const close = useCallback((refocus: boolean) => {
    setStack([]);
    if (refocus) anchor.current?.focus();
  }, []);
  const opened = useRef(onOpen);
  useEffect(() => { opened.current = onOpen; });
  const toggle = useCallback((id: MetricId, el: HTMLElement) => {
    setStack((s) => (s.length === 1 && s[0] === id ? [] : [id]));
    anchor.current = el;
    opened.current?.();
  }, []);
  const push = useCallback((id: MetricId) => setStack((s) => (s[s.length - 1] === id ? s : [...s, id])), []);
  const editRef = useRef(onEdit);
  useEffect(() => { editRef.current = onEdit; });
  const edit = useCallback((target: EditTarget) => editRef.current?.(target), []);
  // The context is new with every edit, but the figures' API isn't: it reads the latest context through a ref, so a schedule
  // that skips rendering until its own data changes (L-6's tables, memoized) doesn't re-render all its figures on each key.
  // Every other figure re-renders with its schedule, which takes the context as a prop.
  const latest = useRef(ctx);
  latest.current = ctx;
  const kind = useCallback((id: MetricId) => metricKind(id, latest.current), []);
  const api = useMemo<WorkApi>(() => ({ get ctx() { return latest.current; }, kind, openId, traced, toggle, push, edit }),
    [kind, openId, traced, toggle, push, edit]);

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

/** A figure is named in "the highlighted figures" only if it's on the page to light up. */
const onPage = (id: MetricId) => {
  // A plain string: querySelector's overloads would otherwise type the selector as a template over every
  // pair of metric ids, which TypeScript can't check in reasonable time.
  const s: string = id;
  return typeof document !== "undefined" && !!document.querySelector(`[data-metric="${s}"], [data-trace="${s}"]`);
};

function Body({ d, close }: { d: Derivation; close: (refocus: boolean) => void }) {
  const { ctx, edit } = useApi();
  const highlightedSentence = derivations.get()!.highlightedSentence;
  // Only figures on the page are named: with none there, no line (and no stray tie mark).
  const sentence = highlightedSentence(d, ctx, onPage);
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
                {l.value && (l.ref
                  ? <Fig id={l.ref} label={`${l.label}, ${l.value}`} drill>{l.value}</Fig>
                  : <>{l.value}<StaticTick kind={l.tick ?? (l.rule ? "footed" : "recomputed")} /></>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.inputs && d.inputs.length > 0 && (
        <div className="work-inputs">
          <p className="work-inputs-head">From your inputs:</p>
          <ul>
            {d.inputs.map((x) => (
              <li key={x.ref}>{x.label} <Fig id={x.ref} label={`${x.label}, ${x.value}`} drill>{x.value}</Fig></li>
            ))}
          </ul>
        </div>
      )}
      {d.notes.map((n) => <p key={n} className="work-note">{n}</p>)}
      {sentence && (
        <p className="work-ties">
          {d.ties.some(onPage) && <><span className="tick" aria-hidden="true">&lt;</span>{" "}</>}
          {sentence}
        </p>
      )}
      <p className="work-foot">
        <a href={`#/method/${d.section}`} onClick={() => close(false)}>Methodology {d.section} · {sectionTitle(d.section, pricesOf(ctx).place)}</a>
        {d.edit && (
          <button type="button" className="link" onClick={() => {
            close(false);
            edit(d.edit!);
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
