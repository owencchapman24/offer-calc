import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { engineFmr, engineRpp, type FmrFile, type RppFile, tableJson } from "./tables";

// The engine's BEA and HUD tables against the record they're taken from (scripts/lib/tables.ts). If the first test fails,
// run `npm run build-tables`.
const read = <T>(name: string) => JSON.parse(readFileSync(new URL(`../../src/col/${name}`, import.meta.url), "utf8")) as T;
const rppFile = read<RppFile>("rpp.json");
const fmrFile = read<FmrFile>("fmr.json");
const rpp = read<ReturnType<typeof engineRpp>>("rpp.engine.json");
const fmr = read<ReturnType<typeof engineFmr>>("fmr.engine.json");

describe("the engine's tables, src/col/rpp.engine.json and fmr.engine.json", () => {
  it("are in step with rpp.json and fmr.json, their areas in the record's order (the engine walks them in it)", () => {
    expect(rpp).toEqual(engineRpp(rppFile));
    expect(fmr).toEqual(engineFmr(fmrFile));
    expect(Object.keys(rpp.areas)).toEqual(Object.keys(rppFile.areas));
    expect(Object.keys(fmr.areas)).toEqual(Object.keys(fmrFile.areas));
  });
  it("keep every row and every figure the engine reads, as the record has it", () => {
    for (const [code, a] of Object.entries(rppFile.areas)) {
      expect(rpp.areas[code]).toEqual({ name: a.name, kind: a.kind, allItems: a.allItems, housing: a.housing });
    }
    for (const [code, a] of Object.entries(fmrFile.areas)) {
      expect(fmr.areas[code]).toEqual({ name: a.name, cbsa: a.cbsa, states: a.states, pop: a.pop, oneBedroom: a.fmr[1] });
    }
    expect([rpp.dataYear, rpp.vintage, rpp.nonHousing]).toEqual([rppFile.dataYear, rppFile.vintage,
      { formula: rppFile.nonHousing.formula, housingWeight: rppFile.nonHousing.housingWeight }]);
    expect(fmr.fiscalYear).toBe(fmrFile.fiscalYear);
  });
  it("hand-checked: HUD's FY2027, Charlotte's 1-bedroom FMR and BEA's U.S. row", () => {
    expect([fmrFile.fiscalYear, fmrFile.effective, fmr.fiscalYear]).toEqual([2027, "2026-10-01", 2027]);
    // HUD FY27_FMRs.xlsx, Charlotte-Concord-Gastonia, NC-SC HUD Metro FMR Area: studio 1,574, 1 bedroom 1,640.
    expect(fmrFile.areas.METRO16740M16740.fmr.slice(0, 2)).toEqual([1_574, 1_640]);
    expect(fmr.areas.METRO16740M16740.oneBedroom).toBe(1_640);
    // BEA 2024: U.S. all items 100, housing 100.629.
    expect(rpp.areas["00000"]).toEqual({ name: "United States", kind: "national", allItems: 100, housing: 100.629 });
  });
  it("leave out the rest: BEA's goods, utilities and other services, HUD's other sizes, the record's notes", () => {
    const fields = (t: { areas: Record<string, object> }) => new Set(Object.values(t.areas).flatMap((a) => Object.keys(a)));
    expect([...fields(rpp)]).toEqual(["name", "kind", "allItems", "housing"]);
    expect([...fields(fmr)]).toEqual(["name", "cbsa", "states", "pop", "oneBedroom"]);
    expect(Object.keys(rpp)).toEqual(["source", "dataYear", "vintage", "nonHousing", "areas"]);
    expect(Object.keys(fmr)).toEqual(["source", "fiscalYear", "areas"]);
  });
  it("refuse a record whose sizes aren't studio, then 1 bedroom", () => {
    expect(() => engineFmr({ ...fmrFile, bedrooms: ["1 bedroom", "2 bedrooms"] })).toThrow(/studio first, then 1 bedroom/);
  });
  it("write one area per line, in the record's order", () => {
    const lines = tableJson(engineRpp(rppFile)).split("\n");
    expect(lines.slice(8, 11)).toEqual([
      ' "areas": {',
      '  "00000": {"name":"United States","kind":"national","allItems":100,"housing":100.629},',
      '  "00999": {"name":"United States (Nonmetropolitan Portion)","kind":"nationalNonmetro","allItems":88.699,"housing":59.852},',
    ]);
    expect(JSON.parse(tableJson(engineFmr(fmrFile)))).toEqual(engineFmr(fmrFile));
  });
});
