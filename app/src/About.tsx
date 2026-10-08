import type { Dispatch } from "react";
import type { FilingStatus } from "../../src/tax/types";
import { ASSUMPTIONS } from "./model";
import type { Action, Session } from "./session";
import { longDate } from "./text";
import { Help, MoneyInput, Tick } from "./ui";

const FILING: Array<[FilingStatus, string]> = [["single", "Single"], ["joint", "Married, filing jointly"], ["headOfHousehold", "Head of household"]];

/** About you: shared by every offer. */
export function About({ session, dispatch, today, wagesYear }: {
  session: Session; dispatch: Dispatch<Action>; today: string; /** The earliest start date's calendar year. */ wagesYear: number;
}) {
  const h = session.household;
  return (
    <section className="about" aria-labelledby="about-title">
      <h2 id="about-title" className="strip-title">About you</h2>
      <div className="about-fields">
        <label className="about-field">
          <span className="about-label">Filing status{h.filingStatus === "single" && <Tick kind="default" note="most new grads file single" />}</span>
          <select value={h.filingStatus} onChange={(e) => dispatch({ type: "household", patch: { filingStatus: e.target.value as FilingStatus } })}>
            {FILING.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <div className="about-field">
          <label htmlFor="stay" className="about-label">
            How long do you expect to stay?{h.stayYears === 4 && <Tick kind="default" note="a typical first-job tenure" />}
          </label>
          <select id="stay" value={h.stayYears} onChange={(e) => dispatch({ type: "household", patch: { stayYears: Number(e.target.value) } })}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} {y === 1 ? "year" : "years"}</option>)}
          </select>
          <Help hint="Sets how many years we compare.">
            We compare every offer over the same stretch, starting on the earliest start date. Pay after that isn't counted.
            The row under the verdict shows whether the winner changes if you stay 2, 3, 4 or 5 years.
          </Help>
        </div>
        <div className="about-field">
          <span className="about-label">Other wages in {wagesYear}{h.otherWagesThisYear === 0 && <Tick kind="default" />}</span>
          <MoneyInput label={`Your wages from another job in ${wagesYear}`} value={h.otherWagesThisYear}
            onChange={(v) => dispatch({ type: "household", patch: { otherWagesThisYear: v ?? 0 } })} />
          <Help hint="An internship or the job you're leaving.">
            Pay you earn in {wagesYear}, the year the earliest offer starts, before the new job begins. It's taxed in the
            same year, so it changes the new job's first-year tax. Leave it at $0 if there's none.
          </Help>
        </div>
        <div className="about-field">
          <span className="about-label">Prices in<Tick kind="default" /></span>
          <span className="about-static">U.S. average</span>
        </div>
      </div>
      <p className="assumptions">
        Assumptions: {ASSUMPTIONS.inflation * 100}% inflation (tax law and rent growth) · {ASSUMPTIONS.discountRate * 100}% discount
        rate · present values as of today, {longDate(today)} · base case.
      </p>
    </section>
  );
}
