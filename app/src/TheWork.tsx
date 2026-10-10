import { memo, type ReactNode, useEffect, useMemo, useRef } from "react";
import { Fig, useRovingTicks } from "./figures";
import { cashName, type MetricId, type WorkContext } from "./metrics";
import type { Letter } from "./model";
import { type CompareRequest, workJob, type WorkOffer } from "./protocol";
import { cents, figure, longDate } from "./text";
import { type Stale, staleClass, StaleNote, Stamp, TickLegend } from "./ui";
import type { Engine, SlowState } from "./useEngine";
import {
  type L6Row, paymentFormula, paymentLabel, type PaymentYear, paymentYears, rateText, stayRows, type StayRow, type TaxCol, type TaxTable, taxTables,
  toCent, type YearTable, yearName, yearTable,
} from "./workpaper";

// L-6 · The work (docs/ui-design.md §4.8): the full tables behind every figure, one offer at a time, ticked like a workpaper.
// Collapsed by default. Each offer's employment years come with the comparison (the fast lane); its payments and tax years
// are worked out in the slow lane only once the tables are open. Every column adds up as shown (workpaper.ts), and the
// totals tie (<) to the lead schedule and L-1. Loaded as you scroll toward it, like the schedules before it.

export interface TheWorkProps {
  ctx: WorkContext;
  sample: boolean;
  /** The comparison's request: the offers L-6 lists, in the comparison's order. */
  compare: CompareRequest | null;
  /** The comparison is current and valid: the slow job can start. */
  ready: boolean;
  /** The comparison itself is from earlier inputs. */
  status?: Stale;
  work: SlowState<WorkOffer[]>;
  requestSlow: Engine["requestSlow"];
  /** The tables are open (closed by default), and the offer shown (null: the first). */
  open: boolean;
  letter: Letter | null;
  onOpen(open: boolean): void;
  onLetter(letter: Letter): void;
}

export function TheWork(p: TheWorkProps) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const job = p.compare ? workJob(p.compare) : null;
  const key = job && JSON.stringify(job);
  const { requestSlow, ready, open } = p;
  // The payments and tax years, only while the tables are open.
  useEffect(() => {
    if (open && ready && job) requestSlow(job, key!);
    // The job is compared by value (its key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, key, requestSlow]);

  const r = p.ctx.results;
  const letter = r && p.letter && r.letters.includes(p.letter) ? p.letter : r?.letters[0] ?? "A";
  // The tables are worked out, and rendered, only when what they show changes: the comparison, the payments, the offer shown,
  // or a word they use (its label, state, cash awards' name, an estimated rent, the prices picked). Not on every key.
  const o = p.ctx.offers.find((x) => x.letter === letter);
  const words = [letter, open, p.ctx.household.pricesIn, p.ctx.household.filingStatus, p.ctx.household.healthUsage, o?.draft.label, o?.draft.residence.state,
    o?.draft.residence.nyc, cashName(o), o?.draft.costOfLiving.monthlyRent === null, o?.sample].join("|");
  const shown = r?.detail && r.detail.years === r.view.row.years ? r : null;
  const workOffer = shown?.work?.[shown.letters.indexOf(letter)];
  const ctx = p.ctx;
  const models = useMemo(() => (shown && open ? {
    t: yearTable(ctx, letter), stay: stayRows(ctx, letter),
    payments: workOffer ? paymentYears(ctx, letter) : null, taxes: workOffer ? taxTables(ctx, letter) : null,
  } : null),
  // The context is read when these change: see above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [shown?.detail, shown?.view.row, workOffer, words]);
  if (!shown || !r) return <section ref={ref} id="l6" className="later" />;
  const fresh = p.work.key === key && !p.work.updating && !!r.work;
  // Dimmed while the comparison or the payments are worked out; nothing to dim while closed.
  const status: Stale = !open ? null : p.status ?? (fresh || !r.work ? null : "updating");
  return (
    <section ref={ref} id="l6" className={`schedule the-work${staleClass(status)}`} aria-labelledby="l6-title" aria-busy={open && !fresh}
      data-ready={!open || fresh ? "1" : "0"}>
      <header className="schedule-head">
        <h2 id="l6-title" tabIndex={-1}><span className="ref">L-6</span> The work</h2>
        {p.sample && <Stamp>Illustrative samples</Stamp>}
        <StaleNote status={status} />
      </header>
      <p className="l6-lede">
        Every figure above, line by line, for one offer at a time: its employment years, every payment with its formula and tax, and each
        calendar year's tax with and without the offer. Every column adds up as shown, and the totals tie to the lead schedule and L-1.
      </p>
      <button type="button" className="got-it data-button l6-toggle" aria-expanded={open} aria-controls="l6-body" onClick={() => p.onOpen(!open)}>
        {open ? "Hide the tables" : "Show the tables"}
      </button>
      {open && (
        <div id="l6-body" className="l6-body">
          <div className="chart-bar">
            <h3 className="chart-title l6-title">
              <span className="l6-ref">L-6.{letter}</span>{p.ctx.offers.find((o) => o.letter === letter)?.draft.label ? ` · ${p.ctx.offers.find((o) => o.letter === letter)!.draft.label}` : ""}
            </h3>
            <div className="segmented" role="group" aria-label="Offer">
              {r.letters.map((l) => (
                <button key={l} type="button" className={l === letter ? "is-on" : ""} aria-pressed={l === letter} onClick={() => p.onLetter(l)}>{l}</button>
              ))}
            </div>
          </div>
          {models && <OfferTables letter={letter} {...models} error={p.work.error} />}
          <p className="caption">
            Base case, as paid, not discounted, except the present values. Figures are rounded to the dollar, payments to the cent; a total is
            its lines as shown, added. <a href="#/method/M-13">Methodology M-13</a>.{p.sample ? " (Sample inputs.)" : ""}
          </p>
          <TickLegend />
        </div>
      )}
    </section>
  );
}

/** One offer's tables. Memoized: it renders again only when its view models do. */
const OfferTables = memo(function OfferTables({ letter, t, stay, payments, taxes, error }: {
  letter: Letter; t: YearTable; stay: StayRow[]; payments: PaymentYear[] | null; taxes: TaxTable[] | null; error: string | null;
}) {
  return (
    <>
      <h4 className="extra-title l6-part">Employment years</h4>
      <Scroll label={`L-6.${letter}, employment years`}><YearsTable t={t} /></Scroll>
      <h4 className="extra-title l6-part">Your stay, tied to the lead schedule and L-1</h4>
      <Scroll label={`L-6.${letter}, your stay`}><StayTable letter={letter} n={t.n} rows={stay} /></Scroll>
      <h4 className="extra-title l6-part">Every payment</h4>
      {payments ? <Scroll label={`L-6.${letter}, every payment`}><Payments letter={letter} years={payments} /></Scroll>
        : <p className="note l6-wait">{error ?? "Working out every payment…"}</p>}
      <h4 className="extra-title l6-part">Tax by calendar year, with and without the offer</h4>
      {taxes ? <Scroll label={`L-6.${letter}, tax by calendar year`}><TaxYears letter={letter} tables={taxes} /></Scroll>
        : <p className="note l6-wait">{error ?? "Working out each year's tax…"}</p>}
    </>
  );
});

/** A table that scrolls sideways on a narrow screen: the scroll takes focus, so a keyboard can scroll it. */
function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="l6-scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

/** A dollar figure: a deduction in parentheses. */
const money = (v: number) => (v < 0 ? `(${figure(-v)})` : figure(v));
const shown = (row: L6Row, v: number) => (row.unit === "perHour" ? cents(v) : row.unit === "hours" ? figure(v) : money(v));
const SECTION: Record<L6Row["section"], string> = { cash: "Cash", rewards: "Total rewards and hours", rent: "" };

function YearsTable({ t }: { t: YearTable }) {
  const years = t.years.map((y) => y.n);
  const sections = (["cash", "rewards", "rent"] as const).filter((s) => t.rows.some((x) => x.section === s));
  return (
    <table className="year-table l6-table l6-years">
      <caption className="sr-only">L-6.{t.letter}: each employment year of your stay, line by line, and the years added</caption>
      <thead>
        <tr>
          <th scope="col" className="l6-no"><span className="sr-only">Number</span></th>
          <th scope="col" className="l6-label">Line</th>
          {years.map((n) => <th key={n} scope="col">Year {n}</th>)}
          <th scope="col">Years 1–{t.n}</th>
        </tr>
      </thead>
      {sections.map((s) => (
        <tbody key={s}>
          <tr className="l6-section">
            <th scope="rowgroup" colSpan={years.length + 3}>{s === "rent" ? t.rows.find((x) => x.line === "total")!.label : SECTION[s]}</th>
          </tr>
          {t.rows.filter((x) => x.section === s).map((row) => (
            <tr key={row.no} className={`l6-${row.kind}${row.kind === "subtotal" ? " rule-single" : row.kind === "total" ? " rule-double" : ""}`}>
              <td className="l6-no">{row.no}</td>
              <th scope="row" className={row.lead ? "l6-led" : undefined}>
                {row.lead && <span className="bridge-lead">{row.lead}</span>}{row.label}
                {row.gloss && <span className="bridge-gloss">{row.gloss}</span>}
              </th>
              {row.values.map((v, i) => (
                <td key={i}>
                  <Fig id={`l6y.${t.letter}.${row.line}.${i + 1}`} label={`${t.letter}, year ${i + 1}, line ${row.no}, ${row.label}, ${shown(row, v)}`}>{shown(row, v)}</Fig>
                </td>
              ))}
              <td className="l6-sum">
                <Fig id={`l6y.${t.letter}.${row.line}.sum`} label={`${t.letter}, years 1 to ${t.n}, line ${row.no}, ${row.label}, ${shown(row, row.sum)}`}>{shown(row, row.sum)}</Fig>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

function StayTable({ letter, n, rows }: { letter: Letter; n: number; rows: StayRow[] }) {
  const after = rows.some((x) => x.after);
  return (
    <table className="year-table l6-table l6-stay">
      <caption className="sr-only">L-6.{letter}: your stay on each basis, as paid and in present value</caption>
      <thead>
        <tr>
          <th scope="col">Basis</th>
          <th scope="col">Years 1–{n}</th>
          {after && <th scope="col">Past your stay's last day</th>}
          <th scope="col">Your stay, as paid</th>
          <th scope="col">Present value today</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.basis}>
            <th scope="row">{x.label}</th>
            <td><Fig id={`l6y.${letter}.${x.line}.sum`} label={`${x.label}, years 1 to ${n}, ${figure(x.years)}`}>{figure(x.years)}</Fig></td>
            {after && (
              <td>{x.after ? <Fig id={`l6s.${letter}.${x.basis}.after`} label={`${x.label} past your stay, ${money(-x.after)}`}>{money(-x.after)}</Fig> : "—"}</td>
            )}
            <td><Fig id={`l6s.${letter}.${x.basis}.stay`} label={`${x.label}, your stay as paid, ${figure(x.stay)}`}>{figure(x.stay)}</Fig></td>
            <td><Fig id={`l6s.${letter}.${x.basis}.pv`} label={`${x.label}, present value today, ${figure(x.pv)}`}>{figure(x.pv)}</Fig></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const KIND_NAME = { salary: "Salary", bonus: "Bonus", cash: "Cash awards", rsu: "RSUs", clawback: "Clawbacks" } as const;

function Payments({ letter, years }: { letter: Letter; years: PaymentYear[] }) {
  return (
    <table className="year-table l6-table l6-payments">
      <caption className="sr-only">L-6.{letter}: every payment, by employment year and kind, with its tax, to the cent</caption>
      <thead>
        <tr><th scope="col">Payment</th><th scope="col">Pay</th><th scope="col">Tax</th></tr>
      </thead>
      {years.map((y) => (
        <tbody key={y.ey}>
          <tr className="l6-section">
            <th scope="rowgroup" colSpan={3}>{y.ey === "after" ? `${yearName(y)}: taxed with its last calendar year, not counted` : yearName(y)}</th>
          </tr>
          {y.groups.map((g) => [
            ...g.rows.map(({ i, p }) => (
              <tr key={i}>
                <th scope="row">{paymentLabel(p)}<span className="bridge-gloss">paid {longDate(p.date)} · {paymentFormula(p)}</span></th>
                <td><Fig id={`l6p.${letter}.${i}.gross`} label={`${paymentLabel(p)}, ${toCent(p.gross)}`}>{toCent(p.gross)}</Fig></td>
                <td><Fig id={`l6p.${letter}.${i}.tax`} label={`Tax on ${paymentLabel(p)}, ${toCent(p.tax)}`}>{toCent(p.tax)}</Fig></td>
              </tr>
            )),
            ...(g.rows.length > 1 ? [(
              <tr key={`${g.component}-sum`} className="rule-single l6-subtotal">
                <th scope="row">{KIND_NAME[g.component]}, {y.ey === "after" ? "after your stay" : `year ${y.ey}`}</th>
                <td><Fig id={`l6g.${letter}.${y.ey}.${g.component}.gross` as MetricId} label={`${KIND_NAME[g.component]} payments added, ${toCent(g.gross)}`}>{toCent(g.gross)}</Fig></td>
                <td><Fig id={`l6g.${letter}.${y.ey}.${g.component}.tax` as MetricId} label={`Their tax added, ${toCent(g.tax)}`}>{toCent(g.tax)}</Fig></td>
              </tr>
            )] : []),
          ])}
          <tr className="rule-double l6-total">
            <th scope="row">Tax on {y.ey === "after" ? "these payments" : `year ${y.ey}'s payments`}</th>
            <td />
            <td><Fig id={`l6g.${letter}.${y.ey}.all.tax` as MetricId} label={`Tax on ${y.ey === "after" ? "the payments after your stay" : `year ${y.ey}'s payments`}, ${toCent(y.tax)}`}>{toCent(y.tax)}</Fig></td>
          </tr>
        </tbody>
      ))}
    </table>
  );
}

const COLS: TaxCol[] = ["with", "without", "offer"];

function TaxYears({ letter, tables }: { letter: Letter; tables: TaxTable[] }) {
  return (
    <table className="year-table l6-table l6-tax">
      <caption className="sr-only">L-6.{letter}: each calendar year's tax with the offer, without it, and the offer's share</caption>
      <thead>
        <tr><th scope="col">Line</th><th scope="col">With the offer</th><th scope="col">Without it</th><th scope="col">The offer's share</th></tr>
      </thead>
      {tables.map((t) => (
        <tbody key={t.year}>
          <tr className="l6-section">
            <th scope="rowgroup" colSpan={4}>{t.year} · {t.projectedLaw ? "tax law projected from 2026" : "2026 tax law"}</th>
          </tr>
          {t.rows.map((row) => (
            <tr key={row.line} className={`l6-${row.kind}${row.kind === "total" ? " rule-double" : row.line === "federal" ? " l6-gap" : ""}`}>
              <th scope="row">{row.label}{row.gloss && <span className="bridge-gloss">{row.gloss}</span>}</th>
              {row.kind === "rate" ? (
                <>
                  <td /><td />
                  <td><Fig id={`l6t.${letter}.${t.year}.rate.offer`} label={`The offer's ${t.year} tax rate, ${rateText(t.rate, t.digits)}`}>{rateText(t.rate, t.digits)}</Fig></td>
                </>
              ) : COLS.map((c) => {
                const v = row[c]!;
                return (
                  <td key={c}>
                    <Fig id={`l6t.${letter}.${t.year}.${row.line}.${c}`} label={`${t.year}, ${row.label}, ${c === "offer" ? "the offer's share" : c === "with" ? "with the offer" : "without it"}, ${money(v)}`}>
                      {money(v)}
                    </Fig>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

