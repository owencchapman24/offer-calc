import { gzipSync } from "node:zlib";

// The bundle budget (docs/ui-design.md §10): the JS a quick-mode visit loads on the main thread, gzipped,
// stays at or under 120 kB, in one chunk. Everything else (detailed mode, the derivations, the methodology, the
// later schedules) loads on first use, and the engine lives in the worker.
//
// One chunk: when Rolldown splits code shared by the main thread and a lazy chunk into a chunk of its own,
// index.html preloads it, and every visit pays 1-2 kB gzip more (CLAUDE.md, Bundles). So the check fails when
// index.html loads more than one script, whatever the total. scripts/lib/imports.test.ts checks the source rules
// that keep it so, where a split would come from.
//
// The worker (the engine and the BEA and HUD tables) is fetched on every visit and the first answer waits for
// it, so it has a budget of its own: 75 kB gzip (68.1 kB on 2026-10-15). The stylesheet blocks rendering; it's
// reported, not budgeted (10.2 kB gzip on 2026-10-15).
//
// This check catches regressions in what we ship; Lighthouse (scripts/lib/lighthouse.ts) measures what
// users feel, the Largest Contentful Paint on a throttled phone. The budget was 110 kB until 2026-10-09,
// when it rose to 120 kB with the Lighthouse check beside it.
//
// Sizes are Node's gzip at its default level (6), in kB of 1,000 bytes. Vite 8's build report uses
// Rolldown's own compressor, which reads about 1 kB higher (108.71 kB vs 107.70 kB for the same chunk on
// 2026-10-09).

export const BUDGET_KB = 120;
export const WORKER_BUDGET_KB = 75;

/** The JS that index.html loads up front: its module scripts and the chunks it preloads, as written. */
export function entryScripts(html: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<(script|link)\b[^>]*>/g) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    if (tag.startsWith("<script") && attr("type") === "module" && attr("src")) out.push(attr("src")!);
    else if (tag.startsWith("<link") && attr("rel") === "modulepreload" && attr("href")) out.push(attr("href")!);
  }
  return out;
}

/** The stylesheets index.html links, which block rendering. */
export function stylesheets(html: string): string[] {
  return (html.match(/<link\b[^>]*>/g) ?? [])
    .filter((tag) => /\brel="stylesheet"/.test(tag))
    .map((tag) => tag.match(/\bhref="([^"]*)"/)?.[1])
    .filter((href): href is string => href !== undefined);
}

/** The workers a chunk starts, as Vite writes them: `new Worker(new URL("/assets/engine.worker-….js", import.meta.url), …)`. */
export function workerScripts(js: string): string[] {
  return [...new Set([...js.matchAll(/new Worker\(\s*new URL\(\s*[`"']([^`"']+)[`"']/g)].map((m) => m[1]))];
}

export interface Measured { file: string; rawKb: number; gzipKb: number }

export const measure = (file: string, bytes: Uint8Array): Measured =>
  ({ file, rawKb: bytes.length / 1000, gzipKb: gzipSync(bytes).length / 1000 });

/** Files' sizes, added. */
export const total = (files: Measured[]) =>
  ({ rawKb: files.reduce((s, f) => s + f.rawKb, 0), gzipKb: files.reduce((s, f) => s + f.gzipKb, 0) });

/**
 * The main thread's scripts and the workers, totalled, and what's wrong with them: none found, more than one script on the
 * main thread, or either over its budget.
 */
export function verdict(main: Measured[], workers: Measured[], budgets = { main: BUDGET_KB, worker: WORKER_BUDGET_KB }) {
  const m = total(main);
  const w = total(workers);
  const problems: string[] = [];
  if (main.length === 0) problems.push("index.html loads no script.");
  if (main.length > 1) {
    problems.push(`index.html loads ${main.length} scripts (${main.map((f) => f.file).join(", ")}): the main thread has split into `
      + "chunks. Find the module a lazy chunk now shares with the main chunk (CLAUDE.md, Bundles; scripts/lib/imports.test.ts).");
  }
  if (m.gzipKb > budgets.main) {
    problems.push(`The main thread is ${m.gzipKb.toFixed(2)} kB gzip, over its ${budgets.main} kB budget. Load the new code on first `
      + "use (app/src/lazy.ts), or make room before raising the budget.");
  }
  if (workers.length === 0) problems.push("The main script starts no worker.");
  if (w.gzipKb > budgets.worker) {
    problems.push(`The worker is ${w.gzipKb.toFixed(2)} kB gzip, over its ${budgets.worker} kB budget: data the worker doesn't need on `
      + "every visit can be fetched when it's used (docs/v2-plan.md, the performance plan's rule 5).");
  }
  return { main: m, worker: w, problems, ok: problems.length === 0 };
}
