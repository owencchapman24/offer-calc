import type { BreakevenResult, ISODate, OfferInput, RentFlipResult, ValueBasis } from "../../src/offer/types";
import type { Letter } from "./model";
import type { Ties, TieRow } from "./protocol";
import { dollars, longDate, percent } from "./text";

// L-3 · What it would take (docs/ui-design.md §4.6), as a view model: what ties each offer behind the
// winner, the winner's cushion, and their words. Shared by the schedule (Breakeven.tsx) and the
// derivations (derive.ts). Pure: no React.

export interface TieView {
  basis: ValueBasis;
  winner: Letter;
  runnerUp: Letter;
  /** The winner's total: what every offer behind it ties to (the rank list's figure). */
  target: number;
  /** Offers behind the winner, by letter. */
  behind: Array<TieLine & { letter: Letter }>;
  /** The winner against the runner-up. */
  cushion: TieLine & { letter: Letter };
}

export interface TieLine { row: TieRow; offer: OfferInput; cash: CashLever; scales: string }

/** The cash award a breakeven changes: the offer's first, by its own name and date, or the sign-on the engine adds. */
export interface CashLever {
  /** "Sign-on, paid Aug 12, 2026", or "a sign-on paid 30 days after you start (Aug 12, 2026), with no clawback". */
  name: string;
  /** The award's own label, as entered ("Sign-on"), and when it's paid ("Aug 12, 2026"). */
  label: string;
  paid: string;
  /** The offer has no cash award: the engine adds one. */
  added: boolean;
}

const addDays = (date: ISODate, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function cashLever(o: OfferInput): CashLever {
  const a = o.cashAwards?.[0];
  if (!a) {
    const paid = longDate(addDays(o.startDate, 30));
    return { name: `a sign-on paid 30 days after you start (${paid}), with no clawback`, label: "sign-on", paid, added: true };
  }
  const paid = longDate(typeof a.paidOn === "string" ? a.paidOn : addDays(o.startDate, a.paidOn.daysAfterStart));
  const label = a.label.trim() || "Cash award";
  return { name: `${label}, paid ${paid}`, label, paid, added: false };
}

/** A label inside a sentence: "Sign-on" -> "sign-on"; "NYC bonus" stays. */
export const inSentence = (label: string) => (/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label);

const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * What moves with an offer's starting salary in a breakeven, in words (§4.6, rev 3): raises, promotions, a
 * percent-of-salary bonus and the 401(k) match scale with it; a bonus entered in dollars or by year doesn't.
 * The match counts only once benefits do, so not on after-tax pay.
 */
export function scalesText(letter: Letter, o: OfferInput, basis: ValueBasis): string {
  const scales: string[] = [];
  if ((o.salary.raise?.base ?? 0) !== 0) scales.push("raises");
  if (o.salary.promotions?.some((p) => (p.scenarios ?? ["base"]).includes("base"))) scales.push("promotions");
  const b = o.bonus;
  if (b?.basis === "percentOfSalary" && b.amount.base > 0) scales.push(`the ${percent(b.amount.base)} bonus`);
  const r = o.retirement;
  if (basis !== "cash" && r && ((r.contributionPct > 0 && (r.match?.length ?? 0) > 0) || (r.nonElectivePct ?? 0) > 0)) {
    scales.push(r.match?.length ? "the 401(k) match" : "employer 401(k) money");
  }
  const not = b?.basis === "fixed" && b.amount.base > 0 ? "its bonus, entered in dollars,"
    : b?.basis === "byEmploymentYear" ? "its bonus, entered by year," : null;
  const lead = scales.length ? `${join(scales)} ${scales.length === 1 && scales[0] !== "raises" && scales[0] !== "promotions" ? "scales" : "scale"} with ${letter}'s salary`
    : `Only ${letter}'s salary itself moves`;
  const text = `${lead}${not ? `; ${not} doesn't` : ""}.`;
  return text[0].toUpperCase() + text.slice(1);
}

/** L-3's view, or null when the ties don't match these offers (they're from other inputs). */
export function tieView(ties: Ties, letters: Letter[], offers: OfferInput[]): TieView | null {
  const rows = ties.rows;
  const cushion = rows[rows.length - 1];
  if (rows.length < 2 || rows.some((r) => !letters[r.offer] || !letters[r.against] || !offers[r.offer])) return null;
  const line = (row: TieRow) => ({ row, offer: offers[row.offer], letter: letters[row.offer], cash: cashLever(offers[row.offer]),
    scales: scalesText(letters[row.offer], offers[row.offer], ties.basis) });
  return {
    basis: ties.basis, winner: letters[cushion.offer], runnerUp: letters[cushion.against],
    // The winner's total, as each breakeven behind it worked it out: the rank list's figure, over the same window.
    target: rows[0].salary.targetPV,
    behind: rows.slice(0, -1).map(line),
    cushion: line(cushion),
  };
}

/** A starting salary's change as it reads: "+$8,626, +7.8%". */
export function changeText(r: BreakevenResult): string {
  if (r.outcome !== "tie") return "";
  const sign = r.increase >= 0 ? "+" : "−";
  return `${sign}${dollars(Math.abs(r.increase))}${r.from > 0 ? `, ${sign}${(Math.abs(r.increase / r.from) * 100).toFixed(1)}%` : ""}`;
}

/** The city a rent lever names: "New York" (the metro's first city). */
export const rentCity = (areaName: string) => areaName.split(/[-,]/)[0].trim();

/** Whether a rent lever has a rent that ties. */
export const rentTies = (r: RentFlipResult | undefined): r is Extract<RentFlipResult, { outcome: "tie" }> => r?.outcome === "tie";
