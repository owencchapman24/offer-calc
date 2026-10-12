import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drift, normalize, readFreeze } from "./lock";

// The oracle's locked environment: run-oracle.ts warns when the .venv has drifted from requirements-lock.txt.

describe("the oracle's lock", () => {
  it("reads name==version lines, by pip's normalized names, skipping comments", () => {
    const m = readFreeze("# a comment\r\nPolicyEngine_US==2.30.3\nzope.interface==7.0  # trailing\n\n-e ./local\n");
    expect([...m]).toEqual([["policyengine-us", "2.30.3"], ["zope-interface", "7.0"]]);
    expect(normalize("Typing_Extensions")).toBe("typing-extensions");
  });

  it("drift: another version, or a package the lock doesn't have; a locked package not installed isn't drift", () => {
    const lock = readFreeze("numpy==2.5.3\npandas==3.0.6\ncolorama==0.4.6\n");
    const installed = readFreeze("numpy==2.6.0\npandas==3.0.6\npexpect==4.9.0\n");
    expect(drift(lock, installed)).toEqual({ changed: [["numpy", "2.5.3", "2.6.0"]], extra: ["pexpect"] });
    expect(drift(lock, lock)).toEqual({ changed: [], extra: [] });
  });

  it("the committed lock pins policyengine-us at requirements.txt's version, and every line is name==version", () => {
    const text = readFileSync(new URL("../../requirements-lock.txt", import.meta.url), "utf8");
    const lock = readFreeze(text);
    const pin = readFileSync(new URL("../../requirements.txt", import.meta.url), "utf8").match(/^policyengine-us==(\S+)$/m)?.[1];
    expect(pin).toBeDefined();
    expect(lock.get("policyengine-us")).toBe(pin);
    const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
    expect(lines.length).toBe(lock.size);
  });
});
