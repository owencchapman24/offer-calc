import { computeTaxes, paramsForYear } from "../tax/index";
import type { TaxInput, TaxParams } from "../tax/index";
import { clawbackFraction, SECTION_1341_THRESHOLD } from "./clawback";
import { addMonths, fromDays, jan1, toDays, yearOfDay } from "./dates";
import { convenienceRuleWarning } from "./location";
import { bonusEvents, cashEvents, rateAt, type RawEvent, salaryEarned, salaryEvents, salaryPath, usd } from "./streams";
import { checkSchedule, type GrantInstance, nominalVestDays, refresherGrants, rsuEvents, vestDays } from "./vesting";
import type {
  ByComponent, CalendarYearResult, ClawbackResult, CompEvent, Component, EmploymentYearResult, Household,
  LeaveSweepRow, Money, OfferInput, ProjectionOptions, ScenarioResult,
} from "./types";

const round2 = (x: number) => Math.round(x * 100) / 100;
const COMPONENTS: Component[] = ["salary", "bonus", "cash", "rsu", "clawback"];
const sumBy = (events: RawEvent[]) => {
  const by = Object.fromEntries(COMPONENTS.map((c) => [c, 0])) as Record<Component, number>;
  for (const e of events) by[e.component] += e.gross;
  return by;
};
const total = (by: Record<Component, number>) => COMPONENTS.reduce((s, c) => s + by[c], 0);
const rounded = (by: Record<Component, number>): ByComponent =>
  ({ ...Object.fromEntries(COMPONENTS.map((c) => [c, round2(by[c])])), total: round2(total(by)) } as ByComponent);

/**
 * One offer, one scenario: dated payments, taxed per calendar year at the incremental tax they
 * cause (household tax with the offer minus without it), regrouped into employment years.
 * See docs/offer-model.md §2 (calendar vs employment years), §4 (leave date), §6 (tax).
 */
export function projectScenario(offer: OfferInput, household: Household, options: ProjectionOptions = {}): ScenarioResult {
  const scenario = options.scenario ?? "base";
  const years = options.years ?? 5;
  const inflation = options.inflation ?? 0.025;
  if (!Number.isInteger(years) || years < 1 || years > 40) throw new Error("years must be an integer from 1 to 40.");
  if (!(offer.salary.annual >= 0)) throw new Error("Salary must be a non-negative number.");
  const start = toDays(offer.startDate);
  if (yearOfDay(start) < 2026) throw new Error("Start dates before 2026 aren't supported: tax data starts in 2026.");
  const leave = offer.leaveDate !== undefined ? toDays(offer.leaveDate) : undefined;
  if (leave !== undefined && leave < start) throw new Error("The leave date can't be before the start date.");
  const discountRate = options.discountRate ?? 0.05;
  if (!(discountRate > -1)) throw new Error("The discount rate must be greater than -100%.");
  const valuation = options.valuationDate !== undefined ? toDays(options.valuationDate) : undefined;

  // Totals window: [start, start + years) unless a shared window is passed in.
  const windowStart = options.window ? toDays(options.window.start) : start;
  const windowYears = options.window?.years ?? years;
  if (!Number.isInteger(windowYears) || windowYears < 1) throw new Error("Window years must be a whole number >= 1.");
  const windowEnd = addMonths(windowStart, 12 * windowYears);

  // anniversaries[n] = start + n years. Employment year n covers [anniversaries[n-1], anniversaries[n]).
  let trackedYears = years;
  while (addMonths(start, 12 * trackedYears) < windowEnd) trackedYears++;
  const anniversaries = Array.from({ length: trackedYears + 3 }, (_, n) => addMonths(start, 12 * n));
  // Simulate to the end of the calendar year holding the last reported day, so it's taxed in full.
  const until = jan1(yearOfDay(Math.max(anniversaries[years], windowEnd) - 1) + 1);
  // Employment ends after the leave date (inclusive); nothing is earned, vested or granted after it.
  const workEnd = leave !== undefined ? Math.min(until, leave + 1) : until;

  // A payment dated exactly on an anniversary counts toward the year just ended (decision 1),
  // so a 12-month cliff vest is year-1 pay. Infinity = past the anniversaries we track.
  const yearOfPayment = (day: number) => {
    const i = anniversaries.findIndex((d) => d >= day);
    return i === -1 ? Infinity : Math.max(1, i);
  };

  const warnings: string[] = [];
  const convenience = convenienceRuleWarning(offer.residence.state, offer.employerState);
  if (convenience) warnings.push(convenience);
  const path = salaryPath(offer.salary, scenario, start, until);

  // ---- equity: new-hire grants and refresher grants ----------------------------
  const equity = offer.equity;
  const growth = equity?.priceGrowth?.[scenario] ?? 0;
  if (!(growth > -1)) throw new Error("Share-price growth must be greater than -100%.");
  const grants: GrantInstance[] = (equity?.grants ?? []).map((g) => {
    if (!(g.value >= 0)) throw new Error(`Grant "${g.label}" needs a non-negative value.`);
    return {
      label: g.label, value: g.value, schedule: g.schedule,
      grantDay: g.grantDate ? toDays(g.grantDate) : start,
      vestStartDay: g.vestStart ? toDays(g.vestStart) : start,
    };
  });
  const refreshers = equity?.refreshers
    ? refresherGrants(equity.refreshers, equity.refreshers.value[scenario], start, workEnd) : [];
  for (const g of [...grants, ...refreshers]) checkSchedule(g.schedule);

  // ---- payments ------------------------------------------------------------------
  const earned = (from: number, to: number) => salaryEarned(path, from, to);
  const cash = cashEvents(offer.cashAwards ?? [], start);
  const paidCash = cash.filter((e) => e.day < workEnd);
  const raw: RawEvent[] = [
    ...salaryEvents(path, start, workEnd, anniversaries),
    ...(offer.bonus ? bonusEvents(offer.bonus, scenario, start, until, earned, yearOfPayment, warnings, leave) : []),
    ...paidCash,
    ...[...grants, ...refreshers].flatMap((g) => rsuEvents(g, growth, workEnd)),
  ];
  if (raw.some((e) => yearOfDay(e.day) < 2026)) throw new Error("Payments before 2026 aren't supported.");

  // ---- clawbacks, part 1: repayments in the year of the payment reverse those wages ----
  interface Pending { label: string; amount: number; paidDay: number; fraction: number; basis: "gross" | "net"; sameYear: boolean }
  const pending: Pending[] = [];
  if (leave !== undefined && leave < until) {
    (offer.cashAwards ?? []).forEach((award, i) => {
      const paidDay = cash[i].day;
      if (!award.clawback || paidDay >= workEnd) return; // no clawback, or never paid
      const clockStart = (award.clawback.from ?? "start") === "payment" ? paidDay : start;
      const fraction = clawbackFraction(award.clawback, clockStart, leave);
      if (fraction === 0) return;
      const p: Pending = {
        label: award.label, amount: award.amount, paidDay, fraction,
        basis: award.clawback.repay ?? "gross", sameYear: yearOfDay(paidDay) === yearOfDay(leave),
      };
      pending.push(p);
      if (p.sameYear) {
        raw.push({
          day: leave, component: "clawback", gross: -fraction * award.amount,
          label: `${award.label} clawback (reverses ${yearOfDay(leave)} wages)`,
          formula: `-${usd(award.amount)} x ${+(fraction * 100).toFixed(4)}%`,
        });
      }
    });
  }

  // ---- calendar years: incremental tax --------------------------------------
  const firstYear = Math.min(yearOfDay(start), ...raw.map((e) => yearOfDay(e.day)));
  const lastYear = yearOfDay(until - 1);
  const paramsByYear = new Map<number, TaxParams>();
  const calendarYears: CalendarYearResult[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const inYear = raw.filter((e) => yearOfDay(e.day) === year);
    const by = sumBy(inYear);
    const offerGross = total(by);
    const params = paramsForYear(year, { inflation });
    paramsByYear.set(year, params);
    const joint = household.filingStatus === "joint";
    const base: Omit<TaxInput, "wages"> = {
      year, filingStatus: household.filingStatus, state: offer.residence.state, locality: offer.residence.locality,
      ...(joint ? { spouseWages: household.spouseWages?.[year] ?? 0 } : {}),
    };
    const other = household.otherWages?.[year] ?? 0;
    const withoutInput: TaxInput = { ...base, wages: other };
    const withInput: TaxInput = { ...base, wages: other + offerGross };
    const without = computeTaxes(withoutInput, params);
    const withOffer = computeTaxes(withInput, params);
    const offerTax = withOffer.totalTax - without.totalTax;
    calendarYears.push({
      year,
      offerGross: rounded(by),
      withOffer: { input: withInput, result: withOffer },
      withoutOffer: { input: withoutInput, result: without },
      offerTax: round2(offerTax),
      offerTaxRate: offerGross !== 0 ? offerTax / offerGross : 0,
      indexFactor: params.indexFactor,
      projectedLaw: params.projected,
      priorYearRepayments: { repaid: 0, relief: 0 },
    });
  }
  const yearResult = (year: number) => calendarYears.find((c) => c.year === year)!;

  // ---- clawbacks, part 2: tax relief, and later-year repayments ------------------
  const clawbacks: ClawbackResult[] = pending.map((p) => {
    const g = p.fraction * p.amount;
    if (p.sameYear) {
      // The reversal already lowered this year's wages; relief = tax without it - tax with it.
      const cy = yearResult(yearOfDay(leave!));
      const undone = computeTaxes({ ...cy.withOffer.input, wages: cy.withOffer.input.wages + g }, paramsByYear.get(cy.year)!);
      const taxRelief = undone.totalTax - cy.withOffer.result.totalTax;
      // Net repayment: you hand back the after-tax share and the employer keeps the reclaimed withholding.
      const owed = p.basis === "gross" ? g : g - taxRelief;
      return result(p, owed, "same-year wage reversal", taxRelief, g - taxRelief);
    }
    // Repaid in a later year: the payment year's wages (and FICA) stay. Federal relief only, via the
    // IRC 1341 credit: the payment year's federal income tax recomputed without the repaid amount.
    const cy = yearResult(yearOfDay(p.paidDay));
    const owed = p.basis === "gross" ? g : g * (1 - cy.offerTaxRate);
    let taxRelief = 0;
    let treatment: ClawbackResult["treatment"] = "no relief ($3,000 or less)";
    if (owed > SECTION_1341_THRESHOLD) {
      const reduced = computeTaxes({ ...cy.withOffer.input, wages: cy.withOffer.input.wages - owed }, paramsByYear.get(cy.year)!);
      taxRelief = cy.withOffer.result.federalIncomeTax - reduced.federalIncomeTax;
      treatment = "IRC 1341 credit";
    }
    const repaidIn = yearResult(yearOfDay(leave!));
    repaidIn.priorYearRepayments.repaid = round2(repaidIn.priorYearRepayments.repaid + owed);
    repaidIn.priorYearRepayments.relief = round2(repaidIn.priorYearRepayments.relief + taxRelief);
    raw.push({
      day: leave!, component: "clawback", gross: -owed, nonWage: { tax: -taxRelief },
      label: `${p.label} clawback (repays ${yearOfDay(p.paidDay)} pay)`,
      formula: `-${usd(p.amount)} x ${+(p.fraction * 100).toFixed(4)}%${p.basis === "net" ? " after tax" : ""}`,
    });
    warnings.push(`Repaying ${p.label} in ${yearOfDay(leave!)} for pay received in ${yearOfDay(p.paidDay)}: the `
      + "FICA withheld on it isn't automatically refunded (your employer may return it on a corrected W-2c). "
      + "This projection assumes you don't get it back, and gives no state relief.");
    return result(p, owed, treatment, taxRelief, owed - taxRelief);
  });
  function result(p: Pending, owed: number, treatment: ClawbackResult["treatment"], taxRelief: number, netCost: number): ClawbackResult {
    return {
      award: p.label, paidOn: fromDays(p.paidDay), repaidOn: fromDays(leave!), fraction: p.fraction, basis: p.basis,
      owed: round2(owed), treatment, taxRelief: round2(taxRelief), netCost: round2(netCost),
    };
  }
  raw.sort((a, b) => a.day - b.day);

  // Accrued pay belongs to the year its first day falls in.
  const employmentYear = (e: RawEvent) => e.accruedFrom !== undefined
    ? anniversaries.findIndex((d) => d > e.accruedFrom!)
    : yearOfPayment(e.day);

  // ---- events: wages carry their calendar year's offer tax rate ------------------
  const taxed = raw.map((e) => {
    const tax = e.nonWage ? e.nonWage.tax : e.gross * yearResult(yearOfDay(e.day)).offerTaxRate;
    return { ...e, tax, ey: employmentYear(e) };
  });
  // Present value: each event's cash discounted from its date to the valuation date.
  const discount = (day: number) => (valuation === undefined ? undefined : (1 + discountRate) ** (-(day - valuation) / 365.25));
  const inWindow = (day: number) => day >= windowStart && day < windowEnd;
  const events: CompEvent[] = taxed.map((e) => ({
    date: fromDays(e.day),
    component: e.component,
    label: e.label,
    formula: e.formula,
    gross: round2(e.gross),
    calendarYear: yearOfDay(e.day),
    employmentYear: e.ey,
    tax: round2(e.tax),
    net: round2(e.gross - e.tax),
    inWindow: inWindow(e.day),
    ...(valuation !== undefined ? { discountFactor: discount(e.day) } : {}),
  }));
  const money = (weight: (day: number) => number): Money => {
    const m = { gross: 0, tax: 0, net: 0 };
    for (const e of taxed) {
      if (!inWindow(e.day)) continue;
      const w = weight(e.day);
      m.gross += e.gross * w;
      m.tax += e.tax * w;
      m.net += (e.gross - e.tax) * w;
    }
    return { gross: round2(m.gross), tax: round2(m.tax), net: round2(m.net) };
  };
  const windowTotals: ScenarioResult["window"] = {
    start: fromDays(windowStart),
    end: fromDays(windowEnd),
    nominal: money(() => 1),
    ...(valuation !== undefined ? { presentValue: money((day) => discount(day)!) } : {}),
  };

  // ---- employment years ---------------------------------------------------------
  const bonus = offer.bonus;
  const bonusTarget = (n: number) => !bonus ? 0
    : bonus.basis === "percentOfSalary" ? bonus.amount.base * rateAt(path, anniversaries[n - 1])
    : bonus.basis === "fixed" ? bonus.amount.base
    : bonus.amounts[Math.min(n, bonus.amounts.length) - 1].base;
  // Quoted RSUs: new-hire tranches by nominal date at grant value (refreshers aren't in an offer letter).
  const quotedRsu = new Map<number, number>();
  for (const g of grants) {
    nominalVestDays(g).forEach((day, i) => {
      const n = yearOfPayment(day);
      quotedRsu.set(n, (quotedRsu.get(n) ?? 0) + g.value * g.schedule.tranches[i].fraction);
    });
  }
  const quotedCash = new Map<number, number>();
  for (const e of cash) quotedCash.set(yearOfPayment(e.day), (quotedCash.get(yearOfPayment(e.day)) ?? 0) + e.gross);
  const employmentYears: EmploymentYearResult[] = [];
  for (let n = 1; n <= years; n++) {
    const inYear = taxed.filter((e) => e.ey === n);
    const by = sumBy(inYear);
    const tax = inYear.reduce((s, e) => s + e.tax, 0);
    employmentYears.push({
      year: n,
      start: fromDays(anniversaries[n - 1]),
      end: fromDays(anniversaries[n]),
      gross: rounded(by),
      tax: round2(tax),
      net: round2(total(by) - tax),
      quotedTC: round2(rateAt(path, anniversaries[n - 1]) + bonusTarget(n) + (quotedCash.get(n) ?? 0) + (quotedRsu.get(n) ?? 0)),
    });
  }

  // ---- leave summary ----------------------------------------------------------------
  let leaveResult: ScenarioResult["leave"];
  if (leave !== undefined) {
    let unvested = 0;
    for (const g of [...grants, ...refreshers]) {
      vestDays(g).forEach((day, i) => { if (day > leave) unvested += g.value * g.schedule.tranches[i].fraction; });
    }
    leaveResult = { leaveDate: fromDays(leave), unvestedRsuForfeited: round2(unvested), clawbacks };
  }

  const assumptions = [
    "Each payment is taxed in the calendar year it's paid (cash basis).",
    "Salary accrues by calendar month (1/12 of the annual rate); a partial month by days worked / days in the month.",
    "The offer's tax is household tax with the offer minus without it, per calendar year, "
      + "spread over that year's payments in proportion to their size.",
    `Taxed as a full-year resident of ${offer.residence.state}${offer.residence.locality && offer.residence.locality.kind !== "none" ? ` (${offer.residence.locality.kind})` : ""}.`,
    `Tax years after 2026 are projected at ${+(inflation * 100).toFixed(2)}% inflation: federal amounts `
      + "indexed, state law held at 2026 except statutory indexing (CA) and federal links.",
  ];
  if (path.steps.length > 1) {
    assumptions.push(`Salary changes (${scenario} scenario): `
      + path.steps.slice(1).map((s) => `${fromDays(s.day)} ${s.why} to ${usd(round2(s.annual))}`).join("; ") + ".");
  }
  if (bonus) {
    assumptions.push(bonus.basis === "percentOfSalary"
      ? `Bonus: ${+(bonus.amount[scenario] * 100).toFixed(2)}% of salary earned in each period (${scenario} scenario).`
      : bonus.basis === "fixed"
        ? `Bonus: ${usd(bonus.amount[scenario])} a year, prorated by days employed (${scenario} scenario).`
        : `Bonus by employment year: ${bonus.amounts.map((a) => usd(a[scenario])).join(", ")} (last repeats; `
          + `${scenario} scenario), prorated by days employed.`);
  }
  if (valuation !== undefined) {
    assumptions.push(`Present values discount each payment's after-tax cash from its date to ${fromDays(valuation)} `
      + `at ${+(discountRate * 100).toFixed(2)}% a year.`);
  }
  if (equity) {
    assumptions.push(`RSUs are W-2 wages at their value on the vest date and are assumed sold at vest; `
      + `share price grows ${+(growth * 100).toFixed(2)}% a year from each grant date (${scenario} scenario).`);
  }
  if (leave !== undefined) {
    assumptions.push(`Leave date ${fromDays(leave)} is your last day of work (voluntary exit): salary stops, `
      + "unvested RSUs are forfeited, and clawbacks are repaid that day.");
  }

  return {
    label: offer.label, scenario, events, calendarYears, employmentYears, window: windowTotals,
    ...(leaveResult ? { leave: leaveResult } : {}), warnings, assumptions,
  };
}

/**
 * What you keep if you leave after each number of months: the last day is start + months - 1
 * day, so `months` full months are worked. Nominal, after tax and clawbacks.
 */
export function leaveDateSweep(
  offer: OfferInput, household: Household, months: number[], options: ProjectionOptions = {},
): LeaveSweepRow[] {
  const start = toDays(offer.startDate);
  return months.map((m) => {
    if (!Number.isInteger(m) || m < 1) throw new Error("Sweep months must be whole numbers >= 1.");
    const leaveDate = fromDays(addMonths(start, m) - 1);
    const years = Math.max(options.years ?? 5, Math.ceil(m / 12));
    const r = projectScenario({ ...offer, leaveDate }, household, { ...options, years });
    const paid = r.events.filter((e) => e.component !== "clawback").reduce((s, e) => s + e.gross, 0);
    return {
      months: m,
      leaveDate,
      paid: round2(paid),
      clawbackOwed: round2(r.leave!.clawbacks.reduce((s, c) => s + c.owed, 0)),
      netKept: round2(r.events.reduce((s, e) => s + e.net, 0)),
      unvestedRsuForfeited: r.leave!.unvestedRsuForfeited,
    };
  });
}
