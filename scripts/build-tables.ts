// Writes the engine's BEA and HUD tables, src/col/rpp.engine.json and fmr.engine.json: the fields the engine reads, from
// rpp.json and fmr.json as fetched (scripts/lib/tables.ts says what's left out, and why). Then the slim city list.
// Usage: npm run build-tables. fetch-rpp and fetch-fmr run it after updating their data; a test fails if either table is
// out of step with the record (it builds them as this does, with engineTables, and compares the files byte for byte).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { engineTables } from "./lib/tables";

const at = (name: string) => fileURLToPath(new URL(`../src/col/${name}`, import.meta.url));
const read = (name: string) => readFileSync(at(name), "utf8");
for (const [name, json] of Object.entries(engineTables(read("rpp.json"), read("fmr.json")))) {
  writeFileSync(at(name), json);
  console.log(`Wrote ${Object.keys((JSON.parse(json) as { areas: object }).areas).length} areas to src/col/${name}`);
}

// Then the slim city list, from the tables just written: build-cities imports the engine only now, so it reads them.
await import("./build-cities");
