import { addMonths, fromDays, toDays } from "./dates";
import { projectScenario } from "./project";
import type { Household, ISODate, LeaveDayRow, LeaveSweepRow, OfferInput, ProjectionOptions } from "./types";

// Leaving early (L-4, A-4's cliffs): what you keep for a last day, and the sweeps over many, each a projection with a leave
// date. Apart from project.ts so the worker loads it with its slow jobs, after the first answer (CLAUDE.md, Bundles).

const round2 = (x: number) => Math.round(x * 100) / 100;

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
