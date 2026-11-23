import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// CI's check job (.github/workflows/ci.yml), the gate every pull request passes: what it runs, so a step isn't dropped unnoticed.

const ROOT = resolve(import.meta.dirname, "../..");

describe("CI's check job", () => {
  const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
  const check = ci.slice(ci.indexOf("\n  check:"), ci.indexOf("\n  lighthouse:"));

  it("audits the production dependencies after installing, before the tests (audit S2)", () => {
    const steps = [...check.matchAll(/- run: (.+)/g)].map((m) => m[1].trim());
    expect(steps.indexOf("npm audit --omit=dev")).toBe(steps.indexOf("npm ci") + 1);
    expect(steps.indexOf("npm audit --omit=dev")).toBeLessThan(steps.indexOf("npm test"));
  });
});
