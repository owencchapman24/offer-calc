// Writes the engine's BEA and HUD tables, src/col/rpp.engine.json and fmr.engine.json: the fields the engine reads, from
// rpp.json and fmr.json as fetched (scripts/lib/tables.ts says what's left out, and why). Then the slim city list.
// Usage: npm run build-tables. fetch-rpp and fetch-fmr run it after updating their data; a test fails if either table is
// out of step with the record.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { engineFmr, engineRpp, type FmrFile, type RppFile, tableJson } from "./lib/tables";

const at = (name: string) => fileURLToPath(new URL(`../src/col/${name}`, import.meta.url));
const read = <T>(name: string) => JSON.parse(readFileSync(at(name), "utf8")) as T;
const rpp = engineRpp(read<RppFile>("rpp.json"));
const fmr = engineFmr(read<FmrFile>("fmr.json"));
writeFileSync(at("rpp.engine.json"), tableJson(rpp));
writeFileSync(at("fmr.engine.json"), tableJson(fmr));
console.log(`Wrote ${Object.keys(rpp.areas).length} BEA areas to src/col/rpp.engine.json and ${Object.keys(fmr.areas).length} HUD `
  + "areas to src/col/fmr.engine.json");

// Then the slim city list, from the tables just written: build-cities imports the engine only now, so it reads them.
await import("./build-cities");
