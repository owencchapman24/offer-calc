import { describe, expect, it } from "vitest";
import { projectOffer } from "../../src/offer/compare";
import { leaveDaySweep } from "../../src/offer/project";
import { STATES_2026 } from "../../src/tax/index";
import { asymmetries } from "./comparability";
import { DEFAULTS } from "./defaults";
import "./detailedDefaults";
import { US_STATES } from "./Detailed";
import { type AppOffer, all, ASSUMPTIONS, getPath, type HealthDraft, type OfferDraft, type RetirementDraft, sampleOffers, setPath, toHousehold, toOfferInput, DEFAULT_HOUSEHOLD } from "./model";
import { DEFAULT_PRESET, PRESETS } from "./presets";
import { context, renderAllInputs } from "./testing";

// The defaults registry (what a D tickmark says) and the engine's defaults (what a null field gives the
// engine, model.ts) can't disagree: for every default, an offer with the field at its default projects
// exactly as one with the default's value entered. The probe has to be able to tell: for every default,
// a value other than the default changes what it sees (audit T5), so each default is tried on an offer
// where it matters.

const TODAY = "2026-07-13";
const [A, B, C] = sampleOffers(TODAY);
const fresh = (o: AppOffer, d: (x: OfferDraft) => OfferDraft): AppOffer => ({ ...o, draft: d(structuredClone(o.draft)) });
/** C's sign-on with a clawback at every default but its window. */
const WITH_CLAWBACK = fresh(C, (d) => ({ ...d, cashAwards: [{ ...d.cashAwards[0], clawback: { months: 12, kind: "prorated", per: null, from: null, repay: null } }] }));
/** C with its share price rising, so a grant's date moves its vests' values. */
const GROWING = fresh(C, (d) => ({ ...d, equity: { ...d.equity, priceGrowth: all(0.05) } }));
/** B with a 3-year cliff on the employer's 401(k) money, so how service is counted moves what vests in a 2-year stay. */
const CLIFF = fresh(B, (d) => ({ ...d, retirement: { ...(d.retirement as RetirementDraft), vesting: { kind: "cliff", years: 3 } } }));
/** B with its employer in California, where unused vacation is paid when you leave; and giving 15 vacation days, 4 more than taken. */
const IN_CA = fresh(B, (d) => ({ ...d, employerState: "CA" }));
const BANKS = fresh(B, (d) => ({ ...d, timeOff: { ...d.timeOff, gives: 15 } }));
const BANKS_IN_CA = fresh(IN_CA, (d) => ({ ...d, timeOff: { ...d.timeOff, gives: 15 } }));
/** B putting $5,000 a year in an HSA: over self-only coverage's limit, under family coverage's. */
const BIG_HSA = fresh(B, (d) => ({ ...d, health: { ...(d.health as HealthDraft), employeeHsa: 5_000 } }));

/**
 * The offer and the concrete path to try each default on, the value that default stands for (when it depends on the offer),
 * and a value other than the default, which the probe must tell from it.
 */
function setup(key: string): { o: AppOffer; path: string; value: unknown; other: unknown } {
  const def = DEFAULTS[key];
  const on = (o: AppOffer, path: string, other: unknown, value = def.value) => ({ o, path, value, other });
  const shortSchedule = [{ month: 12, fraction: 1 }];
  const otherDates = { months: [6, 12], day: 1 };
  switch (key) {
    case "salary.raise": return on(B, key, all(0.03));
    case "salary.raiseOn": return on(B, key, "jan1");
    case "salary.promotions.scenarios": return on(A, "salary.promotions.0.scenarios", ["base", "bull"]);
    case "bonus.basis": return on(B, key, "fixed");
    case "bonus.payOn": return on(B, key, { month: 1, day: 31 });
    case "bonus.periodStart": return on(B, key, { month: 7, day: 1 });
    case "bonus.cutoff": return on(B, key, { month: 7, day: 1 }); // B starts Jul 13: a Jul 1 cutoff skips its first bonus
    case "bonus.firstPayoutGuaranteed": return on(B, key, true); // the bear case's first bonus at the target
    case "bonus.mustBeEmployedOnPayDate": return on(B, key, false); // a bonus unpaid at the last day, prorated
    case "equity.grants.grantDate": return on(GROWING, "equity.grants.0.grantDate", "2026-04-13", C.draft.startDate);
    case "equity.grants.vestStart": return on(C, "equity.grants.0.vestStart", "2026-10-13", C.draft.startDate);
    case "equity.grants.schedule": return on(C, "equity.grants.0.schedule.tranches", shortSchedule, PRESETS[DEFAULT_PRESET].tranches);
    case "equity.grants.schedule.vestDates": return on(C, "equity.grants.0.schedule.vestDates", otherDates, null);
    case "equity.priceGrowth": return on(C, key, all(0.1));
    case "equity.refreshers": return on(C, key, C.draft.equity.refreshers, null);
    case "equity.refreshers.firstAfterMonths": return on(C, key, 6);
    case "equity.refreshers.everyMonths": return on(C, key, 6);
    case "equity.refreshers.schedule": return on(C, "equity.refreshers.schedule.tranches", shortSchedule, PRESETS[DEFAULT_PRESET].tranches);
    case "equity.refreshers.schedule.vestDates": return on(C, key, otherDates);
    case "timeOff.vacation": return on(B, key, 15); // B has weekly hours: the weeks worked move
    case "timeOff.holidays": return on(B, key, 10);
    case "timeOff.sick": return on(B, key, 5);
    case "timeOff.policy": return on(BANKS_IN_CA, key, "unlimited"); // nothing banks, so nothing's paid on leaving
    case "timeOff.gives": return on(IN_CA, key, 15, 11); // the days you'd take, 11, give nothing to bank
    case "timeOff.cap": return on(BANKS_IN_CA, key, 1);
    case "timeOff.payout": return on(BANKS, key, "always"); // B's employer is in North Carolina, which doesn't require it
    case "cashAwards.paidOn": return on(C, "cashAwards.0.paidOn", { daysAfterStart: 90 }, { daysAfterStart: 30 });
    case "cashAwards.clawback.months": return on(WITH_CLAWBACK, "cashAwards.0.clawback.months", 24);
    case "cashAwards.clawback.kind": return on(WITH_CLAWBACK, "cashAwards.0.clawback.kind", "full");
    case "cashAwards.clawback.per": return on(WITH_CLAWBACK, "cashAwards.0.clawback.per", "day");
    case "cashAwards.clawback.from": return on(WITH_CLAWBACK, "cashAwards.0.clawback.from", "payment");
    case "cashAwards.clawback.repay": return on(WITH_CLAWBACK, "cashAwards.0.clawback.repay", "net");
    case "retirement.contributionPct": return on(B, key, 0.06);
    case "retirement.type": return on(B, key, "roth");
    case "retirement.eligiblePay": return on(B, key, "salaryAndBonus");
    case "retirement.nonElectivePct": return on(B, key, 0.03);
    case "retirement.vesting": return on(C, key, { kind: "cliff", years: 3 }, { kind: "immediate" });
    case "retirement.vestingService": return on(CLIFF, key, "planYearHours");
    case "health.employeeHsa": return on(B, key, 1_000);
    case "health.employerHsa": return on(B, key, 500);
    case "health.coverage": return on(BIG_HSA, key, "family");
    case "perks.section127": return on(B, key, 5_250);
    case "perks.commuterMonthly": return on(B, key, 100);
    case "employerState": return on(B, key, "NY", B.draft.residence.state); // NY's convenience rule: a warning
    case "costOfLiving.rentGrowth": return on(B, key, 0.05);
  }
  throw new Error(`No setup for the default ${key}: add one, on an offer where the default matters.`);
}

/**
 * Last days to leave on: 6 months, mid-month after it (where counting by day and by month differ), 11 and 13 months. Each falls
 * inside a 12-month clawback, across a bonus's pay date or a cliff, for offers starting Jul 13, 2026.
 */
const LAST_DAYS = ["2027-01-12", "2027-01-25", "2027-06-12", "2027-08-12"];

/**
 * What the probe sees: bear, base and bull with every event, assumption and warning, over a 4-year stay and a 2-year one, and
 * leaving early. Not where a value came from (`rentGrowthSource` and the like): a default's value entered is "input", rightly.
 */
function probe(o: AppOffer) {
  const r = toOfferInput(o);
  if (!("offer" in r)) throw new Error("incomplete");
  const household = toHousehold(DEFAULT_HOUSEHOLD, 2026);
  const options = { valuationDate: TODAY, inflation: ASSUMPTIONS.inflation };
  const stay = (years: number) => projectOffer(r.offer, household, { ...options, window: { start: r.offer.startDate, years } });
  const seen = { stays: [stay(4), stay(2)], leaving: leaveDaySweep(r.offer, household, LAST_DAYS, options) };
  return JSON.parse(JSON.stringify(seen, (k, v) => (/source$/i.test(k) ? undefined : v))) as unknown;
}

describe("the defaults registry agrees with the engine", () => {
  for (const key of Object.keys(DEFAULTS)) {
    it(key, () => {
      const { o, path, value, other } = setup(key);
      const atDefault = probe({ ...o, draft: setPath(o.draft, path, null) });
      expect(getPath(setPath(o.draft, path, null), path), "the field is at its default").toBeNull();
      expect(probe({ ...o, draft: setPath(o.draft, path, value) }), "the default's value entered").toEqual(atDefault);
      expect(probe({ ...o, draft: setPath(o.draft, path, other) }), "another value: the probe must see the difference").not.toEqual(atDefault);
    });
  }
});

describe("a plan entered as none", () => {
  const none = (o: AppOffer, plan: "retirement" | "health"): AppOffer => ({ ...o, draft: { ...o.draft, [plan]: "none" } });
  it("gives the engine no plan, as not entered does", () => {
    for (const plan of ["retirement", "health"] as const) {
      const r = toOfferInput(none(B, plan));
      expect("offer" in r && r.offer[plan]).toBeUndefined();
    }
  });
  it("counts as entered for the comparability warning: a genuine absence can be said", () => {
    const blankB: AppOffer = { ...B, draft: { ...B.draft, retirement: null, health: null } };
    expect(asymmetries([A, blankB]).map((x) => x.category)).toEqual(["premium", "outOfPocket", "employer401k", "employerHsa"]);
    expect(asymmetries([A, none(none(blankB, "retirement"), "health")])).toEqual([]);
  });
  it("a health plan with only a premium entered counts the premium, not out-of-pocket costs", () => {
    const h: HealthDraft = { premium: 1_200, outOfPocket: { low: null, medium: null, high: null }, oopMax: null, employeeHsa: null, employerHsa: 0, coverage: null };
    const r = toOfferInput({ ...B, draft: { ...B.draft, health: h, retirement: B.draft.retirement as RetirementDraft } });
    expect("offer" in r && r.offer.health).toEqual({ premium: 1_200, outOfPocket: { low: 0, medium: 0, high: 0 }, oopMax: 0 });
  });
});

describe("a default that depends on the offer", () => {
  // CLAUDE.md: every default shows as a real value with its D. The vacation days it gives default to the days you'd take.
  const field = (html: string) => /<input[^>]*id="in-A-timeOff-gives"[^>]*>/.exec(html)?.[0] ?? "";
  it("shows its value: the days it gives are the days you'd take (11 by default, or as entered)", () => {
    expect(field(renderAllInputs(context()))).toMatch(/value="11"/);
    const ctx = context("colAdjustedTotal", (os) => os.map((o) => ({ ...o, draft: { ...o.draft, timeOff: { ...o.draft.timeOff, vacation: 15 } } })));
    expect(field(renderAllInputs(ctx))).toMatch(/value="15"/);
  }, 30_000);
});

describe("employer state", () => {
  it("offers every state the tax engine knows: 50 and DC", () => {
    expect(US_STATES).toEqual(Object.keys(STATES_2026).sort());
    expect(US_STATES).toHaveLength(51);
  });
});
