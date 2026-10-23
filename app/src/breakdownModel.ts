import type { OfferInput } from "../../src/offer/types";
import { hasRanges } from "./cases";
import { type ShownYear, shownStay, shownYears } from "./footing";
import { notesOf, workedFrom } from "./byYearModel";
import type { Letter } from "./model";
import { type PriceWords, shortCity } from "./prices";
import type { Breakdown, OfferDetail } from "./protocol";
import { dayBefore, dollars, longDate } from "./text";
import { shownFactor } from "./verdict";
import { daysOffWords, weeksText } from "./timeOffWords";

// An offer's breakdown, the view model (docs/v2-plan.md, item 5): A-1, its bottom line, worked out from the offer's own stay (B3),
// in its own city's dollars (B4). Shared by the breakdown (Breakdown.tsx), its derivations (derive.ts) and the methodology. Pure:
// no React. Every figure is rounded once where it's worked out, and what adds up adds up as shown (footing.ts, CLAUDE.md "The
// year figures as shown"): a month is a present value as shown ÷ the annuity factor as shown, rounded once (verdict.ts, monthOf);
// to spend is the total less what's saved, so it takes the rounding, as a present value's one line does (derive.ts, shownPv).

/** Rounded to the dollar, never −0. */
const R = (x: number) => Math.round(x) + 0;

/** "New York $7,563", "U.S.-avg −$120": a figure with the dollars it's in, on the figure itself (condition 1). */
export const inDollars = (place: string, x: number) => `${place} ${dollars(x)}`;
/** A place's dollars as a prefix: "U.S.-avg $" -> "U.S.-avg". */
export const prefixOf = (unit: string) => unit.replace(/ \$$/, "");
/** A share to the precision it's shown at: whole percent from 1%, a tenth under it. */
export const shareText = (x: number) => (Math.abs(x) >= 0.01 ? `${Math.round(x * 100)}%` : `${(x * 100).toFixed(1)}%`);
/** A tax rate, to a tenth of a percent: "32.4%". */
export const taxRateText = (x: number) => `${(x * 100).toFixed(1)}%`;

export interface OwnView {
  letter: Letter;
  /** Its own stay: the years, the first and last days. */
  years: number;
  start: string;
  last: string;
  /** Its city, as the figures name their dollars: "New York". */
  place: string;
  /** The annuity factor over its own stay, as shown (4 decimals). */
  factor: number;
  months: number;
  /**
   * Present values over its own stay, as shown, at its own prices: total rewards − rent = the total; the total − saved − tax-free
   * benefits = to spend.
   */
  pv: { totalRewards: number; rent: number; total: number; saved: number; taxFree: number; spend: number };
  /** A month over its own stay, in today's dollars: the total, saved and tax-free benefits each rounded once, to spend the rest. */
  month: { total: number; saved: number; taxFree: number; spend: number };
  /**
   * The same total at the prices picked (Prices in), the step between them in its work: shown when they're another place's
   * prices, or once there's a comparison to tie to. `step` is the total less this, at the offer's own prices.
   */
  ref: { pv: number; month: number; step: number; place: string } | null;
  /**
   * Year 1, as paid, at its own prices: to spend after rent, saved, held in an ESPP at its end (4i), and tax-free benefits (4j), the year
   * and a month (÷ 12, each rounded once).
   */
  year1: { start: string; end: string; spend: number; saved: number; held: number; taxFree: number; spendMonth: number; savedMonth: number;
    heldMonth: number; taxFreeMonth: number; y: ShownYear } | null;
  /** Why the stay's figure differs from year 1's, in words. */
  differs: string;
  /** Its tax over its stay ÷ its pay, as paid (the years as shown, less what runs past the stay). */
  tax: { tax: number; gross: number; rate: number } | null;
  /**
   * Per hour worked over its stay: the after-rent total at its own prices, as paid, ÷ the hours worked in it; and where the hours come
   * from, in words: the weekly hours (base case), the weeks worked and the days off that set them ("11 vacation days, 8 holidays and
   * no sick days").
   */
  hour: { total: number; hours: number; value: number; weekly: number; weeks: string; days: string } | null;
  /** The bear case a month over its stay, at its own prices, and how far under the base case (a share of it); null with no range. */
  bear: { pv: number; month: number; drop: number | null } | null;
  /** The bull case a month over its stay, at its own prices (A-4); null with no range. */
  bull: { pv: number; month: number } | null;
}

/** An offer's own-stay figures. `withRef`: restate the total at the prices picked (a comparison, or Prices in a city). */
export function ownView(letter: Letter, b: Breakdown, offer: OfferInput, prices: PriceWords, withRef: boolean): OwnView {
  const d = b.detail;
  const w = d.window;
  const info = d.costOfLiving;
  const col = w.costOfLiving;
  if (!info || !col?.presentValue || w.totalRewards.presentValue === undefined) throw new Error(`Offer ${letter} needs a city for its breakdown.`);
  const factor = shownFactor(b.annuityFactor);
  // Own prices: a price factor of 1, so the after-rent total is total rewards − rent (M-6.3's identity).
  const totalRewards = R(w.totalRewards.presentValue);
  const total = R(w.totalRewards.presentValue - col.presentValue.rent);
  // Saved: money at face value but an ESPP's, which comes back to spend (4i), and tax-free benefits, on a line of their own (4j, D22).
  const taxFree = R(col.presentValue.taxFree ?? 0);
  const saved = R(col.presentValue.faceValue - (col.presentValue.esppHeld ?? 0) - (col.presentValue.taxFree ?? 0));
  const month = { total: R(total / factor), saved: R(saved / factor), taxFree: R(taxFree / factor), spend: 0 };
  month.spend = month.total - month.saved - month.taxFree;
  const place = shortCity(info.area.name);
  const own = info.area.code === info.reference.code;
  const refPv = R(col.presentValue.total);
  const refMonth = R(refPv / factor);
  const ref = withRef && !own ? { pv: refPv, month: refMonth, step: month.total - refMonth, place: prefixOf(prices.unit) } : null;

  const ys = shownYears(d);
  const y = ys[0];
  const year1 = y?.col ? {
    start: y.start, end: y.end, y,
    spend: y.col.local - y.oop, saved: y.col.face - y.esppHeld - y.perks, held: y.esppHeld, taxFree: y.perks,
    spendMonth: R((y.col.local - y.oop) / 12), savedMonth: R((y.col.face - y.esppHeld - y.perks) / 12), heldMonth: R(y.esppHeld / 12),
    taxFreeMonth: R(y.perks / 12),
  } : null;

  const stay = shownStay(d, b.years).stay;
  const tax = stay.gross > 0 ? { tax: stay.tax, gross: stay.gross, rate: stay.tax / stay.gross } : null;
  const hoursIn = w.hours;
  const nominal = w.totalRewards.nominal - col.nominal.rent;
  const hour = hoursIn && offer.hours
    ? { total: nominal, hours: hoursIn, value: nominal / hoursIn, weekly: offer.hours.weekly.base, weeks: weeksText(offer), days: daysOffWords(offer) }
    : null;

  // A case's after-rent total at its own prices, as shown: total rewards − rent, each a present value; and a month, rounded once.
  const caseOf = (s: "bear" | "bull") => {
    const cw = d.cases[s];
    const pv = cw.totalRewards.presentValue !== undefined && cw.costOfLiving?.presentValue
      ? R(cw.totalRewards.presentValue - cw.costOfLiving.presentValue.rent) : null;
    return pv === null || !hasRanges(offer) ? null : { pv, month: R(pv / factor) };
  };
  const bw = caseOf("bear");
  const bear = bw ? { ...bw, drop: month.total > 0 && bw.month < month.total ? (month.total - bw.month) / month.total : null } : null;
  const bull = caseOf("bull");

  return {
    letter, years: b.years, start: b.window.start, last: dayBefore(b.window.end), place, factor, months: b.annuity.length,
    pv: { totalRewards, rent: totalRewards - total, total, saved, taxFree, spend: total - saved - taxFree }, month, ref, year1,
    differs: whyDiffers(d, ys.slice(0, b.years), b.years, offer), tax, hour, bear, bull,
  };
}

/**
 * Why the stay's figure isn't year 1's: it's in today's dollars over every year, and later years are paid differently. Only
 * what the projection shows: a first bonus for part of a year, raises, a promotion, bonuses that grow, the new-hire RSUs'
 * last vest, rent rising at each anniversary.
 */
export function whyDiffers(d: OfferDetail, ys: ShownYear[], years: number, offer: OfferInput): string {
  const head = `Your stay's figure is in today's dollars, over ${years === 1 ? "its one year" : `all ${years} years`}`;
  if (ys.length < 2) return `${head}.`;
  const [first, ...later] = ys;
  const reasons: string[] = [];
  const firstBonuses = d.bonuses.filter((x) => x.ey === 1);
  const stub = firstBonuses.length > 0 && firstBonuses.every((x) => (Date.parse(x.periodTo) - Date.parse(workedFrom(d, x.periodFrom))) / 86_400_000 < 360);
  if (stub) reasons.push("year 1's bonus is for part of a year");
  else if (!firstBonuses.length && later.some((x) => x.bonus > 0)) reasons.push("the first bonus is paid in year 2");
  const notes = notesOf(d, years).filter((x) => x.n > 1);
  const promoted = notes.some((x) => x.text.startsWith("promotion"));
  if (!promoted && later.some((x) => x.salary > first.salary + 0.5)) reasons.push("raises");
  for (const x of notes) reasons.push(x.text.startsWith("promotion") ? `a ${x.text}` : `the new-hire RSUs finish vesting in year ${x.n}`);
  const bonuses = later.map((x) => x.bonus);
  if (bonuses.length > 1 && bonuses.every((v, i) => i === 0 || v >= bonuses[i - 1]) && bonuses[bonuses.length - 1] > bonuses[0] + 0.5) {
    reasons.push("bonuses grow each year");
  }
  if ((offer.costOfLiving?.rentGrowth ?? 0) > 0 || d.costOfLiving!.rentGrowth > 0) reasons.push("rent rises at each anniversary");
  const sum = (x: ShownYear) => (x.col ? x.totalRewards - x.col.rent : x.totalRewards);
  const average = later.reduce((s, x) => s + sum(x), 0) / later.length;
  const way = average > sum(first) ? "later years pay more" : "later years pay less";
  return reasons.length ? `${head}, and ${way}: ${joinAnd(reasons)}.` : `${head}.`;
}

const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * The breakdown's sentence for screen readers, said once the inputs rest (docs/v2-plan.md, item 5, "Accessibility"), its dollars
 * said once, in words: "A leaves you about $7,563 a month over your stay, after rent: $6,671 to spend and $892 saved, in today's
 * dollars at New York prices."
 */
export function ownSentence(v: OwnView): string {
  const m = v.month;
  return `${v.letter} leaves you about ${dollars(m.total)} a month over your stay, after rent: ${dollars(m.spend)} to spend${m.taxFree ? "," : " and"} `
    + `${dollars(m.saved)} saved${m.taxFree ? ` and ${dollars(m.taxFree)} in tax-free benefits` : ""}, in today's dollars at ${v.place} prices.`;
}

/** The stay as the breakdown names it: "Your 4-year stay (Jul 13, 2026 – Jul 12, 2030)". */
export const stayText = (v: Pick<OwnView, "years" | "start" | "last">) =>
  `Your ${v.years}-year stay (${longDate(v.start)} – ${longDate(v.last)})`;
