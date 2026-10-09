import type { RentEstimate } from "../../src/col/rent";
import { BonusYearsEditor, GrantsEditor, newGrant, newPromotion, newRefreshers, PromotionsEditor, RefreshersEditor } from "./editors";
import { ChoiceField, DefaultTick, EditButton, EditorRow, FieldRow, MonthDayField, NumberField, RangeField, useLedger } from "./fields";
import { type AppOffer, ASSUMPTIONS, bonusBasis, type OfferDraft } from "./model";
import { BonusRow, CityRow, RentRow, SalaryRow, StartRow } from "./rows";
import type { LedgerSection } from "./session";
import {
  bonusYearsText, cashAwardsText, employerStateText, grantsText, healthText, perksText, promotionsText, refreshersText, rentGrowthText, retirementText,
} from "./summary";
import { Trace } from "./Tickmarks";

// Detailed mode's sections (docs/ui-design.md §3.3), one open at a time, each a run of rows with one
// cell per offer. Complex inputs open an editor beneath their row (W3). Inputs not yet editable here
// show what's counted, as entered, so nothing hidden changes the results silently.

export function DetailedSection({ id, rents }: { id: LedgerSection; rents: Record<string, RentEstimate> }) {
  switch (id) {
    case "pay": return <Pay />;
    case "bonus": return <Bonus />;
    case "cash": return <ShownRow path="cashAwards" label="Cash awards" text={cashAwardsText} />;
    case "equity": return <Equity />;
    case "retirement": return <ShownRow path="retirement" label="401(k)" text={retirementText} />;
    case "health": return <ShownRow path="health" label="Health plan" text={healthText} />;
    case "perks": return <ShownRow path="perks" label="Perks" text={perksText} />;
    case "hours": return <Hours />;
    case "where":
      return (
        <>
          <CityRow />
          <RentRow rents={rents} />
          <ShownRow path="employerState" label="Employer state" text={employerStateText} />
          <ShownRow path="costOfLiving.rentGrowth" label="Rent growth" text={(d) => rentGrowthText(d, ASSUMPTIONS.inflation)} />
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
        ? <button type="button" className="link edit-button" id={`in-${o.letter}-${row.replace(/\./g, "-")}`} data-help={row} onClick={() => { start(); api.openEditor(row, o.letter); }}>
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
    </>
  );
}

function Hours() {
  return (
    <>
      <FieldRow k="hours.weekly">{(o) => <RangeField o={o} path="hours.weekly" kind="number" unit="hrs" label="weekly hours" blank="Not counted" />}</FieldRow>
      <FieldRow k="hours.weeksPerYear">{(o) => <NumberField o={o} path="hours.weeksPerYear" kind="number" unit="weeks" label="weeks a year" />}</FieldRow>
    </>
  );
}

/** A row that isn't editable here yet: what each offer has, counted as shown. */
function ShownRow({ path, label, text }: { path: string; label: string; text: (d: OfferDraft) => string }) {
  const api = useLedger();
  return (
    <div className="row">
      <div className="row-label">
        <span className="row-name">{label}</span>
        <div className="help"><span className="hint">Counted as shown; editing it here comes next.</span></div>
      </div>
      {api.offers.map((o) => <Trace key={o.id} id={`in.${o.letter}.${path}`} className="cell shown">{text(o.draft)}</Trace>)}
    </div>
  );
}
