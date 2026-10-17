import { type Dispatch, type ReactNode, useEffect, useRef } from "react";
import type { ISODate, OfferWarning } from "../../src/offer/types";
import { inDollars, ownView, type OwnView, prefixOf, shareText } from "./breakdownModel";
import { inSentence } from "./breakevenModel";
import { bridge, notesOf } from "./byYearModel";
import { caseChanges, changeText, hasRanges } from "./cases";
import { CsvButton, Fig, useApi, useRovingTicks } from "./figures";
import { firstLastDay, forfeits, forfeitText, leaveAxis, leaveTerms } from "./leaveModel";
import type { A2Part, MetricId, WorkContext } from "./metrics";
import type { Letter } from "./model";
import {
  A2_LABEL, arrivalShown, arrivalsOf, benefitsOf, bonusTerms, centsText, cliffCost, cliffLines, cliffName, hundredOf, payRows, rateText,
  taxYearsOf,
} from "./partsModel";
import type { PriceWords } from "./prices";
import { type CompareRequest, cursorJobFor, type LeavePanel, type OfferTerms, termsJob, workJob, type WorkOffer } from "./protocol";
import type { Action, UiState } from "./session";
import { dayBefore, dollars, figure, longDate } from "./text";
import { TheWork } from "./TheWork";
import { type Stale, staleClass, usePrinting } from "./ui";
import type { Engine, SlowState } from "./useEngine";
import { WARNING_AT, withholdingParts } from "./warningAt";
import { stayWarnings, WARNING_KIND, type WarningKind } from "./warningKinds";
import { KIND_TITLE, warningWords } from "./warningWords";
import { moneyText, yearTable } from "./workpaper";
import type { OwnOffer } from "./Breakdown";
import type { LeaveBasis } from "./leaveModel";

// An offer's breakdown, A-2 to A-7 (docs/v2-plan.md, item 5, stop 5B): where the money goes, pay by year and when it arrives,
// the terms that can bite, what the benefits are worth, tax and warnings, and the work, each over the offer's own stay (B3). Each
// part is compact, its detail behind its own "Show …" (all of it in print). One lazy chunk, loaded as you scroll toward it; like the
// schedules it imports figures.tsx, never Tickmarks.tsx. L-5's warnings and L-6's tables live here now (B8), and L-1's bridge (B7).

/** The parts' detail toggles, one setting for every offer: each part's "Show …". */
export type PartKey = "a2" | "a3" | "a4" | "a5" | "a6";

export interface PartsProps {
  ctx: WorkContext;
  x: OwnOffer;
  prices: PriceWords;
  ui: UiState;
  dispatch: Dispatch<Action>;
  /** Every complete offer: what the slow jobs project (A-4's cliffs and last day, A-7's payments). */
  request: CompareRequest | null;
  /** The results are current and valid: the slow jobs can start. */
  ready: boolean;
  requestSlow: Engine["requestSlow"];
  slow: { work: SlowState<WorkOffer[]>; terms: SlowState<OfferTerms[]>; cursor: SlowState<Array<LeavePanel | null>> };
  /** A-4's last day: L-4's, with a comparison (null: the default, six months in from the earliest start). */
  leave: { at: ISODate | null; basis: LeaveBasis; onAt(at: ISODate): void };
  status: Stale;
}

export function OwnParts(p: PartsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useRovingTicks(ref);
  const printing = usePrinting();
  const { x, ctx, ui, dispatch, request, ready, requestSlow } = p;
  const L = x.offer.letter;
  const b = x.breakdown;
  // A-4's cliffs, for every complete offer at once (a few milliseconds each), once the results are current.
  const terms = request ? termsJob(request, ctx.today) : null;
  const termsKey = terms && JSON.stringify(terms);
  useEffect(() => {
    if (ready && terms) requestSlow(terms, termsKey!);
    // The job is compared by value (its key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, termsKey, requestSlow]);
  if (!b || !x.input) return null;
  const open = (k: PartKey) => printing || (ui.parts?.[k] ?? false);
  const toggle = (k: PartKey) => dispatch({ type: "ui", patch: { parts: { ...ui.parts, [k]: !(ui.parts?.[k] ?? false) } } });
  const show = (k: PartKey, what: string, id: string) => (
    <button type="button" className="link part-show no-print" aria-expanded={open(k)} aria-controls={id} onClick={() => toggle(k)}>
      {open(k) ? `Hide ${what}` : `Show ${what}`}
    </button>
  );
  const workOpen = printing || (ui.work?.open ?? false);
  const job = request ? workJob(request) : null;
  const workKey = job && JSON.stringify(job);
  return (
    <div ref={ref} className={`own-parts${staleClass(p.status)}`} data-offer={L}>
      <WhereItGoes {...p} open={open("a2")} show={show("a2", "the bridge from the offer letter", `${L}-2-bridge`)} />
      <PayByYear {...p} open={open("a3")} show={show("a3", "when each payment arrives", `${L}-3-when`)} />
      <Terms {...p} open={open("a4")} show={show("a4", "every cliff in its stay", `${L}-4-cliffs`)} />
      <Benefits {...p} open={open("a5")} show={show("a5", "the benefits by year", `${L}-5-years`)} />
      <TaxAndWarnings {...p} open={open("a6")} show={show("a6", "tax by calendar year", `${L}-6-years`)} />
      <WorkPart {...p} letter={L} open={workOpen} job={job} workKey={workKey} />
    </div>
  );
}

/** A part's head: its reference and name, an h3 under the breakdown's h2. */
function PartHead({ letter, n, title, children }: { letter: Letter; n: number; title: string; children?: ReactNode }) {
  return (
    <div className="part-head">
      <h3 id={`${letter}-${n}-title`} className="part-title" tabIndex={-1}><span className="ref">{letter}-{n}</span> {title}</h3>
      {children}
    </div>
  );
}

type Part = PartsProps & { open: boolean; show: ReactNode };

// ---- A-2: where the money goes ----------------------------------------------------------------------------------------------

function WhereItGoes({ ctx, x, prices, ui, dispatch, open, show }: Part) {
  const L = x.offer.letter;
  const b = x.breakdown!;
  const n = Math.min(Math.max(ui.bridge?.letter === L ? ui.bridge.year : 1, 1), b.years);
  const h = hundredOf(b.detail, n);
  const set = (year: number) => dispatch({ type: "ui", patch: { bridge: { letter: L, year } } });
  const year = `year-${n}`;
  const of = (c: number) => `${centsText(c)} of each $100 of ${year} pay`;
  return (
    <section className="part where-it-goes" aria-labelledby={`${L}-2-title`}>
      <PartHead letter={L} n={2} title="Where the money goes">
        <select aria-label={`${L}-2, employment year`} value={n} onChange={(e) => set(Number(e.target.value))}>
          {Array.from({ length: b.years }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
        </select>
      </PartHead>
      {!h ? <p className="note">Needs a city and pay in year {n}.</p> : (
        <>
          <p className="part-lede">
            Paid to you in year {n} ({longDate(h.start)} – {longDate(dayBefore(h.end))}):{" "}
            <Fig id={`br.${L}.${n}.paid`} label={`Paid in year ${n}, ${dollars(h.paid)}`}>{dollars(h.paid)}</Fig>, as paid. Where each $100 of it goes:
          </p>
          <div className="hundred">
            <HundredBar parts={h.parts} />
            <table className="year-table hundred-table">
              <caption className="sr-only">Where each $100 of {year} pay goes, and its dollars as paid</caption>
              <thead>
                <tr><th scope="col">Part</th><th scope="col">Of each $100 of {year} pay</th><th scope="col">$, as paid in year {n}</th></tr>
              </thead>
              <tbody>
                {h.parts.map((q) => (
                  <tr key={q.part}>
                    <th scope="row"><span className={`hundred-key seg-${q.part}`} aria-hidden="true" />{A2_LABEL[q.part]}</th>
                    <td><Fig id={`a2.${L}.${n}.${q.part}Share` as MetricId} label={`${A2_LABEL[q.part]}, ${of(q.cents)}`}>{centsText(q.cents)}</Fig></td>
                    <td><Fig id={`a2.${L}.${n}.${q.part}`} label={`${A2_LABEL[q.part]}, ${dollars(q.dollars)} in year ${n}`}>{moneyText(q.dollars)}</Fig></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rule-double">
                  <th scope="row">Paid to you</th>
                  <td><Fig id={`a2.${L}.${n}.hundred`} label={`Every $100 of ${year} pay, $100.00`}>$100.00</Fig></td>
                  <td><Fig id={`br.${L}.${n}.paid`} label={`Paid in year ${n}, ${dollars(h.paid)}`}>{figure(h.paid)}</Fig></td>
                </tr>
              </tfoot>
            </table>
            <p className="part-csv"><CsvButton table={{ kind: "part", letter: L, part: "a2", n }} name={`${L}-2, where each $100 of ${year} pay goes`} /></p>
          </div>
          {h.parts[4].cents < 0 && (
            <p className="note">Rent, tax and the rest take more than year {n} pays: the money left to spend is below zero, in parentheses.</p>
          )}
          <EmployerAdds L={L} n={n} credited={h.credited} share={h.vestedShare} hsa={h.hsa} perks={h.perks} years={b.years} />
          <p className="part-more">{show}</p>
          {open && <BridgeView ctx={ctx} letter={L} n={n} prices={prices} />}
        </>
      )}
    </section>
  );
}

/** The $100 as a bar, each part labeled in words beside its share: drawn, so hidden from screen readers (the table says it). */
function HundredBar({ parts }: { parts: Array<{ part: A2Part; cents: number }> }) {
  const shown = parts.filter((q) => q.cents > 0);
  return (
    <div className="hundred-bar" aria-hidden="true">
      {shown.map((q) => (
        <span key={q.part} className={`hundred-seg seg-${q.part}`} style={{ flexGrow: q.cents }} />
      ))}
    </div>
  );
}

/** "Outside the $100, your employer adds $3,300 of 401(k) money in year 1, on top; by the end of your 4-year stay, all of it has vested." */
function EmployerAdds({ L, n, credited, share, hsa, perks, years }: {
  L: Letter; n: number; credited: number; share: number | null; hsa: number; perks: number; years: number;
}) {
  if (!credited && !hsa && !perks) return <p className="part-note">The employer adds nothing on top in year {n}: no 401(k) money, HSA money or perks entered.</p>;
  const vested = !credited || share === null ? "" : share >= 1 ? ` By the end of your ${years}-year stay, all of its 401(k) money has vested.` : share > 0
    ? ` By the end of your ${years}-year stay, ${Math.round(share * 100)}% of its 401(k) money has vested.`
    : ` None of its 401(k) money has vested by the end of your ${years}-year stay: leave then and it's left behind.`;
  const items: ReactNode[] = [];
  if (credited) items.push(<span key="k"><Fig id={`a2.${L}.${n}.credited`} label={`${dollars(credited)} of employer 401(k) money in year ${n}`}>{dollars(credited)}</Fig> of 401(k) money</span>);
  if (hsa) items.push(<span key="h"><Fig id={`br.${L}.${n}.hsa`} label={`Employer HSA money, ${dollars(hsa)} in year ${n}`}>{dollars(hsa)}</Fig> of HSA money</span>);
  if (perks) items.push(<span key="p"><Fig id={`br.${L}.${n}.perks`} label={`Perks, ${dollars(perks)} in year ${n}`}>{dollars(perks)}</Fig> of perks</span>);
  return (
    <p className="part-note">
      Outside the $100, your employer adds {items.map((it, i) => <span key={i}>{i ? (i === items.length - 1 ? " and " : ", ") : ""}{it}</span>)} in year {n}, on
      top.{vested}
    </p>
  );
}

/** The bridge, from the offer letter to after rent at the offer's own prices (and with a comparison, the prices picked): L-1's, moved (B7). */
function BridgeView({ ctx, letter, n, prices }: { ctx: WorkContext; letter: Letter; n: number; prices: PriceWords }) {
  let b: ReturnType<typeof bridge>;
  try {
    b = bridge(ctx, letter, n);
  } catch {
    return null;
  }
  const money = (v: number) => (v < 0 ? `(${figure(-v)})` : figure(v));
  // A line's label says its dollars (condition 1): after rent, its own city's ("New York $65,662") or the prices picked
  // ("U.S.-avg $62,594"); the price line, the prices it steps across, in its name; the rest, "$".
  const say = (line: string, v: number) => (line === "own" ? inDollars(b.city!, Math.abs(v)) : line === "total" ? inDollars(prefixOf(prices.unit), Math.abs(v))
    : line === "prices" ? figure(Math.abs(v)) : dollars(Math.abs(v)));
  return (
    <div className="bridge" id={`bridge-${letter}`}>
      <div className="l6-part-head">
        <h4 className="extra-title" id={`bridge-${letter}-title`} tabIndex={-1}>From the offer letter, year {n}</h4>
        <CsvButton table={{ kind: "part", letter, part: "bridge", n }} name={`${letter}-2, from the offer letter, year ${n}`} />
      </div>
      <table className="bridge-table" id={`${letter}-2-bridge`}>
        <caption className="sr-only">{letter}'s year {n}, from the offer letter to after rent, $, as paid</caption>
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
                  {row.line === "total" && <span className="tie" aria-hidden="true">&lt;</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {b.spend !== undefined && b.saved !== undefined && (
        <p className="bridge-month">
          {/* Where the bridge steps on to the prices picked, the month restates the line at its own prices, not the last line. */}
          {b.rows.some((r) => r.line === "total") ? `After rent at ${letter}'s own prices ` : ""}= <Fig id={`br.${letter}.${n}.spend`} label={`${inDollars(b.city!, b.spend)} a month to spend after rent, in year ${n}`}>{dollars(b.spend)}</Fig> a
          month to spend after rent + <Fig id={`br.${letter}.${n}.saved`} label={`${inDollars(b.city!, b.saved)} a month saved, in year ${n}`}>
            {dollars(b.saved)}</Fig> a month saved, in year {n}, in {b.city} dollars
        </p>
      )}
      <p className="caption">
        Each subtotal is footed (^){b.rows.some((r) => r.line === "total") ? `, and the last line ties (<) to ${letter}'s year ${n} in L-1 on the after-rent basis` : ""}.
      </p>
    </div>
  );
}

// ---- A-3: pay by year, and when it arrives -----------------------------------------------------------------------------------


function PayByYear({ ctx, x, open, show }: Part) {
  const L = x.offer.letter;
  const b = x.breakdown!;
  const t = yearTable(ctx, L);
  const rows = payRows(t);
  const notes = notesOf(b.detail, b.years);
  const arrivals = arrivalsOf(b.detail, b.years);
  const salary = x.input?.salary.annual ?? 0;
  return (
    <section className="part pay-by-year" aria-labelledby={`${L}-3-title`}>
      <PartHead letter={L} n={3} title="Pay by year, and when it arrives" />
      <PayChart years={t.years.map((y) => ({ n: y.n, salary: y.salary, bonus: y.bonus, cash: y.cash, rsu: y.rsu }))} />
      <div className="l6-scroll" role="region" aria-label={`${L}-3, pay by year`} tabIndex={0}>
        <table className="year-table pay-table">
          <caption className="sr-only">{L}'s pay by employment year and kind, $, as paid</caption>
          <thead>
            <tr>
              <th scope="col">$, as paid</th>
              {t.years.map((y) => <th key={y.n} scope="col">Year {y.n}</th>)}
              <th scope="col">Years 1–{t.n}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.line} className={row.line === "gross" ? "rule-double" : undefined}>
                <th scope="row">{row.line !== "gross" && (KINDS as readonly string[]).includes(row.line) && <span className={`pay-key seg-${row.line}`} aria-hidden="true" />}
                  {row.line === "gross" ? "Pay" : row.label}</th>
                {row.values.map((v, i) => (
                  <td key={i}>
                    <Fig id={`l6y.${L}.${row.line}.${i + 1}`} label={`${L}, year ${i + 1}, line ${row.no}, ${row.label}, ${dollars(v)}`}>{moneyText(v)}</Fig>
                  </td>
                ))}
                <td><Fig id={`l6y.${L}.${row.line}.sum`} label={`${L}, years 1 to ${t.n}, line ${row.no}, ${row.label}, ${dollars(row.sum)}`}>{moneyText(row.sum)}</Fig></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="part-csv"><CsvButton table={{ kind: "part", letter: L, part: "a3" }} name={`${L}-3, pay by year`} /></p>
      {notes.length > 0 && <ul className="chart-notes">{notes.map((nt) => <li key={`${nt.n}${nt.text}`}>Yr {nt.n}: {nt.text}</li>)}</ul>}
      <p className="part-note">
        Gross, as paid in each employment year: the same figures as {L}-7's. Salary is paid monthly:{" "}
        <Fig id={`when.${L}.salary`} label={`${dollars(salary / 12)} a month at its starting salary`}>{dollars(salary / 12)}</Fig> a month at its starting
        salary.
      </p>
      <p className="part-more">{show}</p>
      {open && (
        arrivals.length ? (
          <ol className="arrivals" id={`${L}-3-when`} aria-label={`${L}'s payments that aren't salary, by date`}>
            {arrivals.map((a) => (
              <li key={a.i}>
                <span className="arrival-date">{longDate(a.date)}</span> · {a.label}{a.note ? ` (${a.note})` : ""}:{" "}
                <Fig id={`when.${L}.${a.i}`} label={`${a.label}, ${dollars(arrivalShown(a))}, paid ${longDate(a.date)}, in year ${a.ey}`}>{dollars(arrivalShown(a))}</Fig>
                <span className="arrival-year">, in year {a.ey}</span>
              </li>
            ))}
          </ol>
        ) : <p className="note" id={`${L}-3-when`}>Nothing but salary in its stay: no bonus, cash award or RSU vest entered.</p>
      )}
    </section>
  );
}

const KINDS = ["salary", "bonus", "cash", "rsu"] as const;
const KIND_LABEL = { salary: "salary", bonus: "bonus", cash: "cash awards", rsu: "RSUs" };

/** Pay by year as stacked columns, each kind labeled in the legend: drawn, so hidden from screen readers (the table says it). */
function PayChart({ years }: { years: Array<{ n: number; salary: number; bonus: number; cash: number; rsu: number }> }) {
  const max = Math.max(1, ...years.map((y) => KINDS.reduce((s, k) => s + Math.max(0, y[k]), 0)));
  const kinds = KINDS.filter((k) => years.some((y) => y[k] > 0));
  return (
    <div className="pay-chart" aria-hidden="true">
      <ul className="pay-legend">{kinds.map((k) => <li key={k}><span className={`pay-key seg-${k}`} />{KIND_LABEL[k]}</li>)}</ul>
      <div className="pay-columns">
        {years.map((y) => (
          <div key={y.n} className="pay-column">
            <div className="pay-stack" style={{ height: `${(KINDS.reduce((s, k) => s + Math.max(0, y[k]), 0) / max) * 100}%` }}>
              {kinds.map((k) => y[k] > 0 && <span key={k} className={`pay-seg seg-${k}`} style={{ flexGrow: y[k] }} />)}
            </div>
            <span className="pay-year">Yr {y.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- A-4: terms that can bite --------------------------------------------------------------------------------------------------

function Terms({ ctx, x, prices, request, ready, requestSlow, slow, leave, status, open, show }: Part) {
  const L = x.offer.letter;
  const b = x.breakdown!;
  const o = x.input!;
  const d = b.detail;
  const facts = [...leaveTerms(o, d), ...bonusTerms(o)];
  const terms: OfferTerms | undefined = ctx.own?.terms?.[L];
  // If you left on a day you pick (B6): L-4's panel for this offer, the same job and last day.
  const earliest = request ? request.offers.map((q) => q.startDate).sort()[0] : o.startDate;
  const axis = leaveAxis(earliest, b.years);
  const at = leave.at ?? firstLastDay(axis);
  const cursor = request ? cursorJobFor(request, at) : null;
  const cursorKey = cursor && JSON.stringify(cursor);
  useEffect(() => {
    if (ready && cursor) requestSlow(cursor, cursorKey!);
    // The job is compared by value (its key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cursorKey, requestSlow]);
  const panel = ctx.own?.leave?.panels[L];
  const fresh = slow.cursor.key === cursorKey && !slow.cursor.updating && panel !== undefined && (panel === null || panel.leaveDate === at);
  // While an input has a problem nothing newer is on its way: the last valid results show, dimmed with the rest of the breakdown,
  // and the last day's panel only while it's for the day shown.
  const invalid = status === "invalid";
  const shown = fresh || (invalid && panel !== undefined && (panel === null || panel.leaveDate === at));
  const busy = !invalid && (!fresh || !terms);
  const v = viewOfOwn(ctx, x, prices);
  const last = dayBefore(b.window.end);
  return (
    <section className="part terms" aria-labelledby={`${L}-4-title`} aria-busy={busy} data-ready={busy ? "0" : "1"}>
      <PartHead letter={L} n={4} title="Terms that can bite" />
      {facts.length ? (
        <ul className="terms-list">{facts.map((f) => <li key={f}>{f[0].toUpperCase() + f.slice(1)}.</li>)}</ul>
      ) : <p className="part-note">No bonus, cash award, RSU or 401(k) vesting entered: nothing in its terms to lose by leaving early.</p>}
      <NextCliff L={L} terms={terms} start={o.startDate} />
      <p className="part-note left-on">
        <label htmlFor={`${L}-4-at`}>If you left on</label>{" "}
        <input id={`${L}-4-at`} type="date" value={at} min={o.startDate} max={last} onChange={(e) => { if (e.target.value) leave.onAt(e.target.value); }} />
        {": "}
        {!shown ? (invalid ? "waiting on the problem in the inputs." : "working it out…") : panel === null ? `${L} hasn't started by then.` : panel ? <LeftOn L={L} panel={panel} basis={leave.basis} start={o.startDate} /> : null}
      </p>
      <BadCase L={L} v={v} offer={o} end={b.window.end} />
      <p className="part-more">{show}</p>
      {open && (terms ? <CliffList L={L} terms={terms} />
        : <p className="note" id={`${L}-4-cliffs`}>{invalid ? "Its cliffs wait on the problem in the inputs." : "Working out its cliffs…"}</p>)}
    </section>
  );
}

/** A-1's figures, which A-4's bad case and A-6's rate share (the same figures, the same ids). */
function viewOfOwn(ctx: WorkContext, x: OwnOffer, prices: PriceWords): OwnView | null {
  if (!x.breakdown || !x.input) return null;
  try {
    return ownView(x.offer.letter, x.breakdown, x.input, prices, ctx.own?.withRef ?? false);
  } catch {
    return null;
  }
}

/** "The next cliff from its start: Jan 31, 2027, the bonus for …: staying until it is worth $x after tax." */
function NextCliff({ L, terms, start }: { L: Letter; terms: OfferTerms | undefined; start: ISODate }) {
  if (!terms) return <p className="part-note">Working out the next cliff…</p>;
  const from = terms.from === start ? `from its start, ${longDate(start)}` : `from today, ${longDate(terms.from)}`;
  const n = terms.next;
  if (!n) return <p className="part-note">No cliff {from} to the end of its stay: nothing pays, vests or stops being repaid by then.</p>;
  const what = n.cliffs.map(cliffName).join(" and ");
  // What you'd keep on the cliff's day less on the first, each as shown (its work subtracts them).
  const value = terms.kept ? Math.round(terms.kept.at) - Math.round(terms.kept.from) : n.valueOfStaying.afterTaxComp;
  return (
    <p className="part-note next-cliff">
      The next cliff {from}: {longDate(n.date)}, {what}. Staying until it is worth{" "}
      <Fig id={`nextup.${L}`} label={`${dollars(value)} after tax, as paid, to stay until ${longDate(n.date)}`}>{dollars(value)}</Fig> after tax, as paid.
    </p>
  );
}

/** What leaving on the last day picked keeps, repays and leaves behind: L-4's panel for this offer, in a sentence. */
function LeftOn({ L, panel, basis, start }: { L: Letter; panel: LeavePanel; basis: LeaveBasis; start: ISODate }) {
  const kept = basis === "cash" ? panel.afterTaxCompKept : panel.totalRewardsKept;
  const lost: ReactNode[] = [];
  if (panel.retirementForfeited >= 0.5) {
    lost.push(<span key="k"><Fig id={`forfeit.${L}.k401`} label={`${dollars(panel.retirementForfeited)} of employer 401(k) money not vested`}>{dollars(panel.retirementForfeited)}</Fig> of 401(k) money</span>);
  }
  if (panel.unvestedRsuForfeited >= 0.5) {
    lost.push(<span key="r"><Fig id={`forfeit.${L}.rsu`} label={`${dollars(panel.unvestedRsuForfeited)} of RSUs not vested, at grant value`}>{dollars(panel.unvestedRsuForfeited)}</Fig> of RSUs (at grant value)</span>);
  }
  const bonuses = forfeits(panel.warnings, start);
  return (
    <>
      you'd keep <Fig id={`kept.${L}`} label={`${dollars(kept)} kept ${basis === "cash" ? "after tax" : "in total rewards"}, as paid, if your last day is ${longDate(panel.leaveDate)}`}>
        {dollars(kept)}</Fig> {basis === "cash" ? "after tax" : "in total rewards"}, as paid,{" "}
      {panel.clawbackOwed >= 0.5
        ? <>repay <Fig id={`repay.${L}`} label={`${dollars(panel.clawbackOwed)} of clawbacks owed`}>{dollars(panel.clawbackOwed)}</Fig>,</> : "repay nothing,"}{" "}
      {lost.length ? <>and leave {lost.map((l, k) => <span key={k}>{k ? " and " : ""}{l}</span>)} behind</> : "and leave nothing behind"}
      {bonuses.map((f) => {
        const t = forfeitText(f);
        return (
          <span key={f.index}>; {t.before}<Fig id={`forgone.${L}.${f.index}`} label={`${dollars(f.earned)} earned toward the ${f.period} bonus, forfeited`}>{dollars(f.earned)}</Fig>{t.after}
            {" "}is forfeited</span>
        );
      })}.
    </>
  );
}

/** The bear and bull cases, a month over the stay at its own prices, and what goes wrong in the bear case (L-2's words, B8). */
function BadCase({ L, v, offer, end }: { L: Letter; v: OwnView | null; offer: NonNullable<OwnOffer["input"]>; end: ISODate }) {
  if (!hasRanges(offer)) {
    return <p className="part-note bad-case">Bad case: no ranges entered, so the bear and bull cases are the base case. Add a range in detailed mode (+ range) to see them.</p>;
  }
  if (!v?.bear) return <p className="part-note bad-case">Working out its bad case…</p>;
  const changes = caseChanges(offer, "bear", end, false);
  return (
    <p className="part-note bad-case">
      Bad case, in {v.place} dollars:{" "}
      <Fig id={`own.${L}.bear`} label={`${inDollars(v.place, v.bear.month)} a month over your stay, bear case`}>{dollars(v.bear.month)}</Fig> a month over your stay
      {v.bear.drop !== null && <>, <Fig id={`own.${L}.drop`} label={`${shareText(v.bear.drop)} under the base case, over your stay`}>{shareText(v.bear.drop)}</Fig> under the base case</>}
      {v.bull && <>; in the bull case, <Fig id={`own.${L}.bull`} label={`${inDollars(v.place, v.bull.month)} a month over your stay, bull case`}>{dollars(v.bull.month)}</Fig> a month over your stay</>}.
      {" "}{changes.length ? `In the bear case, ${changes.map(changeText).join("; ")}.` : "Nothing entered changes inside its stay in the bear case."}
    </p>
  );
}

/** Every cliff inside the stay, dated, with what leaving the day before gives up. */
function CliffList({ L, terms }: { L: Letter; terms: OfferTerms }) {
  const lines = cliffLines(terms.cliffs);
  if (!lines.length) return <p className="note" id={`${L}-4-cliffs`}>No cliff inside its stay: nothing pays, vests or stops being repaid on a date that leaving the day before would miss.</p>;
  return (
    <ol className="cliffs" id={`${L}-4-cliffs`} aria-label={`${L}'s cliffs inside its stay, by date`}>
      {lines.map((c) => (c.kind === "steps" ? (
        <li key={`s${c.award}`}>
          <span className="arrival-date">{longDate(c.from)} – {longDate(c.until)}</span> · the {inSentence(c.award.trim() || "award")}'s clawback shrinks{" "}
          {dollars(c.perMonth)} a month: each month worked owes less
        </li>
      ) : (
        <li key={c.i}>
          <span className="arrival-date">{longDate(c.cliff.date)}</span> · {cliffName(c.cliff)},{" "}
          <Fig id={`cliff.${L}.${c.i}`} label={`${cliffName(c.cliff)}, ${dollars(c.cliff.amount)} before tax, ${longDate(c.cliff.date)}`}>{dollars(c.cliff.amount)}</Fig> before
          tax: {cliffCost(c.cliff)}
        </li>
      )))}
    </ol>
  );
}

// ---- A-5: what the benefits are worth -----------------------------------------------------------------------------------------

function Benefits({ ctx, x, open, show }: Part) {
  const L = x.offer.letter;
  const b = x.breakdown!;
  const o = x.input!;
  const t = yearTable(ctx, L);
  const { rows, credited, creditedSum, added, addedSum } = benefitsOf(t);
  const month = addedSum / (12 * b.years);
  const missing = [!o.retirement && "No 401(k) entered: its match isn't counted.", !o.health && "No health plan entered: premiums and out-of-pocket costs aren't counted.",
  ].filter(Boolean) as string[];
  return (
    <section className="part benefits" aria-labelledby={`${L}-5-title`}>
      <PartHead letter={L} n={5} title="What the benefits are worth" />
      <p className="part-lede">
        Over its {b.years}-year stay, the benefits add{" "}
        <Fig id={`a5.${L}.added.sum`} label={`${dollars(addedSum)} over the stay, as paid: total rewards less after-tax pay`}>{dollars(addedSum)}</Fig> to after-tax
        pay, as paid:{" "}
        <Fig id={`a5.${L}.month.sum`} label={`${dollars(month)} a month over your stay, as paid`}>{dollars(month)}</Fig> a month over your stay
        {creditedSum ? <>, with <Fig id={`a5.${L}.credited.sum`} label={`${dollars(creditedSum)} of employer 401(k) money credited over the stay`}>{dollars(creditedSum)}</Fig> of
          employer 401(k) money credited</> : ""}.
      </p>
      {missing.map((m) => <p key={m} className="part-note">{m} Add it in detailed mode.</p>)}
      {o.health?.oopMax ? (
        <p className="part-note">
          A bad health year costs up to the plan's out-of-pocket maximum,{" "}
          <Fig id={`in.${L}.health.oopMax`} label={`Out-of-pocket maximum, ${dollars(o.health.oopMax)} a year`}>{dollars(o.health.oopMax)}</Fig> a year, on top of the premiums.
        </p>
      ) : null}
      <p className="part-more">{show}</p>
      {open && (<>
        <div className="l6-scroll" role="region" aria-label={`${L}-5, the benefits by year`} tabIndex={0} id={`${L}-5-years`}>
          <table className="year-table benefits-table">
            <caption className="sr-only">{L}'s benefits and health costs by employment year, $, as paid</caption>
            <thead>
              <tr><th scope="col">$, as paid</th>{t.years.map((y) => <th key={y.n} scope="col">Year {y.n}</th>)}<th scope="col">Years 1–{t.n}</th></tr>
            </thead>
            <tbody>
              {creditedSum > 0 && (
                <tr>
                  <th scope="row">Employer 401(k) money credited</th>
                  {credited.map((v, k) => <td key={k}><Fig id={`a5.${L}.credited.${k + 1}`} label={`Employer 401(k) money credited in year ${k + 1}, ${dollars(v)}`}>{figure(v)}</Fig></td>)}
                  <td><Fig id={`a5.${L}.credited.sum`} label={`Employer 401(k) money credited over the stay, ${dollars(creditedSum)}`}>{figure(creditedSum)}</Fig></td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.line}>
                  <th scope="row">{row.lead && <span className="bridge-lead">{row.lead}</span>}{row.label}{row.gloss && <span className="bridge-gloss">{row.gloss}</span>}</th>
                  {row.values.map((v, k) => (
                    <td key={k}><Fig id={`l6y.${L}.${row.line}.${k + 1}`} label={`${L}, year ${k + 1}, line ${row.no}, ${row.label}, ${dollars(v)}`}>{moneyText(v)}</Fig></td>
                  ))}
                  <td><Fig id={`l6y.${L}.${row.line}.sum`} label={`${L}, years 1 to ${t.n}, line ${row.no}, ${row.label}, ${dollars(row.sum)}`}>{moneyText(row.sum)}</Fig></td>
                </tr>
              ))}
              <tr className="rule-double">
                <th scope="row">Total rewards less after-tax pay</th>
                {added.map((v, k) => <td key={k}><Fig id={`a5.${L}.added.${k + 1}`} label={`Total rewards less after-tax pay in year ${k + 1}, ${dollars(v)}`}>{moneyText(v)}</Fig></td>)}
                <td><Fig id={`a5.${L}.added.sum`} label={`Total rewards less after-tax pay over the stay, ${dollars(addedSum)}`}>{moneyText(addedSum)}</Fig></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="part-csv"><CsvButton table={{ kind: "part", letter: L, part: "a5" }} name={`${L}-5, the benefits by year`} /></p>
      </>)}
    </section>
  );
}

// ---- A-6: tax, and warnings ------------------------------------------------------------------------------------------------------

const WARN_KINDS: Array<{ kind: WarningKind; icon: string; title: string }> = [
  { kind: "changes", icon: "⚠", title: KIND_TITLE.changes },
  { kind: "notModeled", icon: "ⓘ", title: KIND_TITLE.notModeled },
  { kind: "cash", icon: "$", title: KIND_TITLE.cash },
];

function TaxAndWarnings({ x, open, show, ctx, prices }: Part) {
  const L = x.offer.letter;
  const b = x.breakdown!;
  const d = b.detail;
  const { edit } = useApi();
  const rows = taxYearsOf(d, b.window);
  const lastYear = Number(dayBefore(b.window.end).slice(0, 4));
  const groups = stayWarnings([...d.warnings, ...d.withholding.warnings], lastYear);
  const v = viewOfOwn(ctx, x, prices);
  return (
    <section className="part tax-warnings" id={`${L}-6`} aria-labelledby={`${L}-6-title`}>
      <PartHead letter={L} n={6} title="Tax, and warnings" />
      {v?.tax && (
        <p className="part-lede">
          Tax takes <Fig id={`own.${L}.rate`} label={`${(v.tax.rate * 100).toFixed(1)}% of its pay over your stay, in tax`}>{(v.tax.rate * 100).toFixed(1)}%</Fig> of
          its pay over your stay: household tax with the offer less without it, ÷ its pay. That isn't your top rate.
        </p>
      )}
      {!groups.length ? (
        <p className="warn-none">
          No warnings over its stay. Checked: the 401(k), HSA and perk limits, the bonus cutoff, an employer state's remote-work rule, and federal
          withholding against the tax on bonuses and RSU vests.
        </p>
      ) : WARN_KINDS.map(({ kind, icon, title }) => {
        const list = groups.filter((g) => WARNING_KIND[g[0].code] === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className={`warn-group warn-${kind}`}>
            <p className="warn-head"><span className="warn-icon" aria-hidden="true">{icon}</span> {title}</p>
            <ul>
              {list.map((group, k) => {
                const path = WARNING_AT[group[0].code];
                return (
                  <li key={k} className="warn-item">
                    {group[0].code === "withholdingShortfall" ? <Shortfall L={L} years={d.withholding.years} warnings={group} /> : warningWords(group)}
                    {path && <>{" "}<button type="button" className="link" onClick={() => edit({ letter: L, path })}>Show at the field</button></>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="part-more">{show}</p>
      {open && (<>
        <div className="l6-scroll" role="region" aria-label={`${L}-6, tax by calendar year`} tabIndex={0} id={`${L}-6-years`}>
          <table className="year-table tax-years-table">
            <caption className="sr-only">{L}'s tax by calendar year: its pay, its tax by kind and its rate, $, as paid</caption>
            <thead>
              <tr>
                <th scope="col">Calendar year</th><th scope="col">Pay ($)</th><th scope="col">Federal ($)</th><th scope="col">FICA ($)</th>
                <th scope="col">State ($)</th><th scope="col">Local ($)</th><th scope="col">Tax ($)</th><th scope="col">Rate, of the year's pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year}>
                  <th scope="row">{r.year}{r.projectedLaw ? " (projected law)" : ""}</th>
                  {(["gross", "federal", "fica", "state", "local", "tax"] as const).map((k) => (
                    <td key={k}><Fig id={`a6.${L}.${r.year}.${k}`} label={`${r.year}, ${k === "gross" ? "pay" : k === "tax" ? "tax" : `${k} tax`}, ${dollars(r.values[k])}`}>
                      {figure(r.values[k])}</Fig></td>
                  ))}
                  <td><Fig id={`a6.${L}.${r.year}.rate`} label={`${rateText(r.rate)} of its ${r.year} pay, in tax`}>{rateText(r.rate)}</Fig> of its {r.year} pay</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="part-csv"><CsvButton table={{ kind: "part", letter: L, part: "a6" }} name={`${L}-6, tax by calendar year`} /></p>
      </>)}
    </section>
  );
}

/** "Federal withholding falls short of the federal income tax on its pay by $1,173 for 2028…": L-5's line, for this offer. */
function Shortfall({ L, years: wy, warnings }: { L: Letter; years: Array<{ year: number; federalIncomeTax: number; withheld: { regular: number; supplemental: number } }>; warnings: OfferWarning[] }) {
  const years = warnings.flatMap((w) => (w.code === "withholdingShortfall" ? [w.params] : []));
  const supplemental = years.some((y) => y.supplemental);
  return (
    <>
      Federal withholding falls short of the federal income tax on its pay by{" "}
      {years.map((p, i) => {
        const y = wy.find((q) => q.year === p.year);
        const short = dollars(y ? withholdingParts(y).short : p.balanceDue);
        return (
          <span key={p.year}>
            {i ? (i === years.length - 1 ? " and " : ", ") : ""}
            <Fig id={`wh.${L}.${p.year}`} label={`${short} short of the federal tax on ${p.year} pay`}>{short}</Fig> for {p.year}
          </span>
        );
      })}, owed {years.length > 1 ? "each following April" : `in April ${years[0].year + 1}`}
      {supplemental ? ": bonuses and RSU vests are withheld at the flat 22% supplemental rate, below the real rate on them" : ""}. Raising
      your withholding on Form W-4 spreads it out.
    </>
  );
}

// ---- A-7: the work ---------------------------------------------------------------------------------------------------------------

function WorkPart({ ctx, letter, open, job, workKey, requestSlow, ready, slow, status, dispatch, ui }: PartsProps & {
  letter: Letter; open: boolean; job: ReturnType<typeof workJob> | null; workKey: string | null;
}) {
  // The payments and tax years, only while the tables are open.
  useEffect(() => {
    if (open && ready && job) requestSlow(job, workKey!);
    // The job is compared by value (its key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, workKey, requestSlow]);
  // While an input has a problem, the last valid tables, dimmed with the rest of the breakdown: nothing newer is on its way.
  const fresh = ((slow.work.key === workKey && !slow.work.updating) || status === "invalid") && !!ctx.own?.work?.[letter];
  return <TheWork ctx={ctx} letter={letter} open={open} fresh={fresh} error={slow.work.error}
    onOpen={(o) => dispatch({ type: "ui", patch: { work: { ...ui.work, open: o } } })} />;
}

