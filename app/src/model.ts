import { statesOf } from "../../src/col/cities";
import type { AnnualBonus, ByScenario, Household, OfferInput } from "../../src/offer/types";
import type { FilingStatus } from "../../src/tax/types";
import { SAMPLE_HOUSEHOLD, SAMPLE_OFFERS } from "../../src/samples";

// The app's state for each offer: the quick-mode fields the user edits, plus (for samples) the
// detailed inputs quick mode doesn't show yet. toOfferInput() turns them into the engine's input.

export type Letter = "A" | "B" | "C";
export const LETTERS: Letter[] = ["A", "B", "C"];

/** Quick-mode bonus: a target % of salary, dollars a year (blank or 0: none), or a sample's year-by-year schedule (kept as is). */
export type QuickBonus = { kind: "percent" | "amount"; value: number | null } | { kind: "schedule" };

export interface QuickFields {
  label: string;
  /** Per year, before tax. */
  salary: number | null;
  bonus: QuickBonus;
  /** BEA area code: a metro, or a state's area outside metros. */
  area: string | null;
  /** Residence state (a metro can span states). */
  state: string | null;
  /** Inside New York City (city income tax); only asked for the New York metro in NY. */
  nyc: boolean;
  startDate: string | null;
  /** Monthly; null means "use the estimate" (HUD Fair Market Rent). */
  rent: number | null;
}

export interface AppOffer {
  id: string;
  /** Stable identity and color: removing B doesn't repaint C. */
  letter: Letter;
  /** "sample" until edited, then "edited"; null for the user's own offers. */
  sample: "sample" | "edited" | null;
  quick: QuickFields;
  /** Detailed inputs (RSUs, 401(k), health, hours, ...) from a sample; quick fields override. */
  base?: OfferInput;
}

export interface AppHousehold {
  filingStatus: FilingStatus;
  /** "How long do you expect to stay?": the comparison window. */
  stayYears: number;
  /**
   * Your wages from another job in the calendar year the offers start (for the first year's tax).
   * The name is older than that rule; it's kept so saved sessions still load.
   */
  otherWagesThisYear: number;
}

export const DEFAULT_HOUSEHOLD: AppHousehold = { filingStatus: "single", stayYears: 4, otherWagesThisYear: 0 };
/** Paid each March 15 for the prior calendar year: the common pattern, shown as a default. */
export const DEFAULT_BONUS_TIMING = { payOn: { month: 3, day: 15 } } as const;
export const NYC_METRO = "35620";
export const ASSUMPTIONS = { inflation: 0.025, discountRate: 0.05, reference: "00000" } as const;

const all = (v: number): ByScenario => ({ bear: v, base: v, bull: v });

export type Missing = "salary" | "city" | "start date";

/** The engine's input for an offer, or the quick fields still missing. */
export function toOfferInput(o: AppOffer): { offer: OfferInput } | { missing: Missing[] } {
  const q = o.quick;
  const missing: Missing[] = [];
  if (q.salary === null) missing.push("salary");
  if (!q.area || !q.state) missing.push("city");
  if (!q.startDate) missing.push("start date");
  if (missing.length) return { missing };
  const base = o.base;
  const offer: OfferInput = {
    ...base,
    label: q.label || `Offer ${o.letter}`,
    residence: { state: q.state!, ...(q.nyc && q.area === NYC_METRO && q.state === "NY" ? { locality: { kind: "nyc" } } : {}) },
    employerState: q.state!,
    startDate: q.startDate!,
    salary: { ...base?.salary, annual: q.salary! },
    bonus: quickBonus(q.bonus, base?.bonus),
    costOfLiving: { ...base?.costOfLiving, area: q.area!, ...(q.rent !== null ? { monthlyRent: q.rent } : { monthlyRent: undefined }) },
  };
  if (offer.costOfLiving?.monthlyRent === undefined) delete offer.costOfLiving!.monthlyRent;
  if (!offer.bonus) delete offer.bonus;
  return { offer };
}

function quickBonus(b: QuickBonus, base: AnnualBonus | undefined): AnnualBonus | undefined {
  if (b.kind === "schedule") return base;
  const timing = base ? { payOn: base.payOn, ...(base.cutoff ? { cutoff: base.cutoff } : {}),
    ...(base.periodStart ? { periodStart: base.periodStart } : {}) } : DEFAULT_BONUS_TIMING;
  const v = b.value ?? 0;
  if (v === 0) return undefined;
  if (b.kind === "percent") {
    // Keep a sample's bear/bull range in proportion to the new target.
    const scaled = base?.basis === "percentOfSalary" && base.amount.base > 0 ? scale(base.amount, v / 100 / base.amount.base) : all(v / 100);
    return { ...timing, basis: "percentOfSalary", amount: scaled };
  }
  const scaled = base?.basis === "fixed" && base.amount.base > 0 ? scale(base.amount, v / base.amount.base) : all(v);
  return { ...timing, basis: "fixed", amount: scaled };
}

const scale = (s: ByScenario, f: number): ByScenario => ({ bear: s.bear * f, base: s.base * f, bull: s.bull * f });

/** The calendar year other wages belong to: the earliest start date's, or this year until a start date is entered. */
export function firstYear(offers: AppOffer[], today: string): number {
  const starts = offers.flatMap((o) => (o.quick.startDate ? [o.quick.startDate] : [])).sort();
  return Number((starts[0] ?? today).slice(0, 4));
}

export function toHousehold(h: AppHousehold, year: number): Household {
  return {
    filingStatus: h.filingStatus,
    healthUsage: "medium",
    costOfLiving: { reference: ASSUMPTIONS.reference, savingsRate: 0 },
    ...(h.otherWagesThisYear > 0 ? { otherWages: { [year]: h.otherWagesThisYear } } : {}),
  };
}

export function blankOffer(letter: Letter): AppOffer {
  return {
    id: `${letter}-${Date.now().toString(36)}`, letter, sample: null,
    quick: { label: "", salary: null, bonus: { kind: "percent", value: null }, area: null, state: null, nyc: true,
      startDate: null, rent: null },
  };
}

// ---- samples -------------------------------------------------------------------------------

const SHORT_LABELS = ["NYC bank", "Charlotte corp", "Seattle tech"];

/** Moves a date by whole years (Feb 29 becomes Feb 28 in a non-leap year). */
export function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const leap = (yr: number) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  const day = m === 2 && d === 29 && !leap(y + years) ? 28 : d;
  return `${y + years}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftOffer(o: OfferInput, years: number): OfferInput {
  if (years === 0) return o;
  const s = (iso: string) => shiftYears(iso, years);
  return {
    ...o,
    startDate: s(o.startDate),
    ...(o.leaveDate ? { leaveDate: s(o.leaveDate) } : {}),
    salary: { ...o.salary, ...(o.salary.promotions ? { promotions: o.salary.promotions.map((p) => ({ ...p, on: s(p.on) })) } : {}) },
    ...(o.cashAwards ? { cashAwards: o.cashAwards.map((a) => ({ ...a, paidOn: typeof a.paidOn === "string" ? s(a.paidOn) : a.paidOn })) } : {}),
    ...(o.equity ? { equity: { ...o.equity, grants: o.equity.grants.map((g) => ({ ...g,
      ...(g.grantDate ? { grantDate: s(g.grantDate) } : {}), ...(g.vestStart ? { vestStart: s(g.vestStart) } : {}) })) } } : {}),
  };
}

/**
 * The three sample offers (illustrative, not market data), moved forward by whole years so they
 * start on or after `today`: a new grad recruiting in the fall usually starts the next summer.
 */
export function sampleOffers(today: string): AppOffer[] {
  let years = 0;
  const earliest = SAMPLE_OFFERS.map((o) => o.startDate).sort()[0];
  while (shiftYears(earliest, years) < today) years++;
  return SAMPLE_OFFERS.map((raw, i) => {
    const o = shiftOffer(raw, years);
    const b = o.bonus;
    const bonus: QuickBonus = !b ? { kind: "percent", value: 0 }
      : b.basis === "percentOfSalary" ? { kind: "percent", value: Math.round(b.amount.base * 10_000) / 100 }
      : b.basis === "fixed" ? { kind: "amount", value: b.amount.base } : { kind: "schedule" };
    return {
      id: `sample-${LETTERS[i]}`, letter: LETTERS[i], sample: "sample", base: o,
      quick: {
        label: SHORT_LABELS[i], salary: o.salary.annual, bonus, area: o.costOfLiving?.area ?? null,
        state: o.residence.state, nyc: o.residence.locality?.kind === "nyc", startDate: o.startDate,
        rent: o.costOfLiving?.monthlyRent ?? null,
      },
    };
  });
}

export const SAMPLE_HOUSEHOLD_SAVINGS = SAMPLE_HOUSEHOLD.costOfLiving?.savingsRate ?? 0;

/** States a city can be in, for the residence-state picker. */
export const statesFor = (area: string | null) => statesOf(area);
