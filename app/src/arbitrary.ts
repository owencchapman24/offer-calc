import fc from "fast-check";
import type { ByScenario } from "../../src/offer/types";
import { fromDays, toDays } from "../../src/offer/dates";
import { type AppHousehold, type AppOffer, blankDraft, type Letter, type OfferDraft, type RetirementDraft } from "./model";
import { US_PRICES } from "./prices";

// Generated inputs for the property tests (properties.test.ts, display.test.ts): offers and households as a person could enter
// them, in every combination the samples never reach (joint filing, different start days, a later start, rent of $0, a cash
// award before day one, a guaranteed first bonus, fractional 401(k) vesting, per-hour ranges). Test code only: it imports
// fast-check, a dev dependency, and the app never imports it.

const addDays = (iso: string, n: number) => fromDays(toDays(iso) + n);

/** Where an offer is: a BEA area, the state you'd live in, and the city you'd live in when it taxes residents. */
export interface Place { area: string; state: string; city: "nyc" | "philadelphia" | null }
export const PLACES: Place[] = [
  { area: "35620", state: "NY", city: "nyc" }, { area: "35620", state: "NY", city: null }, { area: "35620", state: "NJ", city: null },
  { area: "37980", state: "PA", city: "philadelphia" }, { area: "37980", state: "PA", city: null }, { area: "37980", state: "NJ", city: null },
  { area: "16740", state: "NC", city: null }, { area: "42660", state: "WA", city: null }, { area: "41860", state: "CA", city: null },
  { area: "12420", state: "TX", city: null }, { area: "16980", state: "IL", city: null }, { area: "14460", state: "MA", city: null },
  { area: "19740", state: "CO", city: null }, { area: "47900", state: "VA", city: null }, { area: "38900", state: "OR", city: null },
  { area: "36999", state: "NY", city: null },
];

/** A household as a person would describe it, before the app's About you takes it. */
export interface Household {
  filingStatus: AppHousehold["filingStatus"];
  /** Married, filing jointly: the spouse's wages in the first year (they grow with inflation). */
  spouseWages: number;
  otherWagesThisYear: number;
  stayYears: number;
  pricesIn: string;
  healthUsage: "low" | "medium" | "high";
}

/** A case: the date it's looked at, a household, and two or three offers, each with where it is. */
export interface Case { today: string; household: Household; offers: Array<{ place: Place; draft: OfferDraft }> }

const dollars = (min: number, max: number, step = 1) => fc.integer({ min: Math.ceil(min / step), max: Math.floor(max / step) }).map((n) => n * step);
/** Three values in order (bear <= base <= bull), or one value for all three. */
const ordered = (arb: fc.Arbitrary<number>): fc.Arbitrary<ByScenario> => fc.oneof(
  arb.map((v) => ({ bear: v, base: v, bull: v })),
  fc.tuple(arb, arb, arb).map((xs) => xs.sort((a, b) => a - b)).map(([bear, base, bull]) => ({ bear, base, bull })),
);
const pct = (max: number, step = 0.005) => fc.integer({ min: 0, max: Math.round(max / step) }).map((n) => Math.round(n * step * 1e6) / 1e6);
const maybe = <T,>(arb: fc.Arbitrary<T>, freq = 2) => fc.oneof({ arbitrary: fc.constant(null), weight: freq }, { arbitrary: arb, weight: 1 });
const monthDay = fc.record({ month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) });

/** The day it's looked at: within a year of mid-2026 (tax law starts in 2026). */
export const today = fc.integer({ min: 0, max: 364 }).map((n) => addDays("2026-07-01", n));

export function household(places: Place[]): fc.Arbitrary<Household> {
  return fc.record({
    filingStatus: fc.constantFrom("single", "joint", "headOfHousehold") as fc.Arbitrary<Household["filingStatus"]>,
    spouseWages: fc.oneof(fc.constant(0), dollars(10_000, 250_000, 500)),
    otherWagesThisYear: fc.oneof({ arbitrary: fc.constant(0), weight: 3 }, { arbitrary: dollars(1_000, 80_000, 100), weight: 1 }),
    stayYears: fc.integer({ min: 1, max: 10 }),
    pricesIn: fc.constantFrom(US_PRICES, ...places.map((p) => p.area)),
    healthUsage: fc.constantFrom("low", "medium", "high") as fc.Arbitrary<Household["healthUsage"]>,
  }).map((h) => ({ ...h, spouseWages: h.filingStatus === "joint" ? h.spouseWages : 0 }));
}

/** An offer's draft, everything a person can enter, each part present or not. `start` is its start date. */
export function draft(place: Place, start: string, opts: { simple?: boolean } = {}): fc.Arbitrary<OfferDraft> {
  const b = blankDraft();
  const simple = !!opts.simple;
  return fc.record({
    salary: dollars(30_000, 450_000, 500),
    raise: maybe(ordered(pct(0.08))),
    raiseOn: fc.constantFrom(null, "anniversary" as const, "jan1" as const),
    promotion: simple ? fc.constant(null) : maybe(fc.record({ afterDays: fc.integer({ min: 200, max: 1_500 }), stepUp: pct(0.3, 0.01) })),
    bonus: fc.oneof(
      fc.constant(null),
      fc.record({ basis: fc.constant(null), amount: ordered(pct(0.3)) }),
      fc.record({ basis: fc.constant("fixed" as const), amount: ordered(dollars(0, 60_000, 500)) }),
    ),
    payOn: maybe(monthDay, 1), cutoff: maybe(monthDay), periodStart: maybe(monthDay, 4),
    guaranteed: fc.constantFrom(null, true, false), mustBeEmployed: fc.constantFrom(null, true, false),
    cash: fc.array(fc.record({
      amount: dollars(1_000, 60_000, 500),
      paidOn: fc.oneof(fc.constant(null), fc.integer({ min: -60, max: 300 }).map((d) => addDays(start, d)),
        fc.integer({ min: 0, max: 120 }).map((d) => ({ daysAfterStart: d }))),
      clawback: maybe(fc.record({ months: fc.integer({ min: 1, max: 24 }), kind: fc.constantFrom(null, "full" as const, "prorated" as const) })),
    }), { maxLength: 2 }),
    grant: simple ? fc.constant(null) : maybe(fc.record({ value: dollars(5_000, 300_000, 1_000), growth: maybe(ordered(pct(0.15, 0.01))) }), 1),
    refreshers: simple ? fc.constant(null) : maybe(ordered(dollars(0, 80_000, 1_000)), 3),
    retirement: simple ? fc.constant(null) : fc.oneof(fc.constant(null), fc.constant("none" as const), fc.record({
      contributionPct: pct(0.15, 0.01), upToPct: fc.integer({ min: 1, max: 8 }).map((n) => n / 100), rate: fc.constantFrom(0.5, 1),
      vesting: fc.constantFrom<RetirementDraft["vesting"]>(null, { kind: "immediate" }, { kind: "cliff", years: 2 },
        { kind: "graded", steps: [{ years: 1, pct: 0.33 }, { years: 2, pct: 0.67 }, { years: 3, pct: 1 }] }),
    })),
    health: simple ? fc.constant(null) : fc.oneof(fc.constant(null), fc.constant("none" as const), fc.record({
      premium: dollars(0, 6_000, 100), oop: dollars(0, 3_000, 100), employerHsa: maybe(dollars(0, 1_500, 100)),
    })),
    hours: maybe(ordered(fc.integer({ min: 35, max: 80 })), 1),
    rent: fc.oneof(fc.constant(null), fc.constant(0), dollars(800, 6_000, 50)),
    rentGrowth: maybe(pct(0.06)),
  }).map((g): OfferDraft => {
    const bonus = g.bonus === null ? b.bonus : {
      ...b.bonus, basis: g.bonus.basis, amount: g.bonus.amount, payOn: g.payOn, cutoff: g.cutoff, periodStart: g.periodStart,
      firstPayoutGuaranteed: g.guaranteed, mustBeEmployedOnPayDate: g.mustBeEmployed,
    };
    return {
      ...b, label: "Generated", residence: { state: place.state, nyc: place.city === "nyc" }, startDate: start,
      salary: { annual: g.salary, raise: g.raise, raiseOn: g.raiseOn,
        promotions: g.promotion ? [{ on: addDays(start, g.promotion.afterDays), stepUp: g.promotion.stepUp, scenarios: null }] : [] },
      bonus,
      cashAwards: g.cash.map((c, i) => ({ label: `Award ${i + 1}`, amount: c.amount, paidOn: c.paidOn,
        clawback: c.clawback ? { months: c.clawback.months, kind: c.clawback.kind, per: null, from: null, repay: null } : null })),
      equity: {
        grants: g.grant ? [{ label: "New-hire RSUs", value: g.grant.value, grantDate: null, vestStart: null, schedule: { tranches: null, vestDates: null } }] : [],
        priceGrowth: g.grant?.growth ?? null,
        refreshers: g.grant && g.refreshers ? { value: g.refreshers, firstAfterMonths: null, everyMonths: null, schedule: { tranches: null, vestDates: null } } : null,
      },
      retirement: g.retirement === null || g.retirement === "none" ? g.retirement : {
        contributionPct: g.retirement.contributionPct, type: null, eligiblePay: null, match: [{ upToPct: g.retirement.upToPct, rate: g.retirement.rate }],
        nonElectivePct: null, vesting: g.retirement.vesting, vestingService: null,
      },
      health: g.health === null || g.health === "none" ? g.health : {
        premium: g.health.premium, outOfPocket: { low: g.health.oop / 2, medium: g.health.oop, high: g.health.oop * 2 }, oopMax: null,
        employeeHsa: null, employerHsa: g.health.employerHsa, coverage: null,
      },
      hours: { weekly: g.hours, weeksPerYear: null },
      costOfLiving: { area: place.area, monthlyRent: g.rent, rentGrowth: g.rentGrowth },
    };
  });
}

/** A case: two or three offers, starting on any day in the year after `today`. `simple`: pay, bonus and cash awards only. */
export function cases(opts: { simple?: boolean; offers?: [number, number] } = {}): fc.Arbitrary<Case> {
  const [min, max] = opts.offers ?? [2, 3];
  return today.chain((t) => fc.record({
    today: fc.constant(t),
    household: household(PLACES),
    offers: fc.array(
      fc.tuple(fc.constantFrom(...PLACES), fc.integer({ min: 0, max: 365 })).chain(([place, d]) =>
        draft(place, addDays(t, d), opts).map((dr) => ({ place, draft: dr }))),
      { minLength: min, maxLength: max }),
  }));
}

/** About you, as the app takes it from a household as described. */
export function aboutYou(h: Household): AppHousehold {
  return {
    filingStatus: h.filingStatus, stayYears: h.stayYears, otherWagesThisYear: h.otherWagesThisYear, pricesIn: h.pricesIn, healthUsage: h.healthUsage,
    ...(h.filingStatus === "joint" ? { spouseWages: h.spouseWages } : {}),
  };
}

/** The app's offers for a case, A, B and C. */
export const appOffers = (c: Case): AppOffer[] =>
  c.offers.map((o, i) => ({ id: `gen-${i}`, letter: "ABC"[i] as Letter, sample: null, draft: o.draft }));

/**
 * The settings for fast-check: a fixed seed and `n` runs in `npm test`. `npm run fuzz` sets FUZZ_SEED (random) and FUZZ_RUNS (a
 * multiple of `n`). A counterexample is shrunk to the smallest case that fails, unless `shrink` is false (a case that renders the
 * whole page takes a second or more; FUZZ_SHRINK=1 shrinks those too).
 */
export function runs(n: number, shrink = true): fc.Parameters<unknown> {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  const seed = env.FUZZ_SEED ? Number(env.FUZZ_SEED) : 20261014;
  const scale = env.FUZZ_RUNS ? Number(env.FUZZ_RUNS) : 1;
  return { seed, numRuns: Math.max(1, Math.round(n * scale)), endOnFailure: !(shrink || env.FUZZ_SHRINK) };
}
