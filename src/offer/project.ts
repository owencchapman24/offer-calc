import { computeTaxes, paramsForYear } from "../tax/index";
import type { TaxInput } from "../tax/types";
import { addMonths, fromDays, jan1, toDays, yearOfDay } from "./dates";
import { convenienceRuleWarning } from "./location";
import { bonusEvents, cashEvents, type RawEvent, salaryEarned, salaryEvents, usd } from "./streams";
import type {
  ByComponent, CalendarYearResult, CompEvent, Component, EmploymentYearResult, Household,
  OfferInput, ProjectionOptions, ScenarioResult,
} from "./types";

const round2 = (x: number) => Math.round(x * 100) / 100;
const COMPONENTS: Component[] = ["salary", "bonus", "cash"];
const sumBy = (events: RawEvent[], pick: (e: RawEvent) => number = (e) => e.gross) => {
  const by = Object.fromEntries(COMPONENTS.map((c) => [c, 0])) as Record<Component, number>;
  for (const e of events) by[e.component] += pick(e);
  return by;
};
const total = (by: Record<Component, number>) => COMPONENTS.reduce((s, c) => s + by[c], 0);
const rounded = (by: Record<Component, number>): ByComponent =>
  ({ ...Object.fromEntries(COMPONENTS.map((c) => [c, round2(by[c])])), total: round2(total(by)) } as ByComponent);

/**
 * One offer, one scenario: dated payments, taxed per calendar year at the incremental tax they
 * cause (household tax with the offer minus without it), regrouped into employment years.
 * See docs/offer-model.md §2 (calendar vs employment years) and §6 (tax attribution).
 */
export function projectScenario(offer: OfferInput, household: Household, options: ProjectionOptions = {}): ScenarioResult {
  const scenario = options.scenario ?? "base";
  const years = options.years ?? 5;
  const inflation = options.inflation ?? 0.025;
  if (!Number.isInteger(years) || years < 1 || years > 40) throw new Error("years must be an integer from 1 to 40.");
  if (!(offer.salary.annual >= 0)) throw new Error("Salary must be a non-negative number.");
  const start = toDays(offer.startDate);
  if (yearOfDay(start) < 2026) throw new Error("Start dates before 2026 aren't supported: tax data starts in 2026.");

  // anniversaries[n] = start + n years. Employment year n covers [anniversaries[n-1], anniversaries[n]).
  const anniversaries = Array.from({ length: years + 3 }, (_, n) => addMonths(start, 12 * n));
  // Simulate to the end of the calendar year holding the horizon's last day, so it's taxed in full.
  const until = jan1(yearOfDay(anniversaries[years] - 1) + 1);

  const warnings: string[] = [];
  const convenience = convenienceRuleWarning(offer.residence.state, offer.employerState);
  if (convenience) warnings.push(convenience);

  const earned = (from: number, to: number) => salaryEarned(offer.salary.annual, from, to);
  const raw: RawEvent[] = [
    ...salaryEvents(offer.salary.annual, start, until, anniversaries),
    ...(offer.bonus ? bonusEvents(offer.bonus, scenario, start, until, earned, warnings) : []),
    ...cashEvents(offer.cashAwards ?? [], start).filter((e) => e.day < until),
  ].sort((a, b) => a.day - b.day);
  if (raw.some((e) => yearOfDay(e.day) < 2026)) throw new Error("Payments before 2026 aren't supported.");

  // Accrued pay belongs to the year its first day falls in. A payment dated exactly on an
  // anniversary counts toward the year just ended (decision 1), so a 12-month cliff is year 1.
  const employmentYear = (e: RawEvent) => e.accruedFrom !== undefined
    ? anniversaries.findIndex((d) => d > e.accruedFrom!)
    : Math.max(1, anniversaries.findIndex((d) => d >= e.day));

  // ---- calendar years: incremental tax --------------------------------------
  const firstYear = yearOfDay(raw[0]?.day ?? start);
  const lastYear = yearOfDay(until - 1);
  const rateByYear = new Map<number, number>();
  const calendarYears: CalendarYearResult[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const inYear = raw.filter((e) => yearOfDay(e.day) === year);
    const by = sumBy(inYear);
    const offerGross = total(by);
    const params = paramsForYear(year, { inflation });
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
    const rate = offerGross !== 0 ? offerTax / offerGross : 0;
    rateByYear.set(year, rate);
    calendarYears.push({
      year,
      offerGross: rounded(by),
      withOffer: { input: withInput, result: withOffer },
      withoutOffer: { input: withoutInput, result: without },
      offerTax: round2(offerTax),
      offerTaxRate: rate,
      indexFactor: params.indexFactor,
      projectedLaw: params.projected,
    });
  }

  // ---- events: each payment carries its calendar year's offer tax rate ---------
  const taxed = raw.map((e) => {
    const tax = e.gross * rateByYear.get(yearOfDay(e.day))!;
    return { ...e, tax, ey: employmentYear(e) };
  });
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
  }));

  // ---- employment years ---------------------------------------------------------
  const bonusTarget = offer.bonus
    ? (offer.bonus.basis === "percentOfSalary" ? offer.bonus.amount.base * offer.salary.annual : offer.bonus.amount.base)
    : 0;
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
      quotedTC: round2(offer.salary.annual + bonusTarget + by.cash),
    });
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
  if (offer.bonus) {
    const b = offer.bonus;
    assumptions.push(b.basis === "percentOfSalary"
      ? `Bonus: ${+(b.amount[scenario] * 100).toFixed(2)}% of salary earned in each period (${scenario} scenario).`
      : `Bonus: ${usd(b.amount[scenario])} a year, prorated by days employed (${scenario} scenario).`);
  }

  return { label: offer.label, scenario, events, calendarYears, employmentYears, warnings, assumptions };
}
