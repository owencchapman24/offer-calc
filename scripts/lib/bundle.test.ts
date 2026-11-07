import { describe, expect, it } from "vitest";
import { chunkImports, entryScripts, measure, stylesheets, verdict, workerChunks, workerScripts } from "./bundle";

const HTML = `<!doctype html><html><head>
  <script type="module" crossorigin src="/assets/index-abc.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/vendor-def.js">
  <link rel="stylesheet" crossorigin href="/assets/index-ghi.css">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</head><body><div id="root"></div></body></html>`;

const kb = (gzipKb: number, file = "x.js") => ({ file, rawKb: 3 * gzipKb, gzipKb });
const WORKER = [kb(68, "engine.worker.js")];

describe("the bundle budget", () => {
  it("counts the module entry and the chunks it preloads, not CSS or icons", () => {
    expect(entryScripts(HTML)).toEqual(["/assets/index-abc.js", "/assets/vendor-def.js"]);
  });
  it("finds the stylesheet, and the worker the main script starts as Vite writes it", () => {
    expect(stylesheets(HTML)).toEqual(["/assets/index-ghi.css"]);
    const js = "const a=1;new Worker(new URL(`/assets/engine.worker-vF2MRq07.js`,``+import.meta.url),{type:`module`});"
      + "new Worker(new URL(\"/assets/engine.worker-vF2MRq07.js\", import.meta.url))";
    expect(workerScripts(js)).toEqual(["/assets/engine.worker-vF2MRq07.js"]);
    expect(workerScripts("new Worker(url)")).toEqual([]);
  });
  it("follows the worker's chunks as Rolldown writes them: static imports load before the first answer, dynamic ones on first use", () => {
    const files: Record<string, string> = {
      // The entry: no static import of its own, three lazy chunks.
      "/assets/engine.worker-a.js": 'const s=()=>import(`./slowJobs-b.js`),e=()=>import(`./espp-c.js`);export{x as a};',
      // A lazy chunk imports values from the entry (already loaded) and may load another.
      "/assets/slowJobs-b.js": 'import{a as e}from"./engine.worker-a.js";import"./side-d.js";export{y as t};',
      "/assets/espp-c.js": 'import{a as e}from"./engine.worker-a.js";const q="import x from ./nope.js";',
      "/assets/side-d.js": 'export{};',
    };
    expect(chunkImports("/assets/slowJobs-b.js", files["/assets/slowJobs-b.js"]))
      .toEqual({ static: ["/assets/engine.worker-a.js", "/assets/side-d.js"], dynamic: [] });
    expect(workerChunks("/assets/engine.worker-a.js", (f) => files[f]))
      .toEqual({ first: ["/assets/engine.worker-a.js"], later: ["/assets/slowJobs-b.js", "/assets/side-d.js", "/assets/espp-c.js"] });
    // A chunk split off the entry that it imports statically is waited for: it counts toward the budget.
    const split = { ...files, "/assets/engine.worker-a.js": 'import{b}from"./shared-e.js";' + files["/assets/engine.worker-a.js"],
      "/assets/shared-e.js": 'export{z as b};' };
    expect(workerChunks("/assets/engine.worker-a.js", (f) => split[f as keyof typeof split]).first)
      .toEqual(["/assets/engine.worker-a.js", "/assets/shared-e.js"]);
  });
  it("passes at the budget and fails above it, or with nothing measured", () => {
    expect(verdict([kb(120)], WORKER).ok).toBe(true); // exactly 120
    expect(verdict([kb(120.01)], WORKER).problems).toEqual([expect.stringMatching(/120\.01 kB gzip, over its 120 kB budget/)]);
    expect(verdict([], WORKER).problems).toEqual(["index.html loads no script."]);
  });
  it("fails when the main thread is split into chunks, even under the budget", () => {
    const v = verdict([kb(50, "index.js"), kb(5, "vendor.js")], WORKER);
    expect(v.main.gzipKb).toBe(55);
    expect(v.problems).toEqual([expect.stringMatching(/^index\.html loads 2 scripts \(index\.js, vendor\.js\): the main thread has split/)]);
  });
  it("holds the worker to its own budget, 75 kB gzip, and fails when there's none", () => {
    expect(verdict([kb(110)], [kb(75)]).ok).toBe(true);
    expect(verdict([kb(110)], [kb(75.01)]).problems).toEqual([expect.stringMatching(/worker is 75\.01 kB gzip, over its 75 kB budget/)]);
    expect(verdict([kb(110)], []).problems).toEqual(["The main script starts no worker."]);
  });
  it("measures an oversized file as over budget", () => {
    // Random bytes don't compress: 130 kB of them is over a 120 kB budget.
    const bytes = new Uint8Array(130_000).map(() => Math.floor(Math.random() * 256));
    const m = measure("big.js", bytes);
    expect(m.rawKb).toBe(130);
    expect(m.gzipKb).toBeGreaterThan(120);
    expect(verdict([m], WORKER).ok).toBe(false);
  });
});
