import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The docs say what they are (audit D7): CLAUDE.md's index (section 11) lists every doc with its status, a doc the index calls
// historical says so at its head, and a citation of a doc's section ("docs/ui-design.md §4.8") names a section it has. A
// historical doc read as a spec, or a citation of a section that a revision moved, is how the docs drift from the code.

const ROOT = resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const DOCS = readdirSync(join(ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`);

/** CLAUDE.md's docs index: each doc it names, with its row's status (the last cell). */
function docsIndex(): Map<string, string> {
  const md = read("CLAUDE.md");
  const section = md.slice(md.indexOf("\n## 11. Docs"));
  const out = new Map<string, string>();
  for (const row of section.split("\n").filter((l) => l.startsWith("| `"))) {
    const cells = row.split(" | ");
    for (const [, doc] of cells[0].matchAll(/`([^`]+\.md)`/g)) out.set(doc, cells[cells.length - 1].replace(/ \|$/, ""));
  }
  return out;
}

/** A doc's section numbers, from its headings: "## 4. Results" is 4, "### 4.8 L-6" is 4.8, "### 12b. Offer model" is 12b. */
function sections(doc: string): Set<string> {
  return new Set([...read(doc).matchAll(/^#{2,4} (\d+(?:\.\d+)*[a-z]?)[.\s]/gm)].map((m) => m[1]));
}

/** Files that cite docs: the code, the tests, the scripts and the docs themselves. */
function citing(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const path = `${dir}/${f}`;
    if (f === "node_modules" || f.startsWith(".")) return [];
    if (statSync(join(ROOT, path)).isDirectory()) return citing(path);
    return /\.(ts|tsx|md|yml)$/.test(f) ? [path] : [];
  });
}

describe("the docs", () => {
  const index = docsIndex();

  it("are each in CLAUDE.md's index, and each doc it names exists", () => {
    expect(DOCS.filter((d) => !index.has(d)), "docs missing from the index").toEqual([]);
    expect([...index.keys()].filter((d) => !DOCS.includes(d) && d !== "README.md"), "indexed docs that don't exist").toEqual([]);
  });

  it("say at their head that they're historical, when the index says so", () => {
    const historical = [...index].filter(([, status]) => /^Historical/.test(status)).map(([d]) => d);
    expect(historical).toEqual(expect.arrayContaining(["docs/ui-design.md", "docs/offer-model.md"]));
    for (const doc of historical) {
      const head = read(doc).split("\n").slice(0, 5).join("\n");
      expect(head, doc).toMatch(/^# .*historical\)$/m);
      expect(head, doc).toMatch(/^\*\*Status \(\d{4}-\d{2}-\d{2}\): historical/m);
    }
  });

  it("are cited by sections they have", () => {
    const files = [...citing("src"), ...citing("app/src"), ...citing("scripts"), ...citing("test"), ...citing("e2e"),
      ...citing("docs"), ...citing(".github"), "CLAUDE.md", "README.md"];
    const broken: string[] = [];
    let found = 0;
    for (const file of files) {
      for (const m of read(file).matchAll(/(docs\/[\w.-]+\.md),? §(\d+(?:\.\d+)*[a-z]?)/g)) {
        found++;
        if (!sections(m[1]).has(m[2])) broken.push(`${file}: ${m[1]} §${m[2]}`);
      }
    }
    expect(found).toBeGreaterThan(50);
    expect(broken).toEqual([]);
  });
});
