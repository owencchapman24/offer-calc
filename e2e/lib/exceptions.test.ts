import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExceptions } from "./exceptions";

// The scan's exceptions file must give every entry a reason (docs/ui-slices-4-8-plan.md, decision 4).

describe("a11y exceptions", () => {
  it("the file in the repo parses: every entry has a rule, a selector and a reason", () => {
    const json = JSON.parse(readFileSync(new URL("../../test/a11y-exceptions.json", import.meta.url), "utf8"));
    expect(() => parseExceptions(json)).not.toThrow();
  });

  it("fails an entry without a reason, or with a placeholder for one", () => {
    const entry = { rule: "color-contrast", selector: ".x" };
    expect(() => parseExceptions({ exceptions: [entry] })).toThrow(/entry 1 \(color-contrast\): no reason/);
    expect(() => parseExceptions({ exceptions: [{ ...entry, reason: "  " }] })).toThrow(/no reason/);
    expect(() => parseExceptions({ exceptions: [{ ...entry, reason: "TODO: check this later on" }] })).toThrow(/isn't a reason/);
    expect(() => parseExceptions({ exceptions: [{ ...entry, reason: "too short" }] })).toThrow(/isn't a reason/);
  });

  it("fails an entry without a rule or a selector, and lists every bad entry", () => {
    const good = { rule: "target-size", selector: ".y", reason: "Inline in a sentence, so the spacing exception applies." };
    expect(() => parseExceptions({ exceptions: [good, { selector: ".x", reason: good.reason }, { rule: "r", reason: good.reason }] }))
      .toThrow(/entry 2: no rule\.\n.*entry 3: no selector\./);
    expect(parseExceptions({ exceptions: [good] })).toEqual([good]);
  });

  it("fails a file that isn't a list of exceptions", () => {
    expect(() => parseExceptions([])).toThrow(/expected/);
    expect(() => parseExceptions(null)).toThrow(/expected/);
  });
});
