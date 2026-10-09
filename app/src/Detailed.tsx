import type { RentEstimate } from "../../src/col/rent";
import { useLedger } from "./fields";
import { ASSUMPTIONS, type OfferDraft } from "./model";
import { BonusRow, CityRow, RentRow, SalaryRow, StartRow } from "./rows";
import type { LedgerSection } from "./session";
import {
  bonusText, cashAwardsText, employerStateText, grantsText, healthText, perksText, promotionsText, refreshersText, rentGrowthText, retirementText,
} from "./summary";
import { Trace } from "./Tickmarks";
import { percent } from "./text";

// Detailed mode's sections (docs/ui-design.md §3.3), one open at a time. Inputs not yet editable here
// show what's counted, as entered, so nothing hidden changes the results silently.

export function DetailedSection({ id, rents }: { id: LedgerSection; rents: Record<string, RentEstimate> }) {
  switch (id) {
    case "pay":
      return (
        <>
          <SalaryRow />
          <StartRow />
          <ShownRow path="salary.raise" label="Raises" text={(d) => (d.salary.raise ? `${percent(d.salary.raise.base)} a year` : "0% a year")} />
          <ShownRow path="salary.promotions" label="Promotions" text={promotionsText} />
        </>
      );
    case "bonus":
      return (
        <>
          <BonusRow />
          <ShownRow path="bonus.payOn" label="Timing" text={(d) => bonusText(d)} />
        </>
      );
    case "cash": return <ShownRow path="cashAwards" label="Cash awards" text={cashAwardsText} />;
    case "equity":
      return (
        <>
          <ShownRow path="equity.grants" label="RSU grants" text={grantsText} />
          <ShownRow path="equity.refreshers" label="Refreshers" text={refreshersText} />
        </>
      );
    case "retirement": return <ShownRow path="retirement" label="401(k)" text={retirementText} />;
    case "health": return <ShownRow path="health" label="Health plan" text={healthText} />;
    case "perks": return <ShownRow path="perks" label="Perks" text={perksText} />;
    case "hours": return <ShownRow path="hours.weekly" label="Hours" text={(d) => (d.hours.weekly ? `${d.hours.weekly.base} a week` : "Not counted")} />;
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
