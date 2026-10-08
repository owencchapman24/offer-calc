// Sample offers for the table script, benchmarks and the UI's "Try the sample offers".
// Illustrative inputs, not market data: every place that shows them must say so.
import { VESTING_PRESETS } from "./offer/vesting";
import type { ByScenario, Household, OfferInput } from "./offer/types";

export const SAMPLE_HOUSEHOLD: Household = {
  filingStatus: "single", healthUsage: "medium",
  costOfLiving: { reference: "00000", savingsRate: 0 }, // U.S. dollars; no savings beyond the 401(k)
};
const sixPctPretax = { contributionPct: 0.06, type: "pretax" as const };
const all = (v: number): ByScenario => ({ bear: v, base: v, bull: v });
const range = (base: number): ByScenario => ({ bear: base * 0.8, base, bull: base * 1.2 });

export const SAMPLE_OFFERS: OfferInput[] = [
  {
    label: "A. NYC investment banking analyst",
    residence: { state: "NY", locality: { kind: "nyc" } },
    employerState: "NY",
    startDate: "2026-07-13",
    salary: {
      annual: 110_000,
      promotions: [{ on: "2029-07-13", stepUp: 0.35, scenarios: ["base", "bull"] }], // associate at month 36
    },
    bonus: {
      basis: "byEmploymentYear", amounts: [70_000, 85_000, 100_000, 115_000, 130_000].map(range),
      payOn: { month: 1, day: 31 },
    },
    cashAwards: [{ label: "Sign-on", amount: 10_000, paidOn: { daysAfterStart: 30 }, clawback: { months: 12, kind: "full" } }],
    retirement: { ...sixPctPretax, match: [{ upToPct: 0.06, rate: 0.5 }], vesting: { kind: "cliff", years: 3 } },
    health: { premium: 1_800, outOfPocket: { low: 400, medium: 1_500, high: 4_000 }, oopMax: 4_000 },
    hours: { weekly: all(80) },
    costOfLiving: { area: "35620", monthlyRent: 3_800 }, // New York metro
  },
  {
    label: "B. Charlotte corporate finance analyst",
    residence: { state: "NC" },
    employerState: "NC",
    startDate: "2026-07-13",
    salary: { annual: 80_000, raise: all(0.03) },
    bonus: {
      basis: "percentOfSalary", amount: { bear: 0.05, base: 0.1, bull: 0.12 },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 },
    },
    cashAwards: [{ label: "Sign-on", amount: 5_000, paidOn: { daysAfterStart: 30 }, clawback: { months: 12, kind: "prorated" } }],
    retirement: { ...sixPctPretax, match: [{ upToPct: 0.04, rate: 1 }] },
    health: { premium: 900, outOfPocket: { low: 500, medium: 2_000, high: 5_000 }, oopMax: 5_000, employerHsa: 500 },
    hours: { weekly: all(50) },
    costOfLiving: { area: "16740", monthlyRent: 1_700 }, // Charlotte metro
  },
  {
    label: "C. Seattle public tech company, finance",
    residence: { state: "WA" },
    employerState: "WA",
    startDate: "2026-07-13",
    salary: { annual: 105_000, raise: all(0.03), raiseOn: "jan1" },
    bonus: {
      basis: "percentOfSalary", amount: { bear: 0.1, base: 0.15, bull: 0.2 },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 },
    },
    cashAwards: [{ label: "Sign-on", amount: 10_000, paidOn: { daysAfterStart: 30 }, clawback: { months: 12, kind: "prorated" } }],
    equity: {
      grants: [{
        kind: "rsu", label: "New-hire RSUs", value: 120_000,
        schedule: { ...VESTING_PRESETS.backLoadedSemiannualAfterCliff, vestDates: { months: [2, 5, 8, 11], day: 15 } },
      }],
      refreshers: {
        value: { bear: 10_000, base: 25_000, bull: 40_000 }, firstAfterMonths: 12, everyMonths: 12,
        schedule: { ...VESTING_PRESETS.evenQuarterlyAfterCliff, vestDates: { months: [2, 5, 8, 11], day: 15 } },
      },
    },
    retirement: { ...sixPctPretax, match: [{ upToPct: 1, rate: 0.5 }] }, // 50% of deferrals, up to the 402(g) limit
    health: { premium: 1_200, outOfPocket: { low: 400, medium: 1_800, high: 4_500 }, oopMax: 4_500, employerHsa: 1_000 },
    perks: { section127: 5_250 },
    hours: { weekly: all(45) },
    costOfLiving: { area: "42660", monthlyRent: 2_600 }, // Seattle metro
  },
];
