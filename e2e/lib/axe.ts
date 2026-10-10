import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { quiet } from "./app";
import { type A11yException, parseExceptions } from "./exceptions";

// The automated accessibility scan (docs/ui-slices-4-8-plan.md, slice 7): axe-core on the page as it stands, for the
// WCAG 2.0, 2.1 and 2.2 A and AA rules. Any violation fails the test, unless test/a11y-exceptions.json accepts it
// with a reason. Each scan is attached to the test as a record, and the reporter (reporter.ts) writes them up.

export const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const EXCEPTIONS: A11yException[] = parseExceptions(JSON.parse(readFileSync(new URL("../../test/a11y-exceptions.json", import.meta.url), "utf8")));

export interface ScanNode { target: string; html: string; summary: string }
export interface ScanRecord {
  state: string;
  /** The page's hash route. */
  route: string;
  axe: string;
  violations: Array<{ rule: string; impact: string | null; help: string; helpUrl: string; nodes: ScanNode[] }>;
  excepted: Array<{ rule: string; target: string; selector: string; reason: string }>;
  /** What axe couldn't decide on its own (say, contrast over an image), and why: listed in the report for a person to check. */
  incomplete: Array<{ rule: string; help: string; nodes: Array<{ target: string; why: string }> }>;
  passes: number;
}

/** An axe node's selector, as one string (the app has no frames or shadow roots). */
const selectorOf = (target: unknown[]): string => target.map((t) => (Array.isArray(t) ? t.join(" ") : String(t))).join(" ");

/** The exception that covers a violation's node, if one does: the node, or an ancestor of it, matches its selector. */
async function exceptionFor(page: Page, rule: string, target: string): Promise<A11yException | undefined> {
  for (const e of EXCEPTIONS.filter((x) => x.rule === rule)) {
    const covered = await page.evaluate(([t, s]) => !!document.querySelector(t)?.closest(s), [target, e.selector] as const);
    if (covered) return e;
  }
  return undefined;
}

/**
 * Scans the page as it stands and fails the test (softly: the test goes on to its next state) on any violation not excepted.
 *
 * The sticky verdict bar (phones, tablets) sits over whatever the page has scrolled under it, and axe measures those targets
 * as obscured by it (2.5.8): a scroll position, not the layout. So for the scan the bar sits in its own place in the page
 * (position: static: the same box, unstuck), where it's scanned like everything else. Whether it ever covers the focused
 * element when stuck is WCAG 2.4.11's, checked by the phone and tablet tests (mobile.e2e.ts).
 *
 * It scans a quiet page (app.ts, quiet): never a schedule caught dimmed for the moment it's being worked out.
 */
export async function scan(page: Page, state: string): Promise<ScanRecord> {
  await quiet(page);
  const unstick = await page.addStyleTag({ content: ".verdict-bar { position: static !important; }" });
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze().finally(() => unstick.evaluate((el) => (el as Element).remove()));
  const record: ScanRecord = {
    state, route: new URL(page.url()).hash || "#/", axe: results.testEngine.version, violations: [], excepted: [], passes: results.passes.length,
    incomplete: results.incomplete.map((r) => ({
      rule: r.id, help: r.help,
      nodes: r.nodes.map((n) => ({ target: selectorOf(n.target), why: [...n.any, ...n.all, ...n.none].map((c) => c.message).find(Boolean) ?? "" })),
    })),
  };
  for (const v of results.violations) {
    const nodes: ScanNode[] = [];
    for (const n of v.nodes) {
      const target = selectorOf(n.target);
      const e = await exceptionFor(page, v.id, target);
      if (e) record.excepted.push({ rule: v.id, target, selector: e.selector, reason: e.reason });
      else nodes.push({ target, html: n.html, summary: n.failureSummary ?? "" });
    }
    if (nodes.length) record.violations.push({ rule: v.id, impact: v.impact ?? null, help: v.help, helpUrl: v.helpUrl, nodes });
  }
  await test.info().attach(`axe: ${state}`, { body: JSON.stringify(record), contentType: "application/json" });
  expect.soft(record.violations, `WCAG A/AA violations in "${state}":\n${describe(record)}`).toEqual([]);
  return record;
}

const describe = (r: ScanRecord) => r.violations.map((v) =>
  `- ${v.rule} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `    ${n.target}\n      ${n.summary.replace(/\n/g, "\n      ")}`).join("\n")}`).join("\n");
