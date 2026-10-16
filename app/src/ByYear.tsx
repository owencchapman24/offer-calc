import { type Dispatch, type KeyboardEvent, type PointerEvent, useId, useRef, useState } from "react";
import type { Basis } from "../../src/offer/types";
import type { Letter } from "./model";
import { basisPhrase, type MetricId, pricesOf, type WorkContext } from "./metrics";
import { type Bridge as BridgeData, bridge, byYear, type ByYear as ByYearData, yearNotes } from "./byYearModel";
import type { Action, UiState } from "./session";
import { niceTicks, useChartWidth } from "./axes";
import { cents, dayBefore, dollars, figure, longDate } from "./text";
import { placeOf } from "./verdict";
import { CsvButton, Fig, useRovingTicks } from "./figures";
import { type Stale, staleClass, StaleNote, Stamp, TickLegend, usePrinting } from "./ui";

// L-1 · By year (docs/ui-design.md §4.3) and, beside it, the bridge from the offer letter (§5, W4). It loads as you scroll
// toward it (Later.tsx), so it imports figures.tsx, not Tickmarks.tsx: see figures.tsx for why.
// The chart is hand-built SVG: one axis, 2px lines, 8px markers with a 2px sheet ring, a solid
// hairline grid, a legend plus direct end labels, and a crosshair readout of every offer at a year.

/** A chart's units: after rent, in the dollars of the prices picked ("U.S.-avg $", "Charlotte $"). */
const unit = (basis: Basis, ctx: WorkContext): string => (basis === "colAdjustedTotal" ? `${pricesOf(ctx).unit}, as paid`
  : basis === "perHour" ? `${placeOf(ctx.results!.view, basis) ? pricesOf(ctx).unit : "$"} an hour, as paid` : "$, as paid");

/** A year's figure as its label says it, with its dollars (condition 1) and, per hour, its period: "U.S.-avg $62,594", "$21.85 an hour in year 2". */
const said = (ctx: WorkContext, basis: Basis, v: number, n?: number) =>
  `${placeOf(ctx.results!.view, basis)} ${basis === "perHour" ? `${cents(v)} an hour${n ? ` in year ${n}` : " over your stay"}` : dollars(v)}`.trim();

const short = (x: number, perHour: boolean) =>
  perHour ? `$${Math.round(x)}` : x >= 1_000_000 ? `${+(x / 1e6).toFixed(1)}M` : x >= 1000 ? `${Math.round(x / 1000)}k` : `${Math.round(x)}`;

export interface ByYearProps {
  ctx: WorkContext; ui: UiState; sample: boolean; dispatch: Dispatch<Action>; /** Its figures are from earlier inputs. */ status?: Stale;
}

export function ByYear({ ctx, ui, sample, dispatch, status = null }: ByYearProps) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const printing = usePrinting();
  const r = ctx.results;
  if (!r?.detail || r.detail.years !== r.view.row.years) return null;
  const mode = ui.byYear?.mode ?? "each";
  // In print, every table in full: the table view opens.
  const table = (ui.byYear?.table ?? false) || printing;
  const basis = r.view.basis;
  const offers = r.letters.map((l) => byYear(ctx, l));
  const title = `${basisPhrase(pricesOf(ctx))[basis][0].toUpperCase() + basisPhrase(pricesOf(ctx))[basis].slice(1)}, each employment year`;
  const setView = (patch: Partial<NonNullable<UiState["byYear"]>>) => dispatch({ type: "ui", patch: { byYear: { mode, table, ...patch } } });
  return (
    <section ref={ref} className={`schedule by-year${staleClass(status)}`} aria-labelledby="l1-title" aria-busy={status === "updating"}>
      <header className="schedule-head">
        <h2 id="l1-title" tabIndex={-1}><span className="ref">L-1</span> By year</h2>
        {sample && <Stamp>Illustrative samples</Stamp>}
        <StaleNote status={status} />
      </header>
      <div className="by-year-grid">
        <div className="by-year-chart">
          <div className="chart-bar">
            <p className="chart-title">{title}</p>
            <div className="segmented" role="group" aria-label="Chart shows">
              <button type="button" className={mode === "each" ? "is-on" : ""} aria-pressed={mode === "each"} onClick={() => setView({ mode: "each" })}>Each year</button>
              <button type="button" className={mode === "running" ? "is-on" : ""} aria-pressed={mode === "running"} disabled={basis === "perHour"}
                title={basis === "perHour" ? "Per hour doesn't add up across years" : undefined} onClick={() => setView({ mode: "running" })}>Running total</button>
            </div>
          </div>
          <Chart offers={offers} basis={basis} units={unit(basis, ctx)} running={mode === "running" && basis !== "perHour"} title={title}
            say={(v, n) => said(ctx, basis, v, n)} />
          <Notes ctx={ctx} />
          <p className="caption">
            Each year is in that year's dollars, as paid; the verdict discounts them to today.{sample ? " (Sample inputs.)" : ""}{" "}
            <span className="no-print">
              <button type="button" className="link" aria-expanded={table} aria-controls="l1-table" onClick={() => setView({ table: !table })}>
                {table ? "Hide the table view" : "Table view"}
              </button>
              {table && <>{" · "}<CsvButton table={{ kind: "l1", running: mode === "running" && basis !== "perHour" }} name="L-1, by year" /></>}
            </span>
          </p>
          {table && <YearTable offers={offers} basis={basis} units={unit(basis, ctx)} running={mode === "running" && basis !== "perHour"} years={r.view.row.years}
            say={(v, n) => said(ctx, basis, v, n)} perHour={(l) => r.view.row.values.perHour?.[r.letters.indexOf(l)] ?? 0} />}
          {table && (
            <p className="caption">Each year ties to L-6, The work, below: every line of it, every payment behind it, and your stay's present value as
              in the rank list.</p>
          )}
        </div>
        <Bridge ctx={ctx} ui={ui} dispatch={dispatch} />
      </div>
      <TickLegend />
    </section>
  );
}

// ---- the chart --------------------------------------------------------------------------------

const H = 240;
const M = { top: 14, right: 132, bottom: 30, left: 52 };

function Chart({ offers, basis, units, running, title, say }: {
  offers: ByYearData[]; basis: Basis; units: string; running: boolean; title: string; /** A figure as its label says it. */ say: (v: number, n?: number) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const width = useChartWidth(box, 640);
  const [hover, setHover] = useState<number | null>(null);

  const perHour = basis === "perHour";
  const series = offers.map((o) => {
    let acc = 0;
    return { letter: o.letter, points: o.years.map((y) => ({ n: y.n, value: running ? (acc += y.value) : y.value })) };
  });
  const n = Math.max(1, ...series.map((s) => s.points.length));
  const max = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = width - M.left - M.right;
  const x = (year: number) => M.left + (n === 1 ? plotW / 2 : ((year - 1) / (n - 1)) * plotW);
  const y = (v: number) => M.top + H - (v / top) * H;

  // End labels at each line's last point; where two would overlap they're pushed apart, with a leader.
  const ends = series.filter((s) => s.points.length).map((s) => {
    const last = s.points[s.points.length - 1];
    return { letter: s.letter, n: last.n, value: last.value, py: y(last.value), ly: y(last.value) };
  }).sort((a, b) => a.py - b.py);
  for (let i = 1; i < ends.length; i++) ends[i].ly = Math.max(ends[i].ly, ends[i - 1].ly + 22);
  const overflow = ends.length ? ends[ends.length - 1].ly - (M.top + H + 6) : 0;
  if (overflow > 0) for (const e of ends) e.ly -= overflow;

  const pick = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    const year = n === 1 ? 1 : Math.round(((px - M.left) / plotW) * (n - 1)) + 1;
    setHover(Math.min(n, Math.max(1, year)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (by) {
      e.preventDefault();
      setHover((h) => Math.min(n, Math.max(1, (h ?? (by > 0 ? 0 : n + 1)) + by)));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHover(e.key === "Home" ? 1 : n);
    } else if (e.key === "Escape") setHover(null);
  };
  const fmt = (v: number) => (perHour ? cents(v) : figure(v));
  // What a screen reader says as the year moves: the slider's value, so it speaks only when you move it.
  const year = hover ?? 1;
  const readout = `Year ${year}${running ? ", running total" : ""}: ${series.flatMap((s) => {
    const p = s.points.find((q) => q.n === year);
    return p ? [`${s.letter} ${fmt(p.value)}`] : [];
  }).join(", ")}`;
  const id = (letter: Letter, year: number): MetricId => (running ? `run.${letter}.${year}` : `ey.${letter}.${year}`);

  return (
    <div className="chart" ref={box}>
      <ul className="chart-legend" aria-label="Offers">
        {series.map((s) => <li key={s.letter} className={`offer-${s.letter}`}><span className="line-key" aria-hidden="true" />{s.letter}</li>)}
        <li className="chart-unit">{running ? units.replace("as paid", "running total, as paid") : units}</li>
      </ul>
      <div className="chart-plot" style={{ height: M.top + H + M.bottom }}>
        <svg width={width} height={M.top + H + M.bottom} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
              <text className="axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{short(t, perHour)}</text>
            </g>
          ))}
          {Array.from({ length: n }, (_, i) => i + 1).map((yr) => (
            <text key={yr} className="axis" x={x(yr)} y={M.top + H + 20} textAnchor="middle">Yr {yr}</text>
          ))}
          {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + H} />}
          {series.map((s) => (
            <g key={s.letter} className={`series offer-${s.letter}`}>
              <polyline className="series-line" points={s.points.map((p) => `${x(p.n)},${y(p.value)}`).join(" ")} />
              {s.points.map((p) => <circle key={p.n} className="series-dot" cx={x(p.n)} cy={y(p.value)} r={hover === p.n ? 5.5 : 4} />)}
            </g>
          ))}
          {ends.map((e) => Math.abs(e.ly - e.py) > 1 && (
            <line key={e.letter} className="leader" x1={x(e.n) + 6} y1={e.py} x2={x(e.n) + 14} y2={e.ly} />
          ))}
        </svg>
        {/* The plot reads out every offer at a year: by pointer, or by arrow keys once focused (a slider over the years). */}
        <div className="chart-hit" tabIndex={0} role="slider" aria-label={title} aria-valuemin={1} aria-valuemax={n} aria-valuenow={year}
          aria-valuetext={readout} aria-describedby={hintId}
          style={{ left: M.left - 12, width: plotW + 24, top: M.top, height: H }}
          onPointerMove={(e: PointerEvent<HTMLDivElement>) => pick(e.clientX)} onPointerLeave={() => setHover(null)}
          onKeyDown={onKey} onFocus={() => setHover((h) => h ?? 1)} onBlur={() => setHover(null)} />
        <span id={hintId} className="sr-only">Arrow keys move a year. The table view lists every value.</span>
        {ends.map((e) => (
          <span key={e.letter} className={`end-label offer-${e.letter}`} style={{ left: x(e.n) + 16, top: e.ly - 11 }}>
            <span className="end-letter">{e.letter}</span>{" "}
            <Fig id={id(e.letter, e.n)} label={`${e.letter}, year ${e.n}, ${say(e.value, e.n)}`}>{fmt(e.value)}</Fig>
          </span>
        ))}
        {hover !== null && (
          // What the slider's value says, drawn: hidden from screen readers, which hear the value instead.
          <div className="chart-tip" aria-hidden="true" style={{ left: Math.min(x(hover) + 12, width - 190), top: M.top }}>
            <p className="tip-head">Year {hover}{running ? ", running total" : ""}</p>
            {series.map((s) => {
              const p = s.points.find((q) => q.n === hover);
              return p && (
                <p key={s.letter} className={`tip-row offer-${s.letter}`}>
                  <span className="line-key" aria-hidden="true" /><strong>{fmt(p.value)}</strong> <span className="tip-who">{s.letter}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Muted notes on what bends the lines: a promotion, the new-hire RSUs finishing. */
function Notes({ ctx }: { ctx: WorkContext }) {
  const notes = yearNotes(ctx).map((x) => `Yr ${x.n} · ${x.letter}: ${x.text}`);
  if (!notes.length) return null;
  return <ul className="chart-notes">{notes.sort().map((n) => <li key={n}>{n}</li>)}</ul>;
}

// ---- the table view -----------------------------------------------------------------------------

function YearTable({ offers, basis, units, running, years, say, perHour: rate }: {
  offers: ByYearData[]; basis: Basis; units: string; running: boolean; years: number;
  /** A figure as its label says it (`said`); each offer's per hour over your stay. */ say: (v: number, n?: number) => string; perHour: (l: Letter) => number;
}) {
  const perHour = basis === "perHour";
  const fmt = (v: number) => (perHour ? cents(v) : figure(v));
  return (
    <table className="year-table" id="l1-table">
      <caption className="sr-only">Each offer by employment year, {units}</caption>
      <thead>
        <tr><th scope="col">Year</th>{offers.map((o) => <th key={o.letter} scope="col" className={`offer-${o.letter}`}><span className="who">{o.letter}</span></th>)}</tr>
      </thead>
      <tbody>
        {Array.from({ length: years }, (_, i) => i + 1).map((n) => (
          <tr key={n}>
            <th scope="row">Year {n}</th>
            {offers.map((o) => {
              const k = o.years.findIndex((y) => y.n === n);
              if (k < 0) return <td key={o.letter}>—</td>;
              const v = running ? o.years.slice(0, k + 1).reduce((s, y) => s + y.value, 0) : o.years[k].value;
              return <td key={o.letter}><Fig id={running ? `run.${o.letter}.${n}` : `ey.${o.letter}.${n}`} label={`${o.letter}, year ${n}, ${say(v, n)}`}>{fmt(v)}</Fig></td>;
            })}
          </tr>
        ))}
      </tbody>
      <tfoot>
        {perHour ? (
          <tr className="rule-double">
            <th scope="row">Your stay</th>
            {offers.map((o) => <td key={o.letter}><Fig id={`ph.${o.letter}`} label={`${o.letter}'s per hour, ${say(rate(o.letter))} worked`}>per hour</Fig></td>)}
          </tr>
        ) : (
          <tr className="rule-double">
            <th scope="row">Your stay, as paid</th>
            {offers.map((o) => <td key={o.letter}><Fig id={`eysum.${o.letter}`} label={`${o.letter}'s stay as paid, ${say(o.window ?? 0)}`}>{figure(o.window ?? 0)}</Fig></td>)}
          </tr>
        )}
      </tfoot>
    </table>
  );
}

// ---- the bridge ---------------------------------------------------------------------------------

function Bridge({ ctx, ui, dispatch }: { ctx: WorkContext; ui: UiState; dispatch: Dispatch<Action> }) {
  const r = ctx.results!;
  const letter = ui.bridge && r.letters.includes(ui.bridge.letter) ? ui.bridge.letter : r.letters[0];
  const n = Math.min(ui.bridge?.year ?? 1, r.view.row.years);
  let b: BridgeData;
  try {
    b = bridge(ctx, letter, n);
  } catch {
    return null;
  }
  const offer = ctx.offers.find((o) => o.letter === letter);
  const set = (patch: Partial<{ letter: Letter; year: number }>) => dispatch({ type: "ui", patch: { bridge: { letter, year: n, ...patch } } });
  const money = (v: number) => (v < 0 ? `(${figure(-v)})` : figure(v));
  // A line's label says its dollars: after rent, the prices picked; the price line, the prices it steps across; the rest, "$".
  const place = pricesOf(ctx).unit.slice(0, -2);
  const say = (line: string, v: number) => (line === "total" ? `${place} ${dollars(v)}` : line === "prices" ? figure(Math.abs(v)) : dollars(Math.abs(v)));
  return (
    <div className="bridge" id="bridge">
      <div className="chart-bar">
        <h3 className="chart-title" id="bridge-title" tabIndex={-1}>From the offer letter</h3>
        <div className="bridge-pick">
          <div className="segmented" role="group" aria-label="Offer">
            {r.letters.map((l) => (
              <button key={l} type="button" className={l === letter ? "is-on" : ""} aria-pressed={l === letter} onClick={() => set({ letter: l })}>{l}</button>
            ))}
          </div>
          <select aria-label="Employment year" value={n} onChange={(e) => set({ year: Number(e.target.value) })}>
            {Array.from({ length: r.view.row.years }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
      </div>
      <p className="bridge-scope">
        <strong className={`who offer-${letter}`}>{letter}</strong>{offer?.draft.label ? ` · ${offer.draft.label}` : ""} · year {n} ({longDate(b.start)} – {longDate(dayBefore(b.end))})
      </p>
      <table className="bridge-table">
        <tbody>
          {b.rows.map((row) => {
            const lead = row.kind === "less" || row.kind === "plus" || row.kind === "change" ? (row.value < 0 ? "less" : "plus") : "";
            return (
              <tr key={row.id} className={`bridge-${row.kind}${row.kind === "subtotal" ? " rule-single" : row.kind === "total" ? " rule-double" : ""}`}>
                <th scope="row">
                  {lead && <span className="bridge-lead">{lead}</span>}{row.label}
                  {row.gloss && <span className="bridge-gloss">{row.gloss}</span>}
                </th>
                <td className="bridge-value">
                  <Fig id={row.id} label={`${lead ? `${lead} ` : ""}${row.label}, ${say(row.line, row.value)}`}>{money(row.value)}</Fig>
                  {row.kind === "total" && <span className="tie" aria-hidden="true">&lt;</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {b.spend !== undefined && b.saved !== undefined && (
        <p className="bridge-month">
          = <Fig id={`br.${letter}.${n}.spend`} label={`${place} ${dollars(b.spend)} a month to spend after rent, in year ${n}`}>{place} {dollars(b.spend)}</Fig> a
          month to spend after rent + <Fig id={`br.${letter}.${n}.saved`} label={`${place} ${dollars(b.saved)} a month saved, in year ${n}`}>{place}{" "}
            {dollars(b.saved)}</Fig> a month saved, in year {n}
        </p>
      )}
      <p className="caption">
        {b.rows.some((x) => x.line === "total")
          ? `Each subtotal is footed (^), and the total ties (<) to ${letter}'s year ${n} in the chart on the after-rent basis.`
          : "Each subtotal is footed (^). Add a city to carry the bridge through rent and prices."}
      </p>
    </div>
  );
}
