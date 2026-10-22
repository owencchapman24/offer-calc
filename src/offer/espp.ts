import type { RawBenefit } from "./benefits";
import { addMonths, checkMonthDay, dayIn, fromDays, toDays, yearOfDay } from "./dates";
import type { RawEvent } from "./streams";
import type { Espp, OfferWarning } from "./types";

// An employee stock purchase plan under IRC 423, each lot sold the day it's bought (docs/v2-plan.md, 4i; the user's D20: holding
// shares after purchase is an investment decision and isn't modeled). Each eligible paycheck puts its percentage aside, after tax
// and without interest. Offerings run back to back from the offering day; you join the first that starts on or after your start
// (or the day you're eligible). Each purchase buys at (1 - discount) x the purchase-day value, or with a lookback x the lower of
// the offering's first-day and purchase-day values (IRC 423(b)(6)), within the $25,000 limit (IRC 423(b)(8)), and sells at once:
// the spread is the gain, wages for income tax but not FICA. What the limit can't buy comes back in cash at the purchase; what's
// put toward a purchase you leave before comes back on your last day (plans usually refund; one allowing a purchase within the
// three months IRC 423(a)(2) permits isn't modeled). The share price grows at `growth` a year, so only ratios of prices matter.

/** IRC 423(b)(8): no more than $25,000 of stock a calendar year, valued at the grant (the offering's first day). */
export const ESPP_LIMIT = 25_000;

export interface EsppResult {
  /** Each purchase's gain, sold the same day (component "espp"). */
  events: RawEvent[];
  /** Money into the plan (positive, from each paycheck) and out of it (negative: a purchase, or a refund on your last day). */
  flows: RawBenefit[];
  /** Money put toward purchases not made by your last day, refunded that day. */
  refundOnLeave: number;
}

interface Period { offeringStart: number; from: number; to: number; n: number; contributed: number }

/**
 * The plan's flows and purchases, from the pay events (salary, and bonuses where they count). `until` is the projection's end
 * (exclusive): a purchase on or after it isn't made, and what's put toward it stays in the plan. `leave`: your last day.
 */
export function esppFlows(
  p: Espp, pay: RawEvent[], start: number, until: number, leave: number | undefined, growth: number, warnings: OfferWarning[],
): EsppResult {
  const per = p.purchasesPerOffering ?? 1;
  const months = p.offeringMonths;
  // A backstop: validateOffer says each of these at its field.
  if (!(p.contributionPct >= 0 && p.contributionPct <= 1)) throw new Error("ESPP contributionPct must be between 0 and 1.");
  if (!(p.discount >= 0 && p.discount <= 0.15)) throw new Error("An ESPP discount must be between 0 and 15% (IRC 423(b)(6)).");
  if (!(Number.isInteger(months) && months >= 1 && months <= 27)) throw new Error("An ESPP offering must be 1 to 27 whole months.");
  if (!(Number.isInteger(per) && per >= 1 && months % per === 0)) throw new Error("ESPP purchases must divide the offering's months evenly.");
  checkMonthDay(p.offeringsStart);
  const step = months / per;
  const join = Math.max(start, p.eligibleFrom !== undefined ? toDays(p.eligibleFrom) : start);
  // Offerings start every `months` from the offering day a year before you join, each date worked out from that one (no drift).
  const anchor = dayIn(yearOfDay(join) - 1, p.offeringsStart);
  let first = 0;
  while (addMonths(anchor, first * months) < join) first++;
  const periods: Period[] = [];
  for (let o = first; addMonths(anchor, o * months) < until; o++) {
    const offeringStart = addMonths(anchor, o * months);
    for (let j = 1; j <= per; j++) {
      periods.push({ offeringStart, n: j, contributed: 0,
        from: addMonths(anchor, o * months + (j - 1) * step), to: addMonths(anchor, o * months + j * step) - 1 });
    }
  }

  // Contributions: each eligible paycheck in a purchase period, after tax.
  const flows: RawBenefit[] = [];
  const eligible = pay.filter((e) => e.component === "salary" || (p.eligiblePay === "salaryAndBonus" && e.component === "bonus"))
    .sort((a, b) => a.day - b.day);
  for (const e of eligible) {
    const period = periods.find((x) => x.from <= e.day && e.day <= x.to);
    if (!period || !(e.gross > 0)) continue;
    const amount = p.contributionPct * e.gross;
    period.contributed += amount;
    flows.push({ day: e.day, kind: "espp", amount, detail: { kind: "esppContribution", rate: p.contributionPct, pay: e.gross },
      ...(e.accruedFrom !== undefined ? { accruedFrom: e.accruedFrom } : {}) });
  }

  // Purchases, in date order, each within what's left of the $25,000 a year: an offering outstanding in more than one calendar year
  // accrues $25,000 for each, used from the earliest year first, and nothing carries from one offering to another (Treas. Reg.
  // §1.423-2(i)). Offerings here run back to back, so only one is outstanding at a time.
  const events: RawEvent[] = [];
  const usedByYear = new Map<number, number>();
  const capped = new Set<number>();
  let refundOnLeave = 0;
  for (const x of periods) {
    if (!(x.contributed > 0)) continue;
    if (leave !== undefined && x.to > leave) { refundOnLeave += x.contributed; continue; }
    if (x.to >= until) continue;
    const priceRatio = (1 + growth) ** ((x.to - x.offeringStart) / 365.25);
    const pricePaid = (1 - p.discount) * (p.lookback ? Math.min(1, priceRatio) : priceRatio);
    const years: number[] = [];
    for (let y = yearOfDay(x.offeringStart); y <= yearOfDay(x.to); y++) years.push(y);
    const room = years.reduce((s, y) => s + Math.max(0, ESPP_LIMIT - (usedByYear.get(y) ?? 0)), 0);
    const limitValue = Math.min(x.contributed / pricePaid, room);
    let left = limitValue;
    for (const y of years) {
      const take = Math.min(left, Math.max(0, ESPP_LIMIT - (usedByYear.get(y) ?? 0)));
      usedByYear.set(y, (usedByYear.get(y) ?? 0) + take);
      left -= take;
    }
    const used = limitValue * pricePaid;
    const refunded = x.contributed - used;
    if (refunded > 0.005 && !capped.has(yearOfDay(x.to))) {
      capped.add(yearOfDay(x.to));
      warnings.push({ code: "esppCap", params: { year: yearOfDay(x.to), limit: ESPP_LIMIT } });
    }
    if (used > 0) {
      events.push({ day: x.to, component: "espp", gross: (used * priceRatio) / pricePaid - used,
        detail: { kind: "espp", offeringStart: fromDays(x.offeringStart), purchase: x.n, purchases: per, contributed: x.contributed, used,
          refunded, discount: p.discount, lookback: p.lookback, priceRatio, pricePaid, limitValue } });
    }
    // Out of the plan: the contributions used (sold with their gain, which is pay) and any refund, both on the purchase day.
    flows.push({ day: x.to, kind: "espp", amount: -x.contributed, detail: { kind: "esppOut", why: "purchase" } });
  }
  if (leave !== undefined && refundOnLeave > 0) {
    flows.push({ day: leave, kind: "espp", amount: -refundOnLeave, detail: { kind: "esppOut", why: "leaving" } });
  }
  return { events, flows, refundOnLeave };
}
