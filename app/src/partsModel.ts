import type { Cliff, ISODate, OfferInput } from "../../src/offer/types";
import { inSentence } from "./breakevenModel";
import { workedFrom } from "./byYearModel";
import { shownYears } from "./footing";
import { isProratedStep, periodText } from "./leaveModel";
import type { A2Part, A6Line } from "./metrics";
import type { OfferDetail } from "./protocol";
import { dayBefore } from "./text";

// An offer's breakdown, A-2 to A-6 (docs/v2-plan.md, item 5, "What a breakdown holds"), the view model: where a year's pay goes,
// its payments by date, the terms that can bite, and its tax by calendar year, each over the offer's own stay (B3). Shared by the
// parts (BreakdownParts.tsx) and their derivations (derive.ts), so a figure and its work are the same number. Every figure is
// rounded once where it's worked out, and what adds up adds up as shown (footing.ts). Pure: no React.

/** Rounded to the dollar, never −0. */
const R = (x: number) => Math.round(x) + 0;

// ---- A-2: where the money goes --------------------------------------------------------------------------------------------

export const A2_PARTS: A2Part[] = ["tax", "rent", "health", "saved", "spend"];
export const A2_LABEL: Record<A2Part, string> = { tax: "tax", rent: "rent", health: "health costs", saved: "saved", spend: "left to spend" };

export interface HundredPart {
  part: A2Part;
  /** The year's figure, as shown (footing.ts): what the part takes of the year's pay. */
  dollars: number;
  /** Of each $100 paid, in cents: the figure ÷ the year's pay, to the cent; left to spend takes the rounding. */
  cents: number;
}

export interface Hundred {
  n: number;
  start: ISODate;
  /** Exclusive. */
  end: ISODate;
  /** Paid to you in the year, as paid: the bridge's "Paid in year n". */
  paid: number;
  parts: HundredPart[];
  /** Outside the $100, from the employer: 401(k) money credited in the year (and the share vested by the stay's end), HSA money, perks. */
  credited: number;
  vestedShare: number | null;
  hsa: number;
  perks: number;
}

/** A share of each $100 in cents, as text: 2727 -> "$27.27". A negative share (left to spend below zero) in parentheses. */
export const centsText = (c: number) => (c < 0 ? `($${(-c / 100).toFixed(2)})` : `$${(c / 100).toFixed(2)}`);

/**
 * Where employment year `n`'s pay goes, of each $100 (M-1.1): tax, rent, health costs (premiums and expected out-of-pocket),
 * saved (your 401(k) and HSA, planned savings) and left to spend, each the year's figure as shown ÷ its pay as shown, to the cent;
 * left to spend takes the rounding, so the five add to $100.00. Null without a city or pay.
 */
export function hundredOf(d: OfferDetail, n: number): Hundred | null {
  const y = shownYears(d)[n - 1];
  if (!y?.col || y.gross <= 0) return null;
  const dollars: Record<Exclude<A2Part, "spend">, number> = {
    tax: y.tax, rent: y.col.rent, health: y.premiums + y.oop, saved: y.yours + y.col.savings,
  };
  const spend = y.gross - dollars.tax - dollars.rent - dollars.health - dollars.saved;
  const of = (x: number) => Math.round((x / y.gross) * 10_000);
  const parts: HundredPart[] = (["tax", "rent", "health", "saved"] as const).map((part) => ({ part, dollars: dollars[part], cents: of(dollars[part]) }));
  parts.push({ part: "spend", dollars: spend, cents: 10_000 - parts.reduce((s, p) => s + p.cents, 0) });
  const ret = d.assumptions.find((a) => a.code === "retirement");
  return {
    n, start: y.start, end: y.end, paid: y.gross, parts, credited: y.credited,
    vestedShare: ret?.code === "retirement" ? ret.params.vestedShare : null, hsa: y.hsa, perks: y.perks,
  };
}

// ---- A-3: when it arrives -------------------------------------------------------------------------------------------------

export interface Arrival {
  /** Its place in the list: its figure's id. */
  i: number;
  date: ISODate;
  ey: number;
  kind: "bonus" | "cash" | "rsu";
  label: string;
  /** To the cent, as the engine posts it. */
  gross: number;
  /** A stretch of work it's for, a vest moved to a company date. */
  note?: string;
}

/** Every payment that isn't salary in the offer's own stay's employment years, by date: each bonus, cash award and RSU vest. */
export function arrivalsOf(d: OfferDetail, years: number): Arrival[] {
  const list: Array<Omit<Arrival, "i">> = [
    ...d.bonuses.filter((b) => b.ey <= years).map((b) => {
      const from = workedFrom(d, b.periodFrom);
      const days = (Date.parse(b.periodTo) - Date.parse(from)) / 86_400_000;
      return { date: b.date, ey: b.ey, kind: "bonus" as const, label: `Bonus for ${periodText(from, b.periodTo)}`, gross: b.gross,
        ...(days < 360 ? { note: "for part of a year" } : {}) };
    }),
    ...(d.cash ?? []).filter((c) => c.ey <= years).map((c) => ({ date: c.date, ey: c.ey, kind: "cash" as const, label: c.award, gross: c.gross })),
    ...d.rsus.filter((v) => v.ey <= years).map((v) => ({
      date: v.date, ey: v.ey, kind: "rsu" as const, label: `RSU vest, ${v.refresher ? "a refresher" : "the new-hire grant"}, ${v.tranche} of ${v.tranches}`,
      gross: v.gross, ...(v.nominalDate ? { note: `due ${v.nominalDate}, on the company's next vest date` } : {}),
    })),
  ];
  const order = { bonus: 0, cash: 1, rsu: 2 };
  return list.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]).map((x, i) => ({ ...x, i }));
}

/** An arrival's figure, as shown: to the dollar. */
export const arrivalShown = (a: Arrival) => R(a.gross);

// ---- A-4: terms that can bite -----------------------------------------------------------------------------------------------

/** A cliff inside the stay, as A-4 lists it: by itself, or a prorated clawback's monthly steps as one line. */
export type CliffLine =
  | { kind: "cliff"; i: number; cliff: Cliff }
  | { kind: "steps"; award: string; perMonth: number; from: ISODate; until: ISODate };

/** The cliffs inside the stay in date order, each with its place in the list (its figure's id), a prorated clawback's steps as one line. */
export function cliffLines(cliffs: Cliff[]): CliffLine[] {
  const out: CliffLine[] = [];
  const steps = new Map<string, Cliff[]>();
  cliffs.forEach((c, i) => {
    if (isProratedStep(c)) {
      const award = c.detail.kind === "clawbackStep" ? c.detail.award : "";
      if (!steps.has(award)) out.push({ kind: "steps", award, perMonth: c.amount, from: c.date, until: c.date });
      steps.set(award, [...(steps.get(award) ?? []), c]);
      const line = out.find((x): x is Extract<CliffLine, { kind: "steps" }> => x.kind === "steps" && x.award === award)!;
      line.until = c.date;
    } else out.push({ kind: "cliff", i, cliff: c });
  });
  return out;
}

/** What leaving the day before a cliff gives up, in words. */
export function cliffCost(c: Cliff): string {
  switch (c.kind) {
    case "bonus": return "leave the day before and it's forfeited";
    case "cashAward": return "leave before it's paid and it isn't";
    case "rsuVest": case "retirementVest": return "leave the day before and it's left behind";
    case "clawbackCleared": return "work through this day and it's yours; leave before and you repay it";
    case "clawbackStep": return "the clawback shrinks";
  }
}

/** A cliff's name in a line: "the bonus for Jul 13 – Dec 31, 2026", "the sign-on's clawback ends". */
export function cliffName(c: Cliff): string {
  const d = c.detail;
  if (d.kind === "bonus") return `the bonus for ${periodText(d.periodFrom, d.periodTo)}`;
  if (d.kind === "cash") return `the ${inSentence(d.award.trim() || "cash award")}`;
  if (d.kind === "rsu") return `an RSU vest (${d.grant.kind === "grant" ? d.grant.label : `refresher ${d.grant.number}`})`;
  if (d.kind === "retirementVest") return `your employer 401(k) money vests to ${Math.round(d.vestedShare * 100)}%`;
  if (d.kind === "clawbackStep") return `the ${inSentence(d.award.trim() || "award")}'s clawback ends`;
  return "a payment";
}

/** The terms in an offer's inputs that leaving early or starting late can cost, beyond leaveTerms (M-9): the bonus cutoff and guarantee. */
export function bonusTerms(o: OfferInput): string[] {
  const b = o.bonus;
  if (!b) return [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const out: string[] = [];
  if (b.cutoff) out.push(`a start on or after ${MONTHS[b.cutoff.month - 1]} ${b.cutoff.day} in a bonus period earns nothing for that period`);
  if (b.firstPayoutGuaranteed) out.push("its first bonus is guaranteed at the target, whatever the year brings");
  return out;
}

/** The stay's last day. */
export const lastDayOf = (window: { end: ISODate }) => dayBefore(window.end);

// ---- A-6: tax by calendar year ----------------------------------------------------------------------------------------------

export interface TaxYearRow {
  year: number;
  projectedLaw: boolean;
  /** The offer's pay and tax in the year, as shown, and the tax by kind: federal takes the rounding, so the kinds add to the tax. */
  values: Record<Exclude<A6Line, "rate">, number>;
  /** Its tax ÷ its pay, as shown: the figures its work divides. */
  rate: number;
}

/** The offer's tax by calendar year over its own stay (the calendar years its stay touches), by kind, each column footing as shown. */
export function taxYearsOf(d: OfferDetail, window: { start: ISODate; end: ISODate }): TaxYearRow[] {
  const first = Number(window.start.slice(0, 4));
  const last = Number(lastDayOf(window).slice(0, 4));
  return d.taxYears.filter((t) => t.year >= first && t.year <= last && t.gross > 0).map((t) => {
    const tax = R(t.tax);
    const fica = R(t.parts.fica);
    const state = R(t.parts.state);
    const local = R(t.parts.local);
    const gross = R(t.gross);
    return { year: t.year, projectedLaw: t.projectedLaw, rate: gross ? tax / gross : 0,
      values: { gross, tax, federal: tax - fica - state - local, fica, state, local } };
  });
}

/** A tax rate to a tenth of a percent: "27.3%". */
export const rateText = (x: number) => `${(x * 100).toFixed(1)}%`;
