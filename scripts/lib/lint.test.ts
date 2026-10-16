import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The hooks linter (eslint.config.js, audit H1): it runs on the app's code as CI runs it, and catches what it's there for. A
// hook's dependency list is otherwise checked by hand, and a missing dependency shows old figures as current.

const ROOT = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: ROOT });

/** The rule each problem in `code` breaks, linted as a file at `file` in the app. */
async function problems(code: string, file = "app/src/zz-lint-fixture.tsx") {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, file) });
  return result.messages.map((m) => m.ruleId ?? m.message);
}

const component = (body: string) => [
  'import { useEffect, useMemo, useState } from "react";',
  "export function Figure({ amount, show }: { amount: number; show: boolean }) {",
  "  const [rate] = useState<number>(0.05);",
  body,
  "  return null;",
  "}",
].join("\n");

describe("the hooks linter", () => {
  it("finds a dependency left out of a hook's list", async () => {
    expect(await problems(component("  const v = useMemo(() => amount * rate, [amount]);\n  void v;")))
      .toEqual(["react-hooks/exhaustive-deps"]);
    expect(await problems(component("  const v = useMemo(() => amount * rate, [amount, rate]);\n  void v;"))).toEqual([]);
  }, 30_000); // the first lint loads ESLint's parser: seconds on a busy runner

  it("finds a hook called conditionally", async () => {
    expect(await problems(component("  if (show) useEffect(() => {}, []);"))).toEqual(["react-hooks/rules-of-hooks"]);
  });

  it("fails a disable comment that no longer disables anything, so the exceptions can't go stale", async () => {
    const stale = "  useEffect(() => { void amount; },\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  [amount]);";
    expect(await problems(component(stale))).toEqual([expect.stringMatching(/Unused eslint-disable directive/)]);
  });

  it("parses TypeScript, with JSX only in .tsx files (in a .ts file, <T>(x: T) => x is a generic)", async () => {
    expect(await problems("export const id = <T,>(x: T): T => x;\nexport const el = <b>{id(1)}</b>;")).toEqual([]);
    expect(await problems("export const id = <T>(x: T): T => x;", "app/src/zz-lint-fixture.ts")).toEqual([]);
  });

  it("lints every file in the app, and finds nothing there", async () => {
    const results = await eslint.lintFiles(["app/src"]);
    expect(results.length).toBeGreaterThan(70);
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.line} ${m.ruleId ?? m.message}`))).toEqual([]);
  }, 60_000);

  it("runs in CI's check job", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toBe("eslint app/src");
    const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
    const check = ci.slice(ci.indexOf("\n  check:"), ci.indexOf("\n  lighthouse:"));
    expect(check).toContain("- run: npm run lint");
  });
});
