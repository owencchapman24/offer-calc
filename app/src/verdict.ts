import type { Basis, HorizonRow, HorizonSweep, Lead, ValueBasis } from "../../src/offer/types";
import type { Letter } from "./model";
import { type PriceWords, priceWords } from "./prices";
import { cents, dollars } from "./text";

// Turns the engine's horizon sweep into what the lead schedule shows. Pure: no React, no formatting.

export interface PipelineStep { basis: Basis; step: string; title: string; phrase: string; counted: string }

/** The basis pipeline's steps. The after-rent step names the prices picked under Prices in ("After rent, at Charlotte prices"). */
export function pipeline(p: PriceWords = priceWords(undefined)): PipelineStep[] {
  return [
    { basis: "cash", step: "After tax", title: "After-tax pay", phrase: "after tax", counted: "on pay" },
    { basis: "totalRewards", step: "+ Benefits", title: "Total rewards", phrase: "in total rewards", counted: "once benefits are counted" },
    { basis: "colAdjustedTotal", step: "− Rent & prices", title: p.phrase[0].toUpperCase() + p.phrase.slice(1), phrase: p.phrase,
      counted: "once rent and prices are counted" },
    // "Per hour", not "÷ Hours": at 13px the font's ÷ reads as +.
    { basis: "perHour", step: "Per hour", title: `Per hour worked, ${p.phrase}`, phrase: "per hour worked", counted: "per hour worked" },
  ];
}

/** The rank list's caption: what the totals are, over how long, in which dollars. */
export function totalsCaption(basis: Basis, years: number, perHourOf: "colAdjustedTotal" | "totalRewards", p: PriceWords): string {
  const stay = `${years}-year`;
  switch (basis) {
    case "cash": return `${stay} total after tax, in today's dollars, present value`;
    case "totalRewards": return `${stay} total rewards, in today's dollars, present value`;
    case "colAdjustedTotal": return `${stay} total after rent, in today's ${p.dollars}, present value`;
    case "perHour": return `Per hour worked over ${years} ${years === 1 ? "year" : "years"}, ${
      perHourOf === "colAdjustedTotal" ? `after rent, in ${p.dollars}` : "in total rewards"}, nominal`;
  }
}

export interface StepView {
  basis: Basis;
  step: string;
  title: string;
  lead: (Lead & { winnerLetter: Letter; runnerUpLetter: Letter }) | null;
  /** Why the step can't be shown, when it can't. */
  unavailable: string | null;
}

export interface VerdictView {
  row: HorizonRow;
  basis: Basis;
  /** The prices after-rent figures are in (Prices in). */
  prices: PriceWords;
  /** What the per-hour step divides by hours. */
  perHourOf: HorizonSweep["perHourOf"];
  lead: StepView["lead"];
  /** Offers by value on the selected basis, highest first. */
  ranks: Array<{ letter: Letter; value: number }>;
  steps: StepView[];
  /** "A leads on pay; C leads once rent and prices are counted." */
  disagreement: string;
  /** The "winner if you stay" row: one cell per stay length. */
  stays: Array<{ years: number; lead: StepView["lead"]; current: boolean }>;
}

const join = (ls: string[]) => (ls.length <= 1 ? ls.join("") : `${ls.slice(0, -1).join(", ")} and ${ls[ls.length - 1]}`);

/** A gap between two totals as shown: each rounded to the dollar, then subtracted, so it's the difference of the figures on the page. */
export const shownGap = (a: number, b: number) => Math.round(a) - Math.round(b);
/** The annuity factor as shown, to 4 decimals. */
export const shownFactor = (factor: number) => Number(factor.toFixed(4));
/**
 * "A month": a present-value gap as shown ÷ the annuity factor as shown, rounded once where it's displayed. The verdict, its work,
 * the stays row, the pipeline and L-2 all state it so (the engine's perMonth is rounded to the cent first, so it could read $488
 * where the work said $487: audit C13).
 */
export const monthOf = (gap: number, factor: number) => gap / shownFactor(factor);

/** A lead with its letters; on a dollar basis, its month as every schedule states it (monthOf). */
function withLetters(lead: Lead | undefined, letters: Letter[], row: HorizonRow, basis: Basis): StepView["lead"] {
  if (!lead) return null;
  const values = row.values[basis];
  const perMonth = basis === "perHour" || !values ? lead.perMonth
    : monthOf(shownGap(values[lead.winner], values[lead.runnerUp]), row.annuityFactor);
  return { ...lead, ...(perMonth !== undefined ? { perMonth } : {}), winnerLetter: letters[lead.winner], runnerUpLetter: letters[lead.runnerUp] };
}

/**
 * Picks the stay row and basis; falls back to the first available basis when the chosen one can't be shown.
 * `noHours` names the offers without weekly hours: per hour needs hours for every offer, and says whose are missing.
 */
export function verdict(
  sweep: HorizonSweep, letters: Letter[], basis: Basis, stayYears: number, noHours: Letter[] = [], prices: PriceWords = priceWords(undefined),
): VerdictView | null {
  const row = sweep.rows.find((r) => r.years === stayYears);
  if (!row) return null;
  const steps: StepView[] = pipeline(prices).map((p) => ({
    basis: p.basis, step: p.step, title: p.title,
    lead: withLetters(row.leads[p.basis], letters, row, p.basis),
    unavailable: row.leads[p.basis] ? null
      : p.basis === "perHour" ? `Add weekly hours for ${noHours.length && noHours.length < letters.length ? join(noHours) : "every offer"}.`
      : p.basis === "colAdjustedTotal" ? "Needs a city for every offer." : "Not available.",
  }));
  const chosen = steps.find((s) => s.basis === basis && s.lead) ?? steps.find((s) => s.lead)!;
  const values = row.values[chosen.basis] ?? [];
  return {
    row,
    basis: chosen.basis,
    prices,
    perHourOf: sweep.perHourOf,
    lead: chosen.lead,
    ranks: values.map((value, i) => ({ letter: letters[i], value })).sort((a, b) => b.value - a.value),
    steps,
    disagreement: disagreement(steps),
    stays: sweep.rows.map((r) => ({
      years: r.years, lead: withLetters(r.leads[chosen.basis], letters, r, chosen.basis), current: r.years === stayYears,
    })),
  };
}

/** One "extra hours" line in the lead schedule (docs/ui-design.md §4.2). */
export interface ExtraHoursLine {
  more: Letter;
  fewer: Letter;
  hoursPerYear: number;
  /** The basis it's stated on: the selected one, or what per hour divides. */
  basis: ValueBasis;
  /** `more` minus `fewer`, a year, nominal; negative is more hours for less pay. */
  gapPerYear: number;
  /** What each extra hour pays; null when they pay less. */
  perExtraHour: number | null;
  /** When they pay less: the first pipeline step where they do pay, against `more`'s average there. */
  lower: { basis: ValueBasis; perExtraHour: number; average: number } | null;
}

/** A lead as the verdict states it: "$487" (a month) or "$19.47" (an hour). */
export const marginText = (basis: Basis, lead: Lead) => (basis === "perHour" ? cents(lead.margin) : dollars(lead.perMonth ?? 0));
/** "a month", or "an hour" per hour worked. */
export const perText = (basis: Basis) => (basis === "perHour" ? "an hour" : "a month");

/**
 * The dollars a basis's figures are in, said before the amount (docs/v2-plan.md, item 5, condition 1): the prices picked after rent
 * ("U.S.-avg", "Charlotte"), nothing before rent and prices.
 */
export const placeOf = (view: Pick<VerdictView, "prices" | "perHourOf">, basis: Basis) =>
  (basis === "colAdjustedTotal" || (basis === "perHour" && view.perHourOf === "colAdjustedTotal") ? view.prices.unit.slice(0, -2) : "");
/** A lead with its dollars, as a figure's label states it: "U.S.-avg $487", "$1,373". */
export const leadAmount = (view: Pick<VerdictView, "prices" | "perHourOf">, basis: Basis, lead: Lead) =>
  `${placeOf(view, basis)} ${marginText(basis, lead)}`.trim();

/**
 * A basis in words, for a sentence: it says its dollars once, here, and its figures go without them (docs/v2-plan.md, item 5,
 * condition 1, as the user amended it on 2026-10-16; tables, column heads and figure labels keep "U.S.-avg $"). "after rent, in
 * U.S.-average dollars", "after tax", "in total rewards". Per hour is after rent or in total rewards, as `perHourOf` divides.
 */
export function basisSaid(view: { prices: PriceWords; perHourOf: HorizonSweep["perHourOf"] }, basis: Basis): string {
  const after = `after rent, in ${view.prices.dollars}`;
  switch (basis) {
    case "cash": return "after tax";
    case "totalRewards": return "in total rewards";
    case "colAdjustedTotal": return after;
    case "perHour": return view.perHourOf === "colAdjustedTotal" ? after : "in total rewards";
  }
}

/** The verdict as one sentence: "C leaves you about $487 a month more than A over your stay, after rent, in U.S.-average dollars." */
export function verdictSentence(view: VerdictView): string {
  const { lead, basis } = view;
  return lead && lead.margin > 0
    ? `${lead.winnerLetter} ${basis === "perHour" ? "pays about" : "leaves you about"} ${marginText(basis, lead)} ${perText(basis)} more than `
      + `${lead.runnerUpLetter} over your stay, ${basisSaid(view, basis)}.`
    : `The offers tie over your stay, ${basisSaid(view, basis)}.`;
}

/** Pay per extra hour for the lead's winner against each other offer whose hours differ enough. */
export function extraHoursView(view: VerdictView, letters: Letter[]): ExtraHoursLine[] {
  const { row, lead } = view;
  if (!lead || !row.hours) return [];
  const hours = row.hours;
  const basis: ValueBasis = view.basis === "perHour" ? view.perHourOf : view.basis;
  const order: ValueBasis[] = ["cash", "totalRewards", "colAdjustedTotal"];
  return row.extraHours.filter((p) => p.more === lead.winner || p.fewer === lead.winner).flatMap((p) => {
    const gap = p.gapPerYear[basis];
    if (gap === undefined) return [];
    const rate = p.perExtraHour[basis] ?? null;
    const lowerBasis = rate === null ? order.slice(0, order.indexOf(basis)).find((b) => p.perExtraHour[b] !== undefined) : undefined;
    return [{
      more: letters[p.more], fewer: letters[p.fewer], hoursPerYear: p.hoursPerYear, basis, gapPerYear: gap, perExtraHour: rate,
      lower: lowerBasis ? { basis: lowerBasis, perExtraHour: p.perExtraHour[lowerBasis]!, average: row.nominal[lowerBasis]![p.more] / hours[p.more] } : null,
    }];
  });
}

/** Where the lead changes hands along the pipeline, in words. */
export function disagreement(steps: StepView[]): string {
  const shown = steps.filter((s) => s.lead);
  if (shown.length === 0) return "";
  const winners = shown.map((s) => s.lead!.winnerLetter);
  if (winners.every((w) => w === winners[0])) return `${winners[0]} leads on every basis.`;
  const steps0 = pipeline();
  const parts = [`${winners[0]} leads ${steps0.find((p) => p.basis === shown[0].basis)!.counted}`];
  for (let i = 1; i < shown.length; i++) {
    if (winners[i] !== winners[i - 1]) parts.push(`${winners[i]} leads ${steps0.find((p) => p.basis === shown[i].basis)!.counted}`);
  }
  return `${parts.join("; ")}.`;
}
