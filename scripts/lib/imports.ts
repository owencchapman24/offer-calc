import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// The app's import graph, read from the source: enough to check the rules that keep the main thread in one chunk and free of
// the engine (CLAUDE.md, Bundles; scripts/lib/imports.test.ts). A module is a file path (forward slashes), or "pkg:<name>"
// for a package.

export interface Import { specifier: string; typeOnly: boolean; dynamic: boolean }

/**
 * A module's imports and re-exports, as written at the start of a line, and its dynamic imports. Type-only ones (`import type`,
 * `export type`, or braces whose every name is `type`) are erased by the build, so they reach nothing at run time.
 */
export function importsOf(source: string): Import[] {
  const out: Import[] = [];
  for (const m of source.matchAll(/^(?:import|export)\s+(type\s+)?([^;=()]*?)\s*from\s*["']([^"']+)["']/gm)) {
    const names = m[2].match(/^\{([\s\S]*)\}$/)?.[1].split(",").map((n) => n.trim()).filter(Boolean);
    const typeOnly = Boolean(m[1]) || (names !== undefined && names.length > 0 && names.every((n) => n.startsWith("type ")));
    out.push({ specifier: m[3], typeOnly, dynamic: false });
  }
  for (const m of source.matchAll(/^import\s*["']([^"']+)["']/gm)) out.push({ specifier: m[1], typeOnly: false, dynamic: false });
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push({ specifier: m[1], typeOnly: false, dynamic: true });
  return out;
}

const norm = (p: string) => p.replace(/\\/g, "/");
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** A specifier as seen from `from`: a file in the repo, or "pkg:<name>" (a package, by its name and subpath). */
export function resolveImport(specifier: string, from: string): string {
  if (!specifier.startsWith(".")) return `pkg:${specifier}`;
  const base = resolve(dirname(from), specifier);
  for (const ext of EXTENSIONS) {
    const p = base + ext;
    if (existsSync(p) && !p.endsWith("/") && (ext !== "" || /\.\w+$/.test(p))) return norm(p);
  }
  throw new Error(`Can't resolve "${specifier}" from ${from}.`);
}

/** Everything a module reaches through run-time static imports (not type-only, not dynamic), itself included. */
export function closure(file: string): Set<string> {
  const seen = new Set<string>();
  const visit = (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    if (f.startsWith("pkg:") || !/\.tsx?$/.test(f)) return;
    for (const i of importsOf(readFileSync(f, "utf8"))) if (!i.typeOnly && !i.dynamic) visit(resolveImport(i.specifier, f));
  };
  visit(norm(resolve(file)));
  return seen;
}

/** The modules loaded on first use: every dynamic import's target among `files`' imports. */
export function dynamicTargets(files: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    if (f.startsWith("pkg:") || !/\.tsx?$/.test(f)) continue;
    for (const i of importsOf(readFileSync(f, "utf8"))) if (i.dynamic) out.add(resolveImport(i.specifier, f));
  }
  return out;
}
