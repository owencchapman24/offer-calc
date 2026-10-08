import { type CSSProperties, type Dispatch, type ReactNode, useRef, useState } from "react";
import { CITIES } from "../../src/col/cities";
import type { RentEstimate } from "../../src/col/rent";
import { rentKey } from "./protocol";
import { alsoCounted, type AppOffer, type Missing, NYC_METRO, type QuickBonus, statesFor } from "./model";
import type { Action } from "./session";
import { dollars } from "./text";
import { Help, MoneyInput, PercentInput, Stamp } from "./ui";
import { TickButton, Trace, useRovingTicks } from "./Tickmarks";

// Quick mode: offers are columns, fields are rows, so A's salary sits beside B's (docs/ui-design.md §3.2).

const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));
const CITY_BY_CODE = new Map(CITIES.map((c) => [c.code, c]));

export function Ledger({ offers, missing, rents, dispatch }: {
  offers: AppOffer[]; missing: Map<string, Missing[]>; rents: Record<string, RentEstimate>; dispatch: Dispatch<Action>;
}) {
  const set = (o: AppOffer, patch: Partial<AppOffer["quick"]>) => dispatch({ type: "offer", id: o.id, patch });
  const ref = useRef<HTMLElement>(null);
  useRovingTicks(ref);
  return (
    <section ref={ref} className="ledger-wrap" aria-labelledby="offers-title">
      <div className="ledger-head">
        <h2 id="offers-title" className="strip-title">Offers</h2>
        <div className="mode">
          <div className="segmented" role="group" aria-label="Input mode">
            <button type="button" className="is-on" aria-pressed="true">Quick</button>
            <button type="button" disabled aria-describedby="mode-note">Detailed</button>
          </div>
          <span id="mode-note" className="mode-note">Detailed mode is coming soon.</span>
        </div>
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
            <Trace key={o.id} id={`in.${o.letter}.salary`} className="cell">
              <MoneyInput id={`in-${o.letter}-salary`} label={`Offer ${o.letter} salary`} value={o.quick.salary} onChange={(v) => set(o, { salary: v })} />
            </Trace>
          ))}
        </Row>

        <Row label="Bonus" help={<Help hint="Target bonus; the first one is prorated.">
          The target from your offer, as a % of salary or dollars a year; leave it blank for none. It's paid each March for
          the prior calendar year (the common pattern), so a July start gets a partial first bonus about eight months later.
        </Help>}>
          {offers.map((o) => (
            <Trace key={o.id} id={`in.${o.letter}.bonus`} className="cell"><BonusField offer={o} set={(b) => set(o, { bonus: b })} /></Trace>
          ))}
        </Row>

        <Row label="City" help={<Help hint="Where you'd live, not the office.">
          We tax you as a resident of this state (and New York City, if you say so) and price your spending with this
          metro's price level (BEA Regional Price Parities). If you'd commute across a state line, pick where you'd live.
        </Help>}>
          {offers.map((o) => <Trace key={o.id} id={`in.${o.letter}.city`} className="cell"><CityField offer={o} set={(p) => set(o, p)} /></Trace>)}
        </Row>

        <Row label="Start date">
          {offers.map((o) => (
            <Trace key={o.id} id={`in.${o.letter}.start`} className="cell">
              <input id={`in-${o.letter}-start`} type="date" aria-label={`Offer ${o.letter} start date`} value={o.quick.startDate ?? ""} min="2026-01-01"
                onChange={(e) => set(o, { startDate: e.target.value || null })} />
            </Trace>
          ))}
        </Row>

        <Row label="Rent a month" help={<Help hint="What you'd pay there.">
          If you leave it blank we use HUD's Fair Market Rent: what recent movers pay for a typical 1-bedroom across the
          metro (the 40th percentile, utilities included). City-center rents usually run higher, so enter yours if you know it.
        </Help>}>
          {offers.map((o) => (
            <Trace key={o.id} id={`in.${o.letter}.rent`} className="cell">
              <RentField offer={o} set={(v) => set(o, { rent: v })}
                estimate={o.quick.area && o.quick.state ? rents[rentKey(o.quick.area, o.quick.state)] ?? null : null} />
            </Trace>
          ))}
        </Row>

        {offers.some((o) => o.base) && (
          <Row label="Also counted" help={<div className="help"><span className="hint">
            Sample inputs quick mode doesn't show. They still count; detailed mode (coming soon) will let you edit them.
          </span></div>}>
            {offers.map((o) => (
              <Trace key={o.id} id={`in.${o.letter}.also`} className="cell also">{o.base ? alsoCounted(o).join(", ") : "—"}</Trace>
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
        ? <PercentInput id={`in-${offer.letter}-bonus`} label={`Offer ${offer.letter} bonus, % of salary`} value={value} onChange={(v) => set({ kind, value: v })} />
        : <MoneyInput id={`in-${offer.letter}-bonus`} label={`Offer ${offer.letter} bonus, dollars a year`} value={value} onChange={(v) => set({ kind, value: v })} />}
      <select aria-label={`Offer ${offer.letter} bonus basis`} value={kind}
        onChange={(e) => set({ kind: e.target.value as "percent" | "amount", value: null })}>
        <option value="percent">of salary</option>
        <option value="amount">a year</option>
      </select>
      {!base && <span className="sub">paid each March<TickButton id={`in.${offer.letter}.bonusTiming`} label="the bonus paid each March" /></span>}
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
          <button id={`in-${offer.letter}-city`} type="button" className="link" onClick={() => setEditing(true)} aria-label={`Change offer ${offer.letter} city`}>Change</button>
        </span>
      ) : (
        <input id={`in-${offer.letter}-city`} list="cities" aria-label={`Offer ${offer.letter} city`} placeholder="Search a metro area" value={draft ?? current}
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

/**
 * Rent: left blank, the field shows the estimate as a value with an E tickmark, so it reads as an
 * estimate rather than as something you entered. Once you enter a rent, a one-line link offers the
 * estimate back.
 */
function RentField({ offer, set, estimate }: { offer: AppOffer; set: (v: number | null) => void; estimate: RentEstimate | null }) {
  const q = offer.quick;
  const who = estimate?.source === "fmr" ? "HUD" : "BEA";
  const estimated = q.rent === null && estimate !== null;
  return (
    <div className="rent">
      <span className={`rent-value${estimated ? " is-estimate" : ""}`}>
        <MoneyInput id={`in-${offer.letter}-rent`} label={`Offer ${offer.letter} rent a month${estimated ? `, estimated by ${who}` : ""}`}
          value={q.rent ?? estimate?.monthlyRent ?? null} onChange={set} />
        {estimated && <TickButton id={`in.${offer.letter}.rent`} label={`the rent estimate, ${dollars(estimate.monthlyRent)} a month`} />}
      </span>
      {estimated && <span className="sub estimate one-line">{who} estimate · edit</span>}
      {q.rent !== null && estimate && (
        <span className="sub estimate one-line">
          {who} est. {dollars(estimate.monthlyRent)} ·{" "}
          <button type="button" className="link" onClick={() => set(null)}
            aria-label={`Use ${who}'s estimate for offer ${offer.letter}, ${dollars(estimate.monthlyRent)} a month`}>use</button>
        </span>
      )}
    </div>
  );
}
