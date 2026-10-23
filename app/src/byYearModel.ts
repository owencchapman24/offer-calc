import type { Basis, EmploymentYearResult, ValueBasis } from "../../src/offer/types";
import { type ShownYear, shownStay, shownYears } from "./footing";
import {
  type BridgeLine, detailOf, join, type MetricId, offerByLetter, ownOf, ownYearOf, pricesOf, res, shortCity, type WorkContext, yearOf,
} from "./metrics";
import { type AppOffer, CITY_TAX, cityTax, type Letter } from "./model";
import type { OfferDetail } from "./protocol";
import { dollars, longDate, monthName, percent, shortDate } from "./text";

// The view models behind L-1, by year (docs/ui-design.md §4.3), and the bridge beside it (§5, W4): the figures ByYear.tsx draws,
// shared with the derivations, the copied document, CSV, L-6 and the methodology. Pure: no React. Out of metrics.ts so that L-1,
// which loads as you scroll toward it, takes them, and the year figures as shown (footing.ts), with it: off the main thread.

type L = Letter;

// ---- L-1: by year ------------------------------------------------------------------------------

/** An employment year's value on a basis, as shown (footing.ts): dollars as paid that year, or per hour worked. */
export function yearValue(y: ShownYear, basis: Basis, perHourOf: ValueBasis): number | null {
  switch (basis) {
    case "cash": return y.afterTax;
    case "totalRewards": return y.totalRewards;
    case "colAdjustedTotal": return y.col?.total ?? null;
    case "perHour": {
      const v = perHourOf === "colAdjustedTotal" ? y.col?.total : y.totalRewards;
      return v !== undefined && y.hours ? v / y.hours : null;
    }
  }
}

/** One employment year of an offer's stay in the comparison, as shown. */
export function shownYearOf(ctx: WorkContext, letter: L, n: number): ShownYear {
  yearOf(ctx, letter, n);
  return shownYears(detailOf(ctx, letter))[n - 1];
}

/** One employment year of an offer's own stay (its breakdown), as shown. Employment years are the same in the comparison. */
export function ownShownYear(ctx: WorkContext, letter: L, n: number): ShownYear {
  ownYearOf(ctx, letter, n);
  return shownYears(ownOf(ctx, letter).detail)[n - 1];
}

export interface ByYear {
  letter: L;
  /** Employment years 1 through your stay. */
  years: Array<{ n: number; start: string; end: string; value: number }>;
  /** The years added (dollar bases only). */
  sum: number | null;
  /** Your stay, as paid: less what the years run past its last day (a later start), as shown (footing.ts). */
  window: number | null;
}

/** One offer's figures for L-1 on the selected basis. */
export function byYear(ctx: WorkContext, letter: L): ByYear {
  const r = res(ctx);
  const d = detailOf(ctx, letter);
  const basis = r.view.basis;
  const n = r.view.row.years;
  const out = shownYears(d).slice(0, n).flatMap((y) => {
    const value = yearValue(y, basis, r.sweep.perHourOf);
    return value === null ? [] : [{ n: y.n, start: y.start, end: y.end, value }];
  });
  if (basis === "perHour") return { letter, years: out, sum: null, window: null };
  const s = shownStay(d, n);
  return { letter, years: out, sum: s.years[basis], window: s.stay[basis] };
}

/** L-1's notes on what bends the lines: a promotion in a year (base case), and the year the new-hire RSUs finish vesting. */
export function yearNotes(ctx: WorkContext): Array<{ n: number; letter: L; text: string }> {
  const r = res(ctx);
  return r.letters.flatMap((letter, i) => notesOf(r.detail!.offers[i], r.view.row.years).map((x) => ({ ...x, letter })));
}

/** One offer's notes over its first `years` employment years (L-1's, and the breakdown's year 1). */
export function notesOf(d: OfferDetail, years: number): Array<{ n: number; text: string }> {
  const notes: Array<{ n: number; text: string }> = [];
  const ys = d.employmentYears.slice(0, years);
  const yearAt = (date: string) => ys.findIndex((y) => date >= y.start && date < y.end) + 1;
  for (const a of d.assumptions) {
    if (a.code !== "salaryChanges") continue;
    for (const c of a.params.changes) {
      const n = yearAt(c.date);
      if (n > 0 && c.reasons.some((x) => x.kind === "promotion")) notes.push({ n, text: `promotion (${longDate(c.date)}, base case)` });
    }
  }
  const lastNewHire = d.rsus.filter((v) => !v.refresher).at(-1);
  if (lastNewHire && lastNewHire.ey <= ys.length) notes.push({ n: lastNewHire.ey, text: "new-hire RSUs finish vesting" });
  return notes;
}

// ---- the bridge: offer letter to after rent ------------------------------------------------------

export interface BridgeRow {
  id: MetricId;
  line: BridgeLine;
  /** letter: the offer letter; change: what's paid differs from it; subtotal/total: footed. */
  kind: "letter" | "change" | "subtotal" | "less" | "plus" | "total";
  /** Lower case, after "less" or "plus": "first bonus is a stub". */
  label: string;
  /** Signed: what it adds to the running figure. */
  value: number;
  gloss?: string;
}

export interface Bridge {
  letter: L;
  year: number;
  start: string;
  end: string;
  rows: BridgeRow[];
  /**
   * A month: spending money after rent, and what's saved, present with a city: at the offer's own prices in its breakdown (A-2),
   * at the prices picked in the comparison's document.
   */
  spend?: number;
  saved?: number;
  /** ESPP money held at the year's end, a month (4i): present when it isn't zero. */
  inEspp?: number;
  /** Tax-free benefits, a month (4j): present when there are any. */
  taxFree?: number;
  /** The offer's city, its bridge's own-price line names ("New York"); present with a city. */
  city?: string;
}

/**
 * The tax-free benefits an offer has, by name (4j): its education help and commuter benefits, and other benefits entered as tax-free.
 * A draft's or an input's.
 */
export function taxFreeNames(x: { perks?: { section127?: number | null; commuterMonthly?: number | null } | null;
  otherBenefits?: Array<{ label: string; taxable: boolean | null }> | null }): string[] {
  return [x.perks?.section127 ? "education help" : "", x.perks?.commuterMonthly ? "commuter benefits" : "",
    ...(x.otherBenefits ?? []).filter((b) => b.taxable === false).map((b) => b.label.trim())].filter(Boolean);
}

/** In which employment year a date falls: a date on an anniversary counts toward the year just ended (decision 1). */
export function eyOfDate(ys: EmploymentYearResult[], date: string): number {
  const i = ys.findIndex((y) => date > y.start && date <= y.end);
  return i >= 0 ? i + 1 : date === ys[0]?.start ? 1 : 0;
}

/** A bonus period counts from your start date: a period that began before it is prorated to the days you worked. */
export const workedFrom = (d: OfferDetail, periodFrom: string) => (d.employmentYears[0] && periodFrom < d.employmentYears[0].start ? d.employmentYears[0].start : periodFrom);

/** "sign-on" when every cash award is one, else "cash awards". */
export function cashName(o: AppOffer | undefined): string {
  return o?.draft.cashAwards.length && o.draft.cashAwards.every((a) => /sign/i.test(a.label)) ? "sign-on" : "cash awards";
}

/**
 * The bridge for one offer and employment year (docs/ui-design.md §5, W4): every line foots, as shown (footing.ts). In its breakdown
 * (A-2, `of` "own"), over its own stay, it ends after rent at the offer's own prices, then, with a comparison or Prices in a city,
 * steps to the prices picked (docs/v2-plan.md, item 5, B7). The comparison's document (`of` "comparison") sets offers side by side,
 * so it goes from rent straight to the prices picked, never through an offer's own city's dollars (condition 1).
 */
export function bridge(ctx: WorkContext, letter: L, n: number, of: "own" | "comparison" = "own"): Bridge {
  const d = of === "own" ? ownOf(ctx, letter).detail : detailOf(ctx, letter);
  const y = of === "own" ? ownShownYear(ctx, letter, n) : shownYearOf(ctx, letter, n);
  const o = offerByLetter(ctx, letter);
  const id = (line: BridgeLine) => `br.${letter}.${n}.${line}` as MetricId;
  const rows: BridgeRow[] = [];
  const q = y.quoted;
  const parts = [q.salary && "salary", q.bonus && "target bonus", q.cash && cashName(o), q.rsu && "RSUs due"].filter(Boolean) as string[];
  rows.push({ id: id("letter"), line: "letter", kind: "letter", label: `Offer letter: ${parts.join(" + ")}`, value: q.letter });

  // Where what's paid in the year differs from the letter, line by line.
  const change = (line: "salary" | "bonus" | "cash" | "rsu", label: string, gloss?: string) => {
    const diff = y[line] - q[line];
    if (diff) rows.push({ id: id(line), line, kind: "change", label, value: diff, ...(gloss ? { gloss } : {}) });
  };
  change("salary", y.salary > q.salary ? "raises during the year" : "salary not earned this year");
  const bonuses = d.bonuses.filter((b) => b.ey === n);
  const from = (b: (typeof bonuses)[number]) => workedFrom(d, b.periodFrom);
  const stub = (b: (typeof bonuses)[number]) => (Date.parse(b.periodTo) - Date.parse(from(b))) / 86_400_000 < 360;
  const bonusGloss = bonuses.map((b) => `paid ${shortDate(b.date)} for ${monthName(from(b))}–${monthName(b.periodTo)}${stub(b) ? " only" : ""}`).join("; ");
  const nextBonus = d.bonuses.find((b) => b.ey > n);
  change("bonus",
    !bonuses.length ? `no bonus paid in year ${n}` : n === 1 && bonuses.every(stub) && y.bonus < q.bonus ? "first bonus is a stub"
      : y.bonus < q.bonus ? "bonus paid is below the target" : "bonus paid is above the target",
    bonuses.length ? bonusGloss : nextBonus ? `the first is paid ${shortDate(nextBonus.date)}, ${nextBonus.date.slice(0, 4)}` : undefined);
  change("cash", "cash awards paid in another year");
  const vests = d.rsus.filter((v) => v.ey === n);
  const movedOut = d.rsus.some((v) => !v.refresher && v.nominalDate && eyOfDate(d.employmentYears, v.nominalDate) === n && v.ey > n);
  const movedIn = vests.some((v) => !v.refresher && v.nominalDate && eyOfDate(d.employmentYears, v.nominalDate) < n);
  const reasons = [
    ...(movedOut || movedIn ? ["RSUs vest on company dates"] : []),
    ...(vests.some((v) => v.refresher) ? ["refreshers"] : []),
    ...(vests.some((v) => Math.abs(v.priceFactor - 1) > 1e-9) ? ["share-price growth"] : []),
  ];
  change("rsu", reasons.length ? join(reasons) : "RSUs vest on a different schedule",
    vests.length ? `vests ${join([...new Set(vests.map((v) => shortDate(v.date)))])}` : undefined);
  // An ESPP isn't in the offer letter: each purchase's gain, sold the same day, is pay on top of it (4i).
  const buys = d.espps.filter((p) => p.ey === n);
  if (y.espp) {
    rows.push({ id: id("espp"), line: "espp", kind: "change", label: "ESPP shares bought at a discount, sold at once", value: y.espp,
      ...(buys.length ? { gloss: `bought ${join([...new Set(buys.map((p) => shortDate(p.date)))])}` } : {}) });
  }
  // Taxable other benefits aren't in the offer letter's year either: they're paid with salary (4j).
  if (y.benefit) {
    const names = o ? (o.draft.otherBenefits ?? []).filter((b) => b.taxable !== false).map((b) => b.label.trim()).filter(Boolean) : [];
    rows.push({ id: id("benefit"), line: "benefit", kind: "change", label: "taxable benefits, paid with salary", value: y.benefit,
      ...(names.length ? { gloss: join(names) } : {}) });
  }
  if (y.clawback) rows.push({ id: id("clawback"), line: "clawback", kind: "less", label: "clawback repaid", value: y.clawback });
  rows.push({ id: id("paid"), line: "paid", kind: "subtotal", label: `Paid in year ${n}`, value: y.gross });

  const taxYears = d.split.filter((s) => s.ey === n).map((s) => s.year);
  const kinds = d.taxYears.filter((t) => taxYears.includes(t.year));
  const city = o ? cityTax(o.draft) : null;
  const locality = city ? CITY_TAX[city].line : "local";
  const who = [
    kinds.some((t) => t.parts.federal) && "federal", kinds.some((t) => t.parts.fica) && "FICA",
    kinds.some((t) => t.parts.state) && (o?.draft.residence.state ?? "state"), kinds.some((t) => t.parts.local) && locality,
  ].filter(Boolean) as string[];
  rows.push({ id: id("tax"), line: "tax", kind: "less", label: "tax", value: -y.tax, gloss: who.join(", ") });
  if (y.premiums) rows.push({ id: id("premiums"), line: "premiums", kind: "less", label: "health premiums", value: -y.premiums });
  rows.push({ id: id("afterTax"), line: "afterTax", kind: "subtotal", label: "After-tax pay", value: y.afterTax });

  const ret = d.assumptions.find((a) => a.code === "retirement");
  if (y.credited) {
    const share = ret?.code === "retirement" ? ret.params.vestedShare : y.employer / y.credited;
    rows.push({ id: id("retirement"), line: "retirement", kind: "plus", label: "employer 401(k)", value: y.employer,
      gloss: share >= 1 ? "vested by the end of your stay" : share > 0 ? `${percent(share)} vested by the end of your stay` : "not vested by the end of your stay" });
  }
  if (y.perks) {
    const names = o ? taxFreeNames(o.draft) : [];
    rows.push({ id: id("perks"), line: "perks", kind: "plus", label: "tax-free benefits", value: y.perks,
      gloss: `at face value${names.length ? `: ${join(names)}` : ""}` });
  }
  if (y.hsa) rows.push({ id: id("hsa"), line: "hsa", kind: "plus", label: "employer HSA money", value: y.hsa });
  if (y.oop) rows.push({ id: id("oop"), line: "oop", kind: "less", label: "expected out-of-pocket health costs", value: -y.oop });
  rows.push({ id: id("totalRewards"), line: "totalRewards", kind: "subtotal", label: "Total rewards", value: y.totalRewards });

  const col = y.col;
  const info = d.costOfLiving;
  if (!col || !info) return { letter, year: n, start: y.start, end: y.end, rows };
  const place = shortCity(info.area.name);
  const monthly = info.monthlyRent * (1 + info.rentGrowth) ** (n - 1);
  rows.push({ id: id("rent"), line: "rent", kind: "less", label: "rent", value: -col.rent,
    gloss: Math.abs(12 * monthly - col.rent) < 1 ? `${dollars(monthly)} a month` : "for the months you work there" });
  // Its own prices: a factor of 1, so after rent is total rewards less rent (M-6.3's identity), in its own city's dollars.
  const own = y.totalRewards - col.rent;
  // The prices picked are its own city's (a factor of 1): nothing to step across.
  const same = info.area.code === info.reference.code;
  if (of === "own") {
    const last = same || !ctx.own?.withRef;
    rows.push({ id: id("own"), line: "own", kind: last ? "total" : "subtotal", label: `After rent, at ${place} prices`, value: own });
    const month = { spend: (col.local - y.oop) / 12, saved: (col.face - y.esppHeld - y.perks) / 12, ...(y.esppHeld ? { inEspp: y.esppHeld / 12 } : {}),
      ...(y.perks ? { taxFree: y.perks / 12 } : {}), city: place };
    if (last) return { letter, year: n, start: y.start, end: y.end, rows, ...month };
    rows.push(...pricesRows(ctx, letter, n, col.total, own, info, place));
    return { letter, year: n, start: y.start, end: y.end, rows, ...month };
  }
  rows.push(...pricesRows(ctx, letter, n, col.total, own, info, place));
  return { letter, year: n, start: y.start, end: y.end, rows, spend: (col.atRef - col.oopRef) / 12, saved: (col.face - y.esppHeld - y.perks) / 12,
    ...(y.esppHeld ? { inEspp: y.esppHeld / 12 } : {}), ...(y.perks ? { taxFree: y.perks / 12 } : {}), city: place };
}

/**
 * The step from an offer's own prices to the prices picked, and after rent at those: the bridge's last two lines. The identity,
 * so it foots: after rent = total rewards - rent + (factor - 1) x (local spending - out-of-pocket).
 */
function pricesRows(ctx: WorkContext, letter: L, n: number, total: number, own: number, info: NonNullable<OfferDetail["costOfLiving"]>,
  city: string): BridgeRow[] {
  const id = (line: BridgeLine) => `br.${letter}.${n}.${line}` as MetricId;
  const above = 1 / info.nonHousingFactor - 1;
  const p = pricesOf(ctx);
  const prices = total - own;
  return [
    { id: id("prices"), line: "prices", kind: prices < 0 ? "less" : "plus", label: `${city} prices`, value: prices,
      gloss: info.area.code === info.reference.code ? `the prices you picked under Prices in: a factor of 1`
        : `non-housing prices ${percent(Math.abs(above))} ${above >= 0 ? "above" : "below"} ${p.average}` },
    { id: id("total"), line: "total", kind: "total", label: p.phrase[0].toUpperCase() + p.phrase.slice(1), value: total },
  ];
}
