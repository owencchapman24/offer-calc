import type {
  Assumption, BenefitDetail, BenefitKind, Cliff, ClawbackResult, EventDetail, RsuGrantRef, SalaryChangeReason,
} from "../offer/types";
import type { RentEstimate } from "../col/rent";
import { pct, PLAIN, round2, usd } from "./numbers";

// Words for the engine's numbers and codes. The engine (src/tax, src/offer, src/col) never formats
// text; this module does, for the UI and the scripts. English, U.S. conventions. Its parts are their own
// modules (numbers, issues, schedule, warnings) so the app's chunks each take only what they use.

export * from "./numbers";
export * from "./issues";
export * from "./schedule";
export * from "./warnings";

// ---- payments --------------------------------------------------------------------

const grantLabel = (g: RsuGrantRef) =>
  g.kind === "grant" ? g.label : `${g.label ?? "Refresher"} ${g.number} (granted ${g.grantDate})`;

/** What a payment is: "Salary 2026-08-03 to 2026-08-31", "RSU: New-hire grant, tranche 1 of 7". */
export function eventLabel(d: EventDetail): string {
  switch (d.kind) {
    case "salary": return `Salary ${d.from} to ${d.to}`;
    case "bonus": return `Bonus for ${d.periodFrom} to ${d.periodTo}${d.proratedToLeave ? " (prorated to leave date)" : ""}`;
    case "cash": return d.award;
    case "rsu": return `RSU: ${grantLabel(d.grant)}, tranche ${d.tranche} of ${d.tranches}${d.nominalDate ? ` (nominal ${d.nominalDate})` : ""}`;
    case "clawback": return d.sameYear ? `${d.award} clawback (reverses ${d.repaidYear} wages)` : `${d.award} clawback (repays ${d.paidYear} pay)`;
    case "vacationPayout": return `Unused vacation paid out (${PLAIN.format(round2(d.days))} days)`;
    case "espp": return `ESPP purchase, offering of ${d.offeringStart}${d.purchases > 1 ? `, purchase ${d.purchase} of ${d.purchases}` : ""}, sold at once`;
    case "benefit": return `${d.label} (taxable benefit) ${d.from} to ${d.to}`;
  }
}

/** The arithmetic behind a payment: "$150,000 / 12 x 29/31 days". */
export function eventFormula(d: EventDetail): string {
  switch (d.kind) {
    case "salary":
      return `${usd(round2(d.annual))} / 12${d.days === d.daysInMonth ? "" : ` x ${d.days}/${d.daysInMonth} days`}`;
    case "bonus":
      return d.basis === "percentOfSalary"
        ? `${pct(d.rate)} x ${usd(round2(d.salaryEarned))} salary earned in the period`
        : `${usd(d.amount)}${d.employmentYear ? ` (employment year ${d.employmentYear} amount)` : ""} x ${d.daysEmployed}/${d.periodDays} days employed`;
    case "cash": return usd(d.amount);
    case "rsu": return `${usd(d.grantValue)} x ${pct(d.fraction)} x ${d.priceFactor.toFixed(4)} price factor`;
    case "clawback": return `-${usd(d.amount)} x ${pct(d.fraction)}${!d.sameYear && d.basis === "net" ? " after tax" : ""}`;
    case "vacationPayout": return `${PLAIN.format(round2(d.days))} days x ${usd(round2(d.annual))} / ${d.workdays} workdays`;
    case "espp": return `${usd(round2(d.used))} x ${d.priceRatio.toFixed(6)} / ${d.pricePaid.toFixed(6)} - ${usd(round2(d.used))}`
      + `${d.refunded > 0.005 ? ` (${usd(round2(d.refunded))} over the $25,000 limit refunded)` : ""}`;
    case "benefit": return `${usd(round2(d.annual))} / 12${d.days === d.daysInMonth ? "" : ` x ${d.days}/${d.daysInMonth} days`}`;
  }
}

// ---- benefits ----------------------------------------------------------------------

const BENEFIT_LABELS: Record<Exclude<BenefitKind, "employee401k" | "outOfPocket">, string> = {
  employer401k: "Employer 401(k) contribution",
  premium: "Health premium (pre-tax)",
  employerHsa: "Employer HSA contribution",
  employeeHsa: "Your HSA contribution (pre-tax)",
  section127: "Section 127 education / student loan help (tax-free)",
  commuter: "132(f) commuter benefit (tax-free)",
  espp: "ESPP money (yours, held for a purchase)",
  otherBenefit: "Other benefit (tax-free, as entered)",
};

export function benefitLabel(b: { kind: BenefitKind; detail: BenefitDetail }): string {
  if (b.kind === "employee401k") return `Your 401(k) deferral (${b.detail.kind === "deferral" ? b.detail.type : "pretax"})`;
  if (b.kind === "outOfPocket") return `Expected out-of-pocket (${b.detail.kind === "accrual" ? b.detail.usage : "medium"} usage)`;
  if (b.detail.kind === "otherBenefit") return `${b.detail.label} (tax-free, as entered)`;
  return BENEFIT_LABELS[b.kind];
}

const partOfMonth = (days: number, daysInMonth: number) => (days < daysInMonth ? ` x ${days}/${daysInMonth} days` : "");

export function benefitFormula(b: { kind: BenefitKind; detail: BenefitDetail }): string {
  const d = b.detail;
  switch (d.kind) {
    case "deferral": return `${pct(d.rate)} x ${usd(round2(d.pay))}${d.capped ? ", capped at the 402(g) limit" : ""}`;
    case "employerContribution": return `${pct(d.rate)} of ${usd(round2(d.pay))}`;
    case "accrual":
      return `${usd(d.annual)} / 12${partOfMonth(d.days, d.daysInMonth)}${b.kind === "employeeHsa" && d.capped ? ", capped at the HSA limit" : ""}`;
    case "monthly": return `${usd(round2(d.monthly))} a month${partOfMonth(d.days, d.daysInMonth)}`;
    case "esppContribution": return `${pct(d.rate)} of ${usd(round2(d.pay))}`;
    case "esppOut": return d.why === "purchase" ? "used at a purchase, or refunded over the limit" : "refunded on your last day";
    case "otherBenefit": return `${usd(round2(d.annual))} / 12${partOfMonth(d.days, d.daysInMonth)}`;
  }
}

// ---- leaving ----------------------------------------------------------------------------

export function cliffLabel(c: Cliff): string {
  const d = c.detail;
  if (d.kind === "clawbackStep") return `${d.award} clawback ${c.kind === "clawbackCleared" ? "ends" : "steps down"}`;
  if (d.kind === "retirementVest") return `401(k) match vests to ${pct(d.vestedShare, 1)} (${d.serviceYears} years of service)`;
  return eventLabel(d);
}

export const clawbackTreatment = (t: ClawbackResult["treatment"]) =>
  ({ sameYearReversal: "same-year wage reversal", irc1341Credit: "IRC 1341 credit", noRelief: "no relief ($3,000 or less)" })[t];

// ---- assumptions -----------------------------------------------------------------------------

const reason = (r: SalaryChangeReason) => (r.kind === "merit" ? `${pct(r.rate)} merit raise` : `+${pct(r.stepUp)} promotion`);

const LOCALITY = { nyc: "New York City", philadelphia: "Philadelphia", flat: "its local wage tax" } as const;

export function formatAssumption(a: Assumption): string {
  switch (a.code) {
    case "cashBasis": return "Each payment is taxed in the calendar year it's paid (cash basis).";
    case "monthlyAccrual":
      return "Salary accrues by calendar month (1/12 of the annual rate); a partial month by days worked / days in the month.";
    case "incrementalTax":
      return "The offer's tax is household tax with the offer minus without it, per calendar year, spread over that "
        + "year's payments in proportion to their size.";
    case "residence": return `Taxed as a full-year resident of ${a.params.state}${a.params.locality ? ` and ${LOCALITY[a.params.locality]}` : ""}.`;
    case "projectedLaw":
      return `Tax years after 2026 are projected at ${pct(a.params.inflation, 2)} inflation: federal amounts indexed from the latest `
        + "published (2026's, or a later year's where the IRS has published it), state law held at 2026 except statutory indexing (CA) "
        + "and federal links.";
    case "salaryChanges":
      return `Salary changes (${a.params.scenario} scenario): ${a.params.changes
        .map((c) => `${c.date} ${c.reasons.map(reason).join(" + ")} to ${usd(round2(c.annual))}`).join("; ")}.`;
    case "bonus": {
      const p = a.params;
      if (p.basis === "percentOfSalary") return `Bonus: ${pct(p.rate, 2)} of salary earned in each period (${p.scenario} scenario).`;
      if (p.basis === "fixed") return `Bonus: ${usd(p.amount)} a year, prorated by days employed (${p.scenario} scenario).`;
      return `Bonus by employment year: ${p.amounts.map(usd).join(", ")} (last repeats; ${p.scenario} scenario), prorated by days employed.`;
    }
    case "presentValue":
      return `Present values discount each payment's after-tax cash from its date to ${a.params.valuationDate} at `
        + `${pct(a.params.discountRate, 2)} a year.`;
    case "rsu":
      return "RSUs are W-2 wages at their value on the vest date and are assumed sold at vest; share price grows "
        + `${pct(a.params.priceGrowth, 2)} a year from each grant date (${a.params.scenario} scenario).`;
    case "leaveDate":
      return `Leave date ${a.params.leaveDate} is your last day of work (voluntary exit): salary stops, unvested RSUs `
        + "are forfeited, and clawbacks are repaid that day.";
    case "retirement": {
      const p = a.params;
      return `401(k): ${pct(p.contributionPct, 2)} ${p.type} deferral of ${p.eligiblePay === "salaryAndBonus" ? "salary and bonus" : "salary"}, `
        + "capped at the 402(g) limit; the match follows each paycheck's deferral (no true-up). Employer money "
        + `${p.vestedShare === 1 ? "is fully vested" : `is ${pct(p.vestedShare, 1)} vested`} after ${p.completedYears} completed `
        + "years. Your deferrals count as yours at face value (deferred tax on withdrawal and investment growth aren't modeled).";
    }
    case "health":
      return "Health: premiums and your HSA contributions are pre-tax (section 125); net health cost = premiums + expected "
        + `out-of-pocket (${a.params.usage} usage, capped at the out-of-pocket max) - employer HSA. Held flat each year.`;
    case "perks":
      return "Perks are tax-free and counted at face value; the pre-tax equivalent is face / (1 - that year's marginal rate).";
    case "otherBenefits": {
      const b = a.params.benefits;
      return `Other benefits, each a yearly amount accrued monthly while employed: ${b.map((x) => `${x.label} ${usd(round2(x.annual))} a year, `
        + `${x.taxable ? "taxable (pay)" : "tax-free as entered (face value)"}`).join("; ")}.`;
    }
    case "espp": {
      const p = a.params;
      return `ESPP: ${pct(p.contributionPct, 2)} of ${p.eligiblePay === "salaryAndBonus" ? "salary and bonus" : "salary"}, after tax, into `
        + `${p.offeringMonths}-month offerings with ${p.purchasesPerOffering === 1 ? "a purchase at each end" : `${p.purchasesPerOffering} purchases each`}, `
        + `${pct(p.discount, 2)} off${p.lookback ? " the lower of the offering's first-day and purchase-day value" : " the purchase-day value"}, `
        + `within $25,000 a year (IRC 423(b)(8)); the share price grows ${pct(p.priceGrowth, 2)} a year. Each lot is sold the day it's bought: `
        + "its spread is wages for income tax, not FICA (IRC 3121(a)(22)), with no withholding required. Holding shares after purchase "
        + "is an investment decision and isn't modeled.";
    }
    case "hours": {
      const d = a.params.daysOff;
      return `Hours: ${a.params.weekly} a week x ${PLAIN.format(round2(a.params.weeksPerYear))} weeks a year${d
        ? ` (52 - (${d.vacation} vacation + ${d.holidays} holidays + ${d.sick} sick days) / 5)` : ""} (${a.params.scenario} scenario).`;
    }
    case "vacation": {
      const p = a.params;
      const law = p.required ? `${p.employerState} requires unused vacation be paid when you leave${p.afterYears ? ` after ${p.afterYears} year of service` : ""}`
        : `${p.employerState} leaves it to the employer's policy`;
      if (p.policy === "unlimited") return `Vacation: unlimited, so nothing accrues and nothing is paid when you leave (${law}).`;
      const banks = p.gives - p.taken;
      return `Vacation: ${p.gives} days a year, ${p.taken} taken: ${banks > 0 ? `${banks} a year bank, accrued and used evenly${p.cap !== undefined
        ? `, up to ${p.cap}` : ""}` : "nothing banks"}. ${law}${p.payout === "always" ? "; the offer's policy pays it out" : ""}; paid at the salary rate `
        + "on the last day / 260, as supplemental wages.";
    }
    case "costOfLiving": {
      const p = a.params;
      return `Cost of living (${rppVintage(p.rppVintage)}): gross pay is never adjusted. Take-home - ${pct(p.savingsRate, 2)} `
        + `savings - rent = non-housing spending, converted to ${p.reference} dollars by the non-housing RPPs `
        + `(${p.referenceNonHousing} / ${p.areaNonHousing} = ${p.factor.toFixed(4)}). Non-housing RPP = `
        + `${p.nonHousingFormula}; relative prices are held at ${p.rppVintage.dataYear} levels.`;
    }
    case "rent": {
      const p = a.params;
      return `Rent: ${usd(p.monthlyRent)} a month (${rentSource(p.source, p.estimate)}) `
        + `from your start date, rising ${pct(p.growth, 2)} a year at each lease anniversary`
        + `${p.growthSource === "inflation" ? " (the inflation rate)" : ""}; paid only while employed there.`;
    }
    case "colAdjustedTotal":
      return "COL-adjusted total = discretionary income after rent - expected out-of-pocket health spending (local, so "
        + "converted the same way) + money not spent locally, at face value: planned savings, your 401(k) and HSA "
        + "contributions, vested employer 401(k), employer HSA and perks.";
    case "withholding":
      return "Withholding is estimated, federal income tax only: salary by the IRS percentage method (2020+ Form W-4 with "
        + "your filing status and nothing else entered, monthly pay); bonuses, RSU vests and cash awards at the 22% "
        + "supplemental rate (37% over $1 million a year). State withholding, FICA and other jobs' withholding aren't included.";
  }
}

export const rppVintage = (v: { dataYear: number; release: string }) => `${v.dataYear} RPPs. ${v.release}`;

const BEDROOMS = ["studio", "1 bedroom", "2 bedrooms", "3 bedrooms", "4 bedrooms"];

/** Where a rent came from: "as entered", "HUD FY2027 Fair Market Rent, 1 bedroom, New York, NY HUD Metro FMR Area". */
export function rentSource(source: "input" | "fmr" | "derived", estimate?: RentEstimate): string {
  if (source === "input" || !estimate) return source === "derived" ? "derived from the housing RPPs" : "as entered";
  return estimate.source === "fmr"
    ? `HUD FY${estimate.fiscalYear} Fair Market Rent, ${BEDROOMS[estimate.bedrooms]}, ${estimate.hudAreaName}`
    : `derived from the housing RPPs: ${usd(estimate.anchorRent)} x ${estimate.housingRatio.toFixed(4)}`;
}
