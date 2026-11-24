import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import cities from "../../src/col/cities.json";
import { BASE_YEAR } from "../../src/tax/params/index";

// The tax base year (BASE_YEAR, src/tax/params/index.ts) as the app and the engine say it (audit C28). It was typed as "2026" in about a
// dozen places, which the base-year move would have left behind: the first date accepted, "2026 tax law", "projected from 2026". Each
// now follows BASE_YEAR (the main thread through the city list's copy, DATA_YEARS.tax). This fails on one typed in again.

const ROOT = resolve(import.meta.dirname, "../..");
const DIRS = ["app/src", "src/offer", "src/format", "src/tax/index.ts"];
const SKIP = /\.test\.tsx?$|[\\/](testing|arbitrary)\.ts$/;
/** How the base year was written as a literal: a year after one of these phrases, or a date's minimum. */
const LITERAL = new RegExp([
  String.raw`projected from 20\d\d`, String.raw`20\d\d tax law`, String.raw`tax law 20\d\d`, String.raw`20\d\d law, later`,
  String.raw`held at 20\d\d`, String.raw`after 20\d\d (are|is) projected`, String.raw`before 20\d\d aren't supported`,
  String.raw`min="20\d\d-`, String.raw`yearOfDay\([^)]*\) < 20\d\d`, String.raw`toDays\("20\d\d-01-01"\)`,
].join("|"));

function files(path: string): string[] {
  const full = resolve(ROOT, path);
  if (/\.tsx?$/.test(path)) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(relative(ROOT, join(full, e.name)))
    : /\.tsx?$/.test(e.name) && !SKIP.test(e.name) ? [join(full, e.name)] : []));
}

describe("the tax base year follows BASE_YEAR (audit C28)", () => {
  it("the main thread's copy, in the city list, is the engine's", () => {
    expect(cities.taxBaseYear).toBe(BASE_YEAR);
  });

  it("no source file types the base year where it should follow BASE_YEAR", () => {
    const found = DIRS.flatMap(files).flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/)
      .flatMap((line, i) => (LITERAL.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line) ? [`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`] : [])));
    expect(found).toEqual([]);
  });
});
