import { useRef } from "react";
import type { ISODate, MonthDay, OfferWarning } from "../../src/offer/types";
import { Fig, useApi, useRovingTicks } from "./figures";
import type { WorkContext } from "./metrics";
import type { Letter } from "./model";
import { dayBefore, dollars, longDate } from "./text";
import { type Stale, staleClass, StaleNote, Stamp, TickLegend } from "./ui";
import { WARNING_AT, withholdingParts } from "./warningAt";
import { stayWarnings, WARNING_KIND, type WarningKind, yearOf } from "./warningKinds";

// L-5 · Warnings (docs/ui-design.md §4.7): every engine warning for your stay in one place, grouped by
// kind then offer, each with "Show at the field" where it has one. Detailed mode shows them at their
// fields too; leave-date warnings are in L-4's panel; a cost or benefit counted for some offers but not
// others stays under the verdict. Status colors always come with an icon and a label (§9).

const KINDS: Array<{ kind: WarningKind; icon: string; title: string }> = [
  { kind: "changes", icon: "⚠", title: "Changes your numbers" },
  { kind: "notModeled", icon: "ⓘ", title: "Not modeled: may cost you" },
  { kind: "cash", icon: "$", title: "Cash timing" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (m: MonthDay) => `${MONTHS[m.month - 1]} ${m.day}`;
const period = (from: ISODate, to: ISODate) =>
  (from.endsWith("-01-01") && to === `${from.slice(0, 4)}-12-31` ? from.slice(0, 4) : `${longDate(from)} – ${longDate(to)}`);

const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "2028", "2028 and 2030", "2028 to 2031" (three or more years in a row). */
function yearsText(years: number[]): string {
  const ys = [...years].sort((a, b) => a - b);
  const runs = ys.length >= 3 && ys.every((y, i) => !i || y === ys[i - 1] + 1);
  return runs ? `${ys[0]} to ${ys[ys.length - 1]}` : join(ys.map(String));
}
/** A limit in one year, or how it rises over several (it's indexed each year). */
function limitsText(group: OfferWarning[], limit: (w: OfferWarning) => number, per = ""): string {
  const first = group[0];
  const last = group[group.length - 1];
  return group.length === 1 ? `${dollars(limit(first))}${per}`
    : `${dollars(limit(first))}${per} in ${yearOf(first)}, rising to ${dollars(limit(last))}${per} in ${yearOf(last)}`;
}

/** A warning in words: one kind of warning, its years listed (the withholding shortfall is written with its figures, below). */
function words(group: OfferWarning[]): string {
  const w = group[0];
  const years = yearsText(group.flatMap((x) => (yearOf(x) === null ? [] : [yearOf(x)!])));
  const lim = (x: OfferWarning) => ("limit" in x.params ? (x.params as { limit: number }).limit : 0);
  switch (w.code) {
    case "k401Cap":
      return `Its 401(k) deferrals reach the 402(g) limit before the end of ${years} (${limitsText(group, lim)}): deferrals and the match stop for `
        + `the rest of ${group.length > 1 ? "each of those years" : "that year"} (no true-up assumed).`;
    case "hsaCap":
      return `Its HSA contributions reach the limit, yours plus the employer's, in ${years} (${limitsText(group, lim)}): yours are capped there.`;
    case "section127Cap": return `Education help above the limit (${limitsText(group, lim)}) is taxable pay in ${years}: only the limit is counted tax-free.`;
    case "commuterCap": {
      const monthly = (x: OfferWarning) => ("monthlyLimit" in x.params ? (x.params as { monthlyLimit: number }).monthlyLimit : 0);
      return `Commuter benefits above the limit (${limitsText(group, monthly, " a month")}) are taxable pay in ${years}: only the limit is counted.`;
    }
    case "bonusCutoff":
      return `It starts ${longDate(w.params.start)}, on or after the ${monthDay(w.params.cutoff)} bonus cutoff, so the bonus for `
        + `${period(w.params.periodFrom, w.params.periodTo)} pays nothing.`;
    case "convenienceRule": {
      const { residenceState: r, employerState: e } = w.params;
      return `You'd live in ${r} and work for an employer in ${e}. ${e}'s convenience-of-employer rule may tax your remote days there too, and ${r}'s `
        + `credit may not offset it fully. This projection taxes ${r} residence only.`;
    }
    default: return "";
  }
}

/** One kind of warning for one offer, over your stay's years. */
interface Item { letter: Letter; group: OfferWarning[] }

/** Every warning for your stay that L-5 lists, by offer, in the comparison's order. */
export function warningItems(ctx: WorkContext): Item[] {
  const r = ctx.results;
  if (!r?.detail) return [];
  const lastYear = Number(dayBefore(r.view.row.window.end).slice(0, 4));
  return r.letters.flatMap((letter, i) => {
    const d = r.detail!.offers[i];
    return stayWarnings([...d.warnings, ...d.withholding.warnings], lastYear).map((group) => ({ letter, group }));
  });
}

export function Warnings({ ctx, sample, status = null }: { ctx: WorkContext; sample: boolean; /** Its figures are from earlier inputs. */ status?: Stale }) {
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  const { edit } = useApi();
  const r = ctx.results;
  if (!r?.detail || r.detail.years !== r.view.row.years) return <section ref={ref} id="l5" className="later" />;
  const items = warningItems(ctx);
  return (
    <section ref={ref} id="l5" className={`schedule warnings${staleClass(status)}`} aria-labelledby="l5-title" aria-busy={status === "updating"}>
      <header className="schedule-head">
        <h2 id="l5-title" tabIndex={-1}><span className="ref">L-5</span> Warnings</h2>
        {sample && <Stamp>Illustrative samples</Stamp>}
        <StaleNote status={status} />
      </header>
      {!items.length ? (
        <p className="warn-none">
          None of these offers raises a warning over your stay. Checked: the 401(k), HSA and perk limits, the bonus cutoff, an employer
          state's remote-work rule, and federal withholding against the tax on bonuses and RSU vests.
        </p>
      ) : KINDS.map(({ kind, icon, title }) => {
        const list = items.filter((x) => WARNING_KIND[x.group[0].code] === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className={`warn-group warn-${kind}`}>
            <p className="warn-head"><span className="warn-icon" aria-hidden="true">{icon}</span> {title}</p>
            <ul>
              {list.map(({ letter, group }, i) => {
                const path = WARNING_AT[group[0].code];
                return (
                  <li key={`${letter}${i}`} className="warn-item">
                    <strong className={`who offer-${letter}`}>{letter}</strong>{" "}
                    {group[0].code === "withholdingShortfall" ? <Shortfall ctx={ctx} letter={letter} warnings={group} /> : words(group)}
                    {path && (
                      <>{" "}<button type="button" className="link" onClick={() => edit({ letter, path })}>Show at the field</button></>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="caption">
        Leaving early sets off warnings of its own (a bonus forfeited; Social Security and Medicare on a clawback repaid in a later year): they're
        in L-4's panel, for the last day you pick. A cost or benefit counted for some offers but not others is named under the verdict. What the
        model leaves out is listed in <a href="#/method/M-10">Methodology M-10</a>.{sample ? " (Sample inputs.)" : ""}
      </p>
      <TickLegend />
    </section>
  );
}

/** "Federal withholding falls short of the federal income tax on its pay by $1,173 for 2028 and $3,284 for 2030…" */
function Shortfall({ ctx, letter, warnings }: { ctx: WorkContext; letter: Letter; warnings: OfferWarning[] }) {
  const r = ctx.results!;
  const d = r.detail!.offers[r.letters.indexOf(letter)];
  const years = warnings.flatMap((w) => (w.code === "withholdingShortfall" ? [w.params] : []));
  const supplemental = years.some((y) => y.supplemental);
  return (
    <>
      Federal withholding falls short of the federal income tax on its pay by{" "}
      {years.map((p, i) => {
        const y = d.withholding.years.find((x) => x.year === p.year);
        const short = dollars(y ? withholdingParts(y).short : p.balanceDue);
        return (
          <span key={p.year}>
            {i ? (i === years.length - 1 ? " and " : ", ") : ""}
            <Fig id={`wh.${letter}.${p.year}`} label={`${short} short of the federal tax on ${p.year} pay`}>{short}</Fig> for {p.year}
          </span>
        );
      })}, owed {years.length > 1 ? "each following April" : `in April ${years[0].year + 1}`}
      {supplemental ? ": bonuses and RSU vests are withheld at the flat 22% supplemental rate, below the real rate on them" : ""}. Raising
      your withholding on Form W-4 spreads it out.
    </>
  );
}
