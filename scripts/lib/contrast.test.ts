import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The colour tokens' contrast (styles.css; docs/ui-design.md §9), in both themes (audit P6). The scan checks rendered text, but axe
// can't decide some of it (glyphs, SVG text, text over a pseudo element: test/a11y-reviewed.json); those reviews rest on these
// ratios, so they're checked here, from the tokens themselves.

const css = readFileSync(resolve(import.meta.dirname, "../../app/src/styles.css"), "utf8");

/** The custom properties in the block that starts at `head` (its first `{` to the matching `}`). */
function tokens(head: string): Record<string, string> {
  const at = css.indexOf(head);
  if (at < 0) throw new Error(`No ${head} in styles.css`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

/** WCAG 2's contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = tokens(":root {");
const DARK = tokens(":root:not([data-theme=\"light\"]) {");
const PICKED_DARK = tokens(":root[data-theme=\"dark\"] {");

describe("the colour tokens' contrast (audit P6)", () => {
  it("the dark theme is the same whether the system picks it or you do", () => {
    expect(PICKED_DARK).toEqual(DARK);
  });

  for (const [theme, t] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`${theme}: text colours reach 4.5:1 on the sheet and the band, and on the highlighter`, () => {
      for (const text of ["ink", "graphite", "muted", "warning"]) {
        for (const ground of ["sheet", "band"]) {
          expect(contrast(t[text], t[ground]), `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(t.ink, t.highlighter), "ink on the highlighter").toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: the offers' colours, marks and rules only, reach 3:1 on the sheet and the band (WCAG 1.4.11)`, () => {
      for (const offer of ["offer-a", "offer-b", "offer-c"]) {
        for (const ground of ["sheet", "band"]) {
          expect(contrast(t[offer], t[ground]), `${offer} on ${ground}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it("the ratios the reviews quote: graphite 8.2:1 and 9.2:1, muted 5.7:1 and 6.0:1, ink 17.6:1 and 14.9:1 on the sheet", () => {
    const r = (a: string, b: string) => Math.round(contrast(a, b) * 10) / 10;
    expect([r(LIGHT.graphite, LIGHT.sheet), r(DARK.graphite, DARK.sheet)]).toEqual([8.2, 9.2]);
    expect([r(LIGHT.muted, LIGHT.sheet), r(DARK.muted, DARK.sheet)]).toEqual([5.7, 6.0]);
    expect([r(LIGHT.ink, LIGHT.sheet), r(DARK.ink, DARK.sheet)]).toEqual([17.6, 14.9]);
  });
});
