import { useEffect, useMemo, useReducer, useState } from "react";
import { DATA_YEARS } from "../../src/col/cities";
import { rentKey } from "./protocol";
import { About } from "./About";
import { Lead } from "./Lead";
import { Ledger } from "./Ledger";
import { ASSUMPTIONS, firstYear, type Missing, toHousehold, toOfferInput } from "./model";
import { type KeyValueStore, loadSession, reducer, saveSession, type Theme } from "./session";
import { localToday } from "./text";
import { useEngine } from "./useEngine";
import { verdict } from "./verdict";

const STAYS = [2, 3, 4, 5];

function storage(): KeyValueStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** ?theme=light|dark previews a theme for this visit without saving it. */
const themeOverride = (): Theme | null => {
  const t = new URLSearchParams(window.location.search).get("theme");
  return t === "light" || t === "dark" ? t : null;
};

export function App() {
  const today = useMemo(() => localToday(), []);
  const [session, dispatch] = useReducer(reducer, undefined, () => loadSession(storage(), today));
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSaved(saveSession(storage(), session)), 500);
    return () => clearTimeout(t);
  }, [session]);

  const theme = themeOverride() ?? session.ui.theme;
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const stayYears = session.household.stayYears;
  const wagesYear = firstYear(session.offers, today);
  const built = session.offers.map((o) => ({ o, r: toOfferInput(o) }));
  const complete = built.flatMap((x) => ("offer" in x.r ? [{ o: x.o, offer: x.r.offer }] : []));
  const missing = new Map<string, Missing[]>(built.flatMap((x) => ("missing" in x.r ? [[x.o.id, x.r.missing] as [string, Missing[]]] : [])));
  const compare = complete.length >= 2 ? {
    offers: complete.map((x) => x.offer),
    household: toHousehold(session.household, wagesYear),
    stays: [...new Set([...STAYS, stayYears])].sort((a, b) => a - b),
    valuationDate: today, inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate,
  } : null;
  // Rent estimates come from the worker, which holds the HUD and BEA tables.
  const rents = [...new Map(session.offers.filter((o) => o.quick.area && o.quick.state)
    .map((o) => [rentKey(o.quick.area!, o.quick.state!), { area: o.quick.area!, state: o.quick.state! }])).values()];
  const engine = useEngine({ compare, rents });
  const letters = complete.map((x) => x.o.letter);
  const view = engine.sweep && engine.sweep.labels.length === letters.length
    ? verdict(engine.sweep, letters, session.ui.basis, stayYears) : null;

  const notes: string[] = [];
  if (complete.length < 2) notes.push("Fill in at least two offers to compare them.");
  for (const x of complete) {
    if (x.offer.startDate < today) notes.push(`Offer ${x.o.letter} starts before today, so its present value counts pay already received.`);
  }
  const sample = session.offers.some((o) => o.sample !== null);

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✓</span>
          <span className="brand-name">Offer Calc</span>
        </div>
        <p className="tagline">Job offers compared the way they'd pay out: after tax, after rent and prices, per hour, year by year.</p>
      </header>

      <About session={session} dispatch={dispatch} today={today} wagesYear={wagesYear} />

      <main className="workpaper">
        <Ledger offers={session.offers} missing={missing} rents={engine.rents} dispatch={dispatch} />
        <div className="results">
          <Lead view={view} stayYears={stayYears} updating={engine.updating} error={engine.error} notes={notes}
            sample={sample} dispatch={dispatch} />
        </div>
      </main>

      <footer className="colophon">
        <div className="theme" role="radiogroup" aria-label="Theme">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? "is-on" : ""}
              onClick={() => dispatch({ type: "theme", theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <p>
          {saved ? "Saved in this browser only; nothing leaves this device." : "This browser isn't saving (private window?): your entries last until you close the tab."}{" "}
          <button type="button" className="link" onClick={() => dispatch({ type: "loadSamples", today })}>Reload the samples</button>
        </p>
        <p className="sources">
          Tax law 2026 (later years projected) · Prices: BEA Regional Price Parities {DATA_YEARS.rpp} · Rent estimates: HUD Fair
          Market Rents FY{DATA_YEARS.fmr} · Engine{engine.ms !== null ? `: ${engine.ms.toFixed(0)} ms in a Web Worker` : " in a Web Worker"}.
          Not financial advice.
        </p>
      </footer>
    </div>
  );
}
