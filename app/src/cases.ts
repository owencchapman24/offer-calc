import type { Basis, ByScenario, OfferInput, Scenario, WindowTotals } from "../../src/offer/types";
import { type Letter, toOfferInput } from "./model";
import { detailOf, indexOf, join, offerByLetter, res, type WorkContext } from "./metrics";
import { dollars, percent } from "./text";

// L-2 · If things go badly (docs/ui-design.md §4.4), the view model: each offer's bear, base and bull
// values over your stay on the selected basis, who wins each, who has the most to lose, and which inputs
// differ in a scenario. Shared by the schedule (Risk.tsx) and its derivations (derive.ts); both load on
// first use. (Named apart from Risk.tsx on purpose: risk.ts would collide on a case-insensitive file system.)

export const CASES: Scenario[] = ["bear", "base", "bull"];

/** A window's value on a basis: present value, or per hour worked (nominal). */
export function windowValue(w: WindowTotals, basis: Basis, perHourOf: "colAdjustedTotal" | "totalRewards"): number {
  switch (basis) {
    case "cash": return w.presentValue!.afterTaxComp;
    case "totalRewards": return w.totalRewards.presentValue!;
    case "colAdjustedTotal": return w.costOfLiving!.presentValue!.total;
    case "perHour": return w.perHour?.[perHourOf] ?? 0;
  }
}

/** An offer's value in a scenario over your stay, on the selected basis. The base case is the rank list's figure. */
export function caseValue(ctx: WorkContext, letter: Letter, s: Scenario): number {
  const r = res(ctx);
  if (s === "base") {
    const v = r.view.row.values[r.view.basis]?.[indexOf(ctx, letter)];
    if (v === undefined) throw new Error("This basis isn't available for these offers.");
    return v;
  }
  return windowValue(detailOf(ctx, letter).cases[s], r.view.basis, r.sweep.perHourOf);
}

// ---- what differs from the base case ---------------------------------------------------------------

/** One uncertain input whose value in a scenario differs from the base case. */
export type CaseChange =
  | { kind: "bonus"; basis: "percentOfSalary" | "fixed"; value: number; base: number; firstGuaranteed: boolean }
  /** `ratio`: the scenario over the base, when it's the same every year; else the years that differ. */
  | { kind: "bonusByYear"; ratio: number | null; years: number[]; firstGuaranteed: boolean }
  | { kind: "raise"; value: number; base: number }
  /** `included`: the promotion happens in this scenario but not the base case (else the reverse). */
  | { kind: "promotion"; on: string; stepUp: number; included: boolean }
  | { kind: "priceGrowth"; value: number; base: number }
  | { kind: "refreshers"; value: number; base: number }
  | { kind: "hours"; value: number; base: number };

const differs = (a: number, b: number) => Math.abs(a - b) > 1e-9;
const ranged = (x: ByScenario | undefined) => !!x && (differs(x.bear, x.base) || differs(x.bull, x.base));
const inCase = (scenarios: Scenario[] | undefined, s: Scenario) => (scenarios ?? CASES).includes(s);

/**
 * The inputs whose value in scenario `s` differs from the base case, in the order the ledger lists them.
 * Only what can move the figure: promotions inside your stay (before `end`), share-price growth with
 * equity, and hours only on the per-hour basis.
 */
export function caseChanges(o: OfferInput, s: Scenario, end: string, perHour: boolean): CaseChange[] {
  const out: CaseChange[] = [];
  const b = o.bonus;
  const firstGuaranteed = !!b?.firstPayoutGuaranteed;
  if (b && b.basis !== "byEmploymentYear" && differs(b.amount[s], b.amount.base)) {
    out.push({ kind: "bonus", basis: b.basis, value: b.amount[s], base: b.amount.base, firstGuaranteed });
  }
  if (b?.basis === "byEmploymentYear") {
    const years = b.amounts.flatMap((a, i) => (differs(a[s], a.base) ? [i + 1] : []));
    if (years.length) {
      const ratios = b.amounts.map((a) => (a.base ? a[s] / a.base : 1));
      const same = years.length === b.amounts.length && ratios.every((r) => !differs(r, ratios[0]));
      out.push({ kind: "bonusByYear", ratio: same ? ratios[0] : null, years, firstGuaranteed });
    }
  }
  const raise = o.salary.raise;
  if (raise && differs(raise[s], raise.base)) out.push({ kind: "raise", value: raise[s], base: raise.base });
  for (const p of o.salary.promotions ?? []) {
    if (p.on >= end || inCase(p.scenarios, s) === inCase(p.scenarios, "base")) continue;
    out.push({ kind: "promotion", on: p.on, stepUp: p.stepUp, included: inCase(p.scenarios, s) });
  }
  const eq = o.equity;
  if (eq && (eq.grants.length || eq.refreshers) && eq.priceGrowth && differs(eq.priceGrowth[s], eq.priceGrowth.base)) {
    out.push({ kind: "priceGrowth", value: eq.priceGrowth[s], base: eq.priceGrowth.base });
  }
  const rf = eq?.refreshers;
  if (rf && differs(rf.value[s], rf.value.base)) out.push({ kind: "refreshers", value: rf.value[s], base: rf.value.base });
  if (perHour && o.hours && differs(o.hours.weekly[s], o.hours.weekly.base)) {
    out.push({ kind: "hours", value: o.hours.weekly[s], base: o.hours.weekly.base });
  }
  return out;
}

/** Whether any uncertain input has a range (or a promotion limited to some scenarios). */
export function hasRanges(o: OfferInput): boolean {
  const b = o.bonus;
  return (b?.basis === "byEmploymentYear" ? b.amounts.some(ranged) : ranged(b?.amount)) || ranged(o.salary.raise)
    || (o.salary.promotions ?? []).some((p) => !CASES.every((s) => inCase(p.scenarios, s)))
    || ranged(o.equity?.priceGrowth) || ranged(o.equity?.refreshers?.value) || ranged(o.hours?.weekly);
}

const signedRate = (x: number) => `${x < 0 ? "−" : "+"}${percent(Math.abs(x))}`;
const year = (iso: string) => iso.slice(0, 4);

/** "bonus 5% of salary instead of 10%", "no promotion in 2029": a change in words. */
export function changeText(c: CaseChange): string {
  const guaranteed = "firstGuaranteed" in c && c.firstGuaranteed ? " (the first is guaranteed)" : "";
  switch (c.kind) {
    case "bonus":
      return c.basis === "percentOfSalary"
        ? `bonus ${percent(c.value)} of salary instead of ${percent(c.base)}${guaranteed}`
        : `bonus ${dollars(c.value)} a year instead of ${dollars(c.base)}${guaranteed}`;
    case "bonusByYear":
      if (c.ratio === null) return `bonuses differ in year${c.years.length > 1 ? "s" : ""} ${join(c.years.map(String))}${guaranteed}`;
      return `bonuses ${percent(Math.abs(1 - c.ratio))} ${c.ratio < 1 ? "under" : "over"} target${guaranteed}`;
    case "raise": return `raises ${percent(c.value)} a year instead of ${percent(c.base)}`;
    case "promotion": return c.included ? `a promotion in ${year(c.on)} (${signedRate(c.stepUp)})` : `no promotion in ${year(c.on)}`;
    case "priceGrowth": return `share price ${signedRate(c.value)} a year instead of ${signedRate(c.base)}`;
    case "refreshers": return `refreshers ${dollars(c.value)} instead of ${dollars(c.base)}`;
    case "hours": return `${c.value} hours a week instead of ${c.base}`;
  }
}

const NOUN: Record<CaseChange["kind"], { word: string; plural: boolean }> = {
  bonus: { word: "bonus", plural: false }, bonusByYear: { word: "bonuses", plural: true }, raise: { word: "raises", plural: true },
  promotion: { word: "promotion", plural: false }, priceGrowth: { word: "share price", plural: false },
  refreshers: { word: "refreshers", plural: true }, hours: { word: "hours", plural: true },
};

/** "its promotion and bonuses carry the risk" */
export function riskCarriers(changes: CaseChange[]): string {
  const kinds = [...new Set(changes.map((c) => c.kind))];
  const plural = kinds.length > 1 || NOUN[kinds[0]].plural;
  return `its ${join(kinds.map((k) => NOUN[k].word))} ${plural ? "carry" : "carries"} the risk`;
}

// ---- the view ----------------------------------------------------------------------------------------

export interface RiskRow {
  letter: Letter;
  values: Record<Scenario, number>;
  /** Base minus bear: what the bear case takes away. */
  drop: number;
  /** The drop as a share of the base case. */
  share: number;
  /** The inputs that differ in the bear case. */
  changes: CaseChange[];
  /** Any range entered (an offer without one shows a single value and says so). */
  ranged: boolean;
}

export interface CaseLead { winner: Letter; runnerUp: Letter; margin: number; /** Dollar bases: the margin a month, as the verdict states it. */ perMonth: number | null }

export interface RiskView {
  perHour: boolean;
  years: number;
  /** The stay's annuity factor: a present-value gap / it = a month. */
  factor: number;
  /** Sorted by the bear case, best first. */
  rows: RiskRow[];
  leads: Record<Scenario, CaseLead>;
  /** The best bear case. */
  holdsUp: Letter;
  /** The biggest drop from base to bear, when any offer drops. */
  mostToLose: RiskRow | null;
  /** Offers that win the bull case only. */
  onlyIfWell: Letter[];
  /** Any offer with a range: without one there's no downside to show. */
  anyRange: boolean;
}

/** A bear case against its base, as shown: "−17%" (a drop), "+3%". */
export const dropText = (x: RiskRow) => `${x.share >= 0 ? "−" : "+"}${Math.round(Math.abs(x.share) * 100)}%`;

export function riskView(ctx: WorkContext): RiskView {
  const r = res(ctx);
  const row = r.view.row;
  const perHour = r.view.basis === "perHour";
  const rows: RiskRow[] = r.letters.map((letter) => {
    const values = Object.fromEntries(CASES.map((s) => [s, caseValue(ctx, letter, s)])) as Record<Scenario, number>;
    const input = toOfferInput(offerByLetter(ctx, letter)!);
    const offer = "offer" in input ? input.offer : null;
    const drop = values.base - values.bear;
    return {
      letter, values, drop, share: values.base ? drop / Math.abs(values.base) : 0,
      changes: offer ? caseChanges(offer, "bear", row.window.end, perHour) : [],
      ranged: offer ? hasRanges(offer) : false,
    };
  });
  const leads = Object.fromEntries(CASES.map((s) => {
    // Ties go to the earlier offer, as in the engine's horizon sweep.
    const order = rows.map((x, i) => ({ x, i })).sort((a, b) => b.x.values[s] - a.x.values[s] || a.i - b.i).map((o) => o.x);
    const margin = order[0].values[s] - order[1].values[s];
    return [s, { winner: order[0].letter, runnerUp: order[1].letter, margin, perMonth: perHour ? null : margin / row.annuityFactor }];
  })) as Record<Scenario, CaseLead>;
  const sorted = rows.map((x, i) => ({ x, i })).sort((a, b) => b.x.values.bear - a.x.values.bear || a.i - b.i).map((o) => o.x);
  const worst = [...rows].sort((a, b) => b.drop - a.drop)[0];
  return {
    perHour, years: row.years, factor: row.annuityFactor, rows: sorted, leads,
    holdsUp: leads.bear.winner,
    mostToLose: worst && worst.drop > (perHour ? 0.005 : 0.5) ? worst : null,
    onlyIfWell: r.letters.filter((l) => leads.bull.winner === l && leads.base.winner !== l && leads.bear.winner !== l),
    anyRange: rows.some((x) => x.ranged),
  };
}
