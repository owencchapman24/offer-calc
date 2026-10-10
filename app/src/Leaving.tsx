import { type KeyboardEvent, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ISODate } from "../../src/offer/types";
import { niceTicks } from "./axes";
import { Fig, useRovingTicks } from "./figures";
import {
  addDays, addMonthsIso, cliffsText, daysBetween, firstLastDay, type LeaveAxis, leaveAxis, type LeaveBasis, type LeaveLine, leaveLines,
  forfeits, forfeitText, leaveWarningTexts, MARKS, onAxis, reconcile, segmentText, sliderText, valueAt, worked,
} from "./leaveModel";
import { useOnScreen } from "./lazy";
import type { WorkContext } from "./metrics";
import type { Letter } from "./model";
import type { CompareRequest, LeaveCurve, LeavePanel } from "./protocol";
import { dayBefore, dollars, figure, longDate } from "./text";
import { type Stale, staleClass, StaleNote, Stamp, TickLegend } from "./ui";
import type { Engine, SlowJob, SlowState } from "./useEngine";

// L-4 · Leaving early (docs/ui-design.md §4.5): what you keep if your last day is any day, after tax
// and clawbacks, as paid. A stepped chart by calendar date (so offers with different start dates line up)
// with a last-day cursor, and a panel per offer: what you'd keep, repay and leave behind, the next real
// cliff and what staying until it is worth, the warnings that leaving that day sets off, and, on your
// stay's last day, how leaving then squares with the stay. Its numbers come from the worker's slow lane
// (slowJobs.ts): the curves when the inputs change, the panel when the last day moves.

export interface LeavingProps {
  ctx: WorkContext;
  sample: boolean;
  /** The comparison's request: the offers L-4 projects, in the comparison's order. */
  compare: CompareRequest | null;
  /** The comparison is current and valid: slow jobs can start. */
  ready: boolean;
  /** The comparison itself is from earlier inputs (being worked out, or they have a problem). */
  status?: Stale;
  leave: SlowState<LeaveCurve[]>;
  cursor: SlowState<Array<LeavePanel | null>>;
  requestSlow: Engine["requestSlow"];
  /** The last day picked (null: the first one, six months in). */
  at: ISODate | null;
  basis: LeaveBasis;
  onAt(date: ISODate): void;
  onBasis(basis: LeaveBasis): void;
}

const Who = ({ l }: { l: Letter }) => <strong className={`who offer-${l}`}>{l}</strong>;
const COUNTED: Record<LeaveBasis, string> = { cash: "after tax", totalRewards: "in total rewards" };

/** One month more or less of work: from a last day of start + 6 months - 1 day to start + 7 months - 1 day. */
const stepMonth = (axis: LeaveAxis, at: ISODate, by: number) => onAxis(axis, dayBefore(addMonthsIso(addDays(at, 1), by)));

export function Leaving(p: LeavingProps) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const onScreen = useOnScreen(ref);
  const r = p.ctx.results;
  const axis = r ? leaveAxis(r.view.row.window.start, r.view.row.years) : null;
  const at = axis ? onAxis(axis, p.at ?? firstLastDay(axis)) : null;
  const c = p.compare;
  const base = c ? { offers: c.offers, household: c.household, inflation: c.inflation } : null;
  const leaveJob: SlowJob | null = base && axis ? { lane: "leave", ...base, end: axis.end } : null;
  const cursorJob: SlowJob | null = base && at ? { lane: "cursor", ...base, leaveDate: at } : null;
  const leaveKey = leaveJob && JSON.stringify(leaveJob);
  const cursorKey = cursorJob && JSON.stringify(cursorJob);
  const { requestSlow, ready } = p;
  // The curves when the inputs change; the panel when the last day moves (a moment after it stops, while dragging).
  useEffect(() => {
    if (onScreen && ready && leaveJob) requestSlow(leaveJob, leaveKey!);
    // The job is compared by value (its key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScreen, ready, leaveKey, requestSlow]);
  useEffect(() => {
    if (!onScreen || !ready || !cursorJob) return;
    const t = setTimeout(() => requestSlow(cursorJob, cursorKey!), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScreen, ready, cursorKey, requestSlow]);

  if (!r || !axis || !at || !c) return <section ref={ref} className="later" />;
  const letters = r.letters;
  const curves = p.leave.result?.length === letters.length ? p.leave.result : null;
  const lines = curves ? leaveLines(curves, letters, p.basis) : null;
  const fresh = p.leave.key === leaveKey && !p.leave.updating && p.cursor.key === cursorKey && !p.cursor.updating;
  const notHere = r.view.basis === "colAdjustedTotal" || r.view.basis === "perHour";
  // What the slider says: the date and what each offer keeps, once the panel is worked out for that date (null until then).
  const panels = r.leave?.panels;
  const said = p.cursor.key === cursorKey && !p.cursor.updating && panels?.find((x) => x)?.leaveDate === at
    ? sliderText(at, letters, panels, p.basis) : null;
  // Stale while the comparison is, and while the slow lane works on the curves or the panel after it.
  // Nothing worked out yet (no curves, no panel): the notes say so, and there's nothing from earlier inputs to dim.
  const status: Stale = !lines && !r.leave?.panels ? null : p.status ?? (fresh ? null : "updating");
  return (
    <section ref={ref} className={`schedule leaving${staleClass(status)}`} aria-labelledby="l4-title" aria-busy={!fresh}
      data-ready={fresh ? "1" : "0"} data-fill-ms={p.leave.ms !== null ? Math.round(p.leave.ms) : undefined}>
      <header className="schedule-head">
        <h2 id="l4-title"><span className="ref">L-4</span> Leaving early</h2>
        {p.sample && <Stamp>Illustrative samples</Stamp>}
        <StaleNote status={status} />
      </header>
      <div className="chart-bar">
        <p className="chart-title">{p.basis === "cash" ? "After-tax pay kept" : "Total rewards kept"}, after clawbacks, by your last day</p>
        <div className="segmented" role="group" aria-label="Chart shows">
          {(["cash", "totalRewards"] as LeaveBasis[]).map((b) => (
            <button key={b} type="button" className={p.basis === b ? "is-on" : ""} aria-pressed={p.basis === b} onClick={() => p.onBasis(b)}>
              {b === "cash" ? "After tax" : "Total rewards"}
            </button>
          ))}
        </div>
      </div>
      {notHere && <p className="note">After rent isn't available here yet: L-4 counts after-tax pay or total rewards, as paid.</p>}
      <div className="leave-controls">
        <label htmlFor="leave-day">Last day</label>
        <input id="leave-day" type="date" value={at} min={axis.start} max={dayBefore(axis.end)} aria-describedby="leave-day-hint"
          onChange={(e) => { if (e.target.value) p.onAt(onAxis(axis, e.target.value)); }} />
        <span className="leave-steps">
          <button type="button" aria-label="A month earlier" onClick={() => p.onAt(stepMonth(axis, at, -1))}>◀</button>
          <button type="button" aria-label="A month later" onClick={() => p.onAt(stepMonth(axis, at, 1))}>▶</button>
        </span>
        <button type="button" className="link" onClick={() => p.onAt(axis.stayEnd)}>Your stay's last day ({longDate(axis.stayEnd)})</button>
        <span className="hint" id="leave-day-hint">Your last day of work. Drag along the chart, or step a month at a time.</span>
      </div>
      {lines ? <LeaveChart lines={lines} axis={axis} at={at} onAt={p.onAt} said={said} />
        : <p className="note leave-wait">{p.leave.error ?? "Working out every last day…"}</p>}
      <p className="leave-key" aria-hidden="true">
        {(Object.keys(MARKS) as Array<keyof typeof MARKS>).map((k) => <span key={k}><b>{MARKS[k].glyph}</b> {MARKS[k].name}</span>)}
        <span><b className="leave-key-stay" /> your stay ends</span>
      </p>
      <Panel ctx={p.ctx} axis={axis} at={at} basis={p.basis} compare={c} lines={lines} error={p.cursor.error} />
      <p className="caption">
        As paid, not discounted, so these don't match the verdict's present values. Leaving is a voluntary exit: layoffs, severance and waived
        clawbacks aren't modeled. <a href="#/method/M-9">Methodology M-9</a>.{p.sample ? " (Sample inputs.)" : ""}
      </p>
      <TickLegend />
    </section>
  );
}

// ---- the chart --------------------------------------------------------------------------------------

const H = 240;
const M = { top: 24, right: 24, bottom: 28, left: 56 };
const BAND = 18;

const short = (x: number) => (x >= 1_000_000 ? `${+(x / 1e6).toFixed(1)}M` : x >= 1000 ? `${Math.round(x / 1000)}k` : `${Math.round(x)}`);

function LeaveChart({ lines, axis, at, onAt, said }: {
  lines: LeaveLine[]; axis: LeaveAxis; at: ISODate; onAt(date: ISODate): void;
  /** What each offer keeps at `at`, in words, once the panel has it; null while it's worked out. */ said: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  // The slider's value, as a screen reader hears it: the date with what each offer keeps, from the panel, so its figures are
  // the panel's to the dollar, and a step is announced once, complete. Until the panel has the new date the slider keeps
  // what it last said (a moment: the panel follows the last day in ~150 ms); if the panel doesn't come, the date alone.
  const [value, setValue] = useState(() => ({ at, text: said ?? longDate(at) }));
  useEffect(() => {
    if (said) {
      setValue({ at, text: said });
      return;
    }
    const t = setTimeout(() => setValue({ at, text: longDate(at) }), 1500);
    return () => clearTimeout(t);
  }, [at, said]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const span = daysBetween(axis.start, axis.end);
  const plotW = width - M.left - M.right;
  const x = (date: ISODate) => M.left + (daysBetween(axis.start, date) / span) * plotW;
  const ticks = niceTicks(Math.max(0, ...lines.flatMap((l) => l.points.map((pt) => pt.value))));
  const top = ticks[ticks.length - 1];
  const y = (v: number) => M.top + H - (Math.max(0, v) / top) * H;
  const years = Array.from({ length: 12 }, (_, i) => `${Number(axis.start.slice(0, 4)) + i + 1}-01-01`).filter((d) => d < axis.end);
  const bands = lines.flatMap((l) => l.segments.map((s) => ({ letter: l.letter, s })));
  // On a narrow screen a segment's label won't fit beside it: the labels go in a list under the chart.
  const narrow = width < 560;
  const height = M.top + H + M.bottom + bands.length * BAND;

  const dateAt = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    return onAxis(axis, addDays(axis.start, Math.round(((clientX - rect.left - M.left) / plotW) * span)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (by) {
      e.preventDefault();
      onAt(e.shiftKey ? onAxis(axis, addDays(at, by)) : stepMonth(axis, at, by));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      onAt(e.key === "Home" ? axis.start : dayBefore(axis.end));
    }
  };
  const label = (s: { from: ISODate; until: ISODate }, text: string) => {
    const room = width - x(s.until) - 8;
    return room > text.length * 6.6 ? { x: x(s.until) + 8, anchor: "start" as const } : { x: x(s.from) - 8, anchor: "end" as const };
  };

  return (
    <div className="chart leave-chart" ref={box}>
      <ul className="chart-legend" aria-label="Offers">
        {lines.map((l) => <li key={l.letter} className={`offer-${l.letter}`}><span className="line-key" aria-hidden="true" />{l.letter}</li>)}
        <li className="chart-unit">$, as paid</li>
      </ul>
      <div className="chart-plot" style={{ height }}>
        <svg width={width} height={height} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
              <text className="axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{short(t)}</text>
            </g>
          ))}
          {years.map((d) => <text key={d} className="axis" x={x(d)} y={M.top + H + 18} textAnchor="middle">{d.slice(0, 4)}</text>)}
          <line className="leave-stay" x1={x(axis.stayEnd)} x2={x(axis.stayEnd)} y1={M.top - 6} y2={M.top + H} />
          {lines.map((l) => (
            <g key={l.letter} className={`series offer-${l.letter}`}>
              <polyline className="series-line" points={l.points.map((pt) => `${x(pt.date)},${y(pt.value)}`).join(" ")} />
              {l.markers.map((m) => (
                <text key={m.date} className="leave-mark" x={x(m.date)} y={y(m.value) - 7} textAnchor="middle">
                  {m.kinds.map((k) => MARKS[k].glyph).join("")}
                </text>
              ))}
            </g>
          ))}
          <line className="crosshair" x1={x(at)} x2={x(at)} y1={M.top - 6} y2={M.top + H} />
          {lines.map((l) => {
            const v = valueAt(l, at);
            return v === null ? null : <circle key={l.letter} className={`series-dot offer-${l.letter}`} cx={x(at)} cy={y(v)} r={4.5} />;
          })}
          {bands.map(({ letter, s }, i) => {
            const by = M.top + H + M.bottom + i * BAND + BAND / 2;
            const text = `${letter}: ${segmentText(s)}`;
            const lab = label(s, text);
            return (
              <g key={`${letter}${s.award}`} className={`series offer-${letter}`}>
                <line className="series-line" x1={x(s.from)} x2={x(s.until)} y1={by} y2={by} />
                <line className="series-line" x1={x(s.from)} x2={x(s.from)} y1={by - 4} y2={by + 4} />
                <line className="series-line" x1={x(s.until)} x2={x(s.until)} y1={by - 4} y2={by + 4} />
                {!narrow && <text className="leave-band" x={lab.x} y={by} dy="0.32em" textAnchor={lab.anchor}>{text}</text>}
              </g>
            );
          })}
        </svg>
        <span className="leave-at" style={{ left: Math.min(Math.max(x(at), M.left + 40), width - 60), top: 0 }}>{longDate(at)}</span>
        <div className="chart-hit leave-hit" tabIndex={0} role="slider" aria-label="Last day" aria-valuemin={0} aria-valuemax={span - 1}
          aria-valuenow={daysBetween(axis.start, value.at)} aria-valuetext={value.text}
          aria-describedby="leave-day-hint" style={{ left: M.left, width: plotW, top: M.top, height: H }}
          onPointerDown={(e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); onAt(dateAt(e.clientX)); }}
          onPointerMove={(e: PointerEvent<HTMLDivElement>) => { if (e.buttons & 1) onAt(dateAt(e.clientX)); }} onKeyDown={onKey} />
      </div>
      {bands.length > 0 && (
        <ul className={narrow ? "leave-bands" : "sr-only"}>
          {bands.map(({ letter, s }) => <li key={`${letter}${s.award}`} className={`offer-${letter}`}><span className="line-key" aria-hidden="true" /> {letter}: {segmentText(s)}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---- the panel -----------------------------------------------------------------------------------------

function Panel({ ctx, axis, at, basis, compare, lines, error }: {
  ctx: WorkContext; axis: LeaveAxis; at: ISODate; basis: LeaveBasis; compare: CompareRequest; lines: LeaveLine[] | null; error: string | null;
}) {
  const r = ctx.results!;
  const panels = r.leave?.panels;
  const date = panels?.find((x) => x)?.leaveDate ?? at;
  return (
    <div className="leave-panel">
      <p className="extra-title">If your last day is {longDate(date)}{date === axis.stayEnd ? ", the last day of your stay" : ""}</p>
      {!panels ? <p className="note">{error ?? "Working it out…"}</p> : (
        <ul className="leave-offers">
          {r.letters.map((letter, i) => (
            <Offer key={letter} letter={letter} start={compare.offers[i]?.startDate ?? ""} panel={panels[i] ?? null} basis={basis} axis={axis}
              line={lines?.find((l) => l.letter === letter) ?? null} ctx={ctx} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Offer({ letter, start, panel, basis, axis, line, ctx }: {
  letter: Letter; start: ISODate; panel: LeavePanel | null; basis: LeaveBasis; axis: LeaveAxis; line: LeaveLine | null; ctx: WorkContext;
}) {
  if (!panel) return <li className="leave-offer"><Who l={letter} /> hasn't started by then: it starts {longDate(start)}.</li>;
  const w = worked(start, panel.leaveDate);
  const kept = basis === "cash" ? panel.afterTaxCompKept : panel.totalRewardsKept;
  const owed = panel.clawbacks.filter((c) => c.owed >= 0.5);
  const segments = line?.segments ?? [];
  const n = panel.next;
  const value = n ? (basis === "cash" ? n.valueOfStaying.afterTaxComp : n.valueOfStaying.totalRewards) : 0;
  const fs = forfeits(panel.warnings, start);
  return (
    <li className="leave-offer">
      <p className="leave-line">
        <Who l={letter} /> <span className="leave-worked">{w.months} {w.months === 1 ? "month" : "months"}{w.days ? ` and ${w.days} ${w.days === 1 ? "day" : "days"}` : ""} worked</span>
        {" · "}keep <Fig id={`kept.${letter}`} label={`${dollars(kept)} kept ${COUNTED[basis]}`}>{dollars(kept)}</Fig> {COUNTED[basis]}
        {owed.length > 0 && (
          <>
            , and repay <Fig id={`repay.${letter}`} label={`${dollars(panel.clawbackOwed)} of clawbacks`}>{dollars(panel.clawbackOwed)}</Fig>{" "}
            of the {owed.map((c) => c.award).join(" and ")}
            {owed.map((c) => {
              const s = segments.find((x) => x.award === c.award);
              return s ? <span key={c.award}> (prorated: it shrinks {dollars(s.perMonth)} a month until {longDate(s.until)})</span>
                : c.fraction >= 1 ? <span key={c.award}> (all of it)</span> : null;
            })}
          </>
        )}.
      </p>
      {(panel.unvestedRsuForfeited >= 0.5 || panel.retirementForfeited >= 0.5) && (
        <p className="leave-line">
          Left behind:{" "}
          {panel.unvestedRsuForfeited >= 0.5 && <><Fig id={`forfeit.${letter}.rsu`} label={`${dollars(panel.unvestedRsuForfeited)} of RSUs not vested`}>{dollars(panel.unvestedRsuForfeited)}</Fig> of RSUs not yet vested (at grant value)</>}
          {panel.unvestedRsuForfeited >= 0.5 && panel.retirementForfeited >= 0.5 && " · "}
          {panel.retirementForfeited >= 0.5 && <><Fig id={`forfeit.${letter}.k401`} label={`${dollars(panel.retirementForfeited)} of employer 401(k) not vested`}>{dollars(panel.retirementForfeited)}</Fig> of employer 401(k) money not yet vested</>}.
        </p>
      )}
      <p className="leave-line">
        {n ? (
          <>
            Next cliff: {cliffsText(n.cliffs)} on {longDate(n.date)}, {figure(n.daysAway)} {n.daysAway === 1 ? "day" : "days"} later.
            Staying until then is worth <Fig id={`next.${letter}`} label={`${dollars(value)} for staying until ${longDate(n.date)}`}>+{dollars(value)}</Fig>{" "}
            {COUNTED[basis]}, <Fig id={`nextown.${letter}`} label={`${dollars(n.cliffValue)}, the cliff itself`}>{dollars(n.cliffValue)}</Fig> of it the
            cliff itself.
          </>
        ) : <>Nothing else pays, vests or steps down within five years of {letter}'s start.</>}
      </p>
      {panel.warnings.length > 0 && (
        <div role="note">
          <ul className="leave-warnings">
            {fs.length > 0 && (
              <li>
                <span className="warn-icon" aria-hidden="true">⚠</span> Leaving then forfeits{" "}
                {fs.map((f, i) => {
                  const t = forfeitText(f);
                  return (
                    <span key={f.index}>
                      {i ? (i === fs.length - 1 ? " and " : ", ") : ""}{t.before}
                      <Fig id={`forgone.${letter}.${f.index}`} label={`${dollars(f.earned)} earned toward the ${f.period} bonus`}>{dollars(f.earned)}</Fig>
                      {t.after}
                    </span>
                  );
                })}: you must be employed on the payout date.
              </li>
            )}
            {leaveWarningTexts(panel.warnings).map((x) => <li key={x}><span className="warn-icon" aria-hidden="true">⚠</span> {x}</li>)}
          </ul>
        </div>
      )}
      {panel.leaveDate === axis.stayEnd && <Reconciled letter={letter} panel={panel} basis={basis} ctx={ctx} />}
    </li>
  );
}

/** On your stay's last day: how leaving then squares with the stay L-1 counts, in plain words. */
function Reconciled({ letter, panel, basis, ctx }: { letter: Letter; panel: LeavePanel; basis: LeaveBasis; ctx: WorkContext }) {
  const r = ctx.results!;
  const detail = r.detail?.offers[r.letters.indexOf(letter)];
  if (!detail) return null;
  if (basis !== "cash") {
    return <p className="leave-recon">Switch to after tax to see how leaving on your stay's last day squares with the stay.</p>;
  }
  const x = reconcile(panel, detail.window);
  // As displayed: the difference between the two rounded figures, like its derivation.
  const diff = Math.round(x.kept) - Math.round(x.stay);
  const same = Math.abs(diff) < 0.5;
  const others = [
    Math.abs(x.pay) >= 0.5 && `${x.pay > 0 ? "pay after you leave" : "pay the stay counts after you leave"} (${dollars(Math.abs(x.pay))})`,
    x.clawback >= 0.5 && `clawbacks repaid (${dollars(x.clawback)})`,
    Math.abs(x.premiums) >= 0.5 && `health premiums (${dollars(Math.abs(x.premiums))})`,
  ].filter(Boolean) as string[];
  // The tax is the remainder, as in the derivation: the stay's totals are rounded to cents.
  const tax = diff - (Math.abs(x.pay) >= 0.5 ? x.pay : 0) - (Math.abs(x.premiums) >= 0.5 ? x.premiums : 0) + (x.clawback >= 0.5 ? x.clawback : 0);
  const why = `the stay taxes ${x.year} as though pay continued through December, at a similar next job, while leaving taxes only what was paid `
    + `in ${x.year}, at a part year's lower rate`;
  return (
    <p className="leave-recon">
      Leaving that day, <Who l={letter} /> keeps <Fig id={`kept.${letter}`} label={`${dollars(x.kept)} kept after tax`}>{dollars(x.kept)}</Fig> after
      tax{same ? ", the same as" : ", "}
      {!same && <><Fig id={`recon.${letter}`} label={`${dollars(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the stay`}>{dollars(Math.abs(diff))}</Fig>{" "}
        {diff > 0 ? "more" : "less"} than </>}
      the <Fig id={`stayafter.${letter}`} label={`${dollars(x.stay)}, the stay after tax`}>{dollars(x.stay)}</Fig> that L-1 counts for your stay (after tax,
      as paid).{" "}
      {!same && (Math.abs(tax) < 0.5 ? `The difference: ${others.join(", ")}.`
        : !others.length ? `It's tax: ${why}.`
        : `${Math.abs(tax) >= Math.abs(diff - tax) ? "Mostly" : "Partly"} tax: ${why}. The rest: ${others.join(", ")}.`)}
    </p>
  );
}
