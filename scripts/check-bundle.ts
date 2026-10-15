// Fails if the JS a quick-mode visit loads on the main thread is over budget or in more than one chunk, or if the
// worker is over its budget; reports the stylesheet (scripts/lib/bundle.ts).
// Run after `npm run build`: `npm run check-bundle`. CI runs it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET_KB, entryScripts, measure, stylesheets, total, verdict, WORKER_BUDGET_KB, workerScripts, type Measured } from "./lib/bundle";

const dist = process.argv[2] ?? "dist";
const read = (src: string) => readFileSync(join(dist, src.replace(/^\//, "")));
const html = readFileSync(join(dist, "index.html"), "utf8");
const main = entryScripts(html).map((src) => measure(src, read(src)));
const workers = [...new Set(main.flatMap((f) => workerScripts(read(f.file).toString("utf8"))))].map((src) => measure(src, read(src)));
const css = stylesheets(html).map((src) => measure(src, read(src)));
const v = verdict(main, workers);

const kb = (f: { rawKb: number; gzipKb: number }) => `${f.rawKb.toFixed(2)} kB raw, ${f.gzipKb.toFixed(2)} kB gzip`;
const list = (files: Measured[]) => files.map((f) => `\n  ${f.file}  ${kb(f)}`).join("");
console.log(`Main thread, a quick-mode visit: ${kb(v.main)} (budget ${BUDGET_KB} kB gzip, one chunk)${list(main)}`);
console.log(`Stylesheet, render-blocking (reported, not budgeted): ${kb(total(css))}${list(css)}`);
console.log(`Worker, before the first answer: ${kb(v.worker)} (budget ${WORKER_BUDGET_KB} kB gzip)${list(workers)}`);
if (!v.ok) {
  console.error(`\nBundle check failed:\n${v.problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("Bundle check: passed.");
