import { describe, expect, it } from "vitest";
import { horizonSweep } from "../../src/offer/compare";
import type { OfferInput } from "../../src/offer/types";
import { VESTING_PRESETS } from "../../src/offer/vesting";
import { SAMPLE_OFFERS } from "../../src/samples";
import {
  type AppOffer, blankOffer, DEFAULT_HOUSEHOLD, dropTrailing, firstYear, getPath, sampleOffers, sampleShift, setPath, shiftOffer, shiftYears, toHousehold,
  toOfferInput, withBase,
} from "./model";
import { PRESETS, presetOf } from "./presets";
import { type KeyValueStore, initialSession, loadSession, reducer, saveSession, STORAGE_KEY, type V1Offer, type V1Session } from "./session";
import { localToday, parseMoney, parsePercent } from "./text";
import { disagreement, type StepView, totalsCaption, verdict } from "./verdict";

const TODAY = "2026-10-08";

describe("samples in the app", () => {
  it("move forward by whole years so they start on or after today: July 2026 -> July 2027", () => {
    const [a, b, c] = sampleOffers(TODAY);
    expect([a.draft.startDate, b.draft.startDate, c.draft.startDate]).toEqual(["2027-07-13", "2027-07-13", "2027-07-13"]);
    expect(a.draft.salary.promotions[0].on).toBe("2030-07-13"); // the associate promotion moves with them
    expect(a.draft).toMatchObject({ label: "NYC bank", salary: { annual: 110_000 }, bonus: { basis: "byEmploymentYear" },
      costOfLiving: { area: "35620", monthlyRent: 3_800 }, residence: { state: "NY", nyc: true } });
    expect(b.draft.bonus).toMatchObject({ basis: "percentOfSalary", amount: { bear: 0.05, base: 0.1, bull: 0.12 } });
    expect(c.draft.bonus.amount!.base).toBe(0.15);
    expect([a, b, c].map((o) => o.sample)).toEqual(["sample", "sample", "sample"]);
    expect(sampleOffers("2026-07-13")[0].draft.startDate).toBe("2026-07-13"); // already in the future: unchanged
  });
  it("as drafts, they give the engine exactly the sample inputs (a $0 benefit is no benefit)", () => {
    const years = sampleShift(TODAY);
    sampleOffers(TODAY).forEach((o, i) => {
      const r = toOfferInput(o);
      expect("offer" in r && { ...r.offer, label: "" }).toEqual({ ...shiftOffer(SAMPLE_OFFERS[i], years), label: "" });
    });
  });
  it("a sample's benefits it leaves out are entered as $0, not blank", () => {
    const [a, b] = sampleOffers(TODAY);
    expect(a.draft.health).toMatchObject({ employerHsa: 0, employeeHsa: 0 });
    expect(b.draft.perks).toEqual({ section127: 0, commuterMonthly: 0 });
  });
  it("shiftYears keeps the date, except Feb 29 in a non-leap year", () => {
    expect(shiftYears("2027-07-13", 1)).toBe("2028-07-13");
    expect(shiftYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(shiftYears("2028-02-29", 4)).toBe("2032-02-29");
  });
  it("the editor's vesting presets are the engine's, tranche for tranche", () => {
    expect(PRESETS).toEqual(VESTING_PRESETS);
    expect(presetOf(VESTING_PRESETS.backLoadedSemiannualAfterCliff.tranches)).toBe("backLoadedSemiannualAfterCliff");
    expect(presetOf([{ month: 12, fraction: 1 }])).toBeNull();
  });
});

describe("drafts to the engine's input", () => {
  const filled = (): AppOffer => {
    const o = blankOffer("B");
    return { ...o, draft: { ...o.draft, salary: { ...o.draft.salary, annual: 90_000 }, residence: { state: "NC", nyc: true },
      costOfLiving: { ...o.draft.costOfLiving, area: "16740" }, startDate: "2027-07-01" } };
  };
  it("a blank offer lists what's missing; a blank bonus is no bonus; blank detailed inputs are their defaults", () => {
    expect(toOfferInput(blankOffer("B"))).toEqual({ missing: ["salary", "city", "start date"] });
    const r = toOfferInput(filled());
    expect("offer" in r && r.offer).toEqual({ label: "Offer B", residence: { state: "NC" }, employerState: "NC", startDate: "2027-07-01",
      salary: { annual: 90_000 }, costOfLiving: { area: "16740" } });
  });
  it("blank required numbers in detailed inputs reach the validator as NaN, so it can say which", () => {
    const o = filled();
    const blank = { label: "", value: null, grantDate: null, vestStart: null, schedule: { tranches: null, vestDates: null } };
    o.draft.equity.grants = [{ ...blank, label: "New-hire" }, blank];
    const r = toOfferInput(o);
    const grants = "offer" in r ? r.offer.equity!.grants : [];
    expect(grants).toHaveLength(1); // a grant just added, still blank, isn't an error yet
    expect(grants[0].value).toBeNaN(); // a named grant without a value is: "Enter an amount."
    expect(grants[0].schedule).toEqual(PRESETS.evenQuarterlyAfterCliff); // the default schedule
    expect(dropTrailing([1, null, 2, null, null], (x) => x === null)).toEqual([1, null, 2]); // only trailing rows go: indexes hold
  });
  it("editing a sample's bonus target keeps its bear/bull range in proportion", () => {
    const b = sampleOffers(TODAY)[1]; // 5% / 10% / 12%
    const s = reducer({ ...initialSession(TODAY), offers: [b] }, { type: "edit", id: b.id, set: { "bonus.amount": withBase(b.draft.bonus.amount, 0.2) } });
    const r = toOfferInput(s.offers[0]);
    expect("offer" in r && r.offer.bonus).toMatchObject({ basis: "percentOfSalary", amount: { bear: 0.1, base: 0.2, bull: expect.closeTo(0.24, 12) },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 } });
    expect(withBase(null, 0.1)).toEqual({ bear: 0.1, base: 0.1, bull: 0.1 });
    expect(withBase({ bear: 0.05, base: 0.1, bull: 0.12 }, null)).toBeNull();
  });
  it("New York City tax applies only to the New York metro with NY residence", () => {
    const a = sampleOffers(TODAY)[0];
    const nj = toOfferInput({ ...a, draft: { ...a.draft, residence: { state: "NJ", nyc: true } } });
    expect("offer" in nj && nj.offer.residence).toEqual({ state: "NJ" });
    const ny = toOfferInput(a);
    expect("offer" in ny && ny.offer.residence).toEqual({ state: "NY", locality: { kind: "nyc" } });
  });
  it("paths read and write the draft, copying only what changes", () => {
    const a = sampleOffers(TODAY)[2];
    expect(getPath(a.draft, "equity.grants.0.value")).toBe(120_000);
    const d = setPath(a.draft, "equity.grants.0.grantDate", "2027-08-01");
    expect(d.equity.grants[0].grantDate).toBe("2027-08-01");
    expect(a.draft.equity.grants[0].grantDate).toBeNull();
    expect(d.salary).toBe(a.draft.salary);
  });
  it("other wages go to the earliest start date's calendar year, or this year before any start date", () => {
    expect(toHousehold({ ...DEFAULT_HOUSEHOLD, otherWagesThisYear: 12_000 }, 2027).otherWages).toEqual({ 2027: 12_000 });
    expect(toHousehold(DEFAULT_HOUSEHOLD, 2027).otherWages).toBeUndefined();
    const [a, b] = sampleOffers(TODAY); // both start 2027-07-13
    expect(firstYear([a, b], TODAY)).toBe(2027);
    const earlier: AppOffer = { ...b, draft: { ...b.draft, startDate: "2026-12-01" } };
    expect(firstYear([a, earlier], TODAY)).toBe(2026);
    expect(firstYear([blankOffer("A"), blankOffer("B")], TODAY)).toBe(2026);
  });
});

describe("session", () => {
  const s0 = initialSession(TODAY);
  it("starts with the samples, a 4-year stay and the after-rent basis", () => {
    expect(s0.offers.map((o) => o.letter)).toEqual(["A", "B", "C"]);
    expect(s0.household).toEqual({ filingStatus: "single", stayYears: 4, otherWagesThisYear: 0 });
    expect(s0.ui.basis).toBe("colAdjustedTotal");
  });
  it("letters stay with their offers: remove B, add one, and it's B again", () => {
    const removed = reducer(s0, { type: "removeOffer", id: s0.offers[1].id });
    expect(removed.offers.map((o) => o.letter)).toEqual(["A", "C"]);
    expect(reducer(removed, { type: "addOffer" }).offers.map((o) => o.letter)).toEqual(["A", "B", "C"]);
    expect(reducer(s0, { type: "addOffer" })).toBe(s0); // three is the most
  });
  it("editing a sample marks it edited", () => {
    const s = reducer(s0, { type: "edit", id: s0.offers[0].id, set: { "salary.annual": 120_000 } });
    expect(s.offers[0]).toMatchObject({ sample: "edited", draft: { salary: { annual: 120_000 } } });
    expect(s.offers[1]).toBe(s0.offers[1]);
  });
  it("storage: round trip, and blocked or corrupt storage never throws", () => {
    const mem = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
    const edited = reducer(s0, { type: "household", patch: { stayYears: 3 } });
    expect(saveSession(store, edited)).toBe(true);
    expect(loadSession(store, TODAY).household.stayYears).toBe(3);
    mem.set(STORAGE_KEY, "{not json");
    expect(loadSession(store, TODAY).household.stayYears).toBe(4);
    const blocked: KeyValueStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadSession(blocked, TODAY).offers).toHaveLength(3);
    expect(saveSession(blocked, s0)).toBe(false);
    expect(saveSession(undefined, s0)).toBe(false);
  });
});

describe("a slice-1 or slice-2 save (schema 1) migrates to drafts", () => {
  // v1's own conversion, kept here as the oracle: a migrated offer must give the engine the same input.
  const all = (v: number) => ({ bear: v, base: v, bull: v });
  function v1ToOfferInput(o: V1Offer): OfferInput | null {
    const q = o.quick;
    if (q.salary === null || !q.area || !q.state || !q.startDate) return null;
    const base = o.base;
    const b = q.bonus;
    let bonus: OfferInput["bonus"];
    if (b.kind === "schedule") bonus = base?.bonus;
    else {
      const timing = base?.bonus ? { payOn: base.bonus.payOn, ...(base.bonus.cutoff ? { cutoff: base.bonus.cutoff } : {}),
        ...(base.bonus.periodStart ? { periodStart: base.bonus.periodStart } : {}) } : { payOn: { month: 3, day: 15 } };
      const v = b.value ?? 0;
      if (v !== 0) {
        const kind = b.kind === "percent" ? "percentOfSalary" : "fixed";
        const r = b.kind === "percent" ? v / 100 : v;
        const amount = base?.bonus?.basis === kind && base.bonus.amount.base > 0
          ? { bear: base.bonus.amount.bear * (r / base.bonus.amount.base), base: r, bull: base.bonus.amount.bull * (r / base.bonus.amount.base) } : all(r);
        bonus = { ...timing, basis: kind, amount };
      }
    }
    const offer: OfferInput = {
      ...base, label: q.label || `Offer ${o.letter}`,
      residence: { state: q.state, ...(q.nyc && q.area === "35620" && q.state === "NY" ? { locality: { kind: "nyc" } } : {}) },
      employerState: q.state, startDate: q.startDate, salary: { ...base?.salary, annual: q.salary },
      costOfLiving: { ...base?.costOfLiving, area: q.area, monthlyRent: q.rent ?? undefined },
    };
    if (offer.costOfLiving!.monthlyRent === undefined) delete offer.costOfLiving!.monthlyRent;
    if (bonus) offer.bonus = bonus; else delete offer.bonus;
    return offer;
  }
  const years = sampleShift(TODAY);
  const v1Samples: V1Offer[] = SAMPLE_OFFERS.map((raw, i) => {
    const o = shiftOffer(raw, years);
    const b = o.bonus!;
    return {
      id: `sample-${"ABC"[i]}`, letter: "ABC"[i] as V1Offer["letter"], sample: "sample", base: o,
      quick: { label: ["NYC bank", "Charlotte corp", "Seattle tech"][i], salary: o.salary.annual, area: o.costOfLiving!.area,
        state: o.residence.state, nyc: o.residence.locality?.kind === "nyc", startDate: o.startDate, rent: o.costOfLiving!.monthlyRent ?? null,
        bonus: b.basis === "percentOfSalary" ? { kind: "percent", value: Math.round(b.amount.base * 10_000) / 100 } : { kind: "schedule" } },
    };
  });
  const v1: V1Session = {
    schemaVersion: 1, household: { filingStatus: "single", stayYears: 3, otherWagesThisYear: 5_000 },
    ui: { basis: "cash", theme: "dark", dismissed: { ticks: true } },
    offers: [
      { ...v1Samples[0], sample: "edited", quick: { ...v1Samples[0].quick, salary: 120_000 } },
      { ...v1Samples[1], sample: "edited", quick: { ...v1Samples[1].quick, bonus: { kind: "percent", value: 20 }, rent: null } },
      { id: "C-1", letter: "C", sample: null, quick: { label: "", salary: 95_000, bonus: { kind: "amount", value: 8_000 }, area: "16740",
        state: "SC", nyc: true, startDate: "2027-09-01", rent: null } },
    ],
  };

  it("keeps the household and view choices, and every offer gives the engine the same input", () => {
    const mem = new Map([[STORAGE_KEY, JSON.stringify(v1)]]);
    const s = loadSession({ getItem: (k) => mem.get(k) ?? null, setItem: () => {} }, TODAY);
    expect(s.schemaVersion).toBe(2);
    expect(s.household).toEqual(v1.household);
    expect(s.ui).toEqual(v1.ui);
    expect(s.offers.map((o) => [o.id, o.letter, o.sample])).toEqual([["sample-A", "A", "edited"], ["sample-B", "B", "edited"], ["C-1", "C", null]]);
    s.offers.forEach((o, i) => {
      const r = toOfferInput(o);
      expect("offer" in r && r.offer).toEqual(v1ToOfferInput(v1.offers[i]));
    });
    expect(s.offers[1].draft.bonus.amount).toEqual({ bear: 0.1, base: 0.2, bull: expect.closeTo(0.24, 12) });
    expect(s.offers[0].draft.perks).toEqual({ section127: 0, commuterMonthly: 0 }); // samples, completed as fresh ones are
  });
  it("an incomplete v1 offer stays incomplete, with what was entered", () => {
    const blank: V1Offer = { id: "B-1", letter: "B", sample: null, quick: { label: "Mine", salary: null, bonus: { kind: "percent", value: null },
      area: null, state: null, nyc: true, startDate: "2027-06-01", rent: null } };
    const s = loadSession({ getItem: () => JSON.stringify({ ...v1, offers: [blank] }), setItem: () => {} }, TODAY);
    expect(toOfferInput(s.offers[0])).toEqual({ missing: ["salary", "city"] });
    expect(s.offers[0].draft).toMatchObject({ label: "Mine", startDate: "2027-06-01", bonus: { basis: null, amount: null } });
  });
  it("anything else starts fresh", () => {
    expect(loadSession({ getItem: () => JSON.stringify({ schemaVersion: 9, offers: [], household: {}, ui: {} }), setItem: () => {} }, TODAY)
      .offers.map((o) => o.sample)).toEqual(["sample", "sample", "sample"]);
  });
});

describe("verdict", () => {
  const step = (basis: StepView["basis"], winner: "A" | "B" | "C" | null): StepView => ({
    basis, step: "", title: "", unavailable: winner ? null : "n/a",
    lead: winner ? { winner: 0, runnerUp: 1, margin: 1, share: 0.1, closeCall: false, winnerLetter: winner, runnerUpLetter: "A" } : null,
  });
  it("says where the lead changes hands", () => {
    expect(disagreement([step("cash", "A"), step("totalRewards", "A"), step("colAdjustedTotal", "C"), step("perHour", "C")]))
      .toBe("A leads on pay; C leads once rent and prices are counted.");
    expect(disagreement([step("cash", "B"), step("totalRewards", "B"), step("colAdjustedTotal", "B"), step("perHour", null)]))
      .toBe("B leads on every basis.");
  });
  it("on the samples: C leads after rent at U.S. prices; per hour is unavailable once an offer has no hours", () => {
    const offers = sampleOffers(TODAY).map((o) => { const r = toOfferInput(o); if (!("offer" in r)) throw new Error("incomplete"); return r.offer; });
    const household = toHousehold(DEFAULT_HOUSEHOLD, 2026);
    const opts = { valuationDate: TODAY, inflation: 0.025, discountRate: 0.05 };
    const v = verdict(horizonSweep(offers, household, [2, 3, 4, 5], opts), ["A", "B", "C"], "colAdjustedTotal", 4)!;
    expect(v.basis).toBe("colAdjustedTotal");
    expect(v.lead).toMatchObject({ winnerLetter: "C", runnerUpLetter: "A" });
    expect(v.stays.map((s) => s.years)).toEqual([2, 3, 4, 5]);
    expect(v.stays.find((s) => s.current)!.years).toBe(4);
    const noHours = offers.map((o, i) => (i === 1 ? { ...o, hours: undefined } : o));
    const w = verdict(horizonSweep(noHours, household, [4], opts), ["A", "B", "C"], "perHour", 4)!;
    expect(w.steps.find((s) => s.basis === "perHour")!.unavailable).toMatch(/hours/);
    expect(w.basis).toBe("cash"); // the chosen basis can't be shown, so the first available one is
  });
  it("the rank list says what its totals are: the stay, the basis, the dollars", () => {
    expect(totalsCaption("colAdjustedTotal", 4, "colAdjustedTotal")).toBe("4-year total after rent, in today's U.S.-average dollars, present value");
    expect(totalsCaption("cash", 2, "colAdjustedTotal")).toBe("2-year total after tax, in today's dollars, present value");
    expect(totalsCaption("perHour", 1, "totalRewards")).toBe("Per hour worked over 1 year, in total rewards, nominal");
  });
});

describe("text", () => {
  it("money and percent fields accept what people type", () => {
    expect(parseMoney("110k")).toBe(110_000);
    expect(parseMoney("$110,000")).toBe(110_000);
    expect(parseMoney("1.2m")).toBe(1_200_000);
    expect(parseMoney("  ")).toBeNull();
    expect(parseMoney("ten")).toBeNaN();
    expect(parsePercent("12.5%")).toBe(12.5);
    expect(parsePercent("x")).toBeNaN();
  });
  it("today is the local date", () => {
    expect(localToday(new Date(2026, 9, 8, 23, 59))).toBe("2026-10-08");
  });
});
