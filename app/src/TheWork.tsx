import { memo, type ReactNode, useMemo } from "react";
import type { L6Part } from "./csv";
import { CsvButton, Fig } from "./figures";
import { type MetricId, type WorkContext } from "./metrics";
import { cashName } from "./byYearModel";
import type { Letter } from "./model";
import { cents, dollars, figure, longDate } from "./text";
import { usePrintScope } from "./ui";
import {
  KIND_NAME, moneyText as money, paymentFormula, paymentLabel, type PaymentYear, paymentYears, rateText, rowText as shown, sameStay, sectionName,
  stayRows, type StayRow, type TaxCol, type TaxTable, taxTables, toCent, type YearTable, yearName, yearTable,
} from "./workpaper";

// A-7 · The work (docs/ui-design.md §4.8, L-6 until stop 5B; docs/v2-plan.md, item 5): an offer's full tables, over its own stay,
// ticked like a workpaper, in its breakdown (BreakdownParts.tsx). Collapsed until "Show the tables". Its employment years come with
// the breakdown (the fast lane); its payments and tax years are worked out in the slow lane only once the tables are open. Every
// column adds up as shown (workpaper.ts), and where the comparison projects the offer over the same stay, the totals tie (<) to the
// lead schedule and L-1. Each table downloads as CSV (csv.ts). In print it's open; a summary leaves out the list of every payment.

export interface TheWorkProps {
  ctx: WorkContext;
  letter: Letter;
  /** The tables are open (closed by default; open in print). */
  open: boolean;
  onOpen(open: boolean): void;
  /** Its payments and tax years are for the current inputs; the error that stopped them, if one did. */
  fresh: boolean;
  error: string | null;
}

export function TheWork(p: TheWorkProps) {
  const scope = usePrintScope();
  const printing = scope !== null;
  const open = p.open || printing;
  const { ctx, letter } = p;
  // The tables are worked out, and rendered, only when what they show changes: the breakdown, the payments, or a word they use (its
  // label, state, cash awards' name, an estimated rent, the prices picked). Not on every key.
  const o = ctx.offers.find((x) => x.letter === letter);
  const words = [letter, open, ctx.household.pricesIn, ctx.household.filingStatus, ctx.household.healthUsage, o?.draft.label, o?.draft.residence.state,
    o?.draft.residence.nyc, o?.draft.residence.philadelphia, cashName(o), o?.draft.costOfLiving.monthlyRent === null, o?.sample, sameStay(ctx, letter)].join("|");
  const b = ctx.own?.breakdowns[letter];
  const workOffer = ctx.own?.work?.[letter];
  const models = useMemo(() => (b && open ? {
    t: yearTable(ctx, letter), stay: stayRows(ctx, letter), payments: workOffer ? paymentYears(ctx, letter) : null,
    taxes: workOffer ? taxTables(ctx, letter) : null, same: sameStay(ctx, letter),
  } : null),
  // The context is read when these change: see above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [b, workOffer, words]);
  const ready = !open || (p.fresh && !!workOffer);
  return (
    <section className="part the-work" aria-labelledby={`${letter}-7-title`} aria-busy={!ready} data-ready={ready ? "1" : "0"}>
      <h3 id={`${letter}-7-title`} className="part-title" tabIndex={-1}><span className="ref">{letter}-7</span> The work</h3>
      {scope === "summary" ? (
        <p className="l6-lede">
          Every figure in {letter}'s breakdown, line by line: its employment years and each calendar year's tax with and without the offer. Every
          column adds up as shown. The list of every payment is in the full workpaper.
        </p>
      ) : (
        <p className="l6-lede">
          Every figure in {letter}'s breakdown, line by line: its employment years, every payment with its formula and tax, and each calendar year's
          tax with and without the offer. Every column adds up as shown.
        </p>
      )}
      <button type="button" className="got-it data-button l6-toggle no-print" aria-expanded={open} aria-controls={`${letter}-7-body`} onClick={() => p.onOpen(!open)}>
        {open ? "Hide the tables" : "Show the tables"}
      </button>
      {open && models && (
        <div id={`${letter}-7-body`} className="l6-body">
          <OfferTables letter={letter} {...models} error={p.error} listed={scope !== "summary"} />
          <p className="caption">
            Base case, as paid, not discounted, except the present values. Figures are rounded to the dollar, payments to the cent; a total is
            its lines as shown, added. <a href="#/method/M-13">Methodology M-13</a>.
          </p>
        </div>
      )}
    </section>
  );
}

/** A part's heading, with its CSV (once its figures are there). */
function PartHead({ letter, part, title, name, csv }: { letter: Letter; part: L6Part; title: string; name: string; csv: boolean }) {
  return (
    <div className="l6-part-head">
      <h4 className="extra-title l6-part">{title}</h4>
      {csv && <CsvButton table={{ kind: "a7", letter, part }} name={`${letter}-7, ${name}`} />}
    </div>
  );
}

/**
 * One offer's tables. Memoized: it renders again only when its view models do. `listed`: every payment is listed (on screen, and in
 * the full workpaper; a printed summary says where they are instead).
 */
const OfferTables = memo(function OfferTables({ letter, t, stay, payments, taxes, error, listed = true, same }: {
  letter: Letter; t: YearTable; stay: StayRow[]; payments: PaymentYear[] | null; taxes: TaxTable[] | null; error: string | null; listed?: boolean;
  /** The comparison projects it over the same stay: its totals tie to the lead schedule and L-1, its present value is the rank list's. */
  same: boolean;
}) {
  return (
    <>
      <PartHead letter={letter} part="years" title="Employment years" name="employment years" csv />
      <Scroll label={`${letter}-7, employment years`}><YearsTable t={t} common={t.prices?.unit ?? ""} /></Scroll>
      <PartHead letter={letter} part="stay" title={same ? "Its stay, tied to the lead schedule and L-1" : "Its stay"} name="its stay" csv />
      <Scroll label={`${letter}-7, its stay`}><StayTable letter={letter} n={t.n} rows={stay} common={t.prices?.unit ?? ""} pv={same} /></Scroll>
      <PartHead letter={letter} part="payments" title="Every payment" name="every payment" csv={!!payments} />
      {!listed ? <p className="note l6-elsewhere">Every payment, with its formula and its tax, to the cent: in the full workpaper (Print…, then Full workpaper), and in {letter}-7's CSV of every payment.</p>
        : payments ? <Scroll label={`${letter}-7, every payment`}><Payments letter={letter} years={payments} /></Scroll>
        : <p className="note l6-wait">{error ?? "Working out every payment…"}</p>}
      <PartHead letter={letter} part="tax" title="Tax by calendar year, with and without the offer" name="tax by calendar year" csv={!!taxes} />
      {taxes ? <Scroll label={`${letter}-7, tax by calendar year`}><TaxYears letter={letter} tables={taxes} /></Scroll>
        : <p className="note l6-wait">{error ?? "Working out each year's tax…"}</p>}
    </>
  );
});

/** A table that scrolls sideways on a narrow screen: the scroll takes focus, so a keyboard can scroll it. */
function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="l6-scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

/** The lines after rent at the prices picked, whose labels name those dollars (condition 1); `local` is in the offer's own city's. */
const AFTER = new Set(["atRef", "oopRef", "face", "total", "totalHour"]);

/** A line's figure as its label says it: "$110,000", "U.S.-avg $62,594", "New York $55,762", "$21.85 an hour", "4,000 hours". */
function sayRow(row: YearTable["rows"][number], v: number, common: string, city = "") {
  const place = AFTER.has(row.line) ? `${common} ` : row.line === "local" ? `${city} ` : "";
  return row.unit === "hours" ? `${figure(v)} hours` : row.unit === "perHour" ? `${place}${cents(v)} an hour` : `${place}${dollars(v)}`;
}

function YearsTable({ t, common }: { t: YearTable; /** The prices picked, as a figure names them: "U.S.-avg". */ common: string }) {
  const years = t.years.map((y) => y.n);
  const sections = (["cash", "rewards", "rent"] as const).filter((s) => t.rows.some((x) => x.section === s));
  return (
    <table className="year-table l6-table l6-years">
      <caption className="sr-only">{t.letter}-7: each employment year of its stay, line by line, and the years added</caption>
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
            <th scope="rowgroup" colSpan={years.length + 3}>{sectionName(t, s)}</th>
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
                  <Fig id={`l6y.${t.letter}.${row.line}.${i + 1}`} label={`${t.letter}, year ${i + 1}, line ${row.no}, ${row.label}, ${sayRow(row, v, common, t.prices?.city)}`}>
                    {shown(row, v)}</Fig>
                </td>
              ))}
              <td className="l6-sum">
                <Fig id={`l6y.${t.letter}.${row.line}.sum`} label={`${t.letter}, years 1 to ${t.n}, line ${row.no}, ${row.label}, ${sayRow(row, row.sum, common, t.prices?.city)}`}>
                  {shown(row, row.sum)}</Fig>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

function StayTable({ letter, n, rows, common, pv }: { letter: Letter; n: number; rows: StayRow[]; common: string; /** Its present value is the rank list's. */ pv: boolean }) {
  const after = rows.some((x) => x.after);
  const say = (x: StayRow, v: number) => `${x.basis === "colAdjustedTotal" ? `${common} ` : ""}${dollars(v)}`;
  return (
    <table className="year-table l6-table l6-stay">
      <caption className="sr-only">{letter}-7: its stay on each basis, as paid{pv ? " and in present value" : ""}</caption>
      <thead>
        <tr>
          <th scope="col">Basis</th>
          <th scope="col">Years 1–{n}</th>
          {after && <th scope="col">Past its stay's last day</th>}
          <th scope="col">Its stay, as paid</th>
          {pv && <th scope="col">Present value today</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.basis}>
            <th scope="row">{x.label}</th>
            <td><Fig id={`l6y.${letter}.${x.line}.sum`} label={`${x.label}, years 1 to ${n}, ${say(x, x.years)}`}>{figure(x.years)}</Fig></td>
            {after && (
              <td>{x.after ? <Fig id={`l6s.${letter}.${x.basis}.after`} label={`${x.label} past its stay, ${say(x, -x.after)}`}>{money(-x.after)}</Fig> : "—"}</td>
            )}
            <td><Fig id={`l6s.${letter}.${x.basis}.stay`} label={`${x.label}, its stay as paid, ${say(x, x.stay)}`}>{figure(x.stay)}</Fig></td>
            {pv && <td><Fig id={`l6s.${letter}.${x.basis}.pv`} label={`${x.label}, present value today, ${say(x, x.pv)}`}>{figure(x.pv)}</Fig></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Payments({ letter, years }: { letter: Letter; years: PaymentYear[] }) {
  return (
    <table className="year-table l6-table l6-payments">
      <caption className="sr-only">{letter}-7: every payment, by employment year and kind, with its tax, to the cent</caption>
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
                <td><Fig id={`l6p.${letter}.${i}.gross`} label={`${paymentLabel(p)}, ${cents(p.gross)}`}>{toCent(p.gross)}</Fig></td>
                <td><Fig id={`l6p.${letter}.${i}.tax`} label={`Tax on ${paymentLabel(p)}, ${cents(p.tax)}`}>{toCent(p.tax)}</Fig></td>
              </tr>
            )),
            ...(g.rows.length > 1 ? [(
              <tr key={`${g.component}-sum`} className="rule-single l6-subtotal">
                <th scope="row">{KIND_NAME[g.component]}, {y.ey === "after" ? "after your stay" : `year ${y.ey}`}</th>
                <td><Fig id={`l6g.${letter}.${y.ey}.${g.component}.gross` as MetricId} label={`${KIND_NAME[g.component]} payments added, ${cents(g.gross)}`}>{toCent(g.gross)}</Fig></td>
                <td><Fig id={`l6g.${letter}.${y.ey}.${g.component}.tax` as MetricId} label={`Their tax added, ${cents(g.tax)}`}>{toCent(g.tax)}</Fig></td>
              </tr>
            )] : []),
          ])}
          <tr className="rule-double l6-total">
            <th scope="row">Tax on {y.ey === "after" ? "these payments" : `year ${y.ey}'s payments`}</th>
            <td />
            <td><Fig id={`l6g.${letter}.${y.ey}.all.tax` as MetricId} label={`Tax on ${y.ey === "after" ? "the payments after your stay" : `year ${y.ey}'s payments`}, ${cents(y.tax)}`}>{toCent(y.tax)}</Fig></td>
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
      <caption className="sr-only">{letter}-7: each calendar year's tax with the offer, without it, and the offer's share</caption>
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
                  <td><Fig id={`l6t.${letter}.${t.year}.rate.offer`} label={`The offer's tax, ${rateText(t.rate, t.digits)} of its ${t.year} pay`}>{rateText(t.rate, t.digits)}</Fig></td>
                </>
              ) : COLS.map((c) => {
                const v = row[c]!;
                return (
                  <td key={c}>
                    <Fig id={`l6t.${letter}.${t.year}.${row.line}.${c}`} label={`${t.year}, ${row.label}, ${c === "offer" ? "the offer's share" : c === "with" ? "with the offer" : "without it"}, ${dollars(v)}`}>
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

