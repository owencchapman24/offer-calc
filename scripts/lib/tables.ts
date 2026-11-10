import type { RppData, RppKind } from "../../src/col/index";
import type { FmrData } from "../../src/col/rent";

// The engine's BEA and HUD tables (src/col/rpp.engine.json and fmr.engine.json): the fields it reads, taken from the files
// as fetched (src/col/rpp.json and fmr.json, the record, which fetch-rpp and fetch-fmr write). The worker bundles only
// these, and the first answer waits for the worker, so what the engine doesn't read is left out: BEA's goods, utilities and
// other services (the non-housing price level needs all items and housing alone), HUD's studio and 2-4 bedroom rents (the
// rent estimate is always 1 bedroom), and the files' notes on their sources (the record keeps them). Every row stays.
// scripts/build-tables.ts writes them; scripts/lib/tables.test.ts fails if they're out of step with the record.

/** src/col/rpp.json as scripts/fetch-rpp.ts writes it. */
export interface RppFile {
  source: string;
  files: string[];
  vintage: string;
  dataYear: number;
  fetchedOn: string;
  delineation: string;
  components: Record<string, string>;
  scale: string;
  nonHousing: { formula: string; housingWeight: number; source: string; crossCheck: string };
  areas: Record<string, {
    name: string; kind: RppKind; allItems: number; goods: number; housing: number; utilities: number; otherServices: number;
  }>;
}

/** src/col/fmr.json as scripts/fetch-fmr.ts writes it: `fmr` is studio to 4 bedrooms. */
export interface FmrFile {
  source: string;
  url: string;
  fiscalYear: number;
  effective: string;
  published: string | null;
  fetchedOn: string;
  definition: string;
  bedrooms: string[];
  areas: Record<string, { name: string; cbsa: string; states: string[]; pop: number; fmr: number[] }>;
}

const each = <T, U>(areas: Record<string, T>, f: (a: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(areas).map(([code, a]) => [code, f(a)]));

export function engineRpp(f: RppFile): RppData {
  return {
    source: "Generated from rpp.json by scripts/build-tables.ts: the fields the engine reads; do not edit.",
    dataYear: f.dataYear,
    vintage: f.vintage,
    nonHousing: { formula: f.nonHousing.formula, housingWeight: f.nonHousing.housingWeight },
    areas: each(f.areas, (a) => ({ name: a.name, kind: a.kind, allItems: a.allItems, housing: a.housing })),
  };
}

export function engineFmr(f: FmrFile): FmrData {
  const oneBedroom = f.bedrooms.indexOf("1 bedroom");
  if (oneBedroom !== 1) throw new Error(`fmr.json's bedrooms should be studio first, then 1 bedroom: ${f.bedrooms.join(", ")}`);
  return {
    source: "Generated from fmr.json by scripts/build-tables.ts: the fields the engine reads; do not edit.",
    fiscalYear: f.fiscalYear,
    areas: each(f.areas, (a) => ({ name: a.name, cbsa: a.cbsa, states: a.states, pop: a.pop, oneBedroom: a.fmr[oneBedroom] })),
  };
}

/**
 * A table as JSON, one area per line (so a refresh reads as a diff), in the order the fetch scripts write the record. Read
 * back, its areas come in the record's order too (codes that are whole numbers, as "10180", first: JSON.parse's order).
 */
export function tableJson(t: { areas: Record<string, unknown> }): string {
  const { areas, ...head } = t;
  const lines = Object.entries(areas).sort(([a], [b]) => a.localeCompare(b))
    .map(([code, a]) => `  ${JSON.stringify(code)}: ${JSON.stringify(a)}`);
  return `${JSON.stringify(head, null, 1).slice(0, -2)},\n "areas": {\n${lines.join(",\n")}\n }\n}\n`;
}

/** The engine's tables, file name to contents, from the record's files as text: what build-tables writes, and its test reads. */
export function engineTables(rppJson: string, fmrJson: string): Record<"rpp.engine.json" | "fmr.engine.json", string> {
  return {
    "rpp.engine.json": tableJson(engineRpp(JSON.parse(rppJson) as RppFile)),
    "fmr.engine.json": tableJson(engineFmr(JSON.parse(fmrJson) as FmrFile)),
  };
}
