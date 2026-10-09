import { type Dispatch, useRef } from "react";
import type { FilingStatus } from "../../src/tax/types";
import { ASSUMPTIONS } from "./model";
import type { Action, Session } from "./session";
import { dollars, longDate } from "./text";
import { HELP } from "./help";
import { Help, MoneyInput } from "./ui";
import { TickButton, Trace, useRovingTicks } from "./Tickmarks";

const FILING: Array<[FilingStatus, string]> = [["single", "Single"], ["joint", "Married, filing jointly"], ["headOfHousehold", "Head of household"]];

/** About you: shared by every offer. Defaults carry a D tickmark that says why. */
export function About({ session, dispatch, today, wagesYear }: {
  session: Session; dispatch: Dispatch<Action>; today: string; /** The earliest start date's calendar year. */ wagesYear: number;
}) {
  const h = session.household;
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  return (
    <section ref={ref} className="about" aria-labelledby="about-title">
      <h2 id="about-title" className="strip-title">About you</h2>
      <div className="about-fields">
        <Trace id="about.filing" className="about-field">
          <span className="about-label">
            <label htmlFor="about-filing">Filing status</label>
            {h.filingStatus === "single" && <TickButton id="about.filing" label="filing status Single" />}
          </span>
          <select id="about-filing" value={h.filingStatus} data-help="about.filing" aria-describedby="hint-about-filing"
            onChange={(e) => dispatch({ type: "household", patch: { filingStatus: e.target.value as FilingStatus } })}>
            {FILING.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <AboutHelp k="about.filing" />
        </Trace>
        <Trace id="about.stay" className="about-field">
          <span className="about-label">
            <label htmlFor="stay">How long do you expect to stay?</label>
            {h.stayYears === 4 && <TickButton id="about.stay" label="a 4-year stay" />}
          </span>
          <select id="stay" value={h.stayYears} data-help="about.stay" aria-describedby="hint-about-stay"
            onChange={(e) => dispatch({ type: "household", patch: { stayYears: Number(e.target.value) } })}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} {y === 1 ? "year" : "years"}</option>)}
          </select>
          <AboutHelp k="about.stay" />
        </Trace>
        <Trace id="about.wages" className="about-field">
          <span className="about-label">
            <label htmlFor="about-wages">Other wages in {wagesYear}</label>
            {h.otherWagesThisYear === 0 && <TickButton id="about.wages" label={`other wages of ${dollars(0)}`} />}
          </span>
          <MoneyInput id="about-wages" label={`Your wages from another job in ${wagesYear}`} value={h.otherWagesThisYear} help="about.wages"
            describedBy="hint-about-wages" onChange={(v) => dispatch({ type: "household", patch: { otherWagesThisYear: v ?? 0 } })} />
          <AboutHelp k="about.wages" />
        </Trace>
        <Trace id="about.healthUsage" className="about-field">
          <span className="about-label">
            <label htmlFor="about-health">Health use</label>
            {!h.healthUsage && <TickButton id="about.healthUsage" label="medium health use" />}
          </span>
          <select id="about-health" value={h.healthUsage ?? "medium"} data-help="about.healthUsage" aria-describedby="hint-about-healthUsage"
            onChange={(e) => dispatch({ type: "household", patch: { healthUsage: e.target.value as "low" | "medium" | "high" } })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <AboutHelp k="about.healthUsage" />
        </Trace>
        <Trace id="about.prices" className="about-field">
          <span className="about-label">Prices in<TickButton id="about.prices" label="prices in the U.S. average" /></span>
          <span className="about-static">U.S. average</span>
        </Trace>
      </div>
      <p className="assumptions">
        Assumptions: {ASSUMPTIONS.inflation * 100}% inflation (tax law and rent growth) · {ASSUMPTIONS.discountRate * 100}% discount
        rate · present values as of today, {longDate(today)} · base case.
      </p>
    </section>
  );
}

function AboutHelp({ k }: { k: string }) {
  const h = HELP[k];
  return <Help hint={h.hint} hintId={`hint-${k.replace(/\./g, "-")}`} section={h.section}>{h.help}</Help>;
}
