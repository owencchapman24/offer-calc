// Writes src/col/cities.json: the slim city list the UI's main thread loads (code, name, states,
// and the data vintages it shows), so the full BEA and HUD tables ship only in the engine worker.
// Usage: npm run build-cities. fetch-rpp and fetch-fmr run it after updating their data; a test
// fails if the file is out of step with rpp.json and fmr.json.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cityOptions, RPP } from "../src/col/index";
import { FMR } from "../src/col/rent";

const OUT = fileURLToPath(new URL("../src/col/cities.json", import.meta.url));
const cities = cityOptions();
const head = {
  source: "Generated from rpp.json (BEA metro and state-nonmetro areas) by scripts/build-cities.ts; do not edit.",
  rppDataYear: RPP.dataYear,
  fmrFiscalYear: FMR.fiscalYear,
};
// One city per line keeps diffs readable.
writeFileSync(OUT, `${JSON.stringify(head, null, 1).slice(0, -2)},\n "cities": [\n${cities.map((c) => `  ${JSON.stringify(c)}`).join(",\n")}\n ]\n}\n`);
console.log(`Wrote ${cities.length} cities to ${OUT}`);
