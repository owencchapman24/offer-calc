// Fails if the JS a quick-mode visit loads on the main thread is over budget or in more than one chunk, or if what the
// worker loads before its first answer is over its budget; reports the stylesheet and what the worker loads on first use
// (scripts/lib/bundle.ts).
// Run after `npm run build`: `npm run check-bundle`. CI runs it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUDGET_KB, entryScripts, measure, stylesheets, total, verdict, WORKER_BUDGET_KB, workerChunks, workerScripts, type Measured,
} from "./lib/bundle";

const dist = process.argv[2] ?? "dist";
const read = (src: string) => readFileSync(join(dist, src.replace(/^\//, "")));
const text = (src: string) => read(src).toString("utf8");
const html = readFileSync(join(dist, "index.html"), "utf8");
const main = entryScripts(html).map((src) => measure(src, read(src)));
const chunks = [...new Set(main.flatMap((f) => workerScripts(text(f.file))))].map((src) => workerChunks(src, text));
const workers = [...new Set(chunks.flatMap((c) => c.first))].map((src) => measure(src, read(src)));
const later = [...new Set(chunks.flatMap((c) => c.later))].map((src) => measure(src, read(src)));
const css = stylesheets(html).map((src) => measure(src, read(src)));
const v = verdict(main, workers);

const kb = (f: { rawKb: number; gzipKb: number }) => `${f.rawKb.toFixed(2)} kB raw, ${f.gzipKb.toFixed(2)} kB gzip`;
const list = (files: Measured[]) => files.map((f) => `\n  ${f.file}  ${kb(f)}`).join("");
console.log(`Main thread, a quick-mode visit: ${kb(v.main)} (budget ${BUDGET_KB} kB gzip, one chunk)${list(main)}`);
console.log(`Stylesheet, render-blocking (reported, not budgeted): ${kb(total(css))}${list(css)}`);
console.log(`Worker, before the first answer: ${kb(v.worker)} (budget ${WORKER_BUDGET_KB} kB gzip)${list(workers)}`);
console.log(`Worker, loaded on first use (reported, not budgeted): ${kb(total(later))}${list(later)}`);
if (!v.ok) {
  console.error(`\nBundle check failed:\n${v.problems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("Bundle check: passed.");
