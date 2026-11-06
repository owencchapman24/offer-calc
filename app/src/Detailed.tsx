import type { ReactNode } from "react";
import { CITIES } from "../../src/col/cities";
import type { RentEstimate } from "../../src/col/rent";
import "./detailedDefaults"; // the defaults and fields only detailed mode and the derivations read, first: helpText adds to the fields
import "./helpText"; // detailed mode's help text, which arrives with this chunk
import "./quickHelp"; // and the ⓘ help of quick mode's fields, which detailed mode shows too
import {
  BonusYearsEditor, CashAwardsEditor, CommissionYearsEditor, GrantsEditor, MatchEditor, newCashAward, newEspp, newGrant, newHealth, newOtherBenefit, newPromotion, newRefreshers,
  newRetirement, OtherBenefitsEditor, PromotionsEditor, RefreshersEditor, VestingStepsEditor,
} from "./editors";
import {
  ChoiceField, DateField, EditButton, editorButtonName, EditorRow, MonthDayField, NumberField, PlanField, RangeField, shownValue, Warnings,
} from "./controls";
import { DefaultTick, FieldRow, fieldId, hintId, useLedger } from "./fields";
import { type AppOffer, bonusBasis, hasCommission, hasEspp, type HealthDraft, type RetirementDraft } from "./model";
import { CityRow, RentRow, SalaryRow, StartRow } from "./rows";
import type { LedgerSection } from "./session";
import { bonusYearsText, cashAwardsText, commissionText, grantsText, matchText, otherBenefitsText, promotionsText, refreshersText } from "./summary";
import { percent } from "./text";

// Detailed mode's sections (docs/ui-design.md §3.3), one open at a time, each a run of rows with one
// cell per offer. Complex inputs open an editor beneath their row (W3).

export function DetailedSection({ id, rents }: { id: LedgerSection; rents: Record<string, RentEstimate> }) {
  switch (id) {
    case "pay": return <Pay />;
    case "bonus": return <Bonus />;
    case "commission": return <Commission />;
    case "cash": return <Cash />;
    case "equity": return <Equity />;
    case "retirement": return <Retirement />;
    case "health": return <Health />;
    case "perks": return <Perks />;
    case "hours": return <Hours />;
    case "where":
      return (
        <>
          <CityRow />
          <RentRow rents={rents} />
          <FieldRow k="employerState">{(o) => <><EmployerStateField o={o} /><Warnings o={o} path="employerState" /></>}</FieldRow>
          <FieldRow k="costOfLiving.rentGrowth">{(o) => <NumberField o={o} path="costOfLiving.rentGrowth" kind="percent" label="rent growth a year" />}</FieldRow>
        </>
      );
  }
}

/** A row whose inputs open in an editor: each offer's summary, and the button that opens (or starts) it. */
function EditorCell({ o, row, summary, empty, start }: { o: AppOffer; row: string; summary: string; empty: boolean; /** Adds the first item. */ start: () => void }) {
  const api = useLedger();
  const open = api.editor?.row === row && api.editor.letter === o.letter;
  return (
    <div className="editor-cell">
      <span className="summary">{summary}</span>
      {empty && !open
        ? <button type="button" className="link edit-button" id={`in-${o.letter}-${row.replace(/\./g, "-")}`} data-help={row}
            aria-label={editorButtonName("Add", o, row)} onClick={() => { start(); api.openEditor(row, o.letter); }}>
            + Add</button>
        : <EditButton o={o} row={row} label="Edit" />}
    </div>
  );
}

function Pay() {
  const api = useLedger();
  return (
    <>
      <SalaryRow />
      <StartRow />
      <FieldRow k="salary.raise">{(o) => <RangeField o={o} path="salary.raise" kind="percent" label="merit raise" />}</FieldRow>
      <FieldRow k="salary.raiseOn">
        {(o) => <ChoiceField o={o} path="salary.raiseOn" label="raise timing" options={[["anniversary", "Work anniversary"], ["jan1", "January 1"]]} />}
      </FieldRow>
      <FieldRow k="salary.promotions" issues="editor">
        {(o) => <EditorCell o={o} row="salary.promotions" summary={promotionsText(o.draft)} empty={!o.draft.salary.promotions.length}
          start={() => api.set(o, { "salary.promotions": [newPromotion()] })} />}
      </FieldRow>
      <EditorRow row="salary.promotions" title="Promotions">{(o) => <PromotionsEditor o={o} />}</EditorRow>
    </>
  );
}

function Bonus() {
  return (
    <>
      <FieldRow k="bonus.basis">
        {(o) => <ChoiceField o={o} path="bonus.basis" label="bonus basis" alsoSet={{ "bonus.amount": null }}
          options={[["percentOfSalary", "% of salary"], ["fixed", "Dollars a year"], ["byEmploymentYear", "Dollars by year"]]} />}
      </FieldRow>
      <BonusTarget />
      <EditorRow row="bonus.amounts" title="Bonus by year">{(o) => <BonusYearsEditor o={o} />}</EditorRow>
      <FieldRow k="bonus.payOn">{(o) => <MonthDayField o={o} path="bonus.payOn" label="bonus payout date" />}</FieldRow>
      <FieldRow k="bonus.periodStart">{(o) => <MonthDayField o={o} path="bonus.periodStart" label="first day of the bonus year" />}</FieldRow>
      <FieldRow k="bonus.cutoff">{(o) => <MonthDayField o={o} path="bonus.cutoff" label="bonus cutoff" none="None" />}</FieldRow>
      <FieldRow k="bonus.firstPayoutGuaranteed">
        {(o) => <ChoiceField o={o} path="bonus.firstPayoutGuaranteed" label="first payout guaranteed" options={[[false, "No"], [true, "Yes"]]} />}
      </FieldRow>
      <FieldRow k="bonus.mustBeEmployedOnPayDate">
        {(o) => <ChoiceField o={o} path="bonus.mustBeEmployedOnPayDate" label="must be employed on the pay date" options={[[true, "Yes"], [false, "No"]]} />}
      </FieldRow>
    </>
  );
}

/** The bonus target: a % or dollars with an optional range, or, by employment year, the schedule's editor. */
function BonusTarget() {
  const api = useLedger();
  return (
      <FieldRow k="bonus.amount" label="Target">
        {(o) => bonusBasis(o.draft.bonus) === "byEmploymentYear"
          ? <EditorCell o={o} row="bonus.amounts" summary={bonusYearsText(o.draft)} empty={!o.draft.bonus.amounts.length}
              start={() => api.set(o, { "bonus.amounts": [null] })} />
          : <span className="field">
              <RangeField o={o} path="bonus.amount" kind={bonusBasis(o.draft.bonus) === "percentOfSalary" ? "percent" : "money"}
                label={bonusBasis(o.draft.bonus) === "percentOfSalary" ? "bonus, % of salary" : "bonus, dollars a year"} blank="None: no bonus" />
            </span>}
    </FieldRow>
  );
}

/** Commission (4h): expected a year (or by year), how often and how long after it's paid, the leaving rule, a draw. */
function Commission() {
  const api = useLedger();
  return (
    <>
      <FieldRow k="commission.basis">
        {(o) => <ChoiceField o={o} path="commission.basis" label="commission basis" alsoSet={{ "commission.amount": null, "commission.amounts": [] }}
          options={[["fixed", "Dollars a year"], ["byEmploymentYear", "Dollars by year"]]} />}
      </FieldRow>
      <FieldRow k="commission.amount" label="Expected a year">
        {(o) => o.draft.commission.basis === "byEmploymentYear"
          ? <EditorCell o={o} row="commission.amounts" summary={commissionText(o.draft)} empty={!o.draft.commission.amounts.length}
              start={() => api.set(o, { "commission.amounts": [null] })} />
          : <span className="field">
              <RangeField o={o} path="commission.amount" kind="money" label="commission expected, dollars a year" blank="None: no commission" />
              <Warnings o={o} path="commission.amount" />
            </span>}
      </FieldRow>
      <EditorRow row="commission.amounts" title="Commission by year">{(o) => <CommissionYearsEditor o={o} />}</EditorRow>
      <CommissionRow k="commission.period">
        {(o) => <ChoiceField o={o} path="commission.period" label="how often commission is paid" blank="—"
          options={[["month", "Monthly"], ["quarter", "Quarterly"]]} />}
      </CommissionRow>
      <CommissionRow k="commission.payAfterDays">
        {(o) => <NumberField o={o} path="commission.payAfterDays" kind="number" unit="days" label="days after each period ends it's paid" />}
      </CommissionRow>
      <CommissionRow k="commission.mustBeEmployedOnPayDate">
        {(o) => <ChoiceField o={o} path="commission.mustBeEmployedOnPayDate" label="commission when you leave"
          options={[[false, "Paid for work to your last day"], [true, "Only if employed on the payout date"]]} />}
      </CommissionRow>
      <CommissionRow k="commission.draw">{(o) => <DrawField o={o} />}</CommissionRow>
      <DrawRow k="commission.draw.monthly">
        {(o) => <NumberField o={o} path="commission.draw.monthly" kind="money" unit="a month" label="draw against commission a month" />}
      </DrawRow>
      <DrawRow k="commission.draw.months">
        {(o) => <NumberField o={o} path="commission.draw.months" kind="number" unit="months" label="months the draw is paid" blank="Every month" />}
      </DrawRow>
      <DrawRow k="commission.draw.onLeaving" recoverable>
        {(o) => <ChoiceField o={o} path="commission.draw.onLeaving" label="a recoverable draw not earned back when you leave"
          options={[["kept", "Kept"], ["repaid", "Repaid"]]} />}
      </DrawRow>
    </>
  );
}

/** The eligible-pay choice beyond salary, by what the offer has: commission counts with the bonus (4h, D26). */
const incentivePay = (d: AppOffer["draft"]) => (!hasCommission(d) ? "Salary and bonus"
  : d.bonus.amount || d.bonus.amounts.length ? "Salary, bonus and commission" : "Salary and commission");

/** Whether there's a draw against commission, and which kind: none, guaranteed (a floor) or recoverable (an advance). */
function DrawField({ o }: { o: AppOffer }) {
  const api = useLedger();
  const w = o.draft.commission.draw;
  const value = !w ? "none" : w.recoverable ? "recoverable" : "guaranteed";
  return (
    <span className="field">
      <select id={fieldId(o.letter, "commission.draw")} aria-label={`Offer ${o.letter} draw against commission`} data-help="commission.draw"
        aria-describedby={hintId("commission.draw")} value={value}
        onChange={(e) => api.set(o, { "commission.draw": e.target.value === "none" ? null
          : { monthly: w?.monthly ?? null, months: w?.months ?? null, onLeaving: w?.onLeaving ?? null, recoverable: e.target.value === "recoverable" } })}>
        <option value="none">None</option>
        <option value="guaranteed">Guaranteed (non-recoverable)</option>
        <option value="recoverable">Recoverable</option>
      </select>
      <DefaultTick o={o} path="commission.draw" label="no draw" />
    </span>
  );
}

/** A row about commission's terms: a cell for each offer that has commission, a dash for the others. */
function CommissionRow({ k, children }: { k: string; children: (o: AppOffer) => ReactNode }) {
  return <FieldRow k={k}>{(o) => (hasCommission(o.draft) ? children(o) : <span className="sub">—</span>)}</FieldRow>;
}

/** A row about a draw's terms: offers with commission and a draw (a recoverable one, for what happens to it on leaving). */
function DrawRow({ k, recoverable, children }: { k: string; recoverable?: boolean; children: (o: AppOffer) => ReactNode }) {
  return (
    <FieldRow k={k}>
      {(o) => (hasCommission(o.draft) && o.draft.commission.draw && (!recoverable || o.draft.commission.draw.recoverable) ? children(o)
        : <span className="sub">—</span>)}
    </FieldRow>
  );
}

function Equity() {
  const api = useLedger();
  return (
    <>
      <FieldRow k="equity.grants" issues="editor">
        {(o) => <EditorCell o={o} row="equity.grants" summary={grantsText(o.draft)} empty={!o.draft.equity.grants.length}
          start={() => api.set(o, { "equity.grants": [newGrant()] })} />}
      </FieldRow>
      <EditorRow row="equity.grants" title="RSU grants">{(o) => <GrantsEditor o={o} />}</EditorRow>
      <FieldRow k="equity.priceGrowth">{(o) => <RangeField o={o} path="equity.priceGrowth" kind="percent" label="share-price growth a year" />}</FieldRow>
      <FieldRow k="equity.refreshers" issues="editor">
        {(o) => (
          <span className="field">
            <EditorCell o={o} row="equity.refreshers" summary={refreshersText(o.draft)} empty={!o.draft.equity.refreshers}
              start={() => api.set(o, { "equity.refreshers": newRefreshers() })} />
            <DefaultTick o={o} path="equity.refreshers" label="no refreshers" />
          </span>
        )}
      </FieldRow>
      <EditorRow row="equity.refreshers" title="Refreshers">{(o) => <RefreshersEditor o={o} />}</EditorRow>
      <FieldRow k="espp">
        {(o) => (
          <>
            <PlanField o={o} path="espp" label="employee stock purchase plan" has="Has an ESPP" none="No ESPP" start={newEspp} />
            {hasEspp(o.draft) && <span className="sub field-note">Holding shares after purchase is an investment decision and isn't modeled.</span>}
          </>
        )}
      </FieldRow>
      <EsppRow k="espp.contributionPct">
        {(o) => (
          <span className="field">
            <NumberField o={o} path="espp.contributionPct" kind="percent" unit="% of pay" label="ESPP contribution" blank="Not counted" />
            <Warnings o={o} path="espp.contributionPct" />
          </span>
        )}
      </EsppRow>
      <EsppRow k="espp.eligiblePay">
        {(o) => <ChoiceField o={o} path="espp.eligiblePay" label="pay the ESPP counts" options={[["salary", "Salary"], ["salaryAndBonus", incentivePay(o.draft)]]} />}
      </EsppRow>
      <EsppRow k="espp.discount">{(o) => <NumberField o={o} path="espp.discount" kind="percent" label="ESPP discount" />}</EsppRow>
      <EsppRow k="espp.lookback">{(o) => <ChoiceField o={o} path="espp.lookback" label="ESPP lookback" options={[[true, "Yes"], [false, "No"]]} />}</EsppRow>
      <EsppRow k="espp.offeringMonths">
        {(o) => <NumberField o={o} path="espp.offeringMonths" kind="number" unit="months" label="ESPP offering length" />}
      </EsppRow>
      <EsppRow k="espp.purchasesPerOffering">
        {(o) => <NumberField o={o} path="espp.purchasesPerOffering" kind="number" label="ESPP purchases an offering" />}
      </EsppRow>
      <EsppRow k="espp.offeringsStart">{(o) => <MonthDayField o={o} path="espp.offeringsStart" label="ESPP offerings start" none="—" />}</EsppRow>
      <EsppRow k="espp.eligibleFrom">
        {(o) => <DateField o={o} path="espp.eligibleFrom" label="ESPP eligible from" fallback={o.draft.startDate} />}
      </EsppRow>
    </>
  );
}

/** A row about an ESPP's terms: a cell for each offer that has one, a dash for the others. */
function EsppRow({ k, children }: { k: string; children: (o: AppOffer) => ReactNode }) {
  return <FieldRow k={k}>{(o) => (hasEspp(o.draft) ? children(o) : <span className="sub">—</span>)}</FieldRow>;
}

function Hours() {
  return (
    <>
      <FieldRow k="hours.weekly">{(o) => <RangeField o={o} path="hours.weekly" kind="number" unit="hrs" label="weekly hours" blank="Not counted" />}</FieldRow>
      <FieldRow k="timeOff.vacation">{(o) => <NumberField o={o} path="timeOff.vacation" kind="number" unit="days" label="vacation days you'd take a year" />}</FieldRow>
      <FieldRow k="timeOff.holidays">{(o) => <NumberField o={o} path="timeOff.holidays" kind="number" unit="days" label="paid holidays a year" />}</FieldRow>
      <FieldRow k="timeOff.sick">{(o) => <NumberField o={o} path="timeOff.sick" kind="number" unit="days" label="sick days you'd take a year" />}</FieldRow>
      <FieldRow k="timeOff.policy">
        {(o) => <ChoiceField o={o} path="timeOff.policy" label="vacation policy" options={[["days", "Days a year"], ["unlimited", "Unlimited"]]} />}
      </FieldRow>
      <FieldRow k="timeOff.gives">
        {(o) => o.draft.timeOff.policy === "unlimited" ? <span className="sub">—</span>
          : <NumberField o={o} path="timeOff.gives" kind="number" unit="days" label="vacation days it gives a year"
            fallback={shownValue<number>(o, "timeOff.vacation")} />}
      </FieldRow>
      <FieldRow k="timeOff.cap">
        {(o) => o.draft.timeOff.policy === "unlimited" ? <span className="sub">—</span>
          : <NumberField o={o} path="timeOff.cap" kind="number" unit="days" label="most vacation days you can bank" />}
      </FieldRow>
      <FieldRow k="timeOff.payout">
        {(o) => o.draft.timeOff.policy === "unlimited" ? <span className="sub">—</span>
          : <ChoiceField o={o} path="timeOff.payout" label="unused vacation when you leave"
            options={[["state", "Where the state requires it"], ["always", "Always: the offer's policy pays it"]]} />}
      </FieldRow>
    </>
  );
}

// ---- sign-on and other cash ---------------------------------------------------------------------------

function Cash() {
  const api = useLedger();
  return (
    <>
      <FieldRow k="cashAwards" issues="editor">
        {(o) => <EditorCell o={o} row="cashAwards" summary={cashAwardsText(o.draft)} empty={!o.draft.cashAwards.length}
          start={() => api.set(o, { cashAwards: [newCashAward()] })} />}
      </FieldRow>
      <EditorRow row="cashAwards" title="Sign-on and other cash">{(o) => <CashAwardsEditor o={o} />}</EditorRow>
    </>
  );
}

// ---- 401(k) -------------------------------------------------------------------------------------------

/** A row about a plan's details: a cell for each offer that has the plan, a dash for the others. */
function PlanRow({ k, plan, label, issues, children }: {
  k: string; plan: "retirement" | "health"; label?: string; issues?: "all" | "editor"; children: (o: AppOffer) => ReactNode;
}) {
  return (
    <FieldRow k={k} label={label} issues={issues}>
      {(o) => {
        const v = o.draft[plan];
        return v && v !== "none" ? children(o) : <span className="sub">—</span>;
      }}
    </FieldRow>
  );
}

const retirementOf = (o: AppOffer) => o.draft.retirement as RetirementDraft;

/** The deferral rate the full match needs: the top of the last tier that adds anything. Facts, not advice. */
function fullMatchNote(r: RetirementDraft): string | null {
  const tiers = r.match.filter((t) => t.upToPct !== null && t.rate !== null && t.rate > 0);
  if (!tiers.length) return null;
  const top = Math.max(...tiers.map((t) => t.upToPct!));
  return top >= 1 ? "The match applies to everything you defer." : `The full match needs ${percent(top)} of pay.`;
}

function Retirement() {
  const api = useLedger();
  return (
    <>
      <FieldRow k="retirement">
        {(o) => <PlanField o={o} path="retirement" label="401(k) plan" has="Has a 401(k)" none="No 401(k)" start={newRetirement} />}
      </FieldRow>
      <PlanRow k="retirement.contributionPct" plan="retirement">
        {(o) => {
          const note = fullMatchNote(retirementOf(o));
          return (
            <>
              <NumberField o={o} path="retirement.contributionPct" kind="percent" label="401(k) contribution" />
              {note && <span className="sub">{note}</span>}
              <Warnings o={o} path="retirement.contributionPct" />
            </>
          );
        }}
      </PlanRow>
      <PlanRow k="retirement.type" plan="retirement">
        {(o) => <ChoiceField o={o} path="retirement.type" label="401(k) type" options={[["pretax", "Pre-tax"], ["roth", "Roth"]]} />}
      </PlanRow>
      <PlanRow k="retirement.eligiblePay" plan="retirement">
        {(o) => <ChoiceField o={o} path="retirement.eligiblePay" label="pay the 401(k) counts"
          options={[["salary", "Salary"], ["salaryAndBonus", incentivePay(o.draft)]]} />}
      </PlanRow>
      <PlanRow k="retirement.match" plan="retirement" issues="editor">
        {(o) => <EditorCell o={o} row="retirement.match" summary={matchText(retirementOf(o))} empty={!retirementOf(o).match.length}
          start={() => api.set(o, { "retirement.match": [{ rate: null, upToPct: null }] })} />}
      </PlanRow>
      <EditorRow row="retirement.match" title="401(k) match">{(o) => <MatchEditor o={o} />}</EditorRow>
      <PlanRow k="retirement.nonElectivePct" plan="retirement">
        {(o) => <NumberField o={o} path="retirement.nonElectivePct" kind="percent" unit="% of pay" label="employer contribution" />}
      </PlanRow>
      <PlanRow k="retirement.vesting" plan="retirement" issues="editor">{(o) => <VestingField o={o} />}</PlanRow>
      <EditorRow row="retirement.vesting.steps" title="Vesting steps">{(o) => <VestingStepsEditor o={o} />}</EditorRow>
      <PlanRow k="retirement.vestingService" plan="retirement">
        {(o) => <ChoiceField o={o} path="retirement.vestingService" label="vesting service"
          options={[["elapsedTime", "Years worked"], ["planYearHours", "Plan years with 1,000 hours"]]} />}
      </PlanRow>
    </>
  );
}


/** Vesting: immediate (the default), a cliff after some years, or graded steps (in their own editor). */
function VestingField({ o }: { o: AppOffer }) {
  const api = useLedger();
  const v = retirementOf(o).vesting;
  const kind = v?.kind ?? "immediate";
  return (
    <span className="field vesting-field">
      <select id={fieldId(o.letter, "retirement.vesting")} aria-label={`Offer ${o.letter} 401(k) vesting`} data-help="retirement.vesting"
        aria-describedby={hintId("retirement.vesting")} value={kind}
        onChange={(e) => {
          const k = e.target.value;
          api.set(o, { "retirement.vesting": k === "cliff" ? { kind: "cliff", years: null } : k === "graded" ? { kind: "graded", steps: [{ years: null, pct: null }] }
            : { kind: "immediate" } });
          if (k === "graded") api.openEditor("retirement.vesting.steps", o.letter);
        }}>
        <option value="immediate">Immediate</option>
        <option value="cliff">A cliff</option>
        <option value="graded">Graded steps</option>
      </select>
      <DefaultTick o={o} path="retirement.vesting" label="vesting at once" />
      {v?.kind === "cliff" && (
        <span className="field"><span className="sub">after</span>
          <NumberField o={o} path="retirement.vesting.years" kind="number" unit="years" label="401(k) cliff, years of service" hint="retirement.vesting" />
        </span>
      )}
      {v?.kind === "graded" && (
        <span className="editor-cell">
          <span className="summary">{v.steps.map((x) => `${x.pct === null ? "—" : percent(x.pct)} after ${x.years ?? "—"}`).join(", ")}</span>
          <EditButton o={o} row="retirement.vesting.steps" label="Edit" />
        </span>
      )}
    </span>
  );
}

// ---- health and perks ------------------------------------------------------------------------------------

function Health() {
  return (
    <>
      <FieldRow k="health">
        {(o) => <PlanField o={o} path="health" label="health plan" has="Has a health plan" none="None from this job" start={newHealth} />}
      </FieldRow>
      <PlanRow k="health.premium" plan="health">
        {(o) => <NumberField o={o} path="health.premium" kind="money" label="health premium a year" blank="Not counted" />}
      </PlanRow>
      <PlanRow k="health.outOfPocket" plan="health">
        {(o) => (
          <span className="oop">
            {(["low", "medium", "high"] as const).map((level) => (
              <span key={level} className="range-case">
                <NumberField o={o} path={`health.outOfPocket.${level}`} k="health.outOfPocket" kind="money" label={`out-of-pocket a year, ${level} use`} />
                <span className="range-tag">{level}</span>
              </span>
            ))}
            {Object.values((o.draft.health as HealthDraft).outOfPocket).every((x) => x === null) && <span className="sub not-counted">Not counted</span>}
          </span>
        )}
      </PlanRow>
      <PlanRow k="health.oopMax" plan="health">
        {(o) => <NumberField o={o} path="health.oopMax" kind="money" label="out-of-pocket maximum" blank="No maximum entered" />}
      </PlanRow>
      <PlanRow k="health.employeeHsa" plan="health">
        {(o) => <><NumberField o={o} path="health.employeeHsa" kind="money" label="your HSA a year" /><Warnings o={o} path="health.employeeHsa" /></>}
      </PlanRow>
      <PlanRow k="health.employerHsa" plan="health">
        {(o) => <NumberField o={o} path="health.employerHsa" kind="money" label="employer HSA a year" />}
      </PlanRow>
      <PlanRow k="health.coverage" plan="health">
        {(o) => <ChoiceField o={o} path="health.coverage" label="health coverage" options={[["self", "Self"], ["family", "Family"]]} />}
      </PlanRow>
    </>
  );
}

function Perks() {
  const api = useLedger();
  return (
    <>
      <FieldRow k="perks.section127">
        {(o) => <><NumberField o={o} path="perks.section127" kind="money" label="education assistance a year" /><Warnings o={o} path="perks.section127" /></>}
      </FieldRow>
      <FieldRow k="perks.commuterMonthly">
        {(o) => <><NumberField o={o} path="perks.commuterMonthly" kind="money" label="commuter benefit a month" /><Warnings o={o} path="perks.commuterMonthly" /></>}
      </FieldRow>
      <FieldRow k="otherBenefits" issues="editor">
        {(o) => (
          <span className="field">
            <EditorCell o={o} row="otherBenefits" summary={otherBenefitsText(o.draft)} empty={!o.draft.otherBenefits?.length}
              start={() => api.set(o, { otherBenefits: [newOtherBenefit()] })} />
            {o.draft.otherBenefits === null && <>
              <button type="button" className="link" aria-label={`Offer ${o.letter}: no other benefits`} onClick={() => api.set(o, { otherBenefits: [] })}>None</button>
              <span className="sub not-counted">Not counted</span>
            </>}
          </span>
        )}
      </FieldRow>
      <EditorRow row="otherBenefits" title="Other benefits">{(o) => <OtherBenefitsEditor o={o} />}</EditorRow>
    </>
  );
}

// ---- where you'd live ----------------------------------------------------------------------------------

/** Every state the tax engine knows (50 and DC), from the city list; a test checks it against the engine's. */
export const US_STATES: string[] = [...new Set(CITIES.flatMap((c) => c.states))].sort();

function EmployerStateField({ o }: { o: AppOffer }) {
  const api = useLedger();
  const residence = o.draft.residence.state;
  const v = o.draft.employerState ?? residence ?? "";
  return (
    <span className="field">
      <select id={fieldId(o.letter, "employerState")} aria-label={`Offer ${o.letter} employer state`} data-help="employerState"
        aria-describedby={hintId("employerState")} value={v} onChange={(e) => api.set(o, { employerState: e.target.value || null })}>
        {!residence && <option value="">—</option>}
        {US_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
      </select>
      <DefaultTick o={o} path="employerState" label="employer state, where you'd live" />
    </span>
  );
}
