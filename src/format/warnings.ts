import type { OfferWarning } from "../offer/types";
import type { TaxWarning } from "../tax/types";
import { monthDay, PLAIN, round2, usd } from "./numbers";

// Words for the engine's warnings: the app shows them at the field they're about (detailed mode) and
// the scripts print them.

export function formatWarning(w: OfferWarning | TaxWarning): string {
  switch (w.code) {
    case "convenienceRule": {
      const { residenceState: r, employerState: e } = w.params;
      return `The employer is in ${e}, which can tax a nonresident's remote-work wages under its convenience-of-employer `
        + `rule. If you work from home in ${r}, ${e} may tax this pay too, and ${r}'s credit may not offset it fully. `
        + `This projection taxes ${r} residence only.`;
    }
    case "bonusCutoff": {
      const p = w.params;
      return `Start date ${p.start} is on or after the ${monthDay(p.cutoff)} bonus cutoff, so the ${p.periodFrom} to `
        + `${p.periodTo} period pays nothing.`;
    }
    case "bonusForfeited": {
      const p = w.params;
      return `Leaving on ${p.leaveDate} forfeits ${usd(p.earned)} earned toward the bonus for ${p.periodFrom} to ${p.periodTo} `
        + `(it pays ${usd(p.full)} on ${p.payDate}, to those employed that day).`;
    }
    case "k401Cap":
      return `Your ${w.params.year} 401(k) deferrals reach the 402(g) limit of ${usd(round2(w.params.limit))} before `
        + "year-end: deferrals and any match stop for the rest of that year (no true-up assumed).";
    case "hsaCap":
      return `HSA contributions in ${w.params.year} reach the ${usd(round2(w.params.limit))} limit (yours plus your `
        + "employer's); yours are capped there.";
    case "section127Cap":
      return `Section 127 help above ${usd(round2(w.params.limit))} in ${w.params.year} is taxable; only the limit is counted.`;
    case "commuterCap":
      return `Commuter benefits above ${usd(round2(w.params.monthlyLimit))} a month in ${w.params.year} are taxable; `
        + "only the limit is counted.";
    case "clawbackFica":
      return `Repaying ${w.params.award} in ${w.params.repaidYear} for pay received in ${w.params.paidYear}: the FICA `
        + "withheld on it isn't automatically refunded (your employer may return it on a corrected W-2c). This "
        + "projection assumes you don't get it back, and gives no state relief.";
    case "withholdingShortfall":
      return `Federal withholding on ${w.params.year} pay falls about ${usd(Math.round(w.params.balanceDue))} short of `
        + `its federal income tax${w.params.supplemental ? ": bonuses and RSU vests are withheld at the flat 22% supplemental rate" : ""}. `
        + `Expect to owe it in April ${w.params.year + 1}, or raise your withholding on Form W-4.`;
    case "itemizing":
      return `Itemizing beats the standard deduction here (SALT and other deductions total $${PLAIN.format(Math.round(w.params.deduction))}).`;
    case "k401OverLimit": return `401(k) deferral exceeds the ${w.params.year} limit of $${PLAIN.format(w.params.limit)}.`;
    case "amtNotModeled": return "Alternative minimum tax is not modeled; check AMT above roughly $400k of income.";
    case "projectedLaw":
      return `${w.params.year} tax law is projected from 2026: federal amounts indexed for inflation, state and local law held at 2026.`;
    case "nycNonresident": return "NYC tax applies to NYC residents only; check your state selection.";
    case "phillyNonresident": return "Philadelphia nonresident wage tax applies only to days physically worked in the city.";
    case "flatLocalRate": return `${w.params.label}: user-supplied flat rate of ${(w.params.rate * 100).toFixed(2)}%.`;
    case "headOfHouseholdState": return "Head of household: state tax uses single-filer brackets and deductions (approximation).";
    case "ctPersonalCredit":
      return "Connecticut personal tax credit (1-75% by income) not modeled; tax may be slightly overstated.";
    case "stateNote": return w.params.note;
  }
}
