import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { closure, dynamicTargets, importsOf, resolveImport } from "./imports";

// The source rules behind the bundle's shape (CLAUDE.md, Bundles). The build check (scripts/check-bundle.ts) fails when the
// main thread splits into chunks or outgrows its budget; these say which import would cause it, before a build.

const ROOT = resolve(import.meta.dirname, "../..").replace(/\\/g, "/");
const app = (f: string) => `${ROOT}/app/src/${f}`;
const rel = (f: string) => f.replace(`${ROOT}/`, "");
const MAIN = closure(app("main.tsx"));

describe("reading imports", () => {
  it("tells run-time imports from type-only ones, and finds re-exports, side effects and dynamic imports", () => {
    const src = [
      'import { a, type B } from "./a";',
      'import type { C } from "./c";',
      'import { type D, type E } from "./d";',
      'export type { F } from "./f";',
      'export { g } from "./g";',
      'export * from "./h";',
      'import "./styles.css";',
      'import {\n  i,\n  j,\n} from "./ij";',
      "export const k = 1;",
      'const L = lazy(() => import("./L"));',
    ].join("\n");
    expect(importsOf(src)).toEqual([
      { specifier: "./a", typeOnly: false, dynamic: false },
      { specifier: "./c", typeOnly: true, dynamic: false },
      { specifier: "./d", typeOnly: true, dynamic: false },
      { specifier: "./f", typeOnly: true, dynamic: false },
      { specifier: "./g", typeOnly: false, dynamic: false },
      { specifier: "./h", typeOnly: false, dynamic: false },
      { specifier: "./ij", typeOnly: false, dynamic: false },
      { specifier: "./styles.css", typeOnly: false, dynamic: false },
      { specifier: "./L", typeOnly: false, dynamic: true },
    ]);
  });
  it("resolves to files in the repo, and names packages", () => {
    expect(rel(resolveImport("../../src/col/cities", app("model.ts")))).toBe("src/col/cities.ts");
    expect(rel(resolveImport("./styles.css", app("main.tsx")))).toBe("app/src/styles.css");
    expect(resolveImport("react-dom/client", app("main.tsx"))).toBe("pkg:react-dom/client");
  });
  it("walks the main thread from app/src/main.tsx", () => {
    for (const f of ["app/src/App.tsx", "app/src/figures.tsx", "app/src/Tickmarks.tsx", "src/col/cities.ts"]) {
      expect(MAIN.has(`${ROOT}/${f}`)).toBe(true);
    }
    expect(MAIN.has(app("derive.ts"))).toBe(false); // loaded on first use
    expect(dynamicTargets(MAIN).has(app("derive.ts"))).toBe(true);
  });
});

describe("the main thread's rules", () => {
  it("holds no engine values: the engine and its BEA and HUD tables run in the worker", () => {
    // What the main thread may import from src/: the slim city list, the samples, the vesting presets (pure data), and
    // src/format's words. Engine types are fine everywhere: `import type` is erased.
    const MAY = new Set(["src/col/cities.ts", "src/col/cities.json", "src/samples.ts", "src/offer/presets.ts"]);
    const engine = [...MAIN].map(rel).filter((f) => /^src\/(offer|tax|col)\//.test(f) && !MAY.has(f));
    const workerOnly = [...MAIN].map(rel).filter((f) => /^app\/src\/(engine\.worker|compute|slowJobs)\.ts$/.test(f));
    expect([...engine, ...workerOnly]).toEqual([]);
    // What it may import stays free of the engine itself.
    expect([...closure(`${ROOT}/src/offer/presets.ts`)].map(rel)).toEqual(["src/offer/presets.ts"]);
  });
  it("help.ts reaches no React: the lazy chunks that fill it in import it, and with React it split the main chunk", () => {
    expect([...closure(app("help.ts"))].filter((f) => f.startsWith("pkg:react"))).toEqual([]);
  });
  it("figures.tsx reaches neither react-dom nor metrics.ts at run time: every lazy schedule imports it", () => {
    const c = closure(app("figures.tsx"));
    expect([...c].filter((f) => f.startsWith("pkg:react-dom") || f === app("metrics.ts")).map(rel)).toEqual([]);
  });
  it("the lazy schedules (the breakdowns, the verdict and L-1 to L-6, loaded by Later.tsx) import figures.tsx, never Tickmarks.tsx", () => {
    const later = dynamicTargets([app("Later.tsx")]);
    expect([...later].map(rel).sort()).toEqual(["app/src/Breakdown.tsx", "app/src/Breakeven.tsx", "app/src/ByYear.tsx", "app/src/LeadVerdict.tsx",
      "app/src/Leaving.tsx", "app/src/Risk.tsx", "app/src/TheWork.tsx", "app/src/Warnings.tsx"]);
    for (const f of later) {
      const direct = importsOf(readFileSync(f, "utf8")).filter((i) => !i.typeOnly && !i.dynamic).map((i) => resolveImport(i.specifier, f));
      expect({ schedule: rel(f), tickmarks: direct.includes(app("Tickmarks.tsx")) }).toEqual({ schedule: rel(f), tickmarks: false });
    }
  });
});
