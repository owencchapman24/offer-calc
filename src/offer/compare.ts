import { addMonths, fromDays, toDays } from "./dates";
import { projectScenario } from "./project";
import type {
  BreakevenResult, Comparison, Household, OfferInput, OfferProjection, Scenario, ValuedOptions,
} from "./types";

const SCENARIOS: Scenario[] = ["bear", "base", "bull"];
const round2 = (x: number) => Math.round(x * 100) / 100;

/** One offer under bear, base and bull together. */
export function projectOffer(offer: OfferInput, household: Household, options: ValuedOptions): OfferProjection {
  const scenarios = Object.fromEntries(
    SCENARIOS.map((scenario) => [scenario, projectScenario(offer, household, { ...options, scenario })]),
  ) as OfferProjection["scenarios"];
  const warnings = [...new Set(SCENARIOS.flatMap((s) => scenarios[s].warnings))];
  return { label: offer.label, scenarios, warnings };
}

/** The shared window: earliest start date through `horizonYears` (default 5), unless one is given. */
function sharedWindow(offers: OfferInput[], options: ValuedOptions & { horizonYears?: number }) {
  if (offers.length === 0) throw new Error("Compare at least one offer.");
  if (options.window) return options.window;
  const earliest = Math.min(...offers.map((o) => toDays(o.startDate)));
  return { start: fromDays(earliest), years: options.horizonYears ?? 5 };
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

/**
 * How much B's starting salary (or first sign-on) must change for B to tie A in base-scenario
 * present value over their shared window, on after-tax comp (default), total rewards or the
 * COL-adjusted total. Found by bisection to the cent; PV rises with pay, since tax takes less
 * than all of each extra dollar. Raises, percent-of-salary bonuses and 401(k) amounts scale with
 * the new salary. If B leads even at a $0 salary (or sign-on), the outcome is "alreadyAhead"
 * rather than an error; `aheadBy` always gives B's lead as entered.
 */
export function breakeven(
  offerA: OfferInput, offerB: OfferInput, field: "salary" | "signOn", household: Household,
  options: ValuedOptions & { horizonYears?: number; basis?: BreakevenResult["basis"] },
): BreakevenResult {
  const window = sharedWindow([offerA, offerB], options);
  const basis = options.basis ?? "cash";
  if (basis === "colAdjustedTotal") {
    for (const o of [offerA, offerB]) {
      if (!o.costOfLiving) throw new Error(`The COL-adjusted basis needs costOfLiving on "${o.label}".`);
    }
  }
  const pv = (o: OfferInput) => {
    const w = projectScenario(o, household, { ...options, scenario: "base", window }).window;
    return basis === "cash" ? w.presentValue!.afterTaxComp
      : basis === "totalRewards" ? w.totalRewards.presentValue!
      : w.costOfLiving!.presentValue!.total;
  };
  const from = field === "salary" ? offerB.salary.annual : offerB.cashAwards?.[0]?.amount ?? 0;
  const adjusted = (d: number): OfferInput => {
    if (field === "salary") return { ...offerB, salary: { ...offerB.salary, annual: from + d } };
    const awards = offerB.cashAwards ?? [];
    return awards.length
      ? { ...offerB, cashAwards: [{ ...awards[0], amount: from + d }, ...awards.slice(1)] }
      : { ...offerB, cashAwards: [{ label: "Sign-on", amount: d, paidOn: { daysAfterStart: 30 } }] };
  };
  const target = pv(offerA);
  const gap = (d: number) => pv(adjusted(d)) - target;
  const aheadBy = gap(0);
  const common = {
    field, basis, from, aheadBy, targetPV: target,
    window: { start: window.start, end: fromDays(addMonths(toDays(window.start), 12 * window.years)) },
  };

  // Bracket the root, then bisect. B can't go below a $0 salary or sign-on.
  let lo = 0;
  let hi = 0;
  if (aheadBy < 0) {
    hi = 10_000;
    while (gap(hi) < 0) {
      lo = hi;
      hi *= 2;
      if (hi > 1e8) throw new Error("No breakeven below a $100M increase.");
    }
  } else {
    lo = -Math.min(from, 10_000);
    while (gap(lo) > 0) {
      hi = lo;
      if (lo === -from) return { ...common, outcome: "alreadyAhead", increase: null, to: null };
      lo = Math.max(-from, lo * 2);
    }
  }
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (gap(mid) < 0) lo = mid; else hi = mid;
  }
  const increase = round2((lo + hi) / 2);
  return { ...common, outcome: "tie", increase, to: round2(from + increase) };
}
