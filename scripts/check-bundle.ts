// Fails if the JS a quick-mode visit loads on the main thread is over budget (scripts/lib/bundle.ts).
// Run after `npm run build`: `npm run check-bundle`. CI runs it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET_KB, entryScripts, measure, verdict } from "./lib/bundle";

const dist = process.argv[2] ?? "dist";
const files = entryScripts(readFileSync(join(dist, "index.html"), "utf8"))
  .map((src) => measure(src, readFileSync(join(dist, src.replace(/^\//, "")))));
const v = verdict(files);
for (const f of files) console.log(`${f.file}  ${f.rawKb.toFixed(2)} kB raw, ${f.gzipKb.toFixed(2)} kB gzip`);
const line = `Main thread, quick-mode visit: ${v.rawKb.toFixed(2)} kB raw, ${v.gzipKb.toFixed(2)} kB gzip (budget ${BUDGET_KB} kB gzip).`;
if (!v.ok) {
  console.error(`Bundle check failed. ${files.length ? line : "No entry scripts found in index.html."}\n`
    + "Load the new code on first use (see app/src/lazy.ts), or make room before raising the budget.");
  process.exit(1);
}
console.log(`Bundle check: ${line}`);
