import { describe, expect, it } from "vitest";
import { projectScenario } from "../../src/offer/project";
import { STATES_2026 } from "../../src/tax/index";
import { asymmetries } from "./comparability";
import { DEFAULTS } from "./defaults";
import { US_STATES } from "./Detailed";
import { type AppOffer, ASSUMPTIONS, getPath, type HealthDraft, type OfferDraft, type RetirementDraft, sampleOffers, setPath, toHousehold, toOfferInput, DEFAULT_HOUSEHOLD } from "./model";
import { DEFAULT_PRESET, PRESETS } from "./presets";

// The defaults registry (what a D tickmark says) and the engine's defaults (what a null field gives the
// engine, model.ts) can't disagree: for every default, an offer with the field at its default projects
// exactly as one with the default's value entered.

const TODAY = "2026-07-13";
const [A, B, C] = sampleOffers(TODAY);

/** The offer and the concrete path to try each default on, and the value that default stands for, when it depends on the offer. */
function setup(key: string): { o: AppOffer; path: string; value: unknown } {
  const fresh = (o: AppOffer, d: (x: OfferDraft) => OfferDraft = (x) => x): AppOffer => ({ ...o, draft: d(structuredClone(o.draft)) });
  const withClawback = fresh(C, (d) => ({ ...d, cashAwards: [{ ...d.cashAwards[0], clawback: { months: 12, kind: "prorated", per: null, from: null, repay: null } }] }));
  const def = DEFAULTS[key];
  switch (key) {
    case "salary.promotions.scenarios": return { o: A, path: "salary.promotions.0.scenarios", value: def.value };
    case "equity.grants.grantDate": case "equity.grants.vestStart": return { o: C, path: key.replace("grants.", "grants.0."), value: C.draft.startDate };
    case "equity.grants.schedule": return { o: C, path: "equity.grants.0.schedule.tranches", value: PRESETS[DEFAULT_PRESET].tranches };
    case "equity.grants.schedule.vestDates": return { o: C, path: "equity.grants.0.schedule.vestDates", value: null };
    case "equity.refreshers": return { o: C, path: "equity.refreshers", value: null };
    case "equity.refreshers.schedule": return { o: C, path: "equity.refreshers.schedule.tranches", value: PRESETS[DEFAULT_PRESET].tranches };
    case "cashAwards.paidOn": return { o: C, path: "cashAwards.0.paidOn", value: { daysAfterStart: 30 } };
    case "retirement.vesting": return { o: C, path: key, value: { kind: "immediate" } };
    case "employerState": return { o: B, path: key, value: B.draft.residence.state };
    case "bonus.cutoff": return { o: A, path: key, value: null };
  }
  if (key.startsWith("cashAwards.clawback.")) return { o: withClawback, path: key.replace("cashAwards.", "cashAwards.0."), value: def.value };
  if (key.startsWith("retirement.") || key.startsWith("health.")) return { o: B, path: key, value: def.value };
  return { o: key.startsWith("equity.") ? C : B, path: key, value: def.value };
}

const project = (o: AppOffer) => {
  const r = toOfferInput(o);
  if (!("offer" in r)) throw new Error("incomplete");
  return projectScenario(r.offer, toHousehold(DEFAULT_HOUSEHOLD, 2026), { valuationDate: TODAY, inflation: ASSUMPTIONS.inflation }).window;
};

describe("the defaults registry agrees with the engine", () => {
  for (const key of Object.keys(DEFAULTS)) {
    it(key, () => {
      const { o, path, value } = setup(key);
      const atDefault = { ...o, draft: setPath(o.draft, path, null) };
      const entered = { ...o, draft: setPath(o.draft, path, value) };
      expect(getPath(atDefault.draft, path), "the field is at its default").toBeNull();
      expect(project(atDefault)).toEqual(project(entered));
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

describe("employer state", () => {
  it("offers every state the tax engine knows: 50 and DC", () => {
    expect(US_STATES).toEqual(Object.keys(STATES_2026).sort());
    expect(US_STATES).toHaveLength(51);
  });
});
