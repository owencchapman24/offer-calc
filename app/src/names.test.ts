import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP, LEDGER_SECTIONS } from "./help";
import { Leaving } from "./Leaving";
import { sliderText } from "./leaveModel";
import type { LeavePanel } from "./protocol";
import { context, renderLedger, withLeave } from "./testing";
import { WorkProvider } from "./Tickmarks";

// What a screen reader hears where the screen relies on layout (slice 7): a row editor's button names its offer and row,
// since its column doesn't reach a screen reader; L-4's slider says what each offer keeps, not only the date.

const ctx = context();
const editors = [...new Set(Object.values(HELP).flatMap((h) => (h.editor ? [`${h.group}|${h.editor}`] : [])))];

/** Every view of a detailed section: closed editors, then each editor open for each offer. */
function views(): Array<{ name: string; html: string }> {
  const out: Array<{ name: string; html: string }> = [];
  for (const s of LEDGER_SECTIONS) {
    out.push({ name: s.id, html: renderLedger(ctx, { mode: "detailed", section: s.id }) });
    for (const e of editors) {
      const [group, row] = e.split("|");
      if (group !== s.id) continue;
      for (const o of ctx.offers) out.push({ name: `${s.id}, ${row} open for ${o.letter}`, html: renderLedger(ctx, { mode: "detailed", section: s.id, editor: { row, letter: o.letter } }) });
    }
  }
  return out;
}

describe("a row editor's button names its offer and row", () => {
  it("as \"Edit A's promotions\", \"Close A's promotions\" while it's open, \"Add B's promotions\" with none yet; never two alike in a view", () => {
    let buttons = 0;
    for (const v of views()) {
      const names = [...v.html.matchAll(/<button[^>]*class="link edit-button"[^>]*>/g)].map((m) => m[0].match(/aria-label="([^"]*)"/)?.[1] ?? "(no name)");
      buttons += names.length;
      for (const n of names) expect(n, v.name).toMatch(/^(Edit|Close|Add) [ABC]&#x27;s [a-zA-Z0-9() -]+$/);
      expect(names.length, `${v.name}: duplicate names in ${names.join(" | ")}`).toBe(new Set(names).size);
    }
    expect(buttons).toBeGreaterThan(30);
    const pay = renderLedger(ctx, { mode: "detailed", section: "pay" });
    // The samples: A has a promotion; B and C have none yet.
    expect(pay).toContain('aria-label="Edit A&#x27;s promotions"');
    expect(pay).toContain('aria-label="Add B&#x27;s promotions"');
    const open = renderLedger(ctx, { mode: "detailed", section: "retirement", editor: { row: "retirement.match", letter: "B" } });
    expect(open).toMatch(/aria-expanded="true"[^>]*aria-label="Close B&#x27;s 401\(k\) match"/);
  });
});

describe("L-4's slider says what each offer keeps at the last day", () => {
  const panel = (afterTaxCompKept: number, totalRewardsKept: number) => ({ leaveDate: "2027-01-12", afterTaxCompKept, totalRewardsKept }) as LeavePanel;

  it("the date, then each offer's figure, short, as the panel shows it (to the dollar)", () => {
    const panels = [panel(41_254.4, 43_000), panel(34_962.6, 36_100), panel(47_538, 49_900)];
    expect(sliderText("2027-01-12", ["A", "B", "C"], panels, "cash")).toBe("Jan 12, 2027. A keeps $41,254, B $34,963, C $47,538.");
    expect(sliderText("2027-01-12", ["A", "B", "C"], panels, "totalRewards")).toBe("Jan 12, 2027. In total rewards, A keeps $43,000, B $36,100, C $49,900.");
  });

  it("an offer that hasn't started by then says so", () => {
    expect(sliderText("2027-01-12", ["A", "B"], [null, panel(1_000, 1_200)], "cash")).toBe("Jan 12, 2027. A hasn't started, B keeps $1,000.");
  });

  it("is what L-4's slider says, with the figures its panel shows", () => {
    const L = withLeave(ctx);
    const html = renderToStaticMarkup(createElement(WorkProvider, { ctx: L.ctx, children: createElement(Leaving, L.props) }));
    const said = html.match(/role="slider"[^>]*aria-valuetext="([^"]+)"/)![1];
    expect(said).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}\. A keeps \$[\d,]+, B \$[\d,]+, C \$[\d,]+\.$/);
    // Each figure is the panel's "keep" figure for that offer.
    const kept = [...html.matchAll(/data-metric="kept\.([ABC])"[^>]*><span class="fig-value">([^<]+)<\/span>/g)].map((m) => m[2]);
    expect(kept).toHaveLength(3);
    expect(said).toContain(`A keeps ${kept[0]}, B ${kept[1]}, C ${kept[2]}.`);
  });
});
