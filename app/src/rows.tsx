import { useState } from "react";
import { CITIES } from "../../src/col/cities";
import type { RentEstimate } from "../../src/col/rent";
import { rentKey } from "./protocol";
import { type AppOffer, bonusBasis, type BonusDraft, NYC_METRO, statesFor, withBase } from "./model";
import { dollars } from "./text";
import { DefaultTick, FieldRow, fieldId, hintId, issuesAt, useLedger } from "./fields";
import { TickButton } from "./Tickmarks";
import { MoneyInput, PercentInput, toPercent } from "./ui";

// Quick mode's fields, as rows: quick mode shows them on their own, and detailed mode puts each in its
// section (salary and start date under Pay, the bonus under Bonus, city and rent under Where you'd live).

const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));
const CITY_BY_CODE = new Map(CITIES.map((c) => [c.code, c]));

export function SalaryRow() {
  const api = useLedger();
  return (
    <FieldRow k="salary.annual">
      {(o) => (
        <MoneyInput id={fieldId(o.letter, "salary.annual")} label={`Offer ${o.letter} salary`} value={o.draft.salary.annual} help="salary.annual"
          describedBy={hintId("salary.annual")} invalid={issuesAt(api, o.letter, "salary.annual").length > 0}
          onChange={(v) => api.set(o, { "salary.annual": v })} />
      )}
    </FieldRow>
  );
}

export function StartRow() {
  const api = useLedger();
  return (
    <FieldRow k="startDate">
      {(o) => (
        <input id={fieldId(o.letter, "startDate")} type="date" aria-label={`Offer ${o.letter} start date`} value={o.draft.startDate ?? ""}
          min="2026-01-01" data-help="startDate" aria-describedby={hintId("startDate")}
          aria-invalid={issuesAt(api, o.letter, "startDate").length > 0 || undefined}
          onChange={(e) => api.set(o, { startDate: e.target.value || null })} />
      )}
    </FieldRow>
  );
}

/** The bonus target, in quick mode with its basis beside it. Detailed mode puts the basis on its own row. */
export function BonusRow({ detailed = false }: { detailed?: boolean }) {
  const api = useLedger();
  return (
    <FieldRow k="bonus.amount" label={detailed ? "Target" : undefined} issues={detailed ? "all" : "all"}>
      {(o) => <BonusField offer={o} detailed={detailed} set={(b) => api.set(o, { bonus: b })} />}
    </FieldRow>
  );
}

function BonusField({ offer, set, detailed }: { offer: AppOffer; set: (b: BonusDraft) => void; detailed: boolean }) {
  const api = useLedger();
  const b = offer.draft.bonus;
  const basis = bonusBasis(b);
  if (basis === "byEmploymentYear") {
    const ks = b.amounts.map((a) => (a ? `${Math.round(a.base / 1000)}k` : "—"));
    return (
      <div className="bonus">
        <span className="static">By year: {ks[0] ?? "none"}{ks.length > 1 ? ` → ${ks[ks.length - 1]}` : ""}</span>
        {!detailed && (
          <button type="button" className="link" onClick={() => set({ ...b, basis: "percentOfSalary", amount: null, amounts: [] })}>Use a % instead</button>
        )}
      </div>
    );
  }
  const pct = basis === "percentOfSalary";
  const value = b.amount === null ? null : pct ? toPercent(b.amount.base) : b.amount.base;
  const setValue = (v: number | null) => set({ ...b, amount: withBase(b.amount, v === null ? null : pct ? v / 100 : v) });
  const invalid = issuesAt(api, offer.letter, "bonus.amount").length > 0;
  const common = { id: fieldId(offer.letter, "bonus.amount"), value, onChange: setValue, help: "bonus.amount", describedBy: hintId("bonus.amount"), invalid };
  return (
    <div className="bonus">
      {pct
        ? <PercentInput {...common} label={`Offer ${offer.letter} bonus, % of salary`} />
        : <MoneyInput {...common} label={`Offer ${offer.letter} bonus, dollars a year`} />}
      {detailed ? <span className="sub">{pct ? "of salary" : "a year"}</span> : (
        <select aria-label={`Offer ${offer.letter} bonus basis`} value={basis} data-help="bonus.basis" aria-describedby={hintId("bonus.amount")}
          onChange={(e) => set({ ...b, basis: e.target.value as BonusDraft["basis"], amount: null })}>
          <option value="percentOfSalary">of salary</option>
          <option value="fixed">a year</option>
        </select>
      )}
      {!detailed && b.payOn === null && (
        <span className="sub">paid each March<DefaultTick o={offer} path="bonus.payOn" label="the bonus paid each March" /></span>
      )}
    </div>
  );
}

export function CityRow() {
  const api = useLedger();
  return <FieldRow k="costOfLiving.area">{(o) => <CityField offer={o} set={(v) => api.set(o, v)} />}</FieldRow>;
}

function CityField({ offer, set }: { offer: AppOffer; set: (values: Record<string, unknown>) => void }) {
  const d = offer.draft;
  const area = d.costOfLiving.area;
  const state = d.residence.state;
  const current = area ? CITY_BY_CODE.get(area)?.name ?? "" : "";
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const states = statesFor(area);
  const id = fieldId(offer.letter, "costOfLiving.area");
  return (
    <div className="city">
      {area && !editing ? (
        <span className="city-name">
          {current}{" "}
          <button id={id} type="button" className="link" data-help="costOfLiving.area" onClick={() => setEditing(true)}
            aria-label={`Change offer ${offer.letter} city`}>Change</button>
        </span>
      ) : (
        <input id={id} list="cities" aria-label={`Offer ${offer.letter} city`} placeholder="Search a metro area" value={draft ?? current}
          data-help="costOfLiving.area" aria-describedby={hintId("costOfLiving.area")} autoFocus={editing}
          onFocus={() => setDraft(current)}
          onChange={(e) => {
            setDraft(e.target.value);
            const match = CITY_BY_NAME.get(e.target.value.trim().toLowerCase());
            if (match) {
              set({ "costOfLiving.area": match.code, "residence.state": match.states.includes(state ?? "") ? state : match.states[0],
                "costOfLiving.monthlyRent": null });
              setEditing(false);
              setDraft(null);
            }
          }}
          onBlur={() => { setDraft(null); setEditing(false); }} />
      )}
      {states.length > 1 && (
        <label className="sub">Live in
          <select aria-label={`Offer ${offer.letter} state you'd live in`} value={state ?? states[0]} data-help="costOfLiving.area"
            aria-describedby={hintId("costOfLiving.area")}
            onChange={(e) => set({ "residence.state": e.target.value, "costOfLiving.monthlyRent": null })}>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      {area === NYC_METRO && state === "NY" && (
        <label className="sub check">
          <input type="checkbox" checked={d.residence.nyc} data-help="costOfLiving.area" onChange={(e) => set({ "residence.nyc": e.target.checked })} />
          <span>Inside NYC (city tax)</span>
        </label>
      )}
    </div>
  );
}

export function RentRow({ rents }: { rents: Record<string, RentEstimate> }) {
  const api = useLedger();
  return (
    <FieldRow k="costOfLiving.monthlyRent">
      {(o) => {
        const { area } = o.draft.costOfLiving;
        const state = o.draft.residence.state;
        return <RentField offer={o} set={(v) => api.set(o, { "costOfLiving.monthlyRent": v })}
          estimate={area && state ? rents[rentKey(area, state)] ?? null : null} />;
      }}
    </FieldRow>
  );
}

/**
 * Rent: left blank, the field shows the estimate as a value with an E tickmark, so it reads as an
 * estimate rather than as something you entered. Once you enter a rent, a one-line link offers the
 * estimate back.
 */
function RentField({ offer, set, estimate }: { offer: AppOffer; set: (v: number | null) => void; estimate: RentEstimate | null }) {
  const api = useLedger();
  const rent = offer.draft.costOfLiving.monthlyRent;
  const who = estimate?.source === "fmr" ? "HUD" : "BEA";
  const estimated = rent === null && estimate !== null;
  const path = "costOfLiving.monthlyRent";
  return (
    <div className="rent">
      <span className={`rent-value${estimated ? " is-estimate" : ""}`}>
        <MoneyInput id={fieldId(offer.letter, path)} label={`Offer ${offer.letter} rent a month${estimated ? `, estimated by ${who}` : ""}`}
          value={rent ?? estimate?.monthlyRent ?? null} onChange={set} help={path} describedBy={hintId(path)}
          invalid={issuesAt(api, offer.letter, path).length > 0} />
        {estimated && <TickButton id={`in.${offer.letter}.${path}`} label={`the rent estimate, ${dollars(estimate.monthlyRent)} a month`} />}
      </span>
      {estimated && <span className="sub estimate one-line">{who} estimate · edit</span>}
      {rent !== null && estimate && (
        <span className="sub estimate one-line">
          {who} est. {dollars(estimate.monthlyRent)} ·{" "}
          <button type="button" className="link" onClick={() => set(null)}
            aria-label={`Use ${who}'s estimate for offer ${offer.letter}, ${dollars(estimate.monthlyRent)} a month`}>use</button>
        </span>
      )}
    </div>
  );
}
