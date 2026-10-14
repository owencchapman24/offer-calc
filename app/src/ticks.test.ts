import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ByYear } from "./ByYear";
import { exportSession, readImport } from "./exchange";
import { Lead } from "./Lead";
import { initialSession, loadSession, reducer, saveSession } from "./session";
import { context, VALUATION, withWork } from "./testing";
import { TheWork } from "./TheWork";
import { WorkProvider } from "./Tickmarks";
import { TickLegend, TickSetting } from "./ui";

// The hide-tickmarks setting (slice 6, stop B; docs/ui-design.md §9.1): saved with the session and carried by JSON exports, as
// the theme is; with the marks hidden the legends say so, and every figure is the same button with the same name.

const NOW = new Date("2026-10-12T15:00:00Z");

describe("the tickmark setting is saved, exported and imported", () => {
  it("is saved with the session in this browser", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    const s = reducer(initialSession(VALUATION), { type: "ui", patch: { ticks: "hidden" } });
    expect(saveSession(store, s)).toBe("saved");
    expect(loadSession(store, VALUATION).session.ui.ticks).toBe("hidden");
    // Sessions from before it load with the marks shown.
    expect(initialSession(VALUATION).ui.ticks).toBeUndefined();
  });

  it("is carried by JSON exports as the theme is, and taken back on import", () => {
    const shown = JSON.parse(exportSession(initialSession(VALUATION), VALUATION, NOW).text);
    expect(shown.ui).toEqual({ basis: "colAdjustedTotal", theme: "system", ticks: "shown" });
    const hidden = reducer(initialSession(VALUATION), { type: "ui", patch: { ticks: "hidden" } });
    const r = readImport(exportSession(hidden, VALUATION, NOW).text);
    expect(r.ok && r.ui).toEqual({ basis: "colAdjustedTotal", theme: "system", ticks: "hidden" });
    if (!r.ok) return;
    const back = reducer(initialSession(VALUATION), { type: "replace", household: r.household, offers: r.offers, ui: r.ui });
    expect(back.ui.ticks).toBe("hidden");
    // A value the app doesn't know is left out, as for the other view choices.
    const odd = JSON.parse(exportSession(hidden, VALUATION, NOW).text);
    odd.ui.ticks = "faint";
    const o = readImport(JSON.stringify(odd));
    expect(o.ok && o.ui).toEqual({ basis: "colAdjustedTotal", theme: "system" });
  });
});

describe("with the marks hidden", () => {
  const w = withWork(context());
  const ctx = w.ctx;
  const render = (hidden: boolean, el: ReactElement) => renderToStaticMarkup(createElement(WorkProvider, {
    ctx, children: createElement(TickSetting.Provider, { value: { hidden, show: () => {} }, children: el }),
  }));
  const page = (hidden: boolean) => [
    createElement(Lead, { key: "l", view: ctx.results!.view, letters: ctx.results!.letters, stayYears: 4, updating: false, error: null, notes: [],
      sample: true, dispatch: () => {} }),
    createElement(ByYear, { key: "y", ctx, ui: { ...initialSession(VALUATION).ui, byYear: { mode: "each", table: true } }, sample: true, dispatch: () => {} }),
    createElement(TheWork, { key: "w", ...w.props }),
  ].map((el) => render(hidden, el)).join("\n");

  it("every figure is the same button, with the same name: \"How A, year 1, 62,594 was worked out (recomputed)\"", () => {
    const buttons = (html: string) => [...html.matchAll(/<button type="button" class="fig tick-btn[^"]*" data-metric="([^"]+)"[^>]*aria-label="([^"]+)"/g)]
      .map((m) => `${m[1]} ${m[2]}`);
    const shown = buttons(page(false));
    expect(shown.length).toBeGreaterThan(300);
    expect(buttons(page(true))).toEqual(shown);
    expect(shown).toContain("ey.A.1 How A, year 1, 62,594 was worked out (recomputed)");
  });

  it("the legends say the marks are hidden, and how to show them; the hint asks for an underlined figure", () => {
    const legend = (hidden: boolean) => render(hidden, createElement(TickLegend));
    expect(legend(false)).toContain("cross-footed");
    expect(legend(true)).toContain("are hidden: each figure keeps a dotted underline and still opens its work.");
    expect(legend(true)).toContain(">Show tickmarks</button>");
    expect(legend(true)).not.toContain("cross-footed");
    expect(page(true)).toContain("Click any underlined figure to see how it&#x27;s calculated.");
    expect(page(false)).toContain("Click any figure or");
  });
});
