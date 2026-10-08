import { describe, expect, it } from "vitest";
import { horizonSweep } from "../../src/offer/compare";
import { type AppOffer, blankOffer, firstYear, sampleOffers, shiftYears, toHousehold, toOfferInput, DEFAULT_HOUSEHOLD } from "./model";
import { type KeyValueStore, initialSession, loadSession, reducer, saveSession, STORAGE_KEY } from "./session";
import { localToday, parseMoney, parsePercent } from "./text";
import { disagreement, type StepView, totalsCaption, verdict } from "./verdict";

const TODAY = "2026-10-08";

describe("samples in the app", () => {
  it("move forward by whole years so they start on or after today: July 2026 -> July 2027", () => {
    const [a, b, c] = sampleOffers(TODAY);
    expect([a.quick.startDate, b.quick.startDate, c.quick.startDate]).toEqual(["2027-07-13", "2027-07-13", "2027-07-13"]);
    expect(a.base!.salary.promotions![0].on).toBe("2030-07-13"); // the associate promotion moves with them
    expect(a.quick).toMatchObject({ label: "NYC bank", salary: 110_000, bonus: { kind: "schedule" }, area: "35620", state: "NY", nyc: true, rent: 3_800 });
    expect(b.quick.bonus).toEqual({ kind: "percent", value: 10 });
    expect(c.quick.bonus).toEqual({ kind: "percent", value: 15 });
    expect([a, b, c].map((o) => o.sample)).toEqual(["sample", "sample", "sample"]);
    expect(sampleOffers("2026-07-13")[0].quick.startDate).toBe("2026-07-13"); // already in the future: unchanged
  });
  it("shiftYears keeps the date, except Feb 29 in a non-leap year", () => {
    expect(shiftYears("2027-07-13", 1)).toBe("2028-07-13");
    expect(shiftYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(shiftYears("2028-02-29", 4)).toBe("2032-02-29");
  });
});

describe("quick fields to the engine's input", () => {
  it("a blank offer lists what's missing; a blank bonus is no bonus", () => {
    expect(toOfferInput(blankOffer("B"))).toEqual({ missing: ["salary", "city", "start date"] });
    const filled: AppOffer = { ...blankOffer("B"), quick: { ...blankOffer("B").quick, salary: 90_000, area: "16740", state: "NC", startDate: "2027-07-01" } };
    const r = toOfferInput(filled);
    expect("offer" in r && r.offer).toMatchObject({ residence: { state: "NC" }, employerState: "NC", salary: { annual: 90_000 },
      costOfLiving: { area: "16740" } });
    expect("offer" in r && r.offer.bonus).toBeUndefined();
    expect("offer" in r && "monthlyRent" in r.offer.costOfLiving!).toBe(false); // left blank: the engine estimates it
  });
  it("editing a sample's bonus % keeps its bear/bull range in proportion", () => {
    const b = sampleOffers(TODAY)[1]; // 5% / 10% / 12%
    const r = toOfferInput({ ...b, quick: { ...b.quick, bonus: { kind: "percent", value: 20 } } });
    expect("offer" in r && r.offer.bonus).toMatchObject({ basis: "percentOfSalary", amount: { bear: 0.1, base: 0.2, bull: expect.closeTo(0.24, 12) },
      payOn: { month: 3, day: 15 }, cutoff: { month: 10, day: 1 } });
  });
  it("New York City tax applies only to the New York metro with NY residence", () => {
    const a = sampleOffers(TODAY)[0];
    const nj = toOfferInput({ ...a, quick: { ...a.quick, state: "NJ" } });
    expect("offer" in nj && nj.offer.residence).toEqual({ state: "NJ" });
    const ny = toOfferInput(a);
    expect("offer" in ny && ny.offer.residence).toEqual({ state: "NY", locality: { kind: "nyc" } });
  });
  it("other wages go to the earliest start date's calendar year, or this year before any start date", () => {
    expect(toHousehold({ ...DEFAULT_HOUSEHOLD, otherWagesThisYear: 12_000 }, 2027).otherWages).toEqual({ 2027: 12_000 });
    expect(toHousehold(DEFAULT_HOUSEHOLD, 2027).otherWages).toBeUndefined();
    const [a, b] = sampleOffers(TODAY); // both start 2027-07-13
    expect(firstYear([a, b], TODAY)).toBe(2027);
    const earlier: AppOffer = { ...b, quick: { ...b.quick, startDate: "2026-12-01" } };
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
    const s = reducer(s0, { type: "offer", id: s0.offers[0].id, patch: { salary: 120_000 } });
    expect(s.offers[0]).toMatchObject({ sample: "edited", quick: { salary: 120_000 } });
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
