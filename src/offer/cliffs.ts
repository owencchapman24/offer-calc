import { serviceYears, vestedFraction } from "./benefits";
import { clawbackFraction } from "./clawback";
import { addMonths, fromDays, toDays } from "./dates";
import { keptIfLeaving, projectScenario } from "./project";
import { cashEvents } from "./streams";
import { VACATION_PAYOUT_STATES, weeksWorked } from "./timeOff";
import type { Cliff, Household, NextCliffResult, OfferInput, ProjectionOptions } from "./types";

// Cliffs: dates where your last day starts to matter (roadmap 7). Each cliff's date is the first
// last day that keeps it, by the same rules the projection uses for a leave date (docs/offer-model.md §4).

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Every cliff in the projection, in date order (one scenario, default base):
 * - bonus: paid on its pay date, if you must be employed then (the default);
 * - rsuVest: a tranche vests on its vest date;
 * - cashAward: a sign-on or other award is paid on its date;
 * - clawbackStep / clawbackCleared: what you'd repay steps down, or reaches zero, once you work
 *   through the day before a window month ends (per-day proration shrinks daily: no cliffs);
 * - retirementVest: employer 401(k) money vests as service years complete;
 * - vacationPayout: unused vacation starts being paid when you leave, in a state that requires it only after a year's service
 *   (Rhode Island), once you work through the day before that anniversary.
 * `amount` is gross: the payment or vest, the repayment no longer owed, or the employer money that vests.
 */
export function cliffs(offer: OfferInput, household: Household, options: ProjectionOptions = {}): Cliff[] {
  const scenario = options.scenario ?? "base";
  const base = projectScenario({ ...offer, leaveDate: undefined }, household, { ...options, scenario });
  const start = toDays(offer.startDate);
  const out: Array<Cliff & { day: number }> = [];
  const push = (day: number, c: Omit<Cliff, "date">) => out.push({ day, date: fromDays(day), ...c, amount: round2(c.amount) });

  const mustBeEmployed = offer.bonus?.mustBeEmployedOnPayDate ?? true;
  for (const e of base.events) {
    const day = toDays(e.date);
    if (day <= start) continue; // kept from your first day
    if (e.component === "bonus" && mustBeEmployed) push(day, { kind: "bonus", detail: e.detail, amount: e.gross });
    else if (e.component === "rsu") push(day, { kind: "rsuVest", detail: e.detail, amount: e.gross });
    else if (e.component === "cash") push(day, { kind: "cashAward", detail: e.detail, amount: e.gross });
  }

  // Clawbacks: the owed share drops when a window month completes (leave = clock + k months - 1).
  const paid = cashEvents(offer.cashAwards ?? [], start);
  (offer.cashAwards ?? []).forEach((award, i) => {
    const c = award.clawback;
    if (!c || (c.kind === "prorated" && c.per === "day")) return;
    const paidDay = paid[i].day;
    const clock = (c.from ?? "start") === "payment" ? paidDay : start;
    const steps = c.kind === "prorated"
      ? Array.from({ length: c.months }, (_, k) => addMonths(clock, k + 1) - 1)
      : [addMonths(clock, c.months) - 1];
    for (const day of steps) {
      if (day <= paidDay) continue; // before the payment, there's nothing to repay
      const drop = clawbackFraction(c, clock, day - 1) - clawbackFraction(c, clock, day);
      if (drop <= 0) continue;
      const cleared = clawbackFraction(c, clock, day) === 0;
      push(day, {
        kind: cleared ? "clawbackCleared" : "clawbackStep",
        detail: { kind: "clawbackStep", award: award.label, prorated: c.kind === "prorated" },
        amount: award.amount * drop,
      });
    }
  });

  // 401(k): each time completed service reaches a vesting step, scanning last days with the
  // projection's own service rule. The amount vesting is the employer money credited by then
  // times the step in the vested share.
  const r = offer.retirement;
  if (r && r.vesting && r.vesting.kind !== "immediate") {
    const hours = offer.hours;
    const perYear = hours ? hours.weekly[scenario] * weeksWorked(offer) : undefined;
    const horizon = addMonths(start, 12 * (options.years ?? 5));
    const anniversaries = Array.from({ length: (options.years ?? 5) + 3 }, (_, n) => addMonths(start, 12 * n));
    let years = 0;
    for (let day = start; day < horizon; day++) {
      const now = serviceYears(r.vestingService ?? "elapsedTime", perYear, start, day + 1, day, anniversaries);
      if (now === years) continue;
      const before = vestedFraction(r.vesting, years);
      const after = vestedFraction(r.vesting, now);
      years = now;
      if (after <= before) continue;
      const credited = keptIfLeaving(offer, household, day, { ...options, scenario }).result.benefitEvents
        .filter((b) => b.kind === "employer401k").reduce((s, b) => s + b.amount, 0);
      push(day, {
        kind: "retirementVest", detail: { kind: "retirementVest", vestedShare: after, serviceYears: now },
        amount: credited * (after - before),
      });
    }
  }

  // Unused vacation, where the law pays it only after some service and the offer's policy doesn't pay it anyway.
  const law = VACATION_PAYOUT_STATES[offer.employerState];
  if (law?.afterYears && offer.timeOff?.policy !== "unlimited" && offer.timeOff?.payout !== "always") {
    const day = addMonths(start, 12 * law.afterYears) - 1;
    if (day < addMonths(start, 12 * (options.years ?? 5))) {
      const k = keptIfLeaving(offer, household, day, { ...options, scenario });
      const payout = k.result.events.find((e) => e.detail.kind === "vacationPayout");
      if (payout) push(day, { kind: "vacationPayout", detail: payout.detail, amount: payout.gross });
    }
  }

  return out.sort((a, b) => a.day - b.day).map(({ day: _, ...c }) => c);
}

/**
 * The next cliff after `leaveDate` (your last day) and what staying until it is worth, nominal:
 * after-tax comp kept and total rewards kept if you leave on the cliff date instead. `cliffValue`
 * is the cliffs' own part: payments after tax, the clawback no longer owed (net of tax relief),
 * and employer 401(k) money that vests. The rest of the value is pay for the extra days.
 * `skip` passes over cliffs (L-4 skips a prorated clawback's monthly steps): the value of staying
 * until the next one still counts everything on the way, those steps included.
 */
export function nextCliff(
  offer: OfferInput, household: Household, leaveDate: string, options: ProjectionOptions = {},
  { skip }: { skip?: (c: Cliff) => boolean } = {},
): NextCliffResult {
  const leave = toDays(leaveDate);
  const upcoming = cliffs(offer, household, options).filter((c) => toDays(c.date) > leave && !skip?.(c));
  if (upcoming.length === 0) return { leaveDate, next: null };
  const date = upcoming[0].date;
  const day = toDays(date);
  const onDate = upcoming.filter((c) => c.date === date);
  const now = keptIfLeaving(offer, household, leave, options);
  const then = keptIfLeaving(offer, household, day, options);
  // Unused vacation paid on a last day isn't the cliff's own, unless the cliff is the day it starts being paid.
  const payoutCliff = onDate.some((c) => c.kind === "vacationPayout");
  const payments = then.result.events
    .filter((e) => e.date === date && (e.component === "bonus" || e.component === "rsu" || e.component === "cash")
      && (e.detail.kind !== "vacationPayout" || payoutCliff))
    .reduce((s, e) => s + e.afterTax, 0);
  const clawbackSaved = onDate.some((c) => c.kind === "clawbackStep" || c.kind === "clawbackCleared")
    ? keptIfLeaving(offer, household, day - 1, options).clawbackNetCost - then.clawbackNetCost : 0;
  const vests = onDate.filter((c) => c.kind === "retirementVest").reduce((s, c) => s + c.amount, 0);
  return {
    leaveDate,
    next: {
      date,
      daysAway: day - leave,
      cliffs: onDate,
      valueOfStaying: {
        afterTaxComp: round2(then.afterTaxCompKept - now.afterTaxCompKept),
        totalRewards: round2(then.totalRewardsKept - now.totalRewardsKept),
      },
      cliffValue: round2(payments + clawbackSaved + vests),
    },
  };
}
