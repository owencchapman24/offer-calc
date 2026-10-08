import type { Basis, HorizonRow, HorizonSweep, Lead } from "../../src/offer/types";
import type { Letter } from "./model";

// Turns the engine's horizon sweep into what the lead schedule shows. Pure: no React, no formatting.

export const PIPELINE: Array<{ basis: Basis; step: string; title: string; phrase: string; counted: string }> = [
  { basis: "cash", step: "After tax", title: "After-tax pay", phrase: "after tax", counted: "on pay" },
  { basis: "totalRewards", step: "+ Benefits", title: "Total rewards", phrase: "in total rewards", counted: "once benefits are counted" },
  { basis: "colAdjustedTotal", step: "− Rent & prices", title: "After rent, at U.S. prices", phrase: "after rent, at U.S. prices",
    counted: "once rent and prices are counted" },
  // "Per hour", not "÷ Hours": at 13px the font's ÷ reads as +.
  { basis: "perHour", step: "Per hour", title: "Per hour worked", phrase: "per hour worked", counted: "per hour worked" },
];

/** The rank list's caption: what the totals are, over how long, in which dollars. */
export function totalsCaption(basis: Basis, years: number, perHourOf: "colAdjustedTotal" | "totalRewards"): string {
  const stay = `${years}-year`;
  switch (basis) {
    case "cash": return `${stay} total after tax, in today's dollars, present value`;
    case "totalRewards": return `${stay} total rewards, in today's dollars, present value`;
    case "colAdjustedTotal": return `${stay} total after rent, in today's U.S.-average dollars, present value`;
    case "perHour": return `Per hour worked over ${years} ${years === 1 ? "year" : "years"}, ${
      perHourOf === "colAdjustedTotal" ? "after rent, in U.S.-average dollars" : "in total rewards"}, nominal`;
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

const withLetters = (lead: Lead | undefined, letters: Letter[]) =>
  lead ? { ...lead, winnerLetter: letters[lead.winner], runnerUpLetter: letters[lead.runnerUp] } : null;

/** Picks the stay row and basis; falls back to the first available basis when the chosen one can't be shown. */
export function verdict(sweep: HorizonSweep, letters: Letter[], basis: Basis, stayYears: number): VerdictView | null {
  const row = sweep.rows.find((r) => r.years === stayYears);
  if (!row) return null;
  const steps: StepView[] = PIPELINE.map((p) => ({
    basis: p.basis, step: p.step, title: p.title,
    lead: withLetters(row.leads[p.basis], letters),
    unavailable: row.leads[p.basis] ? null
      : p.basis === "perHour" ? "Needs weekly hours for every offer (detailed mode)."
      : p.basis === "colAdjustedTotal" ? "Needs a city for every offer." : "Not available.",
  }));
  const chosen = steps.find((s) => s.basis === basis && s.lead) ?? steps.find((s) => s.lead)!;
  const values = row.values[chosen.basis] ?? [];
  return {
    row,
    basis: chosen.basis,
    perHourOf: sweep.perHourOf,
    lead: chosen.lead,
    ranks: values.map((value, i) => ({ letter: letters[i], value })).sort((a, b) => b.value - a.value),
    steps,
    disagreement: disagreement(steps),
    stays: sweep.rows.map((r) => ({
      years: r.years, lead: withLetters(r.leads[chosen.basis], letters), current: r.years === stayYears,
    })),
  };
}

/** Where the lead changes hands along the pipeline, in words. */
export function disagreement(steps: StepView[]): string {
  const shown = steps.filter((s) => s.lead);
  if (shown.length === 0) return "";
  const winners = shown.map((s) => s.lead!.winnerLetter);
  if (winners.every((w) => w === winners[0])) return `${winners[0]} leads on every basis.`;
  const parts = [`${winners[0]} leads ${PIPELINE.find((p) => p.basis === shown[0].basis)!.counted}`];
  for (let i = 1; i < shown.length; i++) {
    if (winners[i] !== winners[i - 1]) parts.push(`${winners[i]} leads ${PIPELINE.find((p) => p.basis === shown[i].basis)!.counted}`);
  }
  return `${parts.join("; ")}.`;
}
