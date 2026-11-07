import { addMonths, fromDays, toDays } from "./dates";
import { projectScenario } from "./project";
import { weeksWorked } from "./timeOff";
import type {
  Basis, Comparison, ExtraHours, HorizonRow, HorizonSweep, Household, ISODate, Lead, OfferInput, OfferProjection,
  RentFlipResult, Scenario, ScenarioResult, ValuedOptions, ValueBasis,
} from "./types";

const SCENARIOS: Scenario[] = ["bear", "base", "bull"];
const round2 = (x: number) => Math.round(x * 100) / 100;

/** A lead under 3% of the leader's value is a close call (docs/ui-design.md §4.1). */
export const CLOSE_CALL_SHARE = 0.03;

/**
 * `pv` restated as the level amount paid at the end of each month of the window that has the same
 * present value: pv / sum over months k of (1 + r)^-(days from the valuation date to the k-th month's
 * last day / 365.25), the same discounting as every event. "C leads by $487 a month" uses this.
 */
export function monthlyEquivalent(
  pv: number, window: { start: ISODate; years: number }, valuationDate: ISODate, discountRate = 0.05,
): number {
  return pv / annuityFactor(window, valuationDate, discountRate);
}

/** The present value at `valuationDate` of $1 paid on the last day of each month of the window. */
export function annuityFactor(window: { start: ISODate; years: number }, valuationDate: ISODate, discountRate = 0.05): number {
  const start = toDays(window.start);
  const valuation = toDays(valuationDate);
  let factor = 0;
  for (let k = 1; k <= 12 * window.years; k++) {
    factor += (1 + discountRate) ** (-(addMonths(start, k) - 1 - valuation) / 365.25);
  }
  return factor;
}

/** The terms annuityFactor sums: each month's last day, its days from the valuation date, and its discount factor. */
export function annuityTerms(
  window: { start: ISODate; years: number }, valuationDate: ISODate, discountRate = 0.05,
): Array<{ date: ISODate; days: number; factor: number }> {
  const start = toDays(window.start);
  const valuation = toDays(valuationDate);
  return Array.from({ length: 12 * window.years }, (_, i) => {
    const day = addMonths(start, i + 1) - 1;
    return { date: fromDays(day), days: day - valuation, factor: (1 + discountRate) ** (-(day - valuation) / 365.25) };
  });
}

/** Pay per extra hour shows when two offers' scheduled hours differ by at least 2 a week over a 50-week year. */
export const EXTRA_HOURS_MIN = 100;

/**
 * What the extra hours pay, for every pair of offers whose scheduled hours (weekly x weeks, base
 * scenario) differ by EXTRA_HOURS_MIN or more a year: the gap in each dollar basis over the window,
 * nominal, divided by the gap in hours worked there (docs/ui-design.md §4.2). A pair whose window
 * hours don't differ in the same direction (a much later start) is left out.
 */
export function extraHours(
  offers: OfferInput[], nominal: Partial<Record<ValueBasis, number[]>>, hours: number[], years: number,
): ExtraHours[] {
  const scheduled = offers.map((o) => (o.hours ? o.hours.weekly.base * weeksWorked(o) : 0));
  const out: ExtraHours[] = [];
  for (let i = 0; i < offers.length; i++) {
    for (let j = i + 1; j < offers.length; j++) {
      if (Math.abs(scheduled[i] - scheduled[j]) < EXTRA_HOURS_MIN) continue;
      const [more, fewer] = scheduled[i] > scheduled[j] ? [i, j] : [j, i];
      const extra = hours[more] - hours[fewer];
      if (!(extra > 0)) continue;
      const gapPerYear: ExtraHours["gapPerYear"] = {};
      const perExtraHour: ExtraHours["perExtraHour"] = {};
      for (const [basis, v] of Object.entries(nominal) as Array<[ValueBasis, number[]]>) {
        const gap = v[more] - v[fewer];
        gapPerYear[basis] = round2(gap / years);
        if (gap > 0) perExtraHour[basis] = round2(gap / extra);
      }
      out.push({ more, fewer, hoursPerYear: round2(extra / years), gapPerYear, perExtraHour });
    }
  }
  return out;
}

/** One offer under bear, base and bull together. */
export function projectOffer(offer: OfferInput, household: Household, options: ValuedOptions): OfferProjection {
  const scenarios = Object.fromEntries(
    SCENARIOS.map((scenario) => [scenario, projectScenario(offer, household, { ...options, scenario })]),
  ) as OfferProjection["scenarios"];
  const seen = new Set<string>();
  const warnings = SCENARIOS.flatMap((s) => scenarios[s].warnings).filter((w) => {
    const key = JSON.stringify(w);
    return seen.has(key) ? false : (seen.add(key), true);
  });
  return { label: offer.label, scenarios, warnings };
}

/** The comparison window of these offers: [earliest start, + years). */
export function comparisonWindow(offers: OfferInput[], years: number): { start: ISODate; years: number } {
  if (offers.length === 0) throw new Error("Compare at least one offer.");
  return { start: fromDays(Math.min(...offers.map((o) => toDays(o.startDate)))), years };
}

/** The shared window: earliest start date through `horizonYears` (default 5), unless one is given. */
export function sharedWindow(offers: OfferInput[], options: ValuedOptions & { horizonYears?: number }) {
  if (offers.length === 0) throw new Error("Compare at least one offer.");
  return options.window ?? comparisonWindow(offers, options.horizonYears ?? 5);
}

/**
 * Every offer over one window, [earliest start, + horizonYears), so a later start shows up as
 * less pay inside the window. Nominal and present-value totals per scenario are in each
 * projection's `scenarios[s].window`.
 */
export function compareOffers(
  offers: OfferInput[], household: Household, options: ValuedOptions & { horizonYears?: number },
): Comparison {
  const window = sharedWindow(offers, options);
  return {
    window: { start: window.start, end: fromDays(addMonths(toDays(window.start), 12 * window.years)) },
    valuationDate: options.valuationDate,
    discountRate: options.discountRate ?? 0.05,
    projections: offers.map((o) => projectOffer(o, household, { ...options, window })),
  };
}

/** A window's end, exclusive: its start + its years. */
export const windowEnd = (window: { start: ISODate; years: number }) => fromDays(addMonths(toDays(window.start), 12 * window.years));

/**
 * rentFlip's closed form, from B's base-scenario projection over the window and A's COL-adjusted present value
 * there (the target), so a caller that has already projected both (the UI's fast lane) gets the same figure
 * without projecting again. `rentFactorAtZero` is rent's present value per $1 of monthly rent, asked for only
 * when B's rent is $0 (it then takes a projection at some rent).
 */
export function rentFlipFrom(
  b: ScenarioResult, target: number, window: { start: ISODate; years: number }, rentFactorAtZero: () => number,
): RentFlipResult {
  const info = b.costOfLiving;
  const pvB = b.window.costOfLiving?.presentValue;
  if (!info || !pvB) throw new Error(`The rent lever needs costOfLiving and a valuation date on "${b.label}".`);
  const from = info.monthlyRent;
  // Rent's present value per $1 of monthly rent; with no rent, from a projection at another rent.
  const rentFactor = from > 0 ? pvB.rent / from : rentFactorAtZero();
  const aheadBy = pvB.total - target;
  const common = {
    from, aheadBy, targetPV: target, nonHousingFactor: info.nonHousingFactor, rentFactor,
    window: { start: window.start, end: windowEnd(window) },
  };
  // Rent B pays inside the window: none if B starts after the window ends, and then rent can't tie.
  if (!(rentFactor > 0)) return { ...common, outcome: "noRent", change: null, to: null };
  const change = aheadBy / (info.nonHousingFactor * rentFactor);
  return from + change < 0
    ? { ...common, outcome: "rentFree", change: round2(change), to: null }
    : { ...common, outcome: "tie", change: round2(change), to: round2(from + change) };
}

/**
 * The "winner if you stay N years" row: for each stay length, every offer's base-scenario value on each
 * basis over the shared window [earliest start, + N years), who leads, by how much a month, and whether
 * it's a close call. A stay is the window, not a leave date: pay after it isn't counted, and its last
 * calendar year is taxed as though you kept earning through December. Clawbacks triggered by leaving
 * are the leave-date sweep's job.
 */
export function horizonSweep(
  offers: OfferInput[], household: Household, stays: number[] = [2, 3, 4, 5], options: ValuedOptions,
): HorizonSweep {
  if (offers.length < 2) throw new Error("A horizon sweep compares at least two offers.");
  const { start } = comparisonWindow(offers, 1);
  const discountRate = options.discountRate ?? 0.05;
  const allCol = offers.every((o) => o.costOfLiving);
  const allHours = offers.every((o) => o.hours);
  const perHourOf = allCol ? "colAdjustedTotal" : "totalRewards";
  const rows = stays.map((years): HorizonRow => {
    if (!Number.isInteger(years) || years < 1) throw new Error("Stay lengths must be whole years >= 1.");
    const window = { start, years };
    const w = offers.map((o) => projectScenario(o, household, { ...options, scenario: "base", window }).window);
    const values: Partial<Record<Basis, number[]>> = {
      cash: w.map((x) => x.presentValue!.afterTaxComp),
      totalRewards: w.map((x) => x.totalRewards.presentValue!),
      ...(allCol ? { colAdjustedTotal: w.map((x) => x.costOfLiving!.presentValue!.total) } : {}),
      ...(allHours ? { perHour: w.map((x) => x.perHour?.[perHourOf] ?? 0) } : {}),
    };
    const factor = annuityFactor(window, options.valuationDate, discountRate);
    const leads: Partial<Record<Basis, Lead>> = {};
    for (const [basis, v] of Object.entries(values) as Array<[Basis, number[]]>) {
      const order = v.map((_, i) => i).sort((a, b) => v[b] - v[a] || a - b);
      const [winner, runnerUp] = order;
      const margin = v[winner] - v[runnerUp];
      const share = v[winner] !== 0 ? margin / Math.abs(v[winner]) : 0;
      leads[basis] = {
        winner, runnerUp, margin: round2(margin),
        ...(basis === "perHour" ? {} : { perMonth: round2(margin / factor) }),
        share, closeCall: share < CLOSE_CALL_SHARE,
      };
    }
    const nominal: HorizonRow["nominal"] = {
      cash: w.map((x) => x.nominal.afterTaxComp),
      totalRewards: w.map((x) => x.totalRewards.nominal),
      ...(allCol ? { colAdjustedTotal: w.map((x) => x.costOfLiving!.nominal.total) } : {}),
    };
    const hours = allHours ? w.map((x) => x.hours ?? 0) : undefined;
    return {
      years, window: { start, end: fromDays(addMonths(toDays(start), 12 * years)) }, values, leads, nominal,
      ...(hours ? { hours } : {}), annuityFactor: factor,
      extraHours: hours ? extraHours(offers, nominal, hours, years) : [],
    };
  });
  return { labels: offers.map((o) => o.label), valuationDate: options.valuationDate, discountRate, perHourOf, rows };
}
