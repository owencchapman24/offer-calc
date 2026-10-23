import { statesOf } from "../../src/col/cities";
import type {
  AnnualBonus, ByScenario, CashAward, Clawback, Espp, Household, MonthDay, OfferInput, Retirement, Scenario, TimeOff, VestingSchedule,
} from "../../src/offer/types";
import type { FilingStatus } from "../../src/tax/types";
import { SAMPLE_HOUSEHOLD, SAMPLE_OFFERS } from "../../src/samples";
import { DEFAULT_PRESET, PRESETS } from "./presets";
import { US_PRICES } from "./prices";

// The app's state for each offer: a draft of everything you can enter, quick and detailed.
// toOfferInput() turns it into the engine's input.

export type Letter = "A" | "B" | "C";
export const LETTERS: Letter[] = ["A", "B", "C"];

/**
 * An offer as entered. It follows the engine's OfferInput field by field, so an input has the same
 * path in both ("bonus.payOn", "equity.grants.0.schedule"): the validator's problems, the help, the
 * defaults and the tickmarks all use it. Two differences:
 * - null means "not entered": the field shows its default with a D tickmark, or, where no default
 *   is honest, it's blank (weekly hours and the health premium are then "Not counted").
 * - Quick mode's fields (salary, city, start date) can be blank while you fill them in.
 */
export interface OfferDraft {
  label: string;
  residence: {
    state: string | null;
    /** Inside New York City (city income tax); asked only for the New York metro in NY. */
    nyc: boolean;
    /**
     * Inside Philadelphia (its resident wage tax); asked only for the Philadelphia metro in PA. Absent (drafts from before
     * 2026-10-14): inside, the default, as for New York City.
     */
    philadelphia?: boolean;
  };
  /** Null: the state you'd live in. */
  employerState: string | null;
  startDate: string | null;
  salary: {
    annual: number | null;
    /** Null: 0% in every scenario. */
    raise: ByScenario | null;
    /** Null: each work anniversary. */
    raiseOn: "anniversary" | "jan1" | null;
    promotions: PromotionDraft[];
  };
  bonus: BonusDraft;
  cashAwards: CashAwardDraft[];
  equity: {
    grants: GrantDraft[];
    /** Null: 0% a year. */
    priceGrowth: ByScenario | null;
    /** Null: none. */
    refreshers: RefresherDraft | null;
  };
  /**
   * An employee stock purchase plan (docs/v2-plan.md, 4i). Null: not entered (not counted). "none": the offer has none (entered, as
   * none). Absent in drafts saved before 2026-10-22: not entered.
   */
  espp: EsppDraft | null | "none";
  /** Null: not entered. "none": the offer has no 401(k) (entered, as none). */
  retirement: RetirementDraft | null | "none";
  /** Null: not entered. "none": no health plan from this job, such as staying on a parent's plan (entered, as none). */
  health: HealthDraft | null | "none";
  perks: { section127: number | null; commuterMonthly: number | null };
  /**
   * Other benefits (4j). Null: not entered (not counted). []: entered, none. Absent in drafts saved before 2026-10-23: not entered.
   */
  otherBenefits: OtherBenefitDraft[] | null;
  hours: {
    /** Null: not counted. */
    weekly: ByScenario | null;
  };
  /** Days off and the vacation policy (docs/v2-plan.md, 4a). Each null: its default (timeOff.ts, defaults.ts). */
  timeOff: TimeOffDraft;
  costOfLiving: {
    /** BEA area code: a metro, or a state's area outside metros. */
    area: string | null;
    /** Null: the estimate (HUD Fair Market Rent). */
    monthlyRent: number | null;
    /** Null: the inflation rate. */
    rentGrowth: number | null;
  };
}

export interface TimeOffDraft {
  /** Null: 11 (BLS). */
  vacation: number | null;
  /** Null: 8 (BLS). */
  holidays: number | null;
  /** Null: none. */
  sick: number | null;
  /** Null: a number of days a year. */
  policy: "days" | "unlimited" | null;
  /** Null: the days you'd take, so nothing banks. */
  gives: number | null;
  /** Null: no cap. */
  cap: number | null;
  /** Null: paid out where the state requires it. */
  payout: "state" | "always" | null;
}

/** An employee stock purchase plan as entered (4i): each lot sold the day it's bought. */
export interface EsppDraft {
  /** A fraction of eligible pay. Null: blank, not counted (no default: it's your choice). */
  contributionPct: number | null;
  /** Null: salary only. */
  eligiblePay: "salary" | "salaryAndBonus" | null;
  /** Null: 15% (most plans: NASPP and Deloitte, 2023). */
  discount: number | null;
  /** Null: yes (most plans). */
  lookback: boolean | null;
  /** Null: 6 months (the most common). */
  offeringMonths: number | null;
  /** Null: one, at the offering's end. */
  purchasesPerOffering: number | null;
  /** From the plan's documents; no default. Null: blank, a problem at the field. */
  offeringsStart: MonthDay | null;
  /** Null: from your start date. */
  eligibleFrom: string | null;
}

export const blankTimeOff = (): TimeOffDraft => ({ vacation: null, holidays: null, sick: null, policy: null, gives: null, cap: null, payout: null });

/**
 * A draft as saved before days off (2026-10-19), or after: weeks a year entered become days off that give the same weeks (52 -
 * weeks, x 5 days, as vacation; no holidays or sick days), so a saved per hour doesn't move; no days off saved is every default.
 */
export function withTimeOff(d: OfferDraft): OfferDraft {
  // A draft it can't read is left as it is: the page's recovery screen offers the way out (Recovery.tsx).
  if (!d?.hours) return d;
  const { weeksPerYear: w, ...hours } = d.hours as OfferDraft["hours"] & { weeksPerYear?: number | null };
  if (w === undefined && d.timeOff) return d;
  return { ...d, hours, timeOff: w == null ? d.timeOff ?? blankTimeOff() : { ...blankTimeOff(), vacation: Math.round((52 - w) * 500) / 100, holidays: 0, sick: 0 } };
}

/**
 * A saved draft in today's shape: days off (`withTimeOff`), and no ESPP (2026-10-22) or other benefits (2026-10-23) where it was saved
 * before they could be entered.
 */
export function draftNow(d: OfferDraft): OfferDraft {
  const t = withTimeOff(d);
  return !t?.hours ? t : { ...t, espp: t.espp ?? null, otherBenefits: t.otherBenefits ?? null };
}

/** Another benefit as entered (4j): its name, dollars a year, and taxable (null: taxable, the default) or tax-free. */
export interface OtherBenefitDraft { label: string; annual: number | null; taxable: boolean | null }

export interface PromotionDraft {
  on: string | null;
  stepUp: number | null;
  /** Null: all three. */
  scenarios: Scenario[] | null;
}

export interface BonusDraft {
  /** Null: % of salary (the usual quote). */
  basis: AnnualBonus["basis"] | null;
  /** percentOfSalary (a fraction) or fixed (dollars a year). Null: blank, so no bonus. */
  amount: ByScenario | null;
  /** byEmploymentYear: dollars for employment years 1, 2, ...; the last repeats. A null year is blank. */
  amounts: Array<ByScenario | null>;
  /** Null: Mar 15. */
  payOn: MonthDay | null;
  /** Null: Jan 1 (the calendar year). */
  periodStart: MonthDay | null;
  /** Null: none. */
  cutoff: MonthDay | null;
  /** Null: no. */
  firstPayoutGuaranteed: boolean | null;
  /** Null: yes. */
  mustBeEmployedOnPayDate: boolean | null;
}

export interface ScheduleDraft {
  /** Null: the default preset (25/25/25/25, quarterly after a 1-year cliff). */
  tranches: Array<{ month: number | null; fraction: number | null }> | null;
  /** Null: vests on the schedule's own dates. */
  vestDates: { months: number[]; day: number | null } | null;
}

export interface GrantDraft {
  label: string;
  value: number | null;
  /** Null: your start date. */
  grantDate: string | null;
  /** Null: your start date. */
  vestStart: string | null;
  schedule: ScheduleDraft;
}

export interface RefresherDraft {
  value: ByScenario | null;
  /** Null: 12. */
  firstAfterMonths: number | null;
  /** Null: 12. */
  everyMonths: number | null;
  schedule: ScheduleDraft;
}

export interface CashAwardDraft {
  label: string;
  amount: number | null;
  /** Null: 30 days after your start date. */
  paidOn: string | { daysAfterStart: number | null } | null;
  /** Null: no clawback. */
  clawback: ClawbackDraft | null;
}

export interface ClawbackDraft {
  /** Null: 12. */
  months: number | null;
  /** Null: prorated. */
  kind: Clawback["kind"] | null;
  /** Null: by completed month. */
  per: NonNullable<Clawback["per"]> | null;
  /** Null: from your start date. */
  from: NonNullable<Clawback["from"]> | null;
  /** Null: gross. */
  repay: NonNullable<Clawback["repay"]> | null;
}

export interface RetirementDraft {
  /** Null: 0%. */
  contributionPct: number | null;
  type: NonNullable<Retirement["type"]> | null;
  eligiblePay: NonNullable<Retirement["eligiblePay"]> | null;
  match: Array<{ upToPct: number | null; rate: number | null }>;
  nonElectivePct: number | null;
  /** Null: immediate. */
  vesting: { kind: "immediate" } | { kind: "cliff"; years: number | null } | { kind: "graded"; steps: Array<{ years: number | null; pct: number | null }> } | null;
  vestingService: NonNullable<Retirement["vestingService"]> | null;
}

export interface HealthDraft {
  /** Null: not counted. */
  premium: number | null;
  /** Null: not counted. */
  outOfPocket: { low: number | null; medium: number | null; high: number | null };
  /** Null: no maximum entered. */
  oopMax: number | null;
  employeeHsa: number | null;
  employerHsa: number | null;
  coverage: "self" | "family" | null;
}

export interface AppOffer {
  id: string;
  /** Stable identity and color: removing B doesn't repaint C. */
  letter: Letter;
  /** "sample" until edited, then "edited"; null for the user's own offers. */
  sample: "sample" | "edited" | null;
  draft: OfferDraft;
}

export interface AppHousehold {
  filingStatus: FilingStatus;
  /** Which out-of-pocket estimate applies to every health plan. Absent: medium (the default). */
  healthUsage?: "low" | "medium" | "high";
  /** "How long do you expect to stay?": the comparison window. */
  stayYears: number;
  /**
   * Your wages from another job in the calendar year the offers start (for the first year's tax).
   * The name is older than that rule; it's kept so saved sessions still load.
   */
  otherWagesThisYear: number;
  /**
   * Married, filing jointly: your spouse's wages in that same calendar year (the earliest start's). Later years grow with
   * inflation, the same for every offer. Absent (sessions and exports from before 2026-10-14): none.
   */
  spouseWages?: number;
  /**
   * "Prices in": the BEA area whose prices every after-rent figure is stated in (the engine's reference location).
   * "00000", the U.S. average, is the default; a city in the list instead (slice 8, session schema 3).
   */
  pricesIn: string;
}

export const DEFAULT_HOUSEHOLD: AppHousehold = { filingStatus: "single", stayYears: 4, otherWagesThisYear: 0, pricesIn: US_PRICES };
export const NYC_METRO = "35620";
export const PHILADELPHIA_METRO = "37980";
export const ASSUMPTIONS = { inflation: 0.025, discountRate: 0.05 } as const;

/**
 * Engine defaults the draft fills in for null fields (the engine's own defaults are used where it has
 * one, by leaving the field out). The defaults registry (defaults.ts) shows these with their reasons.
 */
export const DRAFT_DEFAULTS = {
  bonusPayOn: { month: 3, day: 15 } as MonthDay,
  refresherFirstAfterMonths: 12,
  refresherEveryMonths: 12,
  cashDaysAfterStart: 30,
  clawbackMonths: 12,
  clawbackKind: "prorated" as const,
} as const;

export const all = (v: number): ByScenario => ({ bear: v, base: v, bull: v });
/** A range is entered when bear or bull differs from base. */
export const hasRange = (s: ByScenario | null | undefined) => !!s && (s.bear !== s.base || s.bull !== s.base);
const scale = (s: ByScenario, f: number): ByScenario => ({ bear: s.bear * f, base: s.base * f, bull: s.bull * f });

/**
 * A new base for a value that may have a range. With a range (and quick mode hiding it), bear and bull
 * keep their proportion to the base; without one, all three move together. Blank clears it.
 */
export function withBase(s: ByScenario | null, v: number | null): ByScenario | null {
  if (v === null) return null;
  return s && hasRange(s) && s.base > 0 ? scale(s, v / s.base) : all(v);
}

// ---- the engine's input ----------------------------------------------------------------------

export type Missing = "salary" | "city" | "start date";

/** Taxed by New York City: the New York metro, living in NY, inside the city. */
export const inNyc = (d: OfferDraft) => d.residence.nyc && d.costOfLiving.area === NYC_METRO && d.residence.state === "NY";
/** Taxed by Philadelphia as a resident: the Philadelphia metro, living in PA, inside the city. */
export const inPhiladelphia = (d: OfferDraft) => d.residence.philadelphia !== false && d.costOfLiving.area === PHILADELPHIA_METRO
  && d.residence.state === "PA";
/** The city whose resident tax an offer pays, if any. */
export const cityTax = (d: OfferDraft): "nyc" | "philadelphia" | null => (inNyc(d) ? "nyc" : inPhiladelphia(d) ? "philadelphia" : null);
/** Its name: on a tax line ("NYC income tax") and in a sentence ("inside New York City"). */
export const CITY_TAX = {
  nyc: { line: "NYC", place: "New York City" },
  philadelphia: { line: "Philadelphia", place: "Philadelphia" },
} as const;

/** The bonus basis, with its default. */
export const bonusBasis = (b: BonusDraft): AnnualBonus["basis"] => b.basis ?? "percentOfSalary";

/** A blank required number becomes NaN, so the validator says "Enter an amount" at its field. */
const req = (v: number | null) => (v === null ? Number.NaN : v);

/**
 * A list without the rows at its end that are still blank: a row just added to an editor isn't an error
 * before you type in it. Only trailing rows go, so every other row keeps its index (and its problems
 * their path).
 */
export function dropTrailing<T>(rows: T[], blank: (row: T) => boolean): T[] {
  let n = rows.length;
  while (n > 0 && blank(rows[n - 1])) n--;
  return n === rows.length ? rows : rows.slice(0, n);
}
const blankPromotion = (p: PromotionDraft) => p.on === null && p.stepUp === null;
const blankTranche = (t: { month: number | null; fraction: number | null }) => t.month === null && t.fraction === null;
const blankBenefit = (b: OtherBenefitDraft) => !b.label && b.annual === null && b.taxable === null;
const blankCash = (a: CashAwardDraft) => a.amount === null && !a.label && a.paidOn === null && a.clawback === null;
const blankTier = (t: { upToPct: number | null; rate: number | null }) => t.upToPct === null && t.rate === null;
const blankStep = (s: { years: number | null; pct: number | null }) => s.years === null && s.pct === null;
const blankGrant = (g: GrantDraft) => g.value === null && !g.label && g.grantDate === null && g.vestStart === null && g.schedule.tranches === null
  && g.schedule.vestDates === null;

/** The engine's input for an offer, or the quick fields still missing. */
export function toOfferInput(o: AppOffer): { offer: OfferInput } | { missing: Missing[] } {
  const d = o.draft;
  const missing: Missing[] = [];
  if (d.salary.annual === null) missing.push("salary");
  if (!d.costOfLiving.area || !d.residence.state) missing.push("city");
  if (!d.startDate) missing.push("start date");
  if (missing.length) return { missing };
  const state = d.residence.state!;
  const offer: OfferInput = {
    label: d.label || `Offer ${o.letter}`,
    residence: { state, ...(inNyc(d) ? { locality: { kind: "nyc" } } : inPhiladelphia(d) ? { locality: { kind: "philadelphia", resident: true } } : {}) },
    employerState: d.employerState ?? state,
    startDate: d.startDate!,
    salary: {
      annual: d.salary.annual!,
      ...(d.salary.raise ? { raise: d.salary.raise } : {}),
      ...(d.salary.raiseOn ? { raiseOn: d.salary.raiseOn } : {}),
      ...(dropTrailing(d.salary.promotions, blankPromotion).length ? {
        promotions: dropTrailing(d.salary.promotions, blankPromotion)
          .map((p) => ({ on: p.on ?? "", stepUp: req(p.stepUp), ...(p.scenarios ? { scenarios: p.scenarios } : {}) })),
      } : {}),
    },
    costOfLiving: {
      area: d.costOfLiving.area!,
      ...(d.costOfLiving.monthlyRent !== null ? { monthlyRent: d.costOfLiving.monthlyRent } : {}),
      ...(d.costOfLiving.rentGrowth !== null ? { rentGrowth: d.costOfLiving.rentGrowth } : {}),
    },
  };
  const bonus = bonusInput(d.bonus);
  if (bonus) offer.bonus = bonus;
  const cash = dropTrailing(d.cashAwards, blankCash);
  if (cash.length) offer.cashAwards = cash.map(cashInput);
  const espp = hasEspp(d) ? d.espp : null;
  const equity = equityInput(d.equity, espp !== null);
  if (equity) offer.equity = equity;
  if (espp) offer.espp = esppInput(espp);
  if (d.retirement && d.retirement !== "none") offer.retirement = retirementInput(d.retirement);
  const health = healthInput(d.health);
  if (health) offer.health = health;
  const perks = { ...(d.perks.section127 ? { section127: d.perks.section127 } : {}), ...(d.perks.commuterMonthly ? { commuterMonthly: d.perks.commuterMonthly } : {}) };
  if (Object.keys(perks).length) offer.perks = perks;
  const others = dropTrailing(d.otherBenefits ?? [], blankBenefit);
  if (others.length) offer.otherBenefits = others.map((b) => ({ label: b.label, annual: req(b.annual), taxable: b.taxable ?? true }));
  if (d.hours.weekly) offer.hours = { weekly: d.hours.weekly };
  const timeOff = timeOffInput(d.timeOff);
  if (timeOff) offer.timeOff = timeOff;
  return { offer };
}

/** Days off and the vacation policy as entered; a field at its default is left out (the engine has the same default). */
export function timeOffInput(t: TimeOffDraft): TimeOff | undefined {
  // An unlimited policy gives no days, so nothing to cap.
  const out = Object.fromEntries(Object.entries(t).filter(([k, v]) => v !== null && !(t.policy === "unlimited" && (k === "gives" || k === "cap"))));
  return Object.keys(out).length ? (out as TimeOff) : undefined;
}

function bonusInput(b: BonusDraft): AnnualBonus | undefined {
  const timing = {
    payOn: b.payOn ?? DRAFT_DEFAULTS.bonusPayOn,
    ...(b.periodStart ? { periodStart: b.periodStart } : {}),
    ...(b.cutoff ? { cutoff: b.cutoff } : {}),
    ...(b.firstPayoutGuaranteed !== null ? { firstPayoutGuaranteed: b.firstPayoutGuaranteed } : {}),
    ...(b.mustBeEmployedOnPayDate !== null ? { mustBeEmployedOnPayDate: b.mustBeEmployedOnPayDate } : {}),
  };
  const zero = (s: ByScenario | null) => !s || (s.bear === 0 && s.base === 0 && s.bull === 0);
  const basis = bonusBasis(b);
  if (basis === "byEmploymentYear") {
    const amounts = dropTrailing(b.amounts, (a) => a === null);
    if (!amounts.length || amounts.every((a) => a !== null && zero(a))) return undefined;
    return { ...timing, basis: "byEmploymentYear", amounts: amounts.map((a) => a ?? all(Number.NaN)) };
  }
  // Blank or zero: no bonus.
  if (zero(b.amount)) return undefined;
  return { ...timing, basis, amount: b.amount! };
}

function cashInput(a: CashAwardDraft): CashAward {
  const paidOn = a.paidOn === null ? { daysAfterStart: DRAFT_DEFAULTS.cashDaysAfterStart }
    : typeof a.paidOn === "string" ? a.paidOn : { daysAfterStart: req(a.paidOn.daysAfterStart) };
  const c = a.clawback;
  return {
    label: a.label || "Cash award", amount: req(a.amount), paidOn,
    ...(c ? { clawback: {
      months: c.months ?? DRAFT_DEFAULTS.clawbackMonths, kind: c.kind ?? DRAFT_DEFAULTS.clawbackKind,
      ...(c.per ? { per: c.per } : {}), ...(c.from ? { from: c.from } : {}), ...(c.repay ? { repay: c.repay } : {}),
    } } : {}),
  };
}

function scheduleInput(s: ScheduleDraft): VestingSchedule {
  return {
    tranches: s.tranches ? dropTrailing(s.tranches, blankTranche).map((t) => ({ month: req(t.month), fraction: req(t.fraction) }))
      : PRESETS[DEFAULT_PRESET].tranches.map((t) => ({ ...t })),
    // A calendar with no months picked yet vests on the schedule's own dates, as with none.
    ...(s.vestDates?.months.length ? { vestDates: { months: s.vestDates.months, day: req(s.vestDates.day) } } : {}),
  };
}

/** The equity as entered. With an ESPP and no RSUs, only the share price's growth (its purchases are priced by it). */
function equityInput(e: OfferDraft["equity"], espp = false): OfferInput["equity"] {
  const grants = dropTrailing(e.grants, blankGrant);
  if (!grants.length && !e.refreshers && !(espp && e.priceGrowth)) return undefined;
  const r = e.refreshers;
  return {
    ...(e.priceGrowth ? { priceGrowth: e.priceGrowth } : {}),
    grants: grants.map((g) => ({
      kind: "rsu", label: g.label || "RSU grant", value: req(g.value),
      ...(g.grantDate ? { grantDate: g.grantDate } : {}), ...(g.vestStart ? { vestStart: g.vestStart } : {}),
      schedule: scheduleInput(g.schedule),
    })),
    ...(r ? { refreshers: {
      value: r.value ?? all(Number.NaN), firstAfterMonths: r.firstAfterMonths ?? DRAFT_DEFAULTS.refresherFirstAfterMonths,
      everyMonths: r.everyMonths ?? DRAFT_DEFAULTS.refresherEveryMonths, schedule: scheduleInput(r.schedule),
    } } : {}),
  };
}

/** The offer has an ESPP entered (not "not entered", not none). */
export const hasEspp = (d: Pick<OfferDraft, "espp">): d is { espp: EsppDraft } => d.espp !== null && d.espp !== "none";

/**
 * An ESPP as entered: a blank contribution puts nothing in, the terms with a default left blank are at it, and a blank offering date
 * is a problem at its field (the validator's).
 */
function esppInput(p: EsppDraft): Espp {
  // The defaults: 15% off with a lookback, 6-month offerings (detailedDefaults.ts has their sources); the engine's own for the rest.
  return { discount: 0.15, lookback: true, offeringMonths: 6, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null)),
    contributionPct: p.contributionPct ?? 0, offeringsStart: p.offeringsStart ?? { month: Number.NaN, day: Number.NaN } };
}

function retirementInput(r: RetirementDraft): Retirement {
  const v = r.vesting;
  return {
    contributionPct: r.contributionPct ?? 0,
    ...(r.type ? { type: r.type } : {}),
    ...(r.eligiblePay ? { eligiblePay: r.eligiblePay } : {}),
    ...(dropTrailing(r.match, blankTier).length ? { match: dropTrailing(r.match, blankTier).map((t) => ({ upToPct: req(t.upToPct), rate: req(t.rate) })) } : {}),
    ...(r.nonElectivePct !== null ? { nonElectivePct: r.nonElectivePct } : {}),
    ...(v ? { vesting: v.kind === "immediate" ? v : v.kind === "cliff" ? { kind: "cliff", years: req(v.years) }
      : { kind: "graded", steps: dropTrailing(v.steps, blankStep).map((s) => ({ years: req(s.years), pct: req(s.pct) })) } } : {}),
    ...(r.vestingService ? { vestingService: r.vestingService } : {}),
  };
}

function healthInput(h: HealthDraft | null | "none"): OfferInput["health"] {
  if (!h || h === "none") return undefined;
  const o = h.outOfPocket;
  const oop = { low: o.low ?? 0, medium: o.medium ?? 0, high: o.high ?? 0 };
  // Nothing entered that counts: no health plan for the engine.
  if (h.premium === null && o.low === null && o.medium === null && o.high === null && !h.employeeHsa && !h.employerHsa) return undefined;
  return {
    premium: h.premium ?? 0, outOfPocket: oop,
    // No maximum entered: expected spending isn't capped.
    oopMax: h.oopMax ?? Math.max(oop.low, oop.medium, oop.high),
    ...(h.employeeHsa ? { employeeHsa: h.employeeHsa } : {}),
    ...(h.employerHsa ? { employerHsa: h.employerHsa } : {}),
    ...(h.coverage ? { coverage: h.coverage } : {}),
  };
}

// ---- from the engine's input (samples and saved sessions) ----------------------------------------

const or = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

function scheduleDraft(s: VestingSchedule): ScheduleDraft {
  return { tranches: s.tranches.map((t) => ({ ...t })), vestDates: s.vestDates ? { months: [...s.vestDates.months], day: s.vestDates.day } : null };
}

/** A draft holding exactly an engine input: every field it sets is entered; what it leaves out is at its default. */
export function fromOfferInput(o: OfferInput, label = o.label): OfferDraft {
  const b = o.bonus;
  const e = o.equity;
  const r = o.retirement;
  const h = o.health;
  const p = o.espp;
  return {
    label,
    residence: { state: o.residence.state, nyc: o.residence.locality?.kind === "nyc",
      ...(o.residence.locality?.kind === "philadelphia" ? { philadelphia: o.residence.locality.resident } : {}) },
    employerState: o.employerState === o.residence.state ? null : o.employerState,
    startDate: o.startDate,
    salary: {
      annual: o.salary.annual, raise: or(o.salary.raise), raiseOn: or(o.salary.raiseOn),
      promotions: (o.salary.promotions ?? []).map((p) => ({ on: p.on, stepUp: p.stepUp, scenarios: or(p.scenarios) })),
    },
    bonus: {
      basis: b?.basis ?? null,
      amount: b && b.basis !== "byEmploymentYear" ? b.amount : null,
      amounts: b?.basis === "byEmploymentYear" ? b.amounts.map((a) => ({ ...a })) : [],
      payOn: or(b?.payOn), periodStart: or(b?.periodStart), cutoff: or(b?.cutoff),
      firstPayoutGuaranteed: or(b?.firstPayoutGuaranteed), mustBeEmployedOnPayDate: or(b?.mustBeEmployedOnPayDate),
    },
    cashAwards: (o.cashAwards ?? []).map((a) => ({
      label: a.label, amount: a.amount, paidOn: typeof a.paidOn === "string" ? a.paidOn : { daysAfterStart: a.paidOn.daysAfterStart },
      clawback: a.clawback ? { months: a.clawback.months, kind: a.clawback.kind, per: or(a.clawback.per), from: or(a.clawback.from),
        repay: or(a.clawback.repay) } : null,
    })),
    equity: {
      grants: (e?.grants ?? []).map((g) => ({ label: g.label, value: g.value, grantDate: or(g.grantDate), vestStart: or(g.vestStart),
        schedule: scheduleDraft(g.schedule) })),
      priceGrowth: or(e?.priceGrowth),
      refreshers: e?.refreshers ? { value: e.refreshers.value, firstAfterMonths: e.refreshers.firstAfterMonths, everyMonths: e.refreshers.everyMonths,
        schedule: scheduleDraft(e.refreshers.schedule) } : null,
    },
    espp: p ? { eligiblePay: null, purchasesPerOffering: null, eligibleFrom: null, ...p, offeringsStart: { ...p.offeringsStart } } : null,
    retirement: r ? {
      contributionPct: r.contributionPct, type: or(r.type), eligiblePay: or(r.eligiblePay),
      match: (r.match ?? []).map((t) => ({ ...t })), nonElectivePct: or(r.nonElectivePct),
      vesting: r.vesting ? structuredClone(r.vesting) : null, vestingService: or(r.vestingService),
    } : null,
    health: h ? {
      premium: h.premium, outOfPocket: { ...h.outOfPocket }, oopMax: h.oopMax, employeeHsa: or(h.employeeHsa), employerHsa: or(h.employerHsa),
      coverage: or(h.coverage),
    } : null,
    perks: { section127: or(o.perks?.section127), commuterMonthly: or(o.perks?.commuterMonthly) },
    otherBenefits: o.otherBenefits ? o.otherBenefits.map((b) => ({ ...b })) : null,
    hours: { weekly: o.hours?.weekly ?? null },
    timeOff: withTimeOff({ hours: { weekly: null, weeksPerYear: o.hours?.weeksPerYear }, timeOff: { ...blankTimeOff(), ...o.timeOff } } as unknown as OfferDraft).timeOff,
    costOfLiving: { area: o.costOfLiving?.area ?? null, monthlyRent: or(o.costOfLiving?.monthlyRent), rentGrowth: or(o.costOfLiving?.rentGrowth) },
  };
}

export function blankDraft(): OfferDraft {
  return {
    label: "", residence: { state: null, nyc: true }, employerState: null, startDate: null,
    salary: { annual: null, raise: null, raiseOn: null, promotions: [] },
    bonus: { basis: null, amount: null, amounts: [], payOn: null, periodStart: null, cutoff: null, firstPayoutGuaranteed: null,
      mustBeEmployedOnPayDate: null },
    cashAwards: [], equity: { grants: [], priceGrowth: null, refreshers: null }, espp: null, retirement: null, health: null,
    perks: { section127: null, commuterMonthly: null }, otherBenefits: null, hours: { weekly: null }, timeOff: blankTimeOff(),
    costOfLiving: { area: null, monthlyRent: null, rentGrowth: null },
  };
}

export function blankOffer(letter: Letter): AppOffer {
  return { id: `${letter}-${Date.now().toString(36)}`, letter, sample: null, draft: blankDraft() };
}

// ---- reading and writing a draft by path ---------------------------------------------------------

/** The value at a path ("equity.grants.0.value"), or undefined if the path doesn't exist. */
export function getPath(draft: OfferDraft, path: string): unknown {
  let v: unknown = draft;
  for (const k of path.split(".")) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

/** A copy of the draft with the value at `path` replaced; the objects along the path are copied, the rest shared. */
export function setPath(draft: OfferDraft, path: string, value: unknown): OfferDraft {
  const keys = path.split(".");
  const go = (node: unknown, i: number): unknown => {
    if (i === keys.length) return value;
    const k = keys[i];
    if (Array.isArray(node)) {
      const copy = [...node];
      copy[Number(k)] = go(node[Number(k)], i + 1);
      return copy;
    }
    const obj = (node ?? {}) as Record<string, unknown>;
    return { ...obj, [k]: go(obj[k], i + 1) };
  };
  return go(draft, 0) as OfferDraft;
}

// ---- the household ---------------------------------------------------------------------------------

/** The calendar year other wages belong to: the earliest start date's, or this year until a start date is entered. */
export function firstYear(offers: AppOffer[], today: string): number {
  const starts = offers.flatMap((o) => (o.draft.startDate ? [o.draft.startDate] : [])).sort();
  return Number((starts[0] ?? today).slice(0, 4));
}

export function toHousehold(h: AppHousehold, year: number): Household {
  const spouse = h.filingStatus === "joint" ? h.spouseWages ?? 0 : 0;
  return {
    filingStatus: h.filingStatus,
    healthUsage: h.healthUsage ?? "medium",
    costOfLiving: { reference: h.pricesIn, savingsRate: 0 },
    ...(h.otherWagesThisYear > 0 ? { otherWages: { [year]: h.otherWagesThisYear } } : {}),
    ...(spouse > 0 ? { spouseWages: spouseByYear(spouse, year) } : {}),
  };
}

/**
 * A spouse's wages by calendar year, for the engine: the amount entered for `year`, grown with inflation each year after it and
 * shrunk by it each year before (a payment before the start date can fall in an earlier year, from 2026, when tax data starts),
 * through every year a comparison can reach (a 10-year stay starting up to a year out, and the calendar year it ends in).
 */
export function spouseByYear(wages: number, year: number): Record<number, number> {
  const years = Array.from({ length: year + SPOUSE_YEARS_AFTER - FIRST_TAX_YEAR }, (_, i) => FIRST_TAX_YEAR + i);
  return Object.fromEntries(years.map((y) => [y, wages * (1 + ASSUMPTIONS.inflation) ** (y - year)]));
}
const FIRST_TAX_YEAR = 2026;
const SPOUSE_YEARS_AFTER = 20;

// ---- samples -------------------------------------------------------------------------------

const SHORT_LABELS = ["NYC bank", "Charlotte corp", "Seattle tech"];

/** Moves a date by whole years (Feb 29 becomes Feb 28 in a non-leap year). */
export function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const leap = (yr: number) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
  const day = m === 2 && d === 29 && !leap(y + years) ? 28 : d;
  return `${y + years}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftOffer(o: OfferInput, years: number): OfferInput {
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

/** Years to move the samples so they start on or after `today`. */
export function sampleShift(today: string): number {
  let years = 0;
  const earliest = SAMPLE_OFFERS.map((o) => o.startDate).sort()[0];
  while (shiftYears(earliest, years) < today) years++;
  return years;
}

/**
 * The three sample offers (illustrative, not market data), moved forward by whole years so they
 * start on or after `today`: a new grad recruiting in the fall usually starts the next summer. A
 * sample is a complete offer, so a benefit it leaves out is entered as $0 (it has none), not left
 * blank: the comparability warning is about inputs you haven't entered.
 */
export function sampleOffers(today: string): AppOffer[] {
  const years = sampleShift(today);
  return SAMPLE_OFFERS.map((raw, i) => ({
    id: `sample-${LETTERS[i]}`, letter: LETTERS[i], sample: "sample" as const, draft: completeSample(fromOfferInput(shiftOffer(raw, years), SHORT_LABELS[i])),
  }));
}

/** A sample's benefits that it leaves out, entered as $0: it has none. The engine's input is unchanged (a $0 perk is no perk). */
export function completeSample(d: OfferDraft): OfferDraft {
  return {
    ...d,
    health: d.health && d.health !== "none" ? { ...d.health, employeeHsa: d.health.employeeHsa ?? 0, employerHsa: d.health.employerHsa ?? 0 } : d.health,
    perks: { section127: d.perks.section127 ?? 0, commuterMonthly: d.perks.commuterMonthly ?? 0 },
  };
}

export const SAMPLE_HOUSEHOLD_SAVINGS = SAMPLE_HOUSEHOLD.costOfLiving?.savingsRate ?? 0;

/** Detailed inputs that change the results, for quick mode's "Also counted" row: hidden, but still counted. */
export function alsoCounted(d: OfferDraft): string[] {
  const out: string[] = [];
  const raise = d.salary.raise && (d.salary.raise.bear || d.salary.raise.base || d.salary.raise.bull);
  if (d.salary.promotions.length) out.push(d.salary.promotions.length === 1 ? "promotion" : "promotions");
  if (raise) out.push("raises");
  const b = d.bonus;
  if (b.periodStart || b.cutoff || b.firstPayoutGuaranteed !== null || b.mustBeEmployedOnPayDate !== null
    || (b.payOn && (b.payOn.month !== DRAFT_DEFAULTS.bonusPayOn.month || b.payOn.day !== DRAFT_DEFAULTS.bonusPayOn.day))) out.push("bonus timing");
  if (d.cashAwards.length) out.push(d.cashAwards.every((a) => /sign/i.test(a.label)) ? "sign-on" : "cash awards");
  if (d.equity.grants.length || d.equity.refreshers) out.push("RSUs");
  if (hasEspp(d)) out.push("ESPP");
  if (d.retirement && d.retirement !== "none") out.push("401(k)");
  if (d.health && d.health !== "none") out.push("health");
  if (d.perks.section127 || d.perks.commuterMonthly) out.push("perks");
  if (d.otherBenefits?.length) out.push("other benefits");
  if (d.hours.weekly) out.push(`${d.hours.weekly.base} hrs/week`);
  if (Object.values(d.timeOff).some((v) => v !== null)) out.push("days off");
  return out;
}

/** States a city can be in, for the residence-state picker. */
export const statesFor = (area: string | null) => statesOf(area);
