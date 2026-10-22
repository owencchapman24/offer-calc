import { describe, expect, it } from "vitest";
import { horizonSweep, projectOffer } from "../../src/offer/compare";
import type { OfferInput } from "../../src/offer/types";
import { VESTING_PRESETS } from "../../src/offer/vesting";
import { SAMPLE_OFFERS } from "../../src/samples";
import {
  type AppOffer, blankOffer, blankTimeOff, DEFAULT_HOUSEHOLD, dropTrailing, firstYear, getPath, sampleOffers, sampleShift, setPath, shiftOffer, shiftYears, toHousehold,
  toOfferInput, withBase,
} from "./model";
import { newEspp } from "./editors";
import { copyBlock } from "./App";
import { readImport } from "./exchange";
import { PRESETS, presetOf } from "./presets";
import { priceWords, US_PRICES } from "./prices";
import {
  BACKUP_KEY, clearSession, type KeyValueStore, initialSession, loadSession as load, readBackup, reducer, savedFile, saveSession, STORAGE_KEY, type V1Offer,
  type V1Session,
} from "./session";
import { localToday, parseMoney, parsePercent } from "./text";
import { disagreement, type StepView, totalsCaption, verdict } from "./verdict";

const TODAY = "2026-10-08";
/** The saved session as loaded (what the app starts with). */
const loadSession = (store: KeyValueStore | undefined, today: string) => load(store, today).session;

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
  it("Philadelphia's resident wage tax, for an offer inside the city (audit C2), as New York City's tax is asked for", () => {
    const b = blankOffer("A");
    const philly = (residence: Partial<AppOffer["draft"]["residence"]>, state = "PA", area = "37980"): AppOffer => ({ ...b, draft: { ...b.draft,
      salary: { ...b.draft.salary, annual: 100_000 }, startDate: "2026-07-13", residence: { ...b.draft.residence, state, ...residence },
      costOfLiving: { ...b.draft.costOfLiving, area } } });
    const locality = (o: AppOffer) => (toOfferInput(o) as { offer: OfferInput }).offer.residence.locality;
    expect(locality(philly({}))).toEqual({ kind: "philadelphia", resident: true }); // a blank draft: inside, the default
    expect(locality(philly({ philadelphia: true }))).toEqual({ kind: "philadelphia", resident: true });
    expect(locality(philly({ philadelphia: false }))).toBeUndefined(); // the suburbs
    expect(locality(philly({}, "NJ"))).toBeUndefined(); // Camden's side of the metro
    expect(locality(philly({}, "PA", "38300"))).toBeUndefined(); // Pittsburgh
    // Hand-checked: 2026 pay from Jul 13 is 100,000 / 12 x (19/31 + 5) = 46,774.19; the city's rate for 2026 blends its two halves,
    // (3.74% + 3.735%) / 2 = 3.7375%, so 46,774.19 x 0.037375 = 1,748.19 of wage tax, on pay before any 401(k).
    const offer = (toOfferInput(philly({})) as { offer: OfferInput }).offer;
    const y2026 = projectOffer(offer, toHousehold(DEFAULT_HOUSEHOLD, 2026), { valuationDate: "2026-07-13" }).scenarios.base.calendarYears[0];
    expect(y2026.withOffer.result.localIncomeTax).toBeCloseTo(1_748.19, 2);
    expect(y2026.withoutOffer.result.localIncomeTax).toBe(0);
  });
  it("other wages go to the earliest start date's calendar year, or this year before any start date", () => {
    expect(toHousehold({ ...DEFAULT_HOUSEHOLD, otherWagesThisYear: 12_000 }, 2027).otherWages).toEqual({ 2027: 12_000 });
    expect(toHousehold(DEFAULT_HOUSEHOLD, 2027).otherWages).toBeUndefined();
    // A spouse's wages (audit C1): filing jointly only; the year entered, grown with inflation after it and shrunk before it, from 2026.
    const joint = toHousehold({ ...DEFAULT_HOUSEHOLD, filingStatus: "joint", spouseWages: 80_000 }, 2027).spouseWages!;
    expect(joint[2027]).toBe(80_000);
    expect(joint[2028]).toBeCloseTo(82_000, 9); // 80,000 x 1.025
    expect(joint[2026]).toBeCloseTo(78_048.780488, 5); // 80,000 / 1.025
    expect(Math.min(...Object.keys(joint).map(Number))).toBe(2026);
    expect(Math.max(...Object.keys(joint).map(Number))).toBe(2046);
    expect(toHousehold({ ...DEFAULT_HOUSEHOLD, filingStatus: "single", spouseWages: 80_000 }, 2027).spouseWages).toBeUndefined();
    expect(toHousehold({ ...DEFAULT_HOUSEHOLD, filingStatus: "joint" }, 2027).spouseWages).toBeUndefined();
    const [a, b] = sampleOffers(TODAY); // both start 2027-07-13
    expect(firstYear([a, b], TODAY)).toBe(2027);
    const earlier: AppOffer = { ...b, draft: { ...b.draft, startDate: "2026-12-01" } };
    expect(firstYear([a, earlier], TODAY)).toBe(2026);
    expect(firstYear([blankOffer("A"), blankOffer("B")], TODAY)).toBe(2026);
  });
});

describe("session", () => {
  const first = initialSession(TODAY);
  // "See a sample comparison" (and the footer's "Reload the samples"): all three.
  const s0 = reducer(first, { type: "loadSamples", today: TODAY });
  it("a first visit starts with sample A on its own (B5), a 4-year stay and the after-rent basis; one click loads all three", () => {
    expect(first.offers.map((o) => [o.letter, o.sample])).toEqual([["A", "sample"]]);
    expect(first.household).toEqual({ filingStatus: "single", stayYears: 4, otherWagesThisYear: 0, pricesIn: "00000" });
    expect(first.ui.basis).toBe("colAdjustedTotal");
    expect(s0.offers.map((o) => [o.letter, o.sample])).toEqual([["A", "sample"], ["B", "sample"], ["C", "sample"]]);
    expect(s0.offers[0]).toEqual(first.offers[0]);
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
    expect(saveSession(store, edited)).toBe("saved");
    expect(loadSession(store, TODAY).household.stayYears).toBe(3);
    mem.set(STORAGE_KEY, "{not json");
    expect(loadSession(store, TODAY).household.stayYears).toBe(4);
    const blocked: KeyValueStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadSession(blocked, TODAY).offers).toHaveLength(1);
    expect(saveSession(blocked, s0)).toBe("unavailable");
    expect(saveSession(undefined, s0)).toBe("unavailable");
  });
});

describe("recovery: nothing saved is lost (audit C22, C23)", () => {
  const memory = (entries: Array<[string, string]> = []) => {
    const mem = new Map(entries);
    const store: KeyValueStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
    return { mem, store };
  };
  const s0 = reducer(initialSession(TODAY), { type: "loadSamples", today: TODAY });
  const newer = JSON.stringify({ schemaVersion: 4, household: { filingStatus: "joint" }, offers: [{ id: "x", letter: "A", future: true }], ui: {} });

  it("a save this version reads but can't show (an empty draft) loads as it is, for the recovery screen, not set aside", () => {
    const broken = JSON.stringify({ schemaVersion: 3, household: s0.household, offers: [{ id: "mine", letter: "A", sample: null, draft: {} }], ui: s0.ui });
    const { mem, store } = memory([[STORAGE_KEY, broken]]);
    // Days off' migration (2026-10-19) once threw on it, so the save was set aside and the recovery screen never came.
    expect(load(store, TODAY).session.offers[0].draft).toEqual({});
    expect(mem.has(BACKUP_KEY)).toBe(false);
  });

  it("a newer version's save loads as a first visit, says so, and is never saved over", () => {
    const { mem, store } = memory([[STORAGE_KEY, newer]]);
    const loaded = load(store, TODAY);
    expect(loaded.newer).toBe(4);
    expect(loaded.session.offers.map((o) => o.sample)).toEqual(["sample"]);
    // Before this fix the app saved the samples over it 500 ms after loading.
    expect(saveSession(store, reducer(loaded.session, { type: "household", patch: { stayYears: 2 } }))).toBe("newer");
    expect(mem.get(STORAGE_KEY)).toBe(newer);
    // A tab still on this version, after the newer one saved in another tab: the same.
    const other = memory([[STORAGE_KEY, JSON.stringify(s0)]]);
    other.mem.set(STORAGE_KEY, newer);
    expect(saveSession(other.store, s0)).toBe("newer");
    expect(other.mem.get(STORAGE_KEY)).toBe(newer);
    // "Delete all data" is the one way to replace it, on purpose: then saving works again.
    expect(clearSession(store)).toBe(true);
    expect(saveSession(store, s0)).toBe("saved");
  });

  it("a newer version's save downloads as an export the newer version can import; anything else as it was", () => {
    const f = savedFile(newer, TODAY, new Date("2026-10-08T15:00:00Z"));
    expect(f.fileName).toBe("offer-calc-saved-2026-10-08.json");
    expect(JSON.parse(f.text)).toEqual({ format: "offer-calc", schemaVersion: 4, exportedAt: "2026-10-08T15:00:00.000Z",
      household: { filingStatus: "joint" }, offers: [{ id: "x", letter: "A", future: true }], ui: {} });
    expect(savedFile("{not json", TODAY)).toEqual({ fileName: "offer-calc-saved-2026-10-08.txt", text: "{not json" });
    // One of this version's own saves round-trips through import.
    const mine = reducer(s0, { type: "household", patch: { stayYears: 2 } });
    const r = readImport(savedFile(JSON.stringify(mine), TODAY).text);
    expect(r.ok && r.household.stayYears).toBe(2);
  });

  it("an unreadable save is set aside before anything replaces it, and \"Delete all data\" deletes that too", () => {
    const { mem, store } = memory([[STORAGE_KEY, "{not json"]]);
    expect(load(store, TODAY).newer).toBeNull();
    expect(readBackup(store)).toEqual({ on: TODAY, why: "unreadable", saved: "{not json" });
    expect(saveSession(store, s0)).toBe("saved");
    expect(readBackup(store)?.saved).toBe("{not json");
    clearSession(store);
    expect(mem.has(BACKUP_KEY)).toBe(false);
    expect(readBackup(store)).toBeNull();
  });

  it("offers saved with one id twice (an import could once do it) get ids of their own", () => {
    const twice = { ...s0, offers: s0.offers.map((o) => ({ ...o, id: "same" })) };
    const { session } = load(memory([[STORAGE_KEY, JSON.stringify(twice)]]).store, TODAY);
    expect(session.offers.map((o) => o.id)).toEqual(["same", "same'", "same''"]);
    // So an edit changes one offer, and a removal removes one.
    const edited = reducer(session, { type: "edit", id: "same'", set: { "salary.annual": 1 } });
    expect(edited.offers.map((o) => o.draft.salary.annual)).toEqual([s0.offers[0].draft.salary.annual, 1, s0.offers[2].draft.salary.annual]);
    expect(reducer(session, { type: "removeOffer", id: "same" }).offers).toHaveLength(2);
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
    expect(s.schemaVersion).toBe(3);
    expect(s.household).toEqual({ ...v1.household, pricesIn: "00000" }); // prices in the U.S. average, as before slice 8
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
  it("a slice 3-5 save (schema 2) gains Prices in at the U.S. average; a schema 3 one keeps its place, unless it's gone", () => {
    const v2 = { ...initialSession(TODAY), schemaVersion: 2, household: { filingStatus: "joint", stayYears: 5, otherWagesThisYear: 0 } };
    const load = (x: unknown) => loadSession({ getItem: () => JSON.stringify(x), setItem: () => {} }, TODAY);
    const s = load(v2);
    expect(s.schemaVersion).toBe(3);
    expect(s.household).toEqual({ filingStatus: "joint", stayYears: 5, otherWagesThisYear: 0, pricesIn: "00000" });
    expect(s.offers).toEqual(v2.offers);
    const clt = { ...initialSession(TODAY), household: { ...DEFAULT_HOUSEHOLD, pricesIn: "16740" } };
    expect(load(clt).household.pricesIn).toBe("16740");
    // A place the city list no longer has (BEA recodes metros now and then) falls back rather than failing.
    expect(load({ ...clt, household: { ...clt.household, pricesIn: "99999" } }).household.pricesIn).toBe("00000");
  });
  it("a save from before days off (2026-10-19): its weeks a year become days off that give the same weeks", () => {
    const s0 = initialSession(TODAY);
    const old = (weeks: number | null) => ({ ...s0, offers: s0.offers.map((o) => {
      const { timeOff: _, ...draft } = o.draft;
      return { ...o, draft: { ...draft, hours: { ...draft.hours, weeksPerYear: weeks } } };
    }) });
    const read = (x: unknown) => loadSession({ getItem: () => JSON.stringify(x), setItem: () => {} }, TODAY).offers[0].draft;
    // 48 weeks entered: 52 − 48 = 4 weeks off, 20 vacation days with no holidays or sick days, so 52 − 20 ÷ 5 = 48 weeks still.
    expect(read(old(48)).timeOff).toEqual({ ...blankTimeOff(), vacation: 20, holidays: 0, sick: 0 });
    expect(read(old(48)).hours).toEqual({ weekly: s0.offers[0].draft.hours.weekly });
    expect(toOfferInput({ ...s0.offers[0], draft: read(old(48)) })).toMatchObject({ offer: { timeOff: { vacation: 20, holidays: 0, sick: 0 } } });
    // None entered: every default.
    expect(read(old(null)).timeOff).toEqual(blankTimeOff());
  });
  it("a save from before the ESPP (2026-10-22) has none; one saved with it reads back", () => {
    const s0 = initialSession(TODAY);
    const read = (x: unknown) => loadSession({ getItem: () => JSON.stringify(x), setItem: () => {} }, TODAY).offers[0].draft;
    const old = { ...s0, offers: s0.offers.map((o) => { const { espp: _, ...draft } = o.draft; return { ...o, draft }; }) };
    expect(read(old).espp).toBeNull();
    const espp = { ...newEspp(), contributionPct: 0.1, offeringsStart: { month: 2, day: 1 } };
    const now = { ...s0, offers: s0.offers.map((o) => ({ ...o, draft: { ...o.draft, espp } })) };
    expect(read(now).espp).toEqual(espp);
    // None, entered: the engine gets no plan, as not entered does.
    const none = { ...s0, offers: s0.offers.map((o) => ({ ...o, draft: { ...o.draft, espp: "none" } })) };
    expect(read(none).espp).toBe("none");
    expect(toOfferInput({ ...s0.offers[0], draft: read(none) })).not.toHaveProperty("offer.espp");
    // Its terms left blank are the plan's defaults: 15% off with a lookback, 6-month offerings, here from Feb 1.
    expect(toOfferInput({ ...s0.offers[0], draft: read(now) })).toMatchObject({ offer: { espp: { contributionPct: 0.1, discount: 0.15, lookback: true,
      offeringMonths: 6, offeringsStart: { month: 2, day: 1 } } } });
  });
  it("anything else starts fresh", () => {
    expect(loadSession({ getItem: () => JSON.stringify({ schemaVersion: 9, offers: [], household: {}, ui: {} }), setItem: () => {} }, TODAY)
      .offers.map((o) => o.sample)).toEqual(["sample"]);
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
    const us = priceWords(US_PRICES);
    expect(totalsCaption("colAdjustedTotal", 4, "colAdjustedTotal", us)).toBe("4-year total after rent, in today's U.S.-average dollars, present value");
    expect(totalsCaption("cash", 2, "colAdjustedTotal", us)).toBe("2-year total after tax, in today's dollars, present value");
    expect(totalsCaption("perHour", 1, "totalRewards", us)).toBe("Per hour worked over 1 year, in total rewards, nominal");
    // Prices in Charlotte (slice 8): the dollars follow.
    expect(totalsCaption("colAdjustedTotal", 4, "colAdjustedTotal", priceWords("16740"))).toBe("4-year total after rent, in today's Charlotte dollars, present value");
    expect(totalsCaption("perHour", 3, "colAdjustedTotal", priceWords("16740"))).toBe("Per hour worked over 3 years, after rent, in Charlotte dollars, nominal");
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

describe("why Copy as document waits (copyBlock)", () => {
  const ok = { offers: 3, view: true, own: true, invalid: false, error: false, incomplete: [] as string[] };
  it("while the first results are worked out, it waits without a visible reason, so nothing moves", () => {
    expect(copyBlock({ ...ok, view: false })).toEqual({ why: "Working out the comparison…", shown: false });
    expect(copyBlock({ ...ok, own: false })).toEqual({ why: "Working out the comparison…", shown: false });
    expect(copyBlock({ ...ok, offers: 1, view: false, own: false })).toEqual({ why: "Working out the breakdown…", shown: false });
  });
  it("a problem with the offers is said beside the button", () => {
    expect(copyBlock({ ...ok, offers: 0, view: false, own: false })).toEqual({ why: "Fill in an offer to copy its breakdown.", shown: true });
    expect(copyBlock({ ...ok, invalid: true })?.why).toBe("Fix the problems listed under the verdict to copy the document.");
    expect(copyBlock({ ...ok, offers: 1, view: false, invalid: true })?.why).toBe("Fix the problems listed with its bottom line to copy the document.");
    // A stored session with a problem, before any results: the problem, not "fill in".
    expect(copyBlock({ ...ok, view: false, invalid: true })).toEqual({ why: "Fix the problems listed under the verdict to copy the document.", shown: true });
    expect(copyBlock({ ...ok, error: true })?.shown).toBe(true);
    expect(copyBlock({ ...ok, incomplete: ["C"] })).toEqual({ why: "Fill in or remove offer C to copy the comparison.", shown: true });
  });
  it("with results and no problem, it's ready; one complete offer copies its breakdown, a blank second offer or not", () => {
    expect(copyBlock(ok)).toBeNull();
    expect(copyBlock({ ...ok, offers: 1, view: false })).toBeNull();
    expect(copyBlock({ ...ok, offers: 1, view: false, incomplete: ["B"] })).toBeNull();
  });
});
