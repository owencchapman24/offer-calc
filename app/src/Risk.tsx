import { useRef, useState } from "react";
import type { Scenario } from "../../src/offer/types";
import { rangeTicks, useChartWidth } from "./axes";
import { basisPhrase, join, pricesOf, type WorkContext } from "./metrics";
import type { Letter } from "./model";
import { CASES, changeText, dropText, type RiskRow, type RiskView, riskCarriers, riskView } from "./cases";
import { cents, dollars, figure } from "./text";
import { CsvButton, Fig, useRovingTicks } from "./figures";
import { type Stale, staleClass, StaleNote, Stamp, TickLegend, usePrinting } from "./ui";

// L-2 · If things go badly (docs/ui-design.md §4.4): which offer holds up best. A sentence, a range chart
// (bear and bull joined, base as a diamond), who wins each scenario, what goes wrong in the bear case,
// and a table view. Loaded when it nears the screen (App.tsx), like the schedules after it.

const CASE_WORD: Record<Scenario, string> = { bear: "Bear", base: "Base", bull: "Bull" };

const short = (x: number, perHour: boolean) =>
  perHour ? `$${Math.round(x)}` : Math.abs(x) >= 1_000_000 ? `${+(x / 1e6).toFixed(2)}M` : Math.abs(x) >= 1000 ? `${Math.round(x / 1000)}k` : `${Math.round(x)}`;

const Who = ({ l }: { l: Letter }) => <strong className={`who offer-${l}`}>{l}</strong>;

export function Risk({ ctx, sample, tableOpen = false, status = null }: {
  ctx: WorkContext; sample: boolean; /** Tests open the table view. */ tableOpen?: boolean; /** Its figures are from earlier inputs. */ status?: Stale;
}) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const [open, setTable] = useState(tableOpen);
  const printing = usePrinting();
  // In print, every table in full: the table view opens.
  const table = open || printing;
  const r = ctx.results;
  if (!r?.detail || r.detail.years !== r.view.row.years || !r.detail.offers.every((o) => o.cases)) return null;
  let v: RiskView;
  try {
    v = riskView(ctx);
  } catch {
    return null;
  }
  const basis = r.view.basis;
  const title = v.perHour ? `Per hour worked over your stay (${v.years} ${v.years === 1 ? "year" : "years"}), nominal`
    : `${basisPhrase(pricesOf(ctx))[basis][0].toUpperCase()}${basisPhrase(pricesOf(ctx))[basis].slice(1)}, ${v.years}-year total, present value`;
  return (
    <section ref={ref} className={`schedule risk${staleClass(status)}`} aria-labelledby="l2-title" aria-busy={status === "updating"}>
      <header className="schedule-head">
        <h2 id="l2-title"><span className="ref">L-2</span> If things go badly</h2>
        {sample && <Stamp>Illustrative samples</Stamp>}
        <StaleNote status={status} />
      </header>
      {!v.anyRange ? (
        <p className="risk-none">
          No ranges entered, so there's no downside to show. Add a range (+ range) to a bonus, raise, share price or refreshers, or limit a
          promotion to some scenarios, in detailed mode.
        </p>
      ) : (
        <>
          <Lede v={v} />
          <p className="chart-title risk-title">{title}</p>
          <RangeChart v={v} />
          <Winners v={v} />
          <div className="risk-wrong">
            <p className="extra-title">What goes wrong in the bear case</p>
            <ul>
              {[...v.rows].sort((a, b) => a.letter.localeCompare(b.letter)).map((x) => (
                <li key={x.letter}>
                  <Who l={x.letter} />{" "}
                  {x.changes.length ? x.changes.map(changeText).join("; ") : x.ranged ? "nothing within your stay" : "no ranges entered"}
                </li>
              ))}
            </ul>
          </div>
          <p className="caption">
            The bear case is one coherent bad story: every uncertain input at its bear value at once. It isn't the worst case.{" "}
            <a href="#/method/M-8">Methodology M-8</a>.{sample ? " (Sample inputs.)" : ""}{" "}
            <span className="no-print">
              <button type="button" className="link" aria-expanded={table} aria-controls="l2-table" onClick={() => setTable(!table)}>
                {table ? "Hide the table view" : "Table view"}
              </button>
              {table && <>{" · "}<CsvButton table={{ kind: "l2" }} name="L-2, if things go badly" /></>}
            </span>
          </p>
          {table && <CaseTable v={v} />}
        </>
      )}
      <TickLegend />
    </section>
  );
}

/** "C holds up best, and wins in every scenario. In the bear case it leads A by $1,265 a month. A has the most to lose: …" */
function Lede({ v }: { v: RiskView }) {
  const per = v.perHour ? "an hour" : "a month";
  const amount = (x: number) => (v.perHour ? cents(x) : dollars(x / v.factor));
  const H = v.holdsUp;
  const own = CASES.filter((s) => v.leads[s].winner === H);
  const others = new Map<Letter, Scenario[]>();
  for (const s of CASES) if (v.leads[s].winner !== H) others.set(v.leads[s].winner, [...(others.get(v.leads[s].winner) ?? []), s]);
  const cases = (ss: Scenario[]) => `${join(ss)} case${ss.length > 1 ? "s" : ""}`;
  const bear = v.leads.bear;
  const lose = v.mostToLose;
  return (
    <p className="risk-lede">
      <Who l={H} /> holds up best
      {others.size === 0 ? ", and wins in every scenario. " : <>: it wins the {cases(own)}, and {join([...others].map(([w, ss]) => `${w} the ${cases(ss)}`))}. </>}
      {bear.margin > (v.perHour ? 0.005 : 0.5) ? (
        <>In the bear case it leads <Who l={bear.runnerUp} /> by{" "}
          <Fig id="win.bear" label={`${amount(bear.margin)} ${per} in the bear case`}>{amount(bear.margin)}</Fig> {per}.{" "}</>
      ) : <>In the bear case it ties with <Who l={bear.runnerUp} />.{" "}</>}
      {lose && (
        <><Who l={lose.letter} /> has the most to lose:{" "}
          <Fig id={`drop.${lose.letter}`} label={`${amount(lose.drop)} ${per} below its base case`}>{amount(lose.drop)}</Fig> {per} below its base
          case ({dropText(lose)}){lose.changes.length ? `, because ${riskCarriers(lose.changes)}` : ""}.{" "}</>
      )}
      {v.onlyIfWell.map((l) => <span key={l}><Who l={l} /> comes out ahead only if things go well. </span>)}
    </p>
  );
}

// ---- the range chart ------------------------------------------------------------------------------

const ROW = 36;
/** The labels sit to the right of the plot; on a narrow screen they move under it. */
const M = { top: 6, right: 200, bottom: 26, left: 40 };
const NARROW = 520;

function RangeChart({ v }: { v: RiskView }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useChartWidth(box, 640);
  const values = v.rows.flatMap((x) => CASES.map((s) => x.values[s]));
  const ticks = rangeTicks(Math.min(...values), Math.max(...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const narrow = width < NARROW;
  // On a narrow screen the labels go under the plot; keep room for the last axis label.
  const plotW = width - M.left - (narrow ? 28 : M.right);
  const H = v.rows.length * ROW;
  const x = (val: number) => M.left + ((val - lo) / (hi - lo)) * plotW;
  const y = (i: number) => M.top + i * ROW + ROW / 2;
  const fmt = (val: number) => (v.perHour ? cents(val) : figure(val));
  return (
    <div className="chart risk-chart" ref={box}>
      <div className="chart-plot" style={{ height: M.top + H + M.bottom }}>
        <svg width={width} height={M.top + H + M.bottom} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={x(t)} x2={x(t)} y1={M.top} y2={M.top + H} />
              <text className="axis" x={x(t)} y={M.top + H + 18} textAnchor="middle">{short(t, v.perHour)}</text>
            </g>
          ))}
          {v.rows.map((row, i) => {
            const [bear, base, bull] = CASES.map((s) => x(row.values[s]));
            const cy = y(i);
            return (
              <g key={row.letter} className={`series offer-${row.letter}`}>
                {bull - bear > 0.5 && <line className="series-line" x1={bear} x2={bull} y1={cy} y2={cy} />}
                {bull - bear > 0.5 && (
                  <>
                    <circle className="series-dot" cx={bear} cy={cy} r={4.5}><title>{`${row.letter} bear ${fmt(row.values.bear)}`}</title></circle>
                    <circle className="series-dot" cx={bull} cy={cy} r={4.5}><title>{`${row.letter} bull ${fmt(row.values.bull)}`}</title></circle>
                  </>
                )}
                <rect className="series-diamond" x={base - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${base} ${cy})`}>
                  <title>{`${row.letter} base ${fmt(row.values.base)}`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
        {v.rows.map((row, i) => (
          <span key={row.letter} className={`risk-letter offer-${row.letter}`} style={{ top: y(i) - 11 }}><span className="end-letter">{row.letter}</span></span>
        ))}
        {!narrow && v.rows.map((row, i) => (
          <span key={row.letter} className="risk-label" style={{ left: M.left + plotW + 16, top: y(i) - 11 }}><RowLabel row={row} v={v} /></span>
        ))}
      </div>
      {narrow && (
        <ul className="risk-labels">
          {v.rows.map((row) => <li key={row.letter}><span className={`end-letter offer-${row.letter}`}>{row.letter}</span> <RowLabel row={row} v={v} /></li>)}
        </ul>
      )}
      <p className="risk-key">
        <span className="risk-key-dot" aria-hidden="true" /> bear and bull <span className="risk-key-diamond" aria-hidden="true" /> base · sorted by the bear case
      </p>
    </div>
  );
}

/** Beside a row: its bear value and drop, or its one value when it has no range. */
function RowLabel({ row, v }: { row: RiskRow; v: RiskView }) {
  const fmt = (val: number) => (v.perHour ? cents(val) : figure(val));
  if (!row.ranged || Math.abs(row.values.bull - row.values.bear) < (v.perHour ? 0.005 : 0.5)) {
    return (
      <><Fig id={`risk.${row.letter}.base`} label={`${row.letter}'s base case, ${fmt(row.values.base)}`}>{fmt(row.values.base)}</Fig>{" "}
        <span className="risk-flat">{row.ranged ? "same in every case" : "no ranges entered"}</span></>
    );
  }
  return (
    <>bear <Fig id={`risk.${row.letter}.bear`} label={`${row.letter}'s bear case, ${fmt(row.values.bear)}`}>{fmt(row.values.bear)}</Fig>{" "}
      <Fig id={`drop.${row.letter}`} label={`${row.letter}'s bear case is ${dropText(row)} on its base case`}>{dropText(row)}</Fig></>
  );
}

// ---- who wins, and the table view ----------------------------------------------------------------

function Winners({ v }: { v: RiskView }) {
  const per = v.perHour ? "an hour" : "a month";
  const amount = (x: number) => (v.perHour ? cents(x) : dollars(x / v.factor));
  return (
    <div className="stays risk-wins" role="table" aria-label="Who wins in each scenario">
      <div role="row" className="stays-row">
        <span role="rowheader" className="stays-label">Who wins</span>
        {CASES.map((s) => <span role="columnheader" key={s} className="stays-years">{CASE_WORD[s]}</span>)}
      </div>
      <div role="row" className="stays-row">
        <span role="rowheader" className="stays-label stays-sub">Leads by</span>
        {CASES.map((s) => {
          const lead = v.leads[s];
          return (
            <span role="cell" key={s} className="stays-cell">
              {lead.margin > (v.perHour ? 0.005 : 0.5) ? (
                <>
                  <span className={`who offer-${lead.winner}`}>{lead.winner}</span>
                  <Fig id={`win.${s}`} label={`${lead.winner} +${amount(lead.margin)} ${per} in the ${s} case`} className="stays-margin">+{amount(lead.margin)}</Fig>
                  <span className="stays-per">{per}</span>
                </>
              ) : <span className="stays-per">tie</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CaseTable({ v }: { v: RiskView }) {
  const fmt = (val: number) => (v.perHour ? cents(val) : figure(val));
  return (
    <table className="year-table risk-table" id="l2-table">
      <caption className="sr-only">Each offer in the bear, base and bull cases, and the bear case against the base case</caption>
      <thead>
        <tr>
          <th scope="col">Offer</th>
          {CASES.map((s) => <th key={s} scope="col">{CASE_WORD[s]}{s === "base" && <span className="tie" aria-hidden="true">&lt;</span>}</th>)}
          <th scope="col">Bear vs base</th>
        </tr>
      </thead>
      <tbody>
        {[...v.rows].sort((a, b) => a.letter.localeCompare(b.letter)).map((row) => (
          <tr key={row.letter}>
            <th scope="row"><span className={`who offer-${row.letter}`}>{row.letter}</span></th>
            {CASES.map((s) => (
              <td key={s}><Fig id={`risk.${row.letter}.${s}`} label={`${row.letter}'s ${s} case, ${fmt(row.values[s])}`}>{fmt(row.values[s])}</Fig></td>
            ))}
            <td><Fig id={`drop.${row.letter}`} label={`${row.letter}'s bear case is ${dropText(row)} on its base case`}>{dropText(row)}</Fig></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
