import type { OfferWarning } from "../../src/offer/types";
import type { TaxYearRow } from "./partsModel";

// The engine's warnings, as the UI places them (docs/ui-design.md §4.7): the field each is about (shown
// there in detailed mode, and "Show at the field" from L-5). Their kinds are in warningKinds.ts, the part
// the main thread needs (the lead's pointer); this part is used only by chunks that load on first use.

/** The field a warning is about. */
export const WARNING_AT: Partial<Record<OfferWarning["code"], string>> = {
  convenienceRule: "employerState", hsaCap: "health.employeeHsa", section127Cap: "perks.section127", commuterCap: "perks.commuterMonthly",
  k401Cap: "retirement.contributionPct", bonusCutoff: "bonus.cutoff", unlimitedVacation: "timeOff.policy", esppCap: "espp.contributionPct",
  commissionEvenly: "commission.amount", drawNotEarnedBack: "commission.draw.recoverable",
};

/**
 * A year's withholding rounded as displayed, and what it falls short by (so A-6's figure and its derivation foot). The year's federal
 * income tax is the one A-6 and A-7 show (`rows`, from `taxYearsOf`: the same tax, rounded their way), so it reads the same in all
 * three; a year A-6 doesn't list keeps the estimate's own, rounded.
 */
export function withholdingParts(y: { year: number; federalIncomeTax: number; withheld: { regular: number; supplemental: number } },
  rows: readonly TaxYearRow[]) {
  const tax = rows.find((r) => r.year === y.year)?.values.federal ?? Math.round(y.federalIncomeTax);
  const regular = Math.round(y.withheld.regular);
  const supplemental = Math.round(y.withheld.supplemental);
  return { tax, regular, supplemental, short: tax - regular - supplemental };
}
