import type { Cliff, ISODate, OfferWarning, WindowTotals } from "../../src/offer/types";
import type { Letter } from "./model";
import type { LeaveCurve, LeavePanel } from "./protocol";
import { dayBefore, dollars, longDate, percent } from "./text";

// L-4 · Leaving early (docs/ui-design.md §4.5), the view model: the axis (calendar dates, so offers with
// different start dates line up), each offer's curve with its markers and prorated-clawback segments, the
// panel's words, and the reconciliation with your stay at its end. Shared by the schedule (Leaving.tsx)
// and its derivations (derive.ts); both load on first use. Pure: no React, no engine.

/** What L-4 counts: after-tax pay kept, or total rewards kept. After rent isn't available here yet. */
export type LeaveBasis = "cash" | "totalRewards";

const DAY_MS = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** An ISO date plus calendar months, the day clamped to the month's end, as the engine counts them. */
export function addMonthsIso(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return iso(Date.UTC(year, month, Math.min(d, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
}
export const daysBetween = (from: ISODate, to: ISODate) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
export const addDays = (date: ISODate, days: number) => iso(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);

export interface LeaveAxis {
  /** The earliest start. */
  start: ISODate;
  /** Exclusive: the earliest start plus the longer of five years and your stay. */
  end: ISODate;
  /** Your stay's last day. */
  stayEnd: ISODate;
  stayYears: number;
}

export function leaveAxis(earliestStart: ISODate, stayYears: number): LeaveAxis {
  return {
    start: earliestStart, end: addMonthsIso(earliestStart, 12 * Math.max(5, stayYears)),
    stayEnd: dayBefore(addMonthsIso(earliestStart, 12 * stayYears)), stayYears,
  };
}
/** Where the last day starts: six months' work from the earliest start (W6). */
export const firstLastDay = (axis: LeaveAxis) => dayBefore(addMonthsIso(axis.start, 6));
/** A last day kept on the axis. */
export const onAxis = (axis: LeaveAxis, date: ISODate) => (date < axis.start ? axis.start : date >= axis.end ? dayBefore(axis.end) : date);

/** Whole months worked by a last day, and the days past them: a last day of start + 6 months - 1 day is 6 months, 0 days. */
export function worked(start: ISODate, last: ISODate): { months: number; days: number } {
  let months = 0;
  while (dayBefore(addMonthsIso(start, months + 1)) <= last) months++;
  return { months, days: daysBetween(addMonthsIso(start, months), last) + 1 };
}

// ---- the curves ------------------------------------------------------------------------------------

export type MarkKind = "payment" | "vest" | "clawbackEnds" | "retirement";
export const MARKS: Record<MarkKind, { glyph: string; name: string }> = {
  payment: { glyph: "$", name: "payment (bonus, sign-on)" },
  vest: { glyph: "▲", name: "RSU vest" },
  clawbackEnds: { glyph: "✓", name: "clawback ends" },
  retirement: { glyph: "◆", name: "401(k) vests" },
};

export interface Marker { date: ISODate; kinds: MarkKind[]; value: number }
/** A prorated clawback's monthly steps, drawn as one segment: it shrinks `perMonth` each month until `until`. */
export interface Segment { award: string; perMonth: number; from: ISODate; until: ISODate }
export interface LeaveLine { letter: Letter; start: ISODate; points: Array<{ date: ISODate; value: number }>; markers: Marker[]; segments: Segment[] }

export const isProratedStep = (c: Cliff) => c.detail.kind === "clawbackStep" && c.detail.prorated;

function markKind(c: Cliff): MarkKind | null {
  switch (c.kind) {
    case "bonus": case "cashAward": return "payment";
    case "rsuVest": return "vest";
    case "retirementVest": return "retirement";
    case "clawbackCleared": return "clawbackEnds";
    case "clawbackStep": return null;
  }
}

/** Each offer's curve on a basis, its cliffs as markers, and its prorated clawbacks as segments. */
export function leaveLines(curves: LeaveCurve[], letters: Letter[], basis: LeaveBasis): LeaveLine[] {
  return curves.map((c, i) => {
    const points = c.points.map((r) => ({ date: r.leaveDate, value: basis === "cash" ? r.afterTaxCompKept : r.totalRewardsKept }));
    const line = { letter: letters[i], start: points[0]?.date ?? "", points, markers: [] as Marker[], segments: [] as Segment[] };
    const kinds = new Map<ISODate, MarkKind[]>();
    for (const cliff of c.cliffs) {
      const k = markKind(cliff);
      if (!k) continue;
      const at = kinds.get(cliff.date) ?? [];
      if (!at.includes(k)) at.push(k);
      kinds.set(cliff.date, at);
    }
    line.markers = [...kinds].map(([date, ks]) => ({ date, kinds: ks, value: valueAt(line, date) ?? 0 }));
    const steps = new Map<string, Cliff[]>();
    for (const cliff of c.cliffs.filter(isProratedStep)) {
      const award = cliff.detail.kind === "clawbackStep" ? cliff.detail.award : "";
      steps.set(award, [...(steps.get(award) ?? []), cliff]);
    }
    line.segments = [...steps].map(([award, s]) => ({ award, perMonth: s[0].amount, from: s[0].date, until: s[s.length - 1].date }));
    return line;
  });
}

/** A curve's value on a day: exact where it was sampled, straight-line between samples, null before its start. */
export function valueAt(line: Pick<LeaveLine, "points">, date: ISODate): number | null {
  const p = line.points;
  if (!p.length || date < p[0].date) return null;
  let i = 0;
  while (i + 1 < p.length && p[i + 1].date <= date) i++;
  if (i + 1 >= p.length || p[i].date === date) return p[i].value;
  const span = daysBetween(p[i].date, p[i + 1].date);
  return p[i].value + ((p[i + 1].value - p[i].value) * daysBetween(p[i].date, date)) / span;
}

// ---- the panel's words -------------------------------------------------------------------------------

/** "clawback shrinks $833 a month until Jul 12, 2027" */
export const segmentText = (s: Segment) => `${s.award} clawback shrinks ${dollars(s.perMonth)} a month until ${longDate(s.until)}`;

/** A cliff in words: "your 2027 bonus ($32,986 before tax)". */
export function cliffText(c: Cliff): string {
  const d = c.detail;
  const gross = dollars(c.amount);
  if (d.kind === "bonus") {
    const year = d.periodFrom.slice(0, 4);
    const calendar = d.periodFrom === `${year}-01-01` && d.periodTo === `${year}-12-31`;
    return `your ${calendar ? `${year} ` : ""}bonus${calendar ? "" : ` for ${longDate(d.periodFrom)} – ${longDate(d.periodTo)}`} (${gross} before tax)`;
  }
  if (d.kind === "cash") return `the ${d.award} (${gross} before tax)`;
  if (d.kind === "rsu") return `an RSU vest of ${gross} (${d.grant.kind === "grant" ? d.grant.label : `refresher ${d.grant.number}`})`;
  if (d.kind === "retirementVest") return `your employer 401(k) money vesting to ${percent(d.vestedShare)} (${gross})`;
  if (d.kind === "clawbackStep") {
    return c.kind === "clawbackCleared" ? `the end of the ${d.award} clawback (${gross} you'd no longer repay)` : `a ${d.award} clawback step (${gross})`;
  }
  return gross;
}

const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The next cliff's parts in words; RSU vests on the same day are added up. */
export function cliffsText(cliffs: Cliff[]): string {
  const vests = cliffs.filter((c) => c.kind === "rsuVest");
  const parts = cliffs.filter((c) => c.kind !== "rsuVest").map(cliffText);
  if (vests.length === 1) parts.push(cliffText(vests[0]));
  if (vests.length > 1) parts.push(`RSU vests of ${dollars(vests.reduce((sum, c) => sum + c.amount, 0))} from ${vests.length} grants`);
  return join(parts);
}

/** A bonus period in words: "2026" for a calendar year. */
const period = (from: ISODate, to: ISODate) =>
  (from.endsWith("-01-01") && to === `${from.slice(0, 4)}-12-31` ? from.slice(0, 4) : `${longDate(from)} – ${longDate(to)}`);

/** The leave-date warnings, in the UI's words: the bonuses forfeited as one line, then each clawback's FICA. */
export function leaveWarningTexts(warnings: OfferWarning[]): string[] {
  const out: string[] = [];
  const bonuses = warnings.flatMap((w) => (w.code === "bonusForfeited" ? [w.params] : []));
  if (bonuses.length) {
    out.push(`Leaving then forfeits the ${bonuses.length > 1 ? "bonuses" : "bonus"} for `
      + `${join(bonuses.map((b) => `${period(b.periodFrom, b.periodTo)} (paid ${longDate(b.payDate)})`))}: you must be employed on the payout date.`);
  }
  for (const w of warnings) {
    if (w.code !== "clawbackFica") continue;
    const p = w.params;
    out.push(`Repaying the ${p.award} in ${p.repaidYear} for pay received in ${p.paidYear}: the Social Security and Medicare tax withheld on it `
      + "isn't refunded automatically (your employer may return it on a corrected W-2c), and there's no state relief. This assumes you don't "
      + "get it back.");
  }
  return out;
}

// ---- your stay's end -------------------------------------------------------------------------------

/**
 * Leaving on your stay's last day vs the stay as L-1 counts it, after tax and as paid. They differ by
 * the last year's tax (the stay taxes it as though pay continued through December), any pay after you
 * leave, premiums, and clawbacks repaid: kept = stay + pay + tax + premiums - clawback.
 */
export interface Reconciliation {
  kept: number;
  stay: number;
  /** Pay received beyond what the stay counts (a bonus prorated to your last day and paid later). */
  pay: number;
  /** Tax the stay counts that leaving doesn't. */
  tax: number;
  /** Premiums the stay counts that leaving doesn't. */
  premiums: number;
  /** Clawbacks repaid, before tax (their relief is in `tax`), which only leaving pays. */
  clawback: number;
  /** The calendar year your stay ends in. */
  year: number;
}

export function reconcile(panel: LeavePanel, stay: WindowTotals): Reconciliation {
  const n = stay.nominal;
  return {
    kept: panel.afterTaxCompKept, stay: n.afterTaxComp, pay: panel.paid - n.gross, tax: n.tax - panel.tax,
    premiums: n.premiums - panel.premiums, clawback: panel.repaid, year: Number(panel.leaveDate.slice(0, 4)),
  };
}
