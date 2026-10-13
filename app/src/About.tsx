import { type Dispatch, useEffect, useRef, useState } from "react";
import { CITIES } from "../../src/col/cities";
import type { FilingStatus } from "../../src/tax/types";
import { ASSUMPTIONS } from "./model";
import { priceWords, US_PRICES } from "./prices";
import type { Action, Session } from "./session";
import { dollars, longDate } from "./text";
import { quickHelp } from "./fields";
import { HELP } from "./help";
import { useLazyModule } from "./lazy";
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
          <span className="about-label">
            <label htmlFor="about-prices">Prices in</label>
            {h.pricesIn === US_PRICES && <TickButton id="about.prices" label="prices in the U.S. average" />}
          </span>
          <PricesField code={h.pricesIn} set={(pricesIn) => dispatch({ type: "household", patch: { pricesIn } })} />
          <AboutHelp k="about.prices" />
        </Trace>
      </div>
      <p className="assumptions">
        Assumptions: {ASSUMPTIONS.inflation * 100}% inflation (tax law and rent growth) · {ASSUMPTIONS.discountRate * 100}% discount
        rate · present values as of today, {longDate(today)} · base case.
      </p>
    </section>
  );
}

const US_NAME = "U.S. average";
const PLACE_BY_NAME = new Map([[US_NAME.toLowerCase(), US_PRICES], ...CITIES.map((c) => [c.name.toLowerCase(), c.code] as [string, string])]);

/**
 * "Prices in" (docs/ui-design.md §5, item 6): the U.S. average, or a city you know. It shows the place with a Change
 * button, as the ledger's city does; Change opens a search of the city list, with the U.S. average first.
 */
function PricesField({ code, set }: { code: string; set: (code: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // After a pick, Escape or "Use the U.S. average", focus goes to Change (what had it is gone); not after clicking elsewhere.
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    document.getElementById("about-prices")?.focus();
  }, [editing, code]);
  const close = () => { refocus.current = true; setEditing(false); };
  const p = priceWords(code);
  const current = p.us ? US_NAME : p.name;
  if (!editing) {
    return (
      <span className="about-static prices-in">
        {current}{" "}
        <button id="about-prices" type="button" className="link" data-help="about.prices" aria-describedby="hint-about-prices"
          onClick={() => { setDraft(""); setEditing(true); }} aria-label={`Change the prices figures are in, now ${current}`}>Change</button>
        {!p.us && <>{" · "}<button type="button" className="link" onClick={() => { refocus.current = true; set(US_PRICES); }}>Use the U.S. average</button></>}
      </span>
    );
  }
  return (
    <span className="prices-in">
      <input id="about-prices" list="price-places" placeholder="Search a metro area" value={draft} autoFocus data-help="about.prices"
        aria-describedby="hint-about-prices"
        onChange={(e) => {
          setDraft(e.target.value);
          const match = PLACE_BY_NAME.get(e.target.value.trim().toLowerCase());
          if (match) { set(match); close(); }
        }}
        onKeyDown={(e) => { if (e.key === "Escape") close(); }}
        onBlur={() => setEditing(false)} />
      <datalist id="price-places">
        <option value={US_NAME} />
        {CITIES.map((c) => <option key={c.code} value={c.name} />)}
      </datalist>
    </span>
  );
}

function AboutHelp({ k }: { k: string }) {
  useLazyModule(quickHelp); // the ⓘ help, when it arrives
  const h = HELP[k];
  return <Help hint={h.hint} hintId={`hint-${k.replace(/\./g, "-")}`} section={h.section} onWant={() => void quickHelp.load()}>{h.help}</Help>;
}
