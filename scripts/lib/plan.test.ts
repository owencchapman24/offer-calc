import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// v2's plan, CLAUDE.md and the audit agree on the audit's "fix before v2" items (audit D8). The plan restated which were
// still to do and went stale as they were fixed; now each item is in one place on each side, and this test ties them:
// - the audit's table: every "fix before v2" item;
// - CLAUDE.md section 2: those merged; section 3, "Now": those still open;
// - the plan's "Before stop 5A": the items the offer breakdown leans on, each with the pull request that did it.

const ROOT = resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
const between = (text: string, from: string, to: string) => {
  const i = text.indexOf(from);
  expect(i, `"${from}"`).toBeGreaterThanOrEqual(0);
  const j = text.indexOf(to, i + from.length);
  return text.slice(i + from.length, j === -1 ? undefined : j);
};

/** Audit IDs in `text`, ranges spelled out: "C3-C5" is C3, C4 and C5. */
function ids(text: string): string[] {
  return [...text.matchAll(/\b([CTHSPD])(\d+)(?:-\1?(\d+))?\b/g)].flatMap(([, k, a, b]) =>
    Array.from({ length: (b ? Number(b) : Number(a)) - Number(a) + 1 }, (_, i) => `${k}${Number(a) + i}`));
}

const audit = read("docs/audit-2026-10.md");
const claude = read("CLAUDE.md");
const plan = read("docs/v2-plan.md");

const BEFORE_V2 = between(audit, "**Fix before v2**", "**Fix before going public**").split("\n")
  .flatMap((l) => /^\| ([A-Z]\d+) \|/.exec(l)?.[1] ?? []);
const MERGED = ids(between(claude, "- **The October 2026 audit**", "What's left"));
const OPEN = between(claude, "**The audit's other open \"fix before v2\" items**", "\n\n").split("\n")
  .flatMap((l) => /^- \*\*([A-Z]\d+)\*\*/.exec(l)?.[1] ?? []);
const PLAN_ROWS = between(plan, "| Audit | What item 5 needs from it | Done |\n|---|---|---|\n", "\n\n").split("\n")
  .filter((l) => l.startsWith("| "));

describe("the audit's fix-before-v2 items", () => {
  it("are read from the audit's table", () => {
    expect(BEFORE_V2).toContain("T5");
    expect(BEFORE_V2.length).toBeGreaterThan(25);
  });

  it("are each either merged (CLAUDE.md section 2) or open (section 3), not both and not neither", () => {
    for (const id of BEFORE_V2) {
      expect([MERGED.includes(id), OPEN.includes(id)].filter(Boolean), id).toHaveLength(1);
    }
    expect(OPEN.filter((id) => !BEFORE_V2.includes(id)), "open items the audit doesn't rank fix before v2").toEqual([]);
  });

  it("the plan waits on are done, each by a pull request, as CLAUDE.md says", () => {
    expect(PLAN_ROWS.length).toBeGreaterThan(0);
    for (const row of PLAN_ROWS) {
      const [item, , done] = row.replace(/^\| | \|$/g, "").split(" | ");
      expect(done, row).toMatch(/^#\d+$/);
      for (const id of ids(item)) expect(MERGED, `${id}: the plan says ${done} did it`).toContain(id);
    }
  });

  it("the plan names as open are CLAUDE.md's open ones", () => {
    const sentence = between(plan.replace(/\s+/g, " "), "The audit's other open \"fix before v2\" items (", ")");
    expect(ids(sentence)).toEqual(OPEN);
  });
});
