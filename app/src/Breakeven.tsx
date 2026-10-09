import { useEffect, useRef } from "react";
import type { RentFlipResult } from "../../src/offer/types";
import { changeText, inSentence, rentCity, rentTies, type TieLine, type TieView, tieView } from "./breakevenModel";
import { Fig, useRovingTicks } from "./figures";
import { useOnScreen } from "./lazy";
import { BASIS_PHRASE, type WorkContext } from "./metrics";
import type { Letter } from "./model";
import { type CompareRequest, tieJob, type Ties } from "./protocol";
import { dayBefore, dollars, figure, longDate } from "./text";
import { type Stale, StaleNote, Stamp, TickLegend } from "./ui";
import type { Engine, SlowState } from "./useEngine";

// L-3 · What it would take (docs/ui-design.md §4.6): for each offer behind the winner, the starting
// salary, the cash award and (after rent) the rent that would tie it; and the winner's cushion against the
// runner-up. Base case, present value over your stay's window, the rank list's. Its numbers come from the
// worker's slow lane (slowJobs.ts), worked out while L-3 is on screen.

export interface BreakevenProps {
  ctx: WorkContext;
  sample: boolean;
  /** The comparison's request: the offers L-3 ties, in the comparison's order. */
  compare: CompareRequest | null;
  /** The comparison is current and valid: the slow job can start. */
  ready: boolean;
  /** The comparison itself is from earlier inputs (being worked out, or they have a problem). */
  status?: Stale;
  ties: SlowState<Ties>;
  requestSlow: Engine["requestSlow"];
}

const Who = ({ l }: { l: Letter }) => <strong className={`who offer-${l}`}>{l}</strong>;

export function Breakeven(p: BreakevenProps) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const onScreen = useOnScreen(ref);
  const r = p.ctx.results;
  const c = p.compare;
  const basis = r ? (r.view.basis === "perHour" ? r.view.perHourOf : r.view.basis) : null;
  const lead = r && basis ? r.view.row.leads[basis] : undefined;
  const job = c && basis && lead ? tieJob("breakeven", c, basis, lead) : null;
  const key = job && JSON.stringify(job);
  const { requestSlow, ready } = p;
  useEffect(() => {
    if (onScreen && ready && job) requestSlow(job, key!);
    // The job is compared by value (its key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScreen, ready, key, requestSlow]);

  if (!r || !c || !basis || !lead) return <section ref={ref} className="later" />;
  const ties = p.ties.result;
  const v = ties ? tieView(ties, r.letters, c.offers) : null;
  const fresh = p.ties.key === key && !p.ties.updating;
  const status: Stale = p.status ?? (fresh ? null : "updating");
  const row = r.view.row;
  const years = row.years;
  return (
    <section ref={ref} className={`schedule ties${status ? " is-updating" : ""}`} aria-labelledby="l3-title" aria-busy={status === "updating"}
      data-ready={fresh ? "1" : "0"} data-fill-ms={p.ties.ms !== null ? Math.round(p.ties.ms) : undefined}>
      <header className="schedule-head">
        <h2 id="l3-title"><span className="ref">L-3</span> What it would take</h2>
        {p.sample && <Stamp>Illustrative samples</Stamp>}
        <StaleNote status={status} />
      </header>
      {!v ? <p className="note">{p.ties.error ?? "Working out what would tie…"}</p> : (
        <>
          <p className="tie-scope">
            To tie <Who l={v.winner} />: its {years}-year total {BASIS_PHRASE[v.basis]},{" "}
            <Fig id="tie.target" label={`${figure(v.target)}, ${v.winner}'s total`}>{figure(v.target)}</Fig> in today's dollars, base case, over your
            stay ({longDate(row.window.start)} – {longDate(dayBefore(row.window.end))}). Each line changes one input and leaves the rest as entered.
          </p>
          {r.view.basis === "perHour" && (
            <p className="note">
              Per hour can't be tied by one number, so these tie the total it divides by your hours: {BASIS_PHRASE[v.basis]}.
            </p>
          )}
          <ul className="tie-offers">
            {v.behind.map((x) => <Behind key={x.letter} x={x} v={v} ctx={p.ctx} />)}
            <Cushion x={v.cushion} v={v} ctx={p.ctx} />
          </ul>
        </>
      )}
      <p className="caption">
        Each figure is found to the cent: enter it, and the two totals match to within a few cents. Salary moves more than a cash award,
        since what scales with it moves too. These are what it would take to tie, not advice on what to ask for.{" "}
        <a href="#/method/M-7.4">Methodology M-7.4</a>.
        {p.sample ? " (Sample inputs.)" : ""}
      </p>
      <TickLegend />
    </section>
  );
}

/** The city of an offer's rent, from your stay's projection. */
function cityOf(ctx: WorkContext, letter: Letter): string {
  const r = ctx.results!;
  const name = r.detail?.offers[r.letters.indexOf(letter)]?.costOfLiving?.area.name;
  return name ? rentCity(name) : "local";
}

/** An offer behind the winner: what would tie it. */
function Behind({ x, v, ctx }: { x: TieLine & { letter: Letter }; v: TieView; ctx: WorkContext }) {
  const { letter: L, row } = x;
  const s = row.salary;
  const cash = row.cash;
  return (
    <li className="tie-offer">
      <p className="tie-line">
        <Who l={L} /> <span className="tie-lever">Starting salary</span>{" "}
        <Fig id={`in.${L}.salary.annual`} label={`${dollars(s.from)}, ${L}'s salary as entered`}>{dollars(s.from)}</Fig> →{" "}
        {s.outcome === "tie" ? (
          <><Fig id={`tie.${L}.salary`} label={`${dollars(s.to)}, the salary that ties ${v.winner}`}>{dollars(s.to)}</Fig>{" "}
            <span className="tie-change">({changeText(s)})</span></>
        ) : "no salary ties"}
      </p>
      {cash && (
        <p className="tie-line tie-or">
          or {x.cash.added ? x.cash.name : <span className="tie-lever">{x.cash.name}</span>}:{" "}
          {!x.cash.added && <><Fig id={`in.${L}.cashAwards.0.amount`} label={`${dollars(cash.from)}, ${L}'s cash award as entered`}>{dollars(cash.from)}</Fig> → </>}
          {cash.outcome === "tie" ? (
            <><Fig id={`tie.${L}.cash`} label={`${dollars(cash.to)}, the cash award that ties ${v.winner}`}>{dollars(cash.to)}</Fig>
              {!x.cash.added && <> <span className="tie-change">(+{dollars(cash.increase)})</span></>}</>
          ) : "no amount ties"}
        </p>
      )}
      <RentLine r={row.rent} letter={L} winner={v.winner} ctx={ctx} />
      <p className="tie-note">{x.scales}</p>
    </li>
  );
}

/** "C still wins unless your New York rent for A is under $3,292 a month (now $3,800, first lease year)." */
function RentLine({ r, letter, winner, ctx }: { r: RentFlipResult | undefined; letter: Letter; winner: Letter; ctx: WorkContext }) {
  if (!r || r.outcome === "noRent") return null;
  const city = cityOf(ctx, letter);
  const now = <Fig id={`in.${letter}.costOfLiving.monthlyRent`} label={`${dollars(r.from)}, ${letter}'s rent`}>{dollars(r.from)}</Fig>;
  if (!rentTies(r)) {
    return <p className="tie-line tie-or">Even rent-free in {city}, <Who l={letter} /> trails <Who l={winner} /> (its rent now {now} a month).</p>;
  }
  return (
    <p className="tie-line tie-or">
      <Who l={winner} /> still wins unless your {city} rent for <Who l={letter} /> is under{" "}
      <Fig id={`tie.${letter}.rent`} label={`${dollars(r.to)} a month, the rent that ties ${winner}`}>{dollars(r.to)}</Fig> a month (now {now}, first
      lease year).
    </p>
  );
}

/** The winner against the runner-up: how far it could give way before the runner-up ties. */
function Cushion({ x, v, ctx }: { x: TieLine & { letter: Letter }; v: TieView; ctx: WorkContext }) {
  const { letter: W, row } = x;
  const R = v.runnerUp;
  const s = row.salary;
  const cash = row.cash;
  const r = row.rent;
  return (
    <li className="tie-offer is-winner">
      <p className="tie-line"><Who l={W} /> <span className="tie-lever">leads.</span> Its cushion over <Who l={R} />, the runner-up:</p>
      <p className="tie-line tie-or">
        {s.outcome === "tie" ? (
          <>Its starting salary could fall from{" "}
            <Fig id={`in.${W}.salary.annual`} label={`${dollars(s.from)}, ${W}'s salary as entered`}>{dollars(s.from)}</Fig> to{" "}
            <Fig id={`tie.${W}.salary`} label={`${dollars(s.to)}, the salary at which ${R} ties`}>{dollars(s.to)}</Fig>{" "}
            <span className="tie-change">({changeText(s)})</span> before <Who l={R} /> ties.</>
        ) : <>It leads <Who l={R} /> even at a $0 starting salary.</>}
      </p>
      {cash && (
        <p className="tie-line tie-or">
          {cash.outcome === "alreadyAhead" ? (
            !x.cash.added ? (
              <><Who l={W} /> still leads <Who l={R} /> with no {inSentence(x.cash.label)} (now{" "}
                <Fig id={`in.${W}.cashAwards.0.amount`} label={`${dollars(cash.from)}, ${W}'s cash award as entered`}>{dollars(cash.from)}</Fig>,
                paid {x.cash.paid}).</>
            ) : <><Who l={W} /> has no sign-on, and leads <Who l={R} /> without one.</>
          ) : (
            <>Its {inSentence(x.cash.label)} (paid {x.cash.paid}) could fall from{" "}
              <Fig id={`in.${W}.cashAwards.0.amount`} label={`${dollars(cash.from)}, ${W}'s cash award as entered`}>{dollars(cash.from)}</Fig> to{" "}
              <Fig id={`tie.${W}.cash`} label={`${dollars(cash.to)}, the cash award at which ${R} ties`}>{dollars(cash.to)}</Fig> before <Who l={R} /> ties.</>
          )}
        </p>
      )}
      {r && r.outcome === "tie" && (
        <p className="tie-line tie-or">
          <Who l={W} />'s lead goes if your {cityOf(ctx, W)} rent for <Who l={W} /> is over{" "}
          <Fig id={`tie.${W}.rent`} label={`${dollars(r.to)} a month, the rent at which ${R} ties`}>{dollars(r.to)}</Fig> a month (now{" "}
          <Fig id={`in.${W}.costOfLiving.monthlyRent`} label={`${dollars(r.from)}, ${W}'s rent`}>{dollars(r.from)}</Fig>, first lease year).
        </p>
      )}
      <p className="tie-note">{x.scales}</p>
    </li>
  );
}
