import { describe, expect, it } from "vitest";
import { entryScripts, measure, verdict } from "./bundle";

const HTML = `<!doctype html><html><head>
  <script type="module" crossorigin src="/assets/index-abc.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/vendor-def.js">
  <link rel="stylesheet" crossorigin href="/assets/index-ghi.css">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</head><body><div id="root"></div></body></html>`;

describe("the bundle budget", () => {
  it("counts the module entry and the chunks it preloads, not CSS or icons", () => {
    expect(entryScripts(HTML)).toEqual(["/assets/index-abc.js", "/assets/vendor-def.js"]);
  });
  it("passes at the budget and fails above it, or with nothing measured", () => {
    const kb = (gzipKb: number) => ({ file: "x.js", rawKb: 3 * gzipKb, gzipKb });
    expect(verdict([kb(60), kb(50)]).ok).toBe(true); // exactly 110
    expect(verdict([kb(60), kb(50.01)]).ok).toBe(false);
    expect(verdict([]).ok).toBe(false);
  });
  it("measures an oversized file as over budget", () => {
    // Random bytes don't compress: 120 kB of them is over a 110 kB budget.
    const bytes = new Uint8Array(120_000).map(() => Math.floor(Math.random() * 256));
    const m = measure("big.js", bytes);
    expect(m.rawKb).toBe(120);
    expect(m.gzipKb).toBeGreaterThan(110);
    expect(verdict([m]).ok).toBe(false);
  });
});
