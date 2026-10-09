import { gzipSync } from "node:zlib";

// The bundle budget (docs/ui-design.md §10): the JS a quick-mode visit loads on the main thread, gzipped,
// stays at or under 120 kB. Everything else (detailed mode, the derivations, the methodology, the later
// schedules) loads on first use, and the engine lives in the worker.
//
// This check catches regressions in what we ship; Lighthouse (scripts/lib/lighthouse.ts) measures what
// users feel, the Largest Contentful Paint on a throttled phone. The budget was 110 kB until 2026-10-09,
// when it rose to 120 kB with the Lighthouse check beside it.
//
// Sizes are Node's gzip at its default level (6), in kB of 1,000 bytes. Vite 8's build report uses
// Rolldown's own compressor, which reads about 1 kB higher (108.71 kB vs 107.70 kB for the same chunk on
// 2026-10-09).

export const BUDGET_KB = 120;

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

export interface Measured { file: string; rawKb: number; gzipKb: number }

export const measure = (file: string, bytes: Uint8Array): Measured =>
  ({ file, rawKb: bytes.length / 1000, gzipKb: gzipSync(bytes).length / 1000 });

/** The files' total and whether it's within the budget. */
export function verdict(files: Measured[], budgetKb = BUDGET_KB) {
  const rawKb = files.reduce((s, f) => s + f.rawKb, 0);
  const gzipKb = files.reduce((s, f) => s + f.gzipKb, 0);
  return { rawKb, gzipKb, ok: files.length > 0 && gzipKb <= budgetKb };
}
