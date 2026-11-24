import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExceptions, parseReviewed, reviewFor } from "./exceptions";

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

// The review of axe's needs-review list (audit P6): every entry says what was found and when.
describe("a11y reviews", () => {
  const json = JSON.parse(readFileSync(new URL("../../test/a11y-reviewed.json", import.meta.url), "utf8"));

  it("the file in the repo parses: every entry has a rule, axe's reason, what was found and the day", () => {
    expect(parseReviewed(json).length).toBeGreaterThanOrEqual(10);
  });

  it("covers the kinds the scan's report listed as needing review on 2026-11-23", () => {
    const reviews = parseReviewed(json);
    const seen: Array<[string, string]> = [
      ["color-contrast", "Element content contains only non-text characters"],
      ["color-contrast", "Element's background color could not be determined due to a pseudo element"],
      ["color-contrast", "Element content is too short to determine if it is actual text content"],
      ["color-contrast", "Element's background color could not be determined because element contains an image node"],
      ["color-contrast", "Element's background color could not be determined because it is overlapped by another element"],
      ["color-contrast", "Element's background color could not be determined because it partially overlaps other elements"],
      ["color-contrast", "Element's background color could not be determined because it's partially obscured by another element"],
      ["target-size", "Element size could not be accurately determined due to overflow content"],
      ["target-size", "Target has insufficient space to its closest neighbors. Safe clickable space has a diameter of … instead of at least …."],
      ["target-size", "Element with negative tabindex has insufficient size (… by …, should be at least … by …). Is this a target?"],
      ["th-has-data-cells", "Table data cells are missing or empty"],
    ];
    expect(seen.filter(([rule, why]) => !reviewFor(reviews, rule, why))).toEqual([]);
    // A new kind isn't covered by an old review: the report says "not reviewed yet".
    expect(reviewFor(reviews, "color-contrast", "Element has a background image")).toBeUndefined();
  });

  it("fails an entry without what was found, or without the day", () => {
    const entry = { rule: "color-contrast", why: "Element content", reason: "Tickmark glyphs, graphite on the sheet at 8.2:1." };
    expect(() => parseReviewed({ reviewed: [{ ...entry, checked: "2026-11-23" }] })).not.toThrow();
    expect(() => parseReviewed({ reviewed: [entry] })).toThrow(/no date checked/);
    expect(() => parseReviewed({ reviewed: [{ ...entry, reason: "TODO", checked: "2026-11-23" }] })).toThrow(/in a sentence/);
    expect(() => parseReviewed({ reviewed: [{ ...entry, why: "", checked: "2026-11-23" }] })).toThrow(/no why/);
    expect(() => parseReviewed([])).toThrow(/expected/);
  });
});
