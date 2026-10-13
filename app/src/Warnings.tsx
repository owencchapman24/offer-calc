import { useRef } from "react";
import type { OfferWarning } from "../../src/offer/types";
import { Fig, useApi, useRovingTicks } from "./figures";
import type { WorkContext } from "./metrics";
import type { Letter } from "./model";
import { dayBefore, dollars } from "./text";
import { type Stale, staleClass, StaleNote, Stamp, TickLegend } from "./ui";
import { WARNING_AT, withholdingParts } from "./warningAt";
import { stayWarnings, WARNING_KIND, type WarningKind } from "./warningKinds";
import { warningWords as words } from "./warningWords";

// L-5 · Warnings (docs/ui-design.md §4.7): every engine warning for your stay in one place, grouped by
// kind then offer, each with "Show at the field" where it has one. Detailed mode shows them at their
// fields too; leave-date warnings are in L-4's panel; a cost or benefit counted for some offers but not
// others stays under the verdict. Status colors always come with an icon and a label (§9).

const KINDS: Array<{ kind: WarningKind; icon: string; title: string }> = [
  { kind: "changes", icon: "⚠", title: "Changes your numbers" },
  { kind: "notModeled", icon: "ⓘ", title: "Not modeled: may cost you" },
  { kind: "cash", icon: "$", title: "Cash timing" },
];

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
