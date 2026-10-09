import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { HELP, helpKey } from "./help";
import { SECTIONS } from "./sections";
import { context, renderAllInputs } from "./testing";

// Help on every input (docs/ui-design.md §3.5): a hint of 12 words or fewer, 2-4 sentences behind the ⓘ,
// and a methodology section. This renders every view of the inputs (About you, quick mode, each detailed
// section and each row editor) and fails if any input lacks them.

const words = (s: string) => s.trim().split(/\s+/).length;
/** Sentences: a full stop, question or exclamation mark followed by a space and a capital, or the end. */
const sentences = (s: string) => (s.replace(/U\.S\./g, "US").match(/[.!?](?=\s+[A-Z"(]|\s*$)/g) ?? []).length;

describe("help on every input", () => {
  // The samples, with C's vesting entered as your own tranches and company vest dates on the refreshers, so every editor's fields render.
  const custom = context("colAdjustedTotal", (os) => os.map((o) => (o.letter !== "C" ? o : { ...o, draft: { ...o.draft, equity: {
    ...o.draft.equity,
    grants: o.draft.equity.grants.map((g) => ({ ...g, schedule: { ...g.schedule, tranches: [{ month: 12, fraction: 0.5 }, { month: 24, fraction: 0.5 }] } })),
    refreshers: { ...o.draft.equity.refreshers!, schedule: { tranches: [{ month: 12, fraction: 1 }], vestDates: { months: [3, 9], day: 1 } } },
  } } })));
  const html = renderAllInputs(custom);
  const fields = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);

  it("every rendered input names its help, and the help is there", () => {
    expect(fields.length).toBeGreaterThan(20);
    const missing = fields.filter((f) => !/data-help="([^"]+)"/.test(f) || !HELP[f.match(/data-help="([^"]+)"/)![1]]);
    expect(missing, "inputs without help").toEqual([]);
  });

  it("every help entry has a hint of 12 words or fewer, 2-4 sentences of help, and a methodology section", () => {
    for (const [key, h] of Object.entries(HELP)) {
      expect(words(h.hint), `${key}: hint "${h.hint}"`).toBeLessThanOrEqual(12);
      const n = sentences(h.help);
      expect(n >= 2 && n <= 4, `${key}: ${n} sentences in "${h.help}"`).toBe(true);
      expect(SECTIONS[h.section], `${key}: section ${h.section}`).toBeTruthy();
    }
  });

  it("inputs point at their hint (aria-describedby)", () => {
    const loose = fields.filter((f) => !/type="checkbox"/.test(f) && !/aria-describedby="hint-/.test(f));
    expect(loose, "inputs without aria-describedby").toEqual([]);
  });

  it("every help entry is used: each key names a rendered field", () => {
    const used = new Set([...html.matchAll(/data-help="([^"]+)"/g)].map((m) => m[1]));
    expect(Object.keys(HELP).filter((k) => !used.has(k)), "help for no field").toEqual([]);
  });

  it("every default is for an input with help", () => {
    for (const key of Object.keys(DEFAULTS)) expect(HELP[helpKey(key)], key).toBeTruthy();
  });
});
