import { type CSSProperties, type Dispatch, type ReactNode, useMemo, useState } from "react";
import { cityOptions } from "../../src/col/index";
import { estimateRent } from "../../src/col/rent";
import { type AppOffer, type Missing, NYC_METRO, type QuickBonus, statesFor } from "./model";
import type { Action } from "./session";
import { dollars, figure } from "./text";
import { Help, MoneyInput, PercentInput, Stamp, Tick } from "./ui";

// Quick mode: offers are columns, fields are rows, so A's salary sits beside B's (docs/ui-design.md §3.2).

const CITIES = cityOptions();
const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));
const CITY_BY_CODE = new Map(CITIES.map((c) => [c.code, c]));

export function Ledger({ offers, missing, dispatch }: {
  offers: AppOffer[]; missing: Map<string, Missing[]>; dispatch: Dispatch<Action>;
}) {
  const set = (o: AppOffer, patch: Partial<AppOffer["quick"]>) => dispatch({ type: "offer", id: o.id, patch });
  return (
    <section className="ledger-wrap" aria-labelledby="offers-title">
      <div className="ledger-head">
        <h2 id="offers-title" className="strip-title">Offers</h2>
        <span className="mode">Quick mode</span>
      </div>
      <datalist id="cities">{CITIES.map((c) => <option key={c.code} value={c.name} />)}</datalist>
      <div className="ledger" style={{ "--cols": offers.length } as CSSProperties}>
        <div className="row row-head">
          <div className="row-label" />
          {offers.map((o) => (
            <div key={o.id} className={`cell offer-head offer-${o.letter}`}>
              <div className="offer-letter">
                <span className="letter">{o.letter}</span>
                {o.sample === "sample" && <Stamp>Sample</Stamp>}
                {o.sample === "edited" && <Stamp>Edited sample</Stamp>}
                {offers.length > 2 && (
                  <button type="button" className="remove" onClick={() => dispatch({ type: "removeOffer", id: o.id })}
                    aria-label={`Remove offer ${o.letter}`} title={`Remove offer ${o.letter}`}>×</button>
                )}
              </div>
              <input className="offer-label" aria-label={`Offer ${o.letter} name`} placeholder={`Offer ${o.letter}`}
                value={o.quick.label} onChange={(e) => set(o, { label: e.target.value })} />
              {(missing.get(o.id)?.length ?? 0) > 0 && (
                <p className="needs">Needs {missing.get(o.id)!.join(", ")} to be compared.</p>
              )}
            </div>
          ))}
        </div>

        <Row label="Salary" help={<Help hint="Per year, before tax.">
          Your starting base salary from the offer letter. Raises and promotions come with detailed mode. Pay accrues by
          calendar month, so a July start earns about half of it in its first calendar year.
        </Help>}>
          {offers.map((o) => (
            <div key={o.id} className="cell">
              <MoneyInput label={`Offer ${o.letter} salary`} value={o.quick.salary} onChange={(v) => set(o, { salary: v })} />
            </div>
          ))}
        </Row>

        <Row label="Bonus" help={<Help hint="Target bonus; the first one is prorated.">
          The target from your offer, as a % of salary or dollars a year; leave it blank for none. It's paid each March for
          the prior calendar year (the common pattern), so a July start gets a partial first bonus about eight months later.
        </Help>}>
          {offers.map((o) => <div key={o.id} className="cell"><BonusField offer={o} set={(b) => set(o, { bonus: b })} /></div>)}
        </Row>

        <Row label="City" help={<Help hint="Where you'd live, not the office.">
          We tax you as a resident of this state (and New York City, if you say so) and price your spending with this
          metro's price level (BEA Regional Price Parities). If you'd commute across a state line, pick where you'd live.
        </Help>}>
          {offers.map((o) => <div key={o.id} className="cell"><CityField offer={o} set={(p) => set(o, p)} /></div>)}
        </Row>

        <Row label="Start date">
          {offers.map((o) => (
            <div key={o.id} className="cell">
              <input type="date" aria-label={`Offer ${o.letter} start date`} value={o.quick.startDate ?? ""} min="2026-01-01"
                onChange={(e) => set(o, { startDate: e.target.value || null })} />
            </div>
          ))}
        </Row>

        <Row label="Rent a month" help={<Help hint="What you'd pay there.">
          If you leave it blank we use HUD's Fair Market Rent: what recent movers pay for a typical 1-bedroom across the
          metro (the 40th percentile, utilities included). City-center rents usually run higher, so enter yours if you know it.
        </Help>}>
          {offers.map((o) => <div key={o.id} className="cell"><RentField offer={o} set={(v) => set(o, { rent: v })} /></div>)}
        </Row>

        {offers.some((o) => o.base) && (
          <Row label="Also counted">
            {offers.map((o) => (
              <div key={o.id} className="cell also">{o.base ? alsoCounted(o).join(", ") : "—"}</div>
            ))}
          </Row>
        )}
      </div>
      {offers.length < 3 && (
        <button type="button" className="add" onClick={() => dispatch({ type: "addOffer" })}>+ Add an offer (up to 3)</button>
      )}
    </section>
  );
}

function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label"><span className="row-name">{label}</span>{help}</div>
      {children}
    </div>
  );
}

function BonusField({ offer, set }: { offer: AppOffer; set: (b: QuickBonus) => void }) {
  const b = offer.quick.bonus;
  const base = offer.base?.bonus;
  if (b.kind === "schedule" && base?.basis === "byEmploymentYear") {
    const ks = base.amounts.map((a) => `${Math.round(a.base / 1000)}k`);
    return (
      <div className="bonus">
        <span className="static">By year: {ks[0]} → {ks[ks.length - 1]}</span>
        <button type="button" className="link" onClick={() => set({ kind: "percent", value: null })}>Use a % instead</button>
      </div>
    );
  }
  const kind = b.kind === "schedule" ? "percent" : b.kind;
  const value = b.kind === "schedule" ? null : b.value;
  return (
    <div className="bonus">
      {kind === "percent"
        ? <PercentInput label={`Offer ${offer.letter} bonus, % of salary`} value={value} onChange={(v) => set({ kind, value: v })} />
        : <MoneyInput label={`Offer ${offer.letter} bonus, dollars a year`} value={value} onChange={(v) => set({ kind, value: v })} />}
      <select aria-label={`Offer ${offer.letter} bonus basis`} value={kind}
        onChange={(e) => set({ kind: e.target.value as "percent" | "amount", value: null })}>
        <option value="percent">of salary</option>
        <option value="amount">a year</option>
      </select>
      {!base && <span className="sub">paid each March<Tick kind="default" note="paid each March 15 for the prior calendar year" /></span>}
    </div>
  );
}

function CityField({ offer, set }: { offer: AppOffer; set: (p: Partial<AppOffer["quick"]>) => void }) {
  const q = offer.quick;
  const current = q.area ? CITY_BY_CODE.get(q.area)?.name ?? "" : "";
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const states = statesFor(q.area);
  return (
    <div className="city">
      {q.area && !editing ? (
        <span className="city-name">
          {current}{" "}
          <button type="button" className="link" onClick={() => setEditing(true)} aria-label={`Change offer ${offer.letter} city`}>Change</button>
        </span>
      ) : (
        <input list="cities" aria-label={`Offer ${offer.letter} city`} placeholder="Search a metro area" value={draft ?? current}
          autoFocus={editing}
          onFocus={() => setDraft(current)}
          onChange={(e) => {
            setDraft(e.target.value);
            const match = CITY_BY_NAME.get(e.target.value.trim().toLowerCase());
            if (match) {
              set({ area: match.code, state: match.states.includes(q.state ?? "") ? q.state : match.states[0], rent: null });
              setEditing(false);
              setDraft(null);
            }
          }}
          onBlur={() => { setDraft(null); setEditing(false); }} />
      )}
      {states.length > 1 && (
        <label className="sub">Live in
          <select aria-label={`Offer ${offer.letter} state you'd live in`} value={q.state ?? states[0]}
            onChange={(e) => set({ state: e.target.value, rent: null })}>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      {q.area === NYC_METRO && q.state === "NY" && (
        <label className="sub check">
          <input type="checkbox" checked={q.nyc} onChange={(e) => set({ nyc: e.target.checked })} />
          <span>Inside NYC (city tax)</span>
        </label>
      )}
    </div>
  );
}

function RentField({ offer, set }: { offer: AppOffer; set: (v: number | null) => void }) {
  const q = offer.quick;
  const estimate = useMemo(() => (q.area && q.state ? estimateRent(q.area, q.state, { bedrooms: 1 }) : null), [q.area, q.state]);
  return (
    <div className="rent">
      <MoneyInput label={`Offer ${offer.letter} rent a month`} value={q.rent} onChange={set}
        placeholder={estimate ? figure(estimate.monthlyRent) : ""} />
      {q.rent === null && estimate && (
        <span className="sub estimate">
          <Tick kind="estimate" note={estimate.source === "fmr" ? `HUD FY${estimate.fiscalYear} Fair Market Rent, 1 bedroom, ${estimate.hudAreaName}`
            : "BEA housing prices x the U.S. median gross rent"} />
          {estimate.source === "fmr" ? "estimate (HUD Fair Market Rent): edit to your actual rent" : "estimate (BEA housing prices): edit to your actual rent"}
        </span>
      )}
      {q.rent !== null && estimate && (
        <button type="button" className="link sub" onClick={() => set(null)}>Use the estimate ({dollars(estimate.monthlyRent)})</button>
      )}
    </div>
  );
}

function alsoCounted(o: AppOffer): string[] {
  const b = o.base!;
  const out: string[] = [];
  if (b.salary.raise || b.salary.promotions?.length) out.push(b.salary.promotions?.length ? "promotion" : "raises");
  if (b.cashAwards?.length) out.push("sign-on");
  if (b.equity) out.push("RSUs");
  if (b.retirement) out.push("401(k)");
  if (b.health) out.push("health");
  if (b.perks) out.push("perks");
  if (b.hours) out.push(`${b.hours.weekly.base} hrs/week`);
  return out;
}
