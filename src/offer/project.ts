import { computeTaxes, paramsForYear } from "../tax/index";
import type { TaxInput, TaxParams } from "../tax/index";
import { clawbackFraction, SECTION_1341_THRESHOLD } from "./clawback";
import { addMonths, fromDays, jan1, toDays, yearOfDay } from "./dates";
import { convenienceRuleWarning } from "./location";
import { bonusEvents, cashEvents, rateAt, type RawEvent, salaryEarned, salaryEvents, salaryPath } from "./streams";
import { checkSchedule, type GrantInstance, nominalVestDays, refresherGrants, rsuEvents, vestDays } from "./vesting";
import {
  healthFlows, monthlyPieces, otherBenefitStreams, perkFlows, type RawBenefit, retirementFlows, serviceYears, vestedFraction,
} from "./benefits";
import { NATIONAL, nonHousingRpp, RPP, rppArea } from "../col/index";
import { estimateRent, type RentEstimate } from "../col/rent";
import { daysOff, payoutRule, VACATION_PAYOUT_STATES, vacationBanked, weeksWorked, WORKDAYS_A_YEAR } from "./timeOff";
import { esppFlows } from "./espp";
import type {
  Assumption, BenefitEvent, BenefitTotals, ByComponent, CalendarYearResult, CashTotals, ClawbackResult, CompEvent, Component,
  CostOfLivingInfo, CostOfLivingTotals, EmploymentYearResult, OfferWarning, Household, ISODate, LeaveDayRow, LeaveResult, LeaveSweepRow,
  OfferInput, ProjectionOptions, ScenarioResult,
} from "./types";

const round2 = (x: number) => Math.round(x * 100) / 100;
const COMPONENTS: Component[] = ["salary", "bonus", "cash", "rsu", "clawback", "espp", "benefit"];
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
  // Accrued pay, benefits and rent are cut into pieces at month starts, at anniversaries (each piece is in one employment year)
  // and at the window's edges (each piece is wholly inside the window or outside it). Cut only at anniversaries, an offer starting
  // after the 1st of a month had its last month in the window dated at the month's end, outside it (audit C3).
  const cuts = [...new Set([...anniversaries, windowStart, windowEnd])].sort((a, b) => a - b);
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

  const warnings: OfferWarning[] = [];
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
      grant: { kind: "grant", label: g.label }, value: g.value, schedule: g.schedule,
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
  // Other benefits (4j): the taxable ones are pay, paid with salary; the tax-free ones are benefit flows, below.
  const others = otherBenefitStreams(offer.otherBenefits ?? [], start, workEnd, cuts);
  const raw: RawEvent[] = [
    ...salaryEvents(path, start, workEnd, cuts),
    ...others.events,
    ...(offer.bonus ? bonusEvents(offer.bonus, scenario, start, until, earned, yearOfPayment, warnings, leave) : []),
    ...paidCash,
    ...[...grants, ...refreshers].flatMap((g) => rsuEvents(g, growth, workEnd)),
  ];
  if (raw.some((e) => yearOfDay(e.day) < 2026)) throw new Error("Payments before 2026 aren't supported.");

  // ---- unused vacation, paid on the last day (docs/v2-plan.md, 4a) ----------------------------
  // It banks evenly over each employment year worked (the part of a year counting by its days), and is paid at the salary rate
  // that day / 260 where the employer state's law or the offer's policy pays it. A supplemental wage payment, with FICA (Pub. 15
  // section 7: "an annual lump-sum payment for unused leave"), as a cash payment of its own kind.
  let vacation: LeaveResult["vacation"] | undefined;
  if (leave !== undefined) {
    let service = 0;
    for (let n = 1; n < anniversaries.length && anniversaries[n - 1] <= leave; n++) {
      service += (Math.min(leave + 1, anniversaries[n]) - anniversaries[n - 1]) / (anniversaries[n] - anniversaries[n - 1]);
    }
    const banked = vacationBanked(offer.timeOff, service);
    const completed = anniversaries.filter((d, n) => n >= 1 && d <= leave + 1).length;
    const rule = offer.timeOff?.policy === "unlimited" ? null : payoutRule(offer.timeOff, offer.employerState, completed);
    let paid = 0;
    if (rule?.paid && banked > 0 && leave < until) {
      const annual = rateAt(path, leave);
      paid = (banked * annual) / WORKDAYS_A_YEAR;
      raw.push({ day: leave, component: "cash", gross: paid,
        detail: { kind: "vacationPayout", days: banked, annual, workdays: WORKDAYS_A_YEAR, rule } });
    }
    vacation = { banked, paid, rule };
  }
  // ---- the ESPP (docs/v2-plan.md, 4i): each purchase's gain is pay, sold the same day; the plan's money is yours meanwhile ------
  const espp = offer.espp ? esppFlows(offer.espp, raw, start, until, leave, growth, warnings) : undefined;
  if (espp) {
    raw.push(...espp.events);
    warnings.push({ code: "esppSoldAtPurchase", params: {} });
  }
  const taxFreeLabels = (offer.otherBenefits ?? []).filter((x) => !x.taxable).map((x) => x.label);
  if (taxFreeLabels.length) warnings.push({ code: "taxFreeAsEntered", params: { labels: taxFreeLabels } });
  if (offer.timeOff?.policy === "unlimited" && offer.employerState === "CA") {
    warnings.push({ code: "unlimitedVacation", params: { state: offer.employerState } });
  }

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
          detail: { kind: "clawback", award: award.label, amount: award.amount, fraction, basis: p.basis, sameYear: true,
            paidYear: yearOfDay(paidDay), repaidYear: yearOfDay(leave) },
        });
      }
    });
  }

  // ---- tax parameters for every year we simulate --------------------------------
  const firstYear = Math.min(yearOfDay(start), ...raw.map((e) => yearOfDay(e.day)));
  const lastYear = yearOfDay(until - 1);
  const paramsByYear = new Map<number, TaxParams>();
  for (let year = firstYear; year <= lastYear; year++) paramsByYear.set(year, paramsForYear(year, { inflation }));
  const federal = (day: number) => paramsByYear.get(yearOfDay(day))?.federal ?? paramsByYear.get(lastYear)!.federal;

  // ---- benefits: 401(k), health, perks (flows while employed) ----------------------
  const benefitRaw: RawBenefit[] = [];
  let pretaxByYear = new Map<number, number>();
  let section125ByYear = new Map<number, number>();
  if (offer.retirement) {
    const r = retirementFlows(offer.retirement, raw, (y) => federal(jan1(y)).k401Limit, warnings);
    benefitRaw.push(...r.flows);
    pretaxByYear = r.pretaxByYear;
  }
  if (offer.health) {
    const coverage = offer.health.coverage ?? "self";
    const h = healthFlows(offer.health, household.healthUsage ?? "medium", start, workEnd, cuts,
      (y) => federal(jan1(y)).hsaLimit[coverage], warnings);
    benefitRaw.push(...h.flows);
    section125ByYear = h.section125ByYear;
  }
  if (espp) benefitRaw.push(...espp.flows);
  benefitRaw.push(...others.flows);
  if (offer.perks) {
    benefitRaw.push(...perkFlows(offer.perks, start, workEnd, cuts, (y) => ({
      section127: federal(jan1(y)).section127Limit, commuterMonthly: federal(jan1(y)).commuterMonthlyLimit,
    }), warnings));
  }

  // ---- calendar years: incremental tax --------------------------------------
  const calendarYears: CalendarYearResult[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const inYear = raw.filter((e) => yearOfDay(e.day) === year);
    const by = sumBy(inYear);
    const offerGross = total(by);
    const params = paramsByYear.get(year)!;
    const joint = household.filingStatus === "joint";
    const base: Omit<TaxInput, "wages"> = {
      year, filingStatus: household.filingStatus, state: offer.residence.state, locality: offer.residence.locality,
      ...(joint ? { spouseWages: household.spouseWages?.[year] ?? 0 } : {}),
    };
    const other = household.otherWages?.[year] ?? 0;
    const withoutInput: TaxInput = { ...base, wages: other };
    // The offer's pre-tax 401(k) deferrals and cafeteria-plan amounts (premiums, your HSA) lower its taxable wages; an ESPP
    // purchase's gain is wages for income tax, not FICA (IRC 3121(a)(22)).
    const withInput: TaxInput = {
      ...base, wages: other + offerGross,
      ...(by.espp ? { statutoryOptionIncome: by.espp } : {}),
      ...(pretaxByYear.has(year) ? { pretax401k: pretaxByYear.get(year)! } : {}),
      ...(section125ByYear.has(year) ? { section125: section125ByYear.get(year)! } : {}),
    };
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
      return result(p, owed, "sameYearReversal", taxRelief, g - taxRelief);
    }
    // Repaid in a later year: the payment year's wages (and FICA) stay. Federal relief only, via the
    // IRC 1341 credit: the payment year's federal income tax recomputed without the repaid amount.
    const cy = yearResult(yearOfDay(p.paidDay));
    const owed = p.basis === "gross" ? g : g * (1 - cy.offerTaxRate);
    let taxRelief = 0;
    let treatment: ClawbackResult["treatment"] = "noRelief";
    if (owed > SECTION_1341_THRESHOLD) {
      const reduced = computeTaxes({ ...cy.withOffer.input, wages: cy.withOffer.input.wages - owed }, paramsByYear.get(cy.year)!);
      taxRelief = cy.withOffer.result.federalIncomeTax - reduced.federalIncomeTax;
      treatment = "irc1341Credit";
    }
    const repaidIn = yearResult(yearOfDay(leave!));
    repaidIn.priorYearRepayments.repaid = round2(repaidIn.priorYearRepayments.repaid + owed);
    repaidIn.priorYearRepayments.relief = round2(repaidIn.priorYearRepayments.relief + taxRelief);
    raw.push({
      day: leave!, component: "clawback", gross: -owed, nonWage: { tax: -taxRelief },
      detail: { kind: "clawback", award: p.label, amount: p.amount, fraction: p.fraction, basis: p.basis, sameYear: false,
        paidYear: yearOfDay(p.paidDay), repaidYear: yearOfDay(leave!) },
    });
    warnings.push({ code: "clawbackFica", params: { award: p.label, paidYear: yearOfDay(p.paidDay), repaidYear: yearOfDay(leave!) } });
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
  // A payment before the start date (relocation money paid before day one) counts in the window from the start date, as it counts in
  // employment year 1 (audit C4); its tax and present value stay on its own date.
  const inWindow = (day: number) => Math.max(day, start) >= windowStart && Math.max(day, start) < windowEnd;
  const events: CompEvent[] = taxed.map((e) => ({
    date: fromDays(e.day),
    component: e.component,
    detail: e.detail,
    gross: round2(e.gross),
    calendarYear: yearOfDay(e.day),
    employmentYear: e.ey,
    tax: round2(e.tax),
    afterTax: round2(e.gross - e.tax),
    inWindow: inWindow(e.day),
    ...(valuation !== undefined ? { discountFactor: discount(e.day) } : {}),
  }));

  const hours = offer.hours;
  const weeks = weeksWorked(offer);
  if (hours) {
    const weekly = hours.weekly[scenario];
    if (!(weekly > 0 && weekly <= 168)) throw new Error("Weekly hours must be between 0 and 168.");
    if (!(weeks > 0 && weeks <= 52)) throw new Error("Weeks worked a year must be between 0 and 52: days off must be under 260.");
  }

  // ---- benefit events --------------------------------------------------------------
  // Employer 401(k) money vests by completed years of service at the leave date (or the
  // window's last day if you stay). The vested share applies to the whole employer balance.
  const vestingDay = leave ?? windowEnd - 1;
  const completedYears = serviceYears(offer.retirement?.vestingService ?? "elapsedTime",
    hours ? hours.weekly[scenario] * weeks : undefined, start, workEnd, vestingDay, anniversaries);
  const vestedShare = vestedFraction(offer.retirement?.vesting, completedYears);
  // Tax-free benefits: the perks, and other benefits entered as tax-free (4j), counted alike.
  const isPerk = (k: string) => k === "section127" || k === "commuter" || k === "otherBenefit";
  const benefits = benefitRaw.sort((a, b) => a.day - b.day).map((b) => ({
    ...b,
    ey: b.accruedFrom !== undefined ? anniversaries.findIndex((d) => d > b.accruedFrom!) : yearOfPayment(b.day),
    vested: b.kind === "employer401k" ? b.amount * vestedShare : 0,
    // A tax-free perk is worth a pre-tax raise of amount / (1 - marginal rate) that year.
    preTax: isPerk(b.kind) ? b.amount / (1 - yearResult(yearOfDay(b.day)).withOffer.result.marginalRate) : 0,
  }));
  const benefitEvents: BenefitEvent[] = benefits.map((b) => ({
    date: fromDays(b.day), kind: b.kind, detail: b.detail, amount: round2(b.amount),
    ...(b.kind === "employer401k" ? { vested: round2(b.vested) } : {}),
    ...(isPerk(b.kind) ? { preTaxEquivalent: round2(b.preTax) } : {}),
    calendarYear: yearOfDay(b.day), employmentYear: b.ey, inWindow: inWindow(b.day),
    ...(valuation !== undefined ? { discountFactor: discount(b.day) } : {}),
  }));
  const benefitSum = (list: typeof benefits, weight: (day: number) => number = () => 1) => {
    const t = { retirement: 0, perks: 0, healthNet: 0, preTax: 0, employee401k: 0, credited: 0, premiums: 0, oop: 0, employerHsa: 0, employeeHsa: 0,
      esppPutIn: 0, esppHeld: 0 };
    for (const b of list) {
      const w = weight(b.day);
      if (b.kind === "employer401k") { t.retirement += b.vested * w; t.credited += b.amount * w; }
      else if (isPerk(b.kind)) { t.perks += b.amount * w; t.preTax += b.preTax * w; }
      else if (b.kind === "premium") t.premiums += b.amount * w;
      else if (b.kind === "outOfPocket") t.oop += b.amount * w;
      else if (b.kind === "employerHsa") t.employerHsa += b.amount * w;
      else if (b.kind === "employeeHsa") t.employeeHsa += b.amount * w;
      else if (b.kind === "employee401k") t.employee401k += b.amount * w;
      else if (b.kind === "espp") { t.esppHeld += b.amount * w; if (b.amount > 0) t.esppPutIn += b.amount * w; }
    }
    t.healthNet = t.premiums + t.oop - t.employerHsa;
    return t;
  };
  const totals = (t: ReturnType<typeof benefitSum>): BenefitTotals =>
    ({ retirement: round2(t.retirement), perks: round2(t.perks), healthNet: round2(t.healthNet) });
  // Cash measures (unrounded): after-tax comp = gross - tax - premiums; take-home also less your
  // 401(k) and HSA, and what the ESPP holds more than it did. Total rewards = after-tax comp + retirement + perks - out-of-pocket +
  // employer HSA.
  const measures = (gross: number, tax: number, t: ReturnType<typeof benefitSum>) => {
    const afterTaxComp = gross - tax - t.premiums;
    return {
      gross, tax, premiums: t.premiums, afterTaxComp,
      takeHome: afterTaxComp - t.employee401k - t.employeeHsa - t.esppHeld,
      totalRewards: afterTaxComp + t.retirement + t.perks - t.oop + t.employerHsa,
    };
  };
  const windowBenefits = benefits.filter((b) => inWindow(b.day));
  const windowMeasures = (weight: (day: number) => number) => {
    let gross = 0;
    let tax = 0;
    for (const e of taxed) {
      if (!inWindow(e.day)) continue;
      gross += e.gross * weight(e.day);
      tax += e.tax * weight(e.day);
    }
    const t = benefitSum(windowBenefits, weight);
    return { m: measures(gross, tax, t), t };
  };
  const cashTotals = (m: ReturnType<typeof measures>): CashTotals => ({
    gross: round2(m.gross), tax: round2(m.tax), premiums: round2(m.premiums),
    afterTaxComp: round2(m.afterTaxComp), takeHome: round2(m.takeHome),
  });
  const nominal = windowMeasures(() => 1);
  const pv = valuation !== undefined ? windowMeasures((day) => discount(day)!) : undefined;

  // ---- cost of living -----------------------------------------------------------------
  // Never adjust gross pay. Start from take-home, take out planned savings and rent, and express
  // what's left (non-housing spending) in reference-location dollars via non-housing RPPs. The
  // COL-adjusted total adds back money not spent locally at face value and takes out out-of-pocket
  // health spending, converted like the rest of the local spending.
  interface ColFlow { day: number; ey: number; takeHome: number; rent: number; oop: number; face: number; espp: number; taxFree: number }
  let col: { info: CostOfLivingInfo; flows: ColFlow[] } | undefined;
  if (offer.costOfLiving) {
    const hc = household.costOfLiving ?? {};
    const area = rppArea(offer.costOfLiving.area);
    const ref = rppArea(hc.reference ?? NATIONAL);
    const savingsRate = hc.savingsRate ?? 0;
    if (!(savingsRate >= 0 && savingsRate < 1)) throw new Error("savingsRate must be at least 0 and below 1.");
    // No rent entered: HUD's Fair Market Rent for the metro, or for areas without one, an anchor rent
    // (yours at the reference location, else the U.S. median) scaled by the housing RPPs.
    let monthlyRent = offer.costOfLiving.monthlyRent;
    let rentEstimate: RentEstimate | undefined;
    if (monthlyRent === undefined) {
      rentEstimate = estimateRent(area.code, offer.residence.state, {
        bedrooms: hc.fmrBedrooms ?? 1,
        ...(hc.referenceMonthlyRent !== undefined ? { anchorRent: hc.referenceMonthlyRent, anchorArea: ref.code } : {}),
      });
      monthlyRent = rentEstimate.monthlyRent;
    }
    const rentSource: CostOfLivingInfo["rentSource"] = rentEstimate?.source ?? "input";
    if (!(monthlyRent >= 0)) throw new Error("Rent can't be negative.");
    const rentGrowth = offer.costOfLiving.rentGrowth ?? inflation;
    if (!(rentGrowth > -1)) throw new Error("Rent growth must be greater than -100%.");
    const used = (a: ReturnType<typeof rppArea>) =>
      ({ code: a.code, name: a.name, allItems: a.allItems, housing: a.housing, nonHousing: Math.round(nonHousingRpp(a) * 1000) / 1000 });
    const flows: ColFlow[] = [];
    const flow = (day: number, ey: number, f: Partial<ColFlow>) =>
      flows.push({ day, ey, takeHome: 0, rent: 0, oop: 0, face: 0, espp: 0, taxFree: 0, ...f });
    for (const e of taxed) flow(e.day, e.ey, { takeHome: e.gross - e.tax });
    for (const b of benefits) {
      if (b.kind === "premium") flow(b.day, b.ey, { takeHome: -b.amount });
      // Yours: out of take-home, but saved, not spent locally.
      else if (b.kind === "employee401k" || b.kind === "employeeHsa") flow(b.day, b.ey, { takeHome: -b.amount, face: b.amount });
      // The ESPP's money likewise while the plan holds it (out of take-home when put in, back when it comes out), kept apart too.
      else if (b.kind === "espp") flow(b.day, b.ey, { takeHome: -b.amount, face: b.amount, espp: b.amount });
      else if (b.kind === "employer401k") flow(b.day, b.ey, { face: b.vested });
      else if (b.kind === "employerHsa") flow(b.day, b.ey, { face: b.amount });
      // Tax-free benefits at face value, kept apart too (4j): the breakdown shows them on their own line, not in "saved".
      else if (isPerk(b.kind)) flow(b.day, b.ey, { face: b.amount, taxFree: b.amount });
      else if (b.kind === "outOfPocket") flow(b.day, b.ey, { oop: b.amount });
    }
    // Rent is paid monthly while you work there. The lease starts on your start date, so rent
    // rises by rentGrowth at each anniversary: employment year n pays monthlyRent x (1 + g)^(n-1).
    for (const { a, b, share } of monthlyPieces(start, workEnd, cuts)) {
      const n = anniversaries.findIndex((d) => d > a);
      flow(b - 1, n, { rent: monthlyRent * (1 + rentGrowth) ** (n - 1) * share });
    }
    col = {
      info: {
        area: used(area), reference: used(ref), nonHousingFactor: nonHousingRpp(ref) / nonHousingRpp(area),
        monthlyRent: round2(monthlyRent), rentSource, ...(rentEstimate ? { rentEstimate } : {}), rentGrowth,
        rentGrowthSource: offer.costOfLiving.rentGrowth !== undefined ? "input" : "inflation",
        savingsRate, rppVintage: { dataYear: RPP.dataYear, release: RPP.vintage },
      },
      flows,
    };
  }
  // Tax-free benefits are kept apart when the offer has any (4j).
  const hasTaxFree = !!offer.perks || (offer.otherBenefits ?? []).some((x) => !x.taxable);
  const colSum = (keep: (f: ColFlow) => boolean, weight: (day: number) => number = () => 1): CostOfLivingTotals => {
    const t = { takeHome: 0, rent: 0, oop: 0, face: 0, espp: 0, taxFree: 0 };
    for (const f of col!.flows) {
      if (!keep(f)) continue;
      const w = weight(f.day);
      t.takeHome += f.takeHome * w;
      t.rent += f.rent * w;
      t.oop += f.oop * w;
      t.face += f.face * w;
      t.espp += f.espp * w;
      t.taxFree += f.taxFree * w;
    }
    const k = col!.info.nonHousingFactor;
    const savings = t.takeHome * col!.info.savingsRate;
    const nonHousingLocal = t.takeHome - savings - t.rent;
    const discretionaryReference = nonHousingLocal * k;
    const outOfPocketReference = t.oop * k;
    const faceValue = savings + t.face;
    return {
      savings, rent: t.rent, nonHousingLocal, discretionaryReference, outOfPocketReference, faceValue,
      total: discretionaryReference - outOfPocketReference + faceValue, ...(offer.espp ? { esppHeld: t.espp } : {}),
      ...(hasTaxFree ? { taxFree: t.taxFree } : {}),
    };
  };
  const colRounded = (c: CostOfLivingTotals) =>
    Object.fromEntries(Object.entries(c).map(([key, v]) => [key, round2(v)])) as unknown as CostOfLivingTotals;

  // Hours worked inside the window: each employment year's hours (weekly x weeks, prorated by days
  // employed) counted only for its days in the window, so they tie to the employment-year figures.
  let windowHours = 0;
  if (hours) {
    const perYear = hours.weekly[scenario] * weeks;
    for (let n = 1; n < anniversaries.length && anniversaries[n - 1] < windowEnd; n++) {
      const from = Math.max(anniversaries[n - 1], windowStart);
      const to = Math.min(anniversaries[n], windowEnd, workEnd);
      if (to > from) windowHours += (perYear * (to - from)) / (anniversaries[n] - anniversaries[n - 1]);
    }
  }
  const colNominal = col ? colSum((f) => inWindow(f.day)) : undefined;

  const windowTotals: ScenarioResult["window"] = {
    start: fromDays(windowStart),
    end: fromDays(windowEnd),
    nominal: cashTotals(nominal.m),
    ...(pv ? { presentValue: cashTotals(pv.m) } : {}),
    benefits: { nominal: totals(nominal.t), ...(pv ? { presentValue: totals(pv.t) } : {}) },
    totalRewards: {
      nominal: round2(nominal.m.totalRewards),
      ...(pv ? { presentValue: round2(pv.m.totalRewards) } : {}),
    },
    ...(colNominal ? {
      costOfLiving: {
        nominal: colRounded(colNominal),
        ...(valuation !== undefined ? { presentValue: colRounded(colSum((f) => inWindow(f.day), (day) => discount(day)!)) } : {}),
      },
    } : {}),
    ...(hours ? { hours: round2(windowHours) } : {}),
    ...(windowHours > 0 ? {
      perHour: {
        afterTaxComp: round2(nominal.m.afterTaxComp / windowHours),
        totalRewards: round2(nominal.m.totalRewards / windowHours),
        ...(colNominal ? { colAdjustedTotal: round2(colNominal.total / windowHours) } : {}),
      },
    } : {}),
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
    const b = benefitSum(benefits.filter((x) => x.ey === n));
    const m = measures(total(by), tax, b);
    // Hours: weekly x weeks, prorated by the share of the year you're employed.
    const yearDays = anniversaries[n] - anniversaries[n - 1];
    const employedDays = Math.max(0, Math.min(workEnd, anniversaries[n]) - anniversaries[n - 1]);
    const worked = hours ? hours.weekly[scenario] * weeks * (employedDays / yearDays) : undefined;
    const quoted = {
      salary: round2(rateAt(path, anniversaries[n - 1])), bonus: round2(bonusTarget(n)),
      cash: round2(quotedCash.get(n) ?? 0), rsu: round2(quotedRsu.get(n) ?? 0),
    };
    employmentYears.push({
      year: n,
      start: fromDays(anniversaries[n - 1]),
      end: fromDays(anniversaries[n]),
      gross: rounded(by),
      tax: round2(tax),
      afterTaxComp: round2(m.afterTaxComp),
      takeHome: round2(m.takeHome),
      // The sum of the rounded parts, so the offer-letter bridge foots to the cent.
      quotedTC: round2(quoted.salary + quoted.bonus + quoted.cash + quoted.rsu),
      quoted,
      retirement: { employee: round2(b.employee401k), employerCredited: round2(b.credited), employerVested: round2(b.retirement) },
      health: {
        premiums: round2(b.premiums), outOfPocket: round2(b.oop), employerHsa: round2(b.employerHsa),
        employeeHsa: round2(b.employeeHsa), net: round2(b.healthNet),
      },
      perks: { face: round2(b.perks), preTaxEquivalent: round2(b.preTax) },
      espp: { putIn: round2(b.esppPutIn), held: round2(b.esppHeld) },
      totalRewards: round2(m.totalRewards),
      ...(worked !== undefined ? { hours: round2(worked) } : {}),
      ...(worked ? { hourly: { afterTaxComp: round2(m.afterTaxComp / worked), totalRewards: round2(m.totalRewards / worked) } } : {}),
      ...(col ? { costOfLiving: colRounded(colSum((f) => f.ey === n)) } : {}),
    });
  }

  // ---- leave summary ----------------------------------------------------------------
  let leaveResult: ScenarioResult["leave"];
  if (leave !== undefined) {
    let unvested = 0;
    for (const g of [...grants, ...refreshers]) {
      vestDays(g).forEach((day, i) => { if (day > leave) unvested += g.value * g.schedule.tranches[i].fraction; });
    }
    const credited = benefits.filter((b) => b.kind === "employer401k").reduce((s, b) => s + b.amount, 0);
    leaveResult = {
      leaveDate: fromDays(leave), unvestedRsuForfeited: round2(unvested), clawbacks,
      retirementForfeited: round2(credited * (1 - vestedShare)),
      vacation: { banked: vacation!.banked, paid: round2(vacation!.paid), rule: vacation!.rule },
      esppRefund: round2(espp?.refundOnLeave ?? 0),
    };
  }

  const locality = offer.residence.locality && offer.residence.locality.kind !== "none" ? offer.residence.locality.kind : undefined;
  const assumptions: Assumption[] = [
    { code: "cashBasis", params: {} },
    { code: "monthlyAccrual", params: {} },
    { code: "incrementalTax", params: {} },
    { code: "residence", params: { state: offer.residence.state, ...(locality ? { locality } : {}) } },
    { code: "projectedLaw", params: { inflation } },
  ];
  if (path.steps.length > 1) {
    assumptions.push({ code: "salaryChanges", params: { scenario,
      changes: path.steps.slice(1).map((s) => ({ date: fromDays(s.day), annual: s.annual, reasons: s.reasons })) } });
  }
  if (bonus) {
    assumptions.push(bonus.basis === "percentOfSalary"
      ? { code: "bonus", params: { scenario, basis: "percentOfSalary", rate: bonus.amount[scenario] } }
      : bonus.basis === "fixed"
        ? { code: "bonus", params: { scenario, basis: "fixed", amount: bonus.amount[scenario] } }
        : { code: "bonus", params: { scenario, basis: "byEmploymentYear", amounts: bonus.amounts.map((a) => a[scenario]) } });
  }
  if (valuation !== undefined) {
    assumptions.push({ code: "presentValue", params: { valuationDate: fromDays(valuation), discountRate } });
  }
  // RSUs: an offer with only an ESPP has the share price's growth (its purchases are priced by it) but no RSUs to say it of.
  if (equity && (equity.grants.length || equity.refreshers)) assumptions.push({ code: "rsu", params: { scenario, priceGrowth: growth } });
  if (leave !== undefined) assumptions.push({ code: "leaveDate", params: { leaveDate: fromDays(leave) } });
  if (offer.retirement) {
    const r = offer.retirement;
    assumptions.push({ code: "retirement", params: { contributionPct: r.contributionPct, type: r.type ?? "pretax",
      eligiblePay: r.eligiblePay ?? "salary", vestedShare, completedYears } });
  }
  if (offer.health) assumptions.push({ code: "health", params: { usage: household.healthUsage ?? "medium" } });
  if (offer.perks) assumptions.push({ code: "perks", params: {} });
  if (offer.otherBenefits?.length) assumptions.push({ code: "otherBenefits", params: { benefits: offer.otherBenefits.map((x) => ({ ...x })) } });
  if (offer.espp) {
    const e = offer.espp;
    assumptions.push({ code: "espp", params: { contributionPct: e.contributionPct, eligiblePay: e.eligiblePay ?? "salary", discount: e.discount,
      lookback: e.lookback, offeringMonths: e.offeringMonths, purchasesPerOffering: e.purchasesPerOffering ?? 1, priceGrowth: growth } });
  }
  if (hours) {
    assumptions.push({ code: "hours", params: { scenario, weekly: hours.weekly[scenario], weeksPerYear: weeks,
      ...(hours.weeksPerYear === undefined ? { daysOff: daysOff(offer.timeOff) } : {}) } });
  }
  {
    const t = offer.timeOff;
    const taken = daysOff(t).vacation;
    const law = VACATION_PAYOUT_STATES[offer.employerState];
    assumptions.push({ code: "vacation", params: { policy: t?.policy ?? "days", gives: t?.policy === "unlimited" ? 0 : t?.gives ?? taken,
      taken, ...(t?.cap !== undefined ? { cap: t.cap } : {}), payout: t?.payout ?? "state", employerState: offer.employerState,
      required: !!law, ...(law?.afterYears ? { afterYears: law.afterYears } : {}) } });
  }
  if (col) {
    const c = col.info;
    assumptions.push({ code: "costOfLiving", params: { rppVintage: c.rppVintage, savingsRate: c.savingsRate,
      reference: c.reference.name, referenceNonHousing: c.reference.nonHousing, areaNonHousing: c.area.nonHousing,
      factor: c.nonHousingFactor, nonHousingFormula: RPP.nonHousing.formula } });
    assumptions.push({ code: "rent", params: { monthlyRent: c.monthlyRent, source: c.rentSource,
      ...(c.rentEstimate ? { estimate: c.rentEstimate } : {}), growth: c.rentGrowth,
      growthSource: c.rentGrowthSource } });
    assumptions.push({ code: "colAdjustedTotal", params: {} });
  }

  return {
    label: offer.label, scenario, events, benefitEvents, calendarYears, employmentYears, window: windowTotals,
    ...(leaveResult ? { leave: leaveResult } : {}), ...(col ? { costOfLiving: col.info } : {}), warnings, assumptions,
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
    return { months: m, ...leaveRow(offer, household, addMonths(start, m) - 1, options) };
  });
}

/**
 * What you keep if each of `lastDays` is your last day (inclusive), in the order given: the leave
 * sweep by day, so a payment, vest or clawback step shows on its own date rather than at the next
 * month's end. Nominal, after tax and clawbacks, as in leaveDateSweep.
 */
export function leaveDaySweep(
  offer: OfferInput, household: Household, lastDays: ISODate[], options: ProjectionOptions = {},
): LeaveDayRow[] {
  const start = toDays(offer.startDate);
  return lastDays.map((date) => {
    const day = toDays(date);
    if (day < start) throw new Error("A last day can't be before the start date.");
    return leaveRow(offer, household, day, options);
  });
}

function leaveRow(offer: OfferInput, household: Household, leaveDay: number, options: ProjectionOptions): LeaveDayRow {
  const k = keptIfLeaving(offer, household, leaveDay, options);
  return {
    leaveDate: k.result.leave!.leaveDate,
    paid: round2(k.paid),
    clawbackOwed: round2(k.clawbackOwed),
    afterTaxCompKept: round2(k.afterTaxCompKept),
    unvestedRsuForfeited: k.result.leave!.unvestedRsuForfeited,
    retirementVested: round2(k.retirementVested),
    totalRewardsKept: round2(k.totalRewardsKept),
  };
}

/**
 * What you keep if your last day is `leaveDay` (a day number): pay received, clawbacks owed, and
 * after-tax comp and total rewards kept, nominal and unrounded, with the projection behind them.
 * The projection tracks at least the employment years up to the leave date.
 */
export function keptIfLeaving(offer: OfferInput, household: Household, leaveDay: number, options: ProjectionOptions = {}) {
  const start = toDays(offer.startDate);
  let years = 1;
  while (addMonths(start, 12 * years) <= leaveDay) years++;
  const result = projectScenario({ ...offer, leaveDate: fromDays(leaveDay) }, household,
    { ...options, years: Math.max(options.years ?? 5, years) });
  const sumOf = (kinds: string[]) => result.benefitEvents.filter((b) => kinds.includes(b.kind)).reduce((s, b) => s + b.amount, 0);
  const afterTaxCompKept = result.events.reduce((s, e) => s + e.afterTax, 0) - sumOf(["premium"]);
  const retirementVested = result.benefitEvents.reduce((s, b) => s + (b.vested ?? 0), 0);
  return {
    result,
    paid: result.events.filter((e) => e.component !== "clawback").reduce((s, e) => s + e.gross, 0),
    clawbackOwed: result.leave!.clawbacks.reduce((s, c) => s + c.owed, 0),
    clawbackNetCost: result.leave!.clawbacks.reduce((s, c) => s + c.netCost, 0),
    afterTaxCompKept,
    retirementVested,
    totalRewardsKept: afterTaxCompKept + retirementVested + sumOf(["section127", "commuter", "employerHsa"]) - sumOf(["outOfPocket"]),
  };
}
