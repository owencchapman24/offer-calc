import { fileURLToPath } from "node:url";
import { normalizePath, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

const path = (p: string) => normalizePath(fileURLToPath(new URL(p, import.meta.url)));
const ENACTED = path("./src/tax/params/enacted.ts");
const FROZEN = path("./test/frozen-enacted.ts");

/** Resolves src/tax/params/enacted.ts, the amounts published for years after 2026, to the tests' frozen copy. */
function frozenLaw(): Plugin {
  return {
    name: "frozen-law",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && normalizePath(resolved.id.split("?")[0]) === ENACTED ? FROZEN : resolved;
    },
  };
}

// Two projects:
// - "law": test/law.test.ts alone, on the law as published (src/tax/params/enacted.ts). It pins what's published, so it's
//   the test meant to fail at a data refresh.
// - "frozen law": every other test, on test/frozen-enacted.ts, so a refresh moves none of the figures they pin.
const UNIT = ["test/**/*.test.ts", "app/src/**/*.test.ts", "scripts/**/*.test.ts", "e2e/lib/**/*.test.ts"];
const LAW = "test/law.test.ts";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "law", include: [LAW] } },
      { plugins: [frozenLaw()], test: { name: "frozen law", include: UNIT, exclude: [LAW] } },
    ],
  },
});
