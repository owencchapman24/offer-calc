import { rentFlipFrom, sharedWindow, windowEnd } from "./compare";
import { projectScenario } from "./project";
import type { BreakevenResult, Household, ISODate, OfferInput, RentFlipResult, ValuedOptions, ValueBasis } from "./types";

// What it would take (L-3, and the close-call line): the salary, cash or rent at which one offer ties another. Apart from
// compare.ts so the worker loads it with its slow jobs, after the first answer (CLAUDE.md, Bundles).

const round2 = (x: number) => Math.round(x * 100) / 100;

type BreakevenOptions = ValuedOptions & { horizonYears?: number; basis?: ValueBasis };

/** An offer's base-scenario present value over a window, on a dollar basis. */
function basisPV(o: OfferInput, household: Household, options: ValuedOptions, window: { start: ISODate; years: number }, basis: ValueBasis) {
  const w = projectScenario(o, household, { ...options, scenario: "base", window }).window;
  return basis === "cash" ? w.presentValue!.afterTaxComp
    : basis === "totalRewards" ? w.totalRewards.presentValue!
    : w.costOfLiving!.presentValue!.total;
}

function needsCostOfLiving(offers: OfferInput[], basis: ValueBasis) {
  if (basis !== "colAdjustedTotal") return;
  for (const o of offers) if (!o.costOfLiving) throw new Error(`The COL-adjusted basis needs costOfLiving on "${o.label}".`);
}

/**
 * How much B's starting salary (or first cash award) must change for B to tie A in base-scenario
 * present value, on after-tax comp (default), total rewards or the COL-adjusted total. Found by
 * bisection to the cent; PV rises with pay, since tax takes less than all of each extra dollar.
 * Raises, percent-of-salary bonuses and 401(k) amounts scale with the new salary. With no cash award,
 * the lever is a sign-on paid 30 days after the start, with no clawback. If B leads even at a $0 salary
 * (or award), the outcome is "alreadyAhead" rather than an error; `aheadBy` always gives B's lead as
 * entered.
 *
 * The window: pass `window`, the comparison window of every offer compared (comparisonWindow), so the
 * target is the rank list's figure. Without it, it's the two offers' own [earlier start, +
 * horizonYears), which differs when a third offer starts earlier.
 */
export function breakeven(
  offerA: OfferInput, offerB: OfferInput, field: "salary" | "signOn", household: Household, options: BreakevenOptions,
): BreakevenResult {
  const steps = breakevenSteps(offerA, offerB, field, household, options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * breakeven, one projection per step: a caller that must stay responsive (the UI's worker) runs a few
 * steps at a time. The generator's return value is breakeven's result.
 */
export function* breakevenSteps(
  offerA: OfferInput, offerB: OfferInput, field: "salary" | "signOn", household: Household, options: BreakevenOptions,
): Generator<void, BreakevenResult> {
  const window = sharedWindow([offerA, offerB], options);
  const basis = options.basis ?? "cash";
  needsCostOfLiving([offerA, offerB], basis);
  const from = field === "salary" ? offerB.salary.annual : offerB.cashAwards?.[0]?.amount ?? 0;
  const adjusted = (d: number): OfferInput => {
    if (field === "salary") return { ...offerB, salary: { ...offerB.salary, annual: from + d } };
    const awards = offerB.cashAwards ?? [];
    return awards.length
      ? { ...offerB, cashAwards: [{ ...awards[0], amount: from + d }, ...awards.slice(1)] }
      : { ...offerB, cashAwards: [{ label: "Sign-on", amount: d, paidOn: { daysAfterStart: 30 } }] };
  };
  const target = basisPV(offerA, household, options, window, basis);
  yield;
  const gap = (d: number) => basisPV(adjusted(d), household, options, window, basis) - target;
  const aheadBy = gap(0);
  yield;
  const common = { field, basis, from, aheadBy, targetPV: target, window: { start: window.start, end: windowEnd(window) } };

  // Bracket the root, then bisect. B can't go below a $0 salary or sign-on.
  let lo = 0;
  let hi = 0;
  if (aheadBy < 0) {
    hi = 10_000;
    for (;;) {
      const g = gap(hi);
      yield;
      if (g >= 0) break;
      lo = hi;
      hi *= 2;
      if (hi > 1e8) throw new Error("No breakeven below a $100M increase.");
    }
  } else {
    lo = -Math.min(from, 10_000);
    for (;;) {
      const g = gap(lo);
      yield;
      if (g <= 0) break;
      hi = lo;
      if (lo === -from) return { ...common, outcome: "alreadyAhead", increase: null, to: null };
      lo = Math.max(-from, lo * 2);
    }
  }
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (gap(mid) < 0) lo = mid; else hi = mid;
    yield;
  }
  const increase = round2((lo + hi) / 2);
  return { ...common, outcome: "tie", increase, to: round2(from + increase) };
}

/**
 * The rent lever (docs/ui-design.md §4.6): the first lease year's monthly rent at which B ties A on the
 * COL-adjusted total, base scenario, present value. Closed form, since the total is linear in rent: each
 * $1 of rent takes $nonHousingFactor of spending money at reference prices, so B's total moves by
 * -factor x (rent's present value), and rent's present value is the monthly rent x `rentFactor`, the
 * present value of $1 a month of first-year rent over B's months there in the window, rising at each
 * lease anniversary. The rent that ties is from + aheadBy / (factor x rentFactor). When it would be below
 * $0 (B trails even rent-free), the outcome is "rentFree". Pass `window` as for breakeven.
 */
export function rentFlip(
  offerA: OfferInput, offerB: OfferInput, household: Household, options: Omit<BreakevenOptions, "basis">,
): RentFlipResult {
  const window = sharedWindow([offerA, offerB], options);
  needsCostOfLiving([offerA, offerB], "colAdjustedTotal");
  const target = basisPV(offerA, household, options, window, "colAdjustedTotal");
  const run = (o: OfferInput) => projectScenario(o, household, { ...options, scenario: "base", window });
  return rentFlipFrom(run(offerB), target, window,
    () => run({ ...offerB, costOfLiving: { ...offerB.costOfLiving!, monthlyRent: 1000 } }).window.costOfLiving!.presentValue!.rent / 1000);
}
