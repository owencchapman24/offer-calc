import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { engineFmr, engineRpp, engineTables, type FmrFile, type RppFile, tableJson } from "./tables";

// The engine's BEA and HUD tables against the record they're taken from (scripts/lib/tables.ts). If the first test fails,
// run `npm run build-tables`.
const text = (name: string) => readFileSync(new URL(`../../src/col/${name}`, import.meta.url), "utf8");
const read = <T>(name: string) => JSON.parse(text(name)) as T;
const rppFile = read<RppFile>("rpp.json");
const fmrFile = read<FmrFile>("fmr.json");
const rpp = read<ReturnType<typeof engineRpp>>("rpp.engine.json");
const fmr = read<ReturnType<typeof engineFmr>>("fmr.engine.json");

describe("the engine's tables, src/col/rpp.engine.json and fmr.engine.json", () => {
  it("are what build-tables writes from rpp.json and fmr.json, byte for byte (a Windows checkout's CRLF aside)", () => {
    const built = Object.entries(engineTables(text("rpp.json"), text("fmr.json")));
    expect(built.map(([name]) => name)).toEqual(["rpp.engine.json", "fmr.engine.json"]);
    for (const [name, json] of built) expect(text(name).replace(/\r\n/g, "\n"), `${name}: run npm run build-tables`).toBe(json);
  });
  it("keep the record's order of areas (the engine walks them in it)", () => {
    expect(Object.keys(rpp.areas)).toEqual(Object.keys(rppFile.areas));
    expect(Object.keys(fmr.areas)).toEqual(Object.keys(fmrFile.areas));
  });
  it("are rebuilt by fetch-rpp and fetch-fmr, each after it writes the record", () => {
    const { scripts } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as
      { scripts: Record<string, string> };
    expect(scripts["fetch-rpp"]).toBe("tsx scripts/fetch-rpp.ts && tsx scripts/build-tables.ts");
    expect(scripts["build-tables"]).toBe("tsx scripts/build-tables.ts");
    // fetch-fmr runs it from its last line, so `npm run fetch-fmr -- <FY> --file <xlsx>` passes its arguments to fetch-fmr.
    const fetchFmr = readFileSync(new URL("../fetch-fmr.ts", import.meta.url), "utf8");
    expect(fetchFmr.trimEnd()).toMatch(/\nawait import\("\.\/build-tables"\);$/);
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
