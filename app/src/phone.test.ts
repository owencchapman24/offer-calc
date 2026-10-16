import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VerdictBar, verdictSentence } from "./Lead";
import { context, renderLedger } from "./testing";

// Phones and tablets (docs/ui-design.md §3.2, W9; slice 7 stop B): the phone's offer tabs, and the sticky verdict bar.
// What they do in a browser (arrow keys, focus, the bar out of the focused field's way) is in e2e/mobile.e2e.ts.

const ctx = context();

describe("the phone's offer tabs", () => {
  it("show one offer at a time: a tab list, the chosen tab's panel, and every cell marked with its offer", () => {
    const html = renderLedger(ctx, { mode: "quick" }, { tabbed: true });
    expect(html).toMatch(/<div class="tablist" role="tablist" aria-label="Offers">/);
    expect([...html.matchAll(/role="tab"/g)]).toHaveLength(3);
    expect(html).toMatch(/id="offer-tab-A"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="offer-tab-B"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
    expect(html).toMatch(/class="ledger is-quick is-tabbed tab-A"[^>]*id="offer-panel" role="tabpanel" aria-labelledby="offer-tab-A"/);
    // The stylesheet shows a cell only if it's the chosen offer's: every per-offer cell says whose it is.
    const cells = [...html.matchAll(/<div [^>]*class="[^"]*\bcell\b[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(cells.length).toBeGreaterThan(15);
    expect(cells.filter((c) => !/data-offer="[ABC]"/.test(c))).toEqual([]);
    // Three offers: no +, and the desktop's "+ Add an offer" gives way to it.
    expect(html).not.toContain('aria-label="Add an offer"');
    expect(html).not.toContain("+ Add an offer (up to 3)");
  });

  it("show the chosen offer, or the first when that one's gone; + while there are fewer than three; a tab that needs a fix says so", () => {
    expect(renderLedger(ctx, { mode: "quick", offerTab: "C" }, { tabbed: true })).toContain("is-tabbed tab-C");
    const two = { ...ctx, offers: ctx.offers.slice(0, 2) };
    const html = renderLedger(two, { mode: "detailed", section: "pay", offerTab: "C" }, { tabbed: true, missing: new Map([[two.offers[1].id, ["salary"]]]) });
    expect(html).toContain("is-tabbed tab-A");
    expect(html).toContain('aria-label="Add an offer to compare"');
    expect(html).toMatch(/id="offer-tab-B"[^>]*>.*?<span class="sr-only">, needs a fix<\/span>/);
    expect(html).not.toMatch(/id="offer-tab-A"[^>]*>[^]*?needs a fix[^]*?id="offer-tab-B"/);
  });

  it("aren't there off a phone: every offer shows, and the ledger is no tab panel", () => {
    const html = renderLedger(ctx, { mode: "quick" });
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain('class="ledger is-quick"');
  });
});

describe("the sticky verdict bar", () => {
  const view = ctx.results!.view;
  const bar = (place: "top" | "bottom", hidden = false) =>
    renderToStaticMarkup(createElement(VerdictBar, { view, stayYears: 4, place, updating: false, hidden }));
  const lead = view.lead!;

  it("on a phone: short, the winner and its margin a month, and one button to the lead schedule", () => {
    const html = bar("bottom");
    expect(html).toMatch(/^<div class="verdict-bar is-bottom" data-bar="bottom"><button type="button" class="bar-go">/);
    expect(html).toContain(`<strong class="who offer-${lead.winnerLetter}">${lead.winnerLetter}</strong><span class="sr-only"> leads by</span>`);
    expect(html).toMatch(/<span class="bar-figure">\+\$[\d,]+<\/span> a month/);
    expect(html).toContain("· stay 4 yrs");
    expect(html).toContain('<span class="sr-only">. Go to the lead schedule</span><span class="ref" aria-hidden="true">L</span>');
    expect(bar("bottom", true)).toContain('class="verdict-bar is-bottom is-hidden"');
  });

  it("on a tablet: the verdict's own sentence and the stay", () => {
    const html = bar("top");
    expect(html).toContain(`${verdictSentence(view).replace(/\.$/, "")}<span class="bar-scope"> · stay 4 years</span>`);
    expect(verdictSentence(view)).toMatch(/^[ABC] leaves you about \$[\d,]+ a month more than [ABC] over your stay, after rent, in U\.S\.-average dollars\.$/);
  });
});
