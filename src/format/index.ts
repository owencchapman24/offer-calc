import type {
  Assumption, BenefitDetail, BenefitKind, Cliff, ClawbackResult, EventDetail, MonthDay, OfferWarning, RsuGrantRef,
  SalaryChangeReason, VestingSchedule,
} from "../offer/types";
import type { TaxWarning } from "../tax/types";

// Words for the engine's numbers and codes. The engine (src/tax, src/offer, src/col) never formats
// text; this module does, for the UI and the scripts. English, U.S. conventions.

const WHOLE = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PLAIN = new Intl.NumberFormat("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const round2 = (x: number) => Math.round(x * 100) / 100;

/** "$150,000" or "$62,054.79" */
export const usd = (x: number) => `$${(Number.isInteger(x) ? WHOLE : CENTS).format(x)}`;
/** A fraction as a percent with up to `digits` decimals: pct(0.06125) = "6.125%". */
export const pct = (x: number, digits = 4) => `${+(x * 100).toFixed(digits)}%`;
/** "Mar 15" */
export const monthDay = (md: MonthDay) => `${MONTHS[md.month - 1]} ${md.day}`;

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
};

export function benefitLabel(b: { kind: BenefitKind; detail: BenefitDetail }): string {
  if (b.kind === "employee401k") return `Your 401(k) deferral (${b.detail.kind === "deferral" ? b.detail.type : "pretax"})`;
  if (b.kind === "outOfPocket") return `Expected out-of-pocket (${b.detail.kind === "accrual" ? b.detail.usage : "medium"} usage)`;
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

// ---- warnings ------------------------------------------------------------------------------

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
      return `Leaving on ${p.leaveDate} forfeits the bonus for ${p.periodFrom} to ${p.periodTo}: it pays ${p.payDate} `
        + "and requires being employed on the payout date.";
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

// ---- assumptions -----------------------------------------------------------------------------

const reason = (r: SalaryChangeReason) => (r.kind === "merit" ? `${pct(r.rate)} merit raise` : `+${pct(r.stepUp)} promotion`);

export function formatAssumption(a: Assumption): string {
  switch (a.code) {
    case "cashBasis": return "Each payment is taxed in the calendar year it's paid (cash basis).";
    case "monthlyAccrual":
      return "Salary accrues by calendar month (1/12 of the annual rate); a partial month by days worked / days in the month.";
    case "incrementalTax":
      return "The offer's tax is household tax with the offer minus without it, per calendar year, spread over that "
        + "year's payments in proportion to their size.";
    case "residence": return `Taxed as a full-year resident of ${a.params.state}${a.params.locality ? ` (${a.params.locality})` : ""}.`;
    case "projectedLaw":
      return `Tax years after 2026 are projected at ${pct(a.params.inflation, 2)} inflation: federal amounts indexed, `
        + "state law held at 2026 except statutory indexing (CA) and federal links.";
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
    case "hours":
      return `Hours: ${a.params.weekly} a week x ${a.params.weeksPerYear} weeks a year (${a.params.scenario} scenario).`;
    case "costOfLiving": {
      const p = a.params;
      return `Cost of living (${rppVintage(p.rppVintage)}): gross pay is never adjusted. Take-home - ${pct(p.savingsRate, 2)} `
        + `savings - rent = non-housing spending, converted to ${p.reference} dollars by the non-housing RPPs `
        + `(${p.referenceNonHousing} / ${p.areaNonHousing} = ${p.factor.toFixed(4)}). Non-housing RPP = `
        + `${p.nonHousingFormula}; relative prices are held at ${p.rppVintage.dataYear} levels.`;
    }
    case "rent": {
      const p = a.params;
      return `Rent: ${usd(p.monthlyRent)} a month (${p.source === "input" ? "as entered" : "derived from the housing RPPs"}) `
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

// ---- vesting schedules ------------------------------------------------------------------------

const CADENCE: Record<number, string> = { 1: "monthly", 3: "quarterly", 6: "semiannual", 12: "annual" };

/** Plain-language label read off the tranches, e.g. "5/15/40/40, semiannual after a 1-year cliff". */
export function describeSchedule(s: VestingSchedule): string {
  const pcts: number[] = [];
  for (const t of s.tranches) {
    const year = Math.max(0, Math.ceil(t.month / 12) - 1);
    pcts[year] = (pcts[year] ?? 0) + t.fraction * 100;
  }
  const split = Array.from(pcts, (p) => +(p ?? 0).toFixed(1)).join("/");
  const months = s.tranches.map((t) => t.month);
  const gaps = months.slice(1).map((m, i) => m - months[i]);
  if (gaps.length === 0) return `${split}, all at month ${months[0]}`;
  if (!gaps.every((g) => g === gaps[0])) return `${split} by year, on a custom schedule`;
  const cadence = CADENCE[gaps[0]] ?? `every ${gaps[0]} months`;
  if (months[0] === gaps[0]) return `${split}, ${cadence}`;
  const cliff = months[0] % 12 === 0 ? `${months[0] / 12}-year` : `${months[0]}-month`;
  return `${split}, ${cadence} after a ${cliff} cliff`;
}
