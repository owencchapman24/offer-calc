import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_OFFERS } from "../../src/samples";
import { compute } from "./compute";
import { exportSession, readImport } from "./exchange";
import { ASSUMPTIONS, blankOffer, shiftOffer, toHousehold, toOfferInput } from "./model";
import { Lead } from "./Lead";
import { initialSession, migrateOffer, reducer, type Session, type V1Offer } from "./session";

/** The three samples, compared ("See a sample comparison"; the first visit is sample A alone). */
const samples = (today: string) => reducer(initialSession(today), { type: "loadSamples", today });

// JSON export and import (docs/slice-3-plan.md): a round trip gives the same results; an invalid file
// lists its problems and changes nothing; an older (schema 1) export migrates.

const TODAY = "2026-10-08";
const NOW = new Date("2026-10-08T15:00:00Z");

/** The comparison's numbers for a session: what a round trip must leave unchanged. */
function results(s: Session) {
  const offers = s.offers.map((o) => {
    const r = toOfferInput(o);
    if (!("offer" in r)) throw new Error("incomplete");
    return r.offer;
  });
  return compute({
    offers: { offers, household: toHousehold(s.household, 2027), stays: [4], stayYears: 4, valuationDate: TODAY, inflation: ASSUMPTIONS.inflation,
      discountRate: ASSUMPTIONS.discountRate },
    rents: [],
  }).sweep!.rows[0].values;
}

describe("export", () => {
  it("one versioned file: format, schema version, when, a note while samples are in it; the name ends -sample then", () => {
    const { fileName, text } = exportSession(samples(TODAY), TODAY, NOW);
    expect(fileName).toBe("offer-calc-2026-10-08-sample.json");
    const file = JSON.parse(text);
    expect(file).toMatchObject({ format: "offer-calc", schemaVersion: 3, exportedAt: "2026-10-08T15:00:00.000Z",
      note: "Includes sample offers: illustrative inputs, not market data." });
    expect(Object.keys(file)).toEqual(["format", "schemaVersion", "exportedAt", "note", "household", "offers", "ui"]);
    const mine = { ...initialSession(TODAY), offers: [blankOffer("A"), blankOffer("B")] };
    expect(exportSession(mine, TODAY, NOW).fileName).toBe("offer-calc-2026-10-08.json");
    expect(JSON.parse(exportSession(mine, TODAY, NOW).text).note).toBeUndefined();
  });
});

describe("import", () => {
  it("a round trip gives the same offers, About you and results", () => {
    let s = samples(TODAY);
    s = reducer(s, { type: "edit", id: s.offers[2].id, set: { "health.premium": 1_500, "retirement.vesting": { kind: "cliff", years: 2 }, "timeOff.vacation": 15, "timeOff.gives": 20, "timeOff.payout": "always" } });
    s = reducer(s, { type: "household", patch: { stayYears: 3, healthUsage: "high", pricesIn: "16740" } });
    expect(JSON.parse(exportSession(s, TODAY, NOW).text).household.pricesIn).toBe("16740");
    // A spouse's wages (2026-10-14) round-trip; exports from before them import as none.
    const joint = reducer(s, { type: "household", patch: { filingStatus: "joint", spouseWages: 65_000 } });
    const read = readImport(exportSession(joint, TODAY, NOW).text);
    expect(read.ok && read.household).toMatchObject({ filingStatus: "joint", spouseWages: 65_000 });
    const r = readImport(exportSession(s, TODAY, NOW).text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offers).toEqual(s.offers);
    expect(r.household).toEqual(s.household);
    const back = reducer(samples(TODAY), { type: "replace", household: r.household, offers: r.offers, ui: r.ui });
    expect(results(back)).toEqual(results(s));
    expect(back.ui.basis).toBe(s.ui.basis);
  });

  it("an export from before days off (2026-10-19) imports its weeks a year as days off that give the same weeks", () => {
    const file = JSON.parse(exportSession(samples(TODAY), TODAY, NOW).text);
    for (const o of file.offers) { delete o.draft.timeOff; o.draft.hours.weeksPerYear = 50; }
    const r = readImport(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 52 − 50 = 2 weeks off: 10 vacation days and no holidays or sick days, so 52 − 10 ÷ 5 = 50 weeks still.
    for (const o of r.offers) {
      expect(o.draft.timeOff).toMatchObject({ vacation: 10, holidays: 0, sick: 0, policy: null, gives: null, cap: null, payout: null });
      expect(o.draft.hours).not.toHaveProperty("weeksPerYear");
    }
    // An export with neither weeks nor days off: every default.
    for (const o of file.offers) delete o.draft.hours.weeksPerYear;
    const none = readImport(JSON.stringify(file));
    expect(none.ok && none.offers.map((o) => o.draft.timeOff.vacation)).toEqual([null, null, null]);
  });

  it("an invalid file lists its problems and changes nothing", () => {
    const good = JSON.parse(exportSession(samples(TODAY), TODAY, NOW).text);
    const bad = (f: (x: typeof good) => void) => { const x = structuredClone(good); f(x); return JSON.stringify(x); };
    const cases: Array<[string, string, string]> = [
      ["not JSON", "{oops", "This file isn't JSON, so it isn't an Offer Calc export."],
      ["another format", JSON.stringify({ format: "something", offers: [] }), "This isn't an Offer Calc export: it doesn't say \"format\": \"offer-calc\"."],
      ["a newer schema", bad((x) => { x.schemaVersion = 9; }), "This export's schema version (9) is newer than this app knows: 1 to 3."],
      ["prices in a place that isn't in the list", bad((x) => { x.household.pricesIn = "Charlotte"; }),
        "household.pricesIn: should be \"00000\" (the U.S. average) or a BEA area code from the city list."],
      ["prices in missing (schema 3)", bad((x) => { delete x.household.pricesIn; }),
        "household.pricesIn: should be \"00000\" (the U.S. average) or a BEA area code from the city list."],
      ["a salary that isn't a number", bad((x) => { x.offers[0].draft.salary.annual = "lots"; }), "offers.0.draft.salary.annual: should be a number."],
      ["a missing field", bad((x) => { delete x.offers[1].draft.hours; }), "offers.1.draft.hours: should be present."],
      ["a letter twice", bad((x) => { x.offers[1].letter = "A"; }), "offers.1.letter: A appears twice."],
      // Offers are edited and removed by id: with one id twice, an edit to A changed B too, and removing A removed both (audit C25).
      ["an id twice", bad((x) => { x.offers[1].id = x.offers[0].id; }), "offers.1.id: \"sample-A\" appears twice; each offer needs its own."],
      ["four offers", bad((x) => { x.offers.push(x.offers[0]); }), "offers: 4 offers; the app holds 1 to 3."],
      ["a bad stay", bad((x) => { x.household.stayYears = 0; }), "household.stayYears: should be a whole number of years from 1 to 10."],
      ["inside Philadelphia, not yes or no", bad((x) => { x.offers[0].draft.residence.philadelphia = "maybe"; }),
        "offers.0.draft.residence.philadelphia: should be true or false."],
      ["a spouse's wages below $0", bad((x) => { x.household.spouseWages = -1; }), "household.spouseWages: should be an amount of $0 or more."],
      ["a 401(k) that's neither", bad((x) => { x.offers[0].draft.retirement = "maybe"; }), "offers.0.draft.retirement: should be \"none\" or a 401(k) plan."],
    ];
    for (const [name, text, problem] of cases) {
      const r = readImport(text);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.problems, name).toContain(problem);
    }
    // Nothing is replaced unless the import is ok: the page dispatches "replace" only for an ok file.
  });

  it("a schema 2 export (slices 3-5) migrates: prices in the U.S. average, everything else as it was", () => {
    const file = JSON.parse(exportSession(samples(TODAY), TODAY, NOW).text);
    delete file.household.pricesIn;
    const r = readImport(JSON.stringify({ ...file, schemaVersion: 2 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(2);
    expect(r.household).toEqual(samples(TODAY).household);
    expect(r.offers).toEqual(samples(TODAY).offers);
  });

  it("an older (schema 1) export migrates: each offer as the v1 app would have computed it", () => {
    const o = shiftOffer(SAMPLE_OFFERS[1], 1);
    const v1: V1Offer = {
      id: "sample-B", letter: "B", sample: "edited", base: o,
      quick: { label: "Charlotte corp", salary: 85_000, bonus: { kind: "percent", value: 10 }, area: "16740", state: "NC", nyc: false,
        startDate: o.startDate, rent: 1_650 },
    };
    const mine: V1Offer = { id: "A-1", letter: "A", sample: null,
      quick: { label: "Mine", salary: 95_000, bonus: { kind: "amount", value: 8_000 }, area: "16740", state: "SC", nyc: true, startDate: "2027-09-01", rent: null } };
    const r = readImport(JSON.stringify({ format: "offer-calc", schemaVersion: 1, exportedAt: NOW.toISOString(),
      household: { filingStatus: "single", stayYears: 4, otherWagesThisYear: 0 }, offers: [v1, mine] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(1);
    expect(r.household.pricesIn).toBe("00000"); // before slice 8, prices were always the U.S. average
    expect(r.offers).toEqual([migrateOffer(mine), migrateOffer(v1)]); // sorted by letter
    expect(r.offers[1].draft.salary.annual).toBe(85_000);
  });

  it("after an import with a problem, the lead says what to fix and doesn't say it's working: the comparison waits", () => {
    const issue = { code: "trancheSum", path: "equity.grants.0.schedule.tranches", params: { sum: 0.95 } } as const;
    const lead = (issues: Parameters<typeof Lead>[0]["issues"]) => renderToStaticMarkup(createElement(Lead, {
      view: null, letters: ["A", "B", "C"], stayYears: 4, updating: false, error: null, notes: [], sample: false, dispatch: () => {}, issues,
    }));
    const waiting = lead({ C: [issue] });
    expect(waiting).toContain("Nothing to work out yet.");
    expect(waiting).not.toContain("Working out the comparison");
    // With nothing to fix, no results yet means the worker is on it.
    expect(lead({})).toContain("Working out the comparison");
  });

  it("\"Delete all data\" goes back to the first visit, with the samples", () => {
    const edited = reducer(initialSession(TODAY), { type: "startBlank" });
    expect(reducer(edited, { type: "reset", today: TODAY })).toEqual({ ...initialSession(TODAY), revision: 1 }); // results from before don't apply
  });
});
