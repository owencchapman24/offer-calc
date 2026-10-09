import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseExceptions } from "./exceptions";
import type { ScanRecord } from "./axe";

// Writes up every accessibility scan in the run: .a11y/report.md (for a person) and .a11y/report.json. CI uploads them
// with the Playwright report. A scan is a state of the app (quick mode, a detailed section, Show the work open…) in one
// project (desktop or phone, light or dark).

type Row = ScanRecord & { project: string };

export default class A11yReporter implements Reporter {
  private rows = new Map<string, Row>();
  private flaky: string[] = [];
  private out: string;

  constructor(options: { out?: string } = {}) {
    this.out = resolve(process.cwd(), options.out ?? ".a11y");
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? "";
    for (const a of result.attachments) {
      if (!a.name.startsWith("axe: ") || !a.body) continue;
      const r = JSON.parse(a.body.toString()) as ScanRecord;
      // A retry's scan replaces the first one's.
      this.rows.set(`${project}|${r.state}`, { ...r, project });
    }
    if (result.retry > 0 && result.status === "passed") this.flaky.push(`${project}: ${test.title}`);
  }

  onEnd(result: FullResult) {
    if (!this.rows.size) return;
    const rows = [...this.rows.values()];
    mkdirSync(this.out, { recursive: true });
    writeFileSync(resolve(this.out, "report.json"), `${JSON.stringify(rows, null, 2)}\n`);
    writeFileSync(resolve(this.out, "report.md"), markdown(rows, result, this.flaky));
    console.log(`Accessibility report: ${resolve(this.out, "report.md")}`);
  }
}

function markdown(rows: Row[], result: FullResult, flaky: string[]): string {
  const projects = [...new Set(rows.map((r) => r.project))];
  const states = [...new Set(rows.map((r) => r.state))];
  const failing = rows.flatMap((r) => r.violations.flatMap((v) => v.nodes.map((n) => ({ r, v, n }))));
  const excepted = rows.flatMap((r) => r.excepted.map((e) => ({ r, e })));
  const lines: string[] = [
    "# Accessibility scan",
    "",
    `axe-core ${rows[0].axe}, WCAG 2.0, 2.1 and 2.2, levels A and AA (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa), on the production build.`,
    `${rows.length} scans: ${states.length} states in ${projects.length} projects (${projects.join(", ")}). Run ${result.status}.`,
    "",
    failing.length ? `**${failing.length} violations** (elements, counted per scan), ${excepted.length} excepted.`
      : `**No violations.** ${excepted.length ? `${excepted.length} excepted (below).` : "No exceptions used."}`,
    "",
  ];
  if (failing.length) {
    lines.push("## Violations", "");
    const byRule = group(failing, (x) => x.v.rule);
    for (const [rule, xs] of byRule) {
      lines.push(`### ${rule} (${xs[0].v.impact}): ${xs[0].v.help}`, "", xs[0].v.helpUrl, "");
      for (const [target, ys] of group(xs, (x) => x.n.target)) {
        lines.push(`- \`${target}\` in ${ys.map((y) => `${y.r.project} / ${y.r.state}`).join("; ")}`);
        lines.push(`  ${ys[0].n.summary.replace(/\n/g, " ")}`);
      }
      lines.push("");
    }
  }
  const exceptions = parseExceptions(JSON.parse(readFileSync(resolve(process.cwd(), "test/a11y-exceptions.json"), "utf8")));
  lines.push("## Exceptions (test/a11y-exceptions.json)", "");
  if (!exceptions.length) lines.push("None.", "");
  for (const e of exceptions) {
    const used = excepted.filter((x) => x.e.rule === e.rule && x.e.selector === e.selector);
    lines.push(`- **${e.rule}** \`${e.selector}\`: ${e.reason} ${used.length ? `(covered ${used.length} elements)` : "(**unused**: remove it?)"}`);
  }
  lines.push("");
  const incomplete = rows.flatMap((r) => r.incomplete.map((i) => ({ r, i })));
  lines.push("## Needs review", "", "What axe couldn't decide by itself (axe's \"incomplete\"): a person checks these.", "");
  if (!incomplete.length) lines.push("None.", "");
  for (const [rule, xs] of group(incomplete, (x) => x.i.rule)) {
    lines.push(`- **${rule}**: ${xs[0].i.help}.`);
    // By axe's reason, the numbers taken out ("1.23:1", "#a1b2c3") so like reasons group.
    const nodes = xs.flatMap((x) => x.i.nodes.map((n) => ({ ...n, state: x.r.state })));
    for (const [why, ys] of group(nodes, (n) => n.why.replace(/#[0-9a-f]{3,8}|\d+(\.\d+)?(:1|px|pt)?/gi, "…"))) {
      const targets = [...new Set(ys.map((y) => y.target))];
      lines.push(`  - ${why || "No reason given"} (${targets.length} elements, ${new Set(ys.map((y) => y.state)).size} states): `
        + `${targets.slice(0, 6).map((t) => `\`${t}\``).join(", ")}${targets.length > 6 ? ", …" : ""}`);
    }
  }
  lines.push("");
  if (flaky.length) lines.push("## Passed on a retry", "", ...flaky.map((f) => `- ${f}`), "");
  lines.push("## Scans", "", "Violations per scan (excepted in parentheses); a dash: not scanned.", "",
    `| State | ${projects.join(" | ")} |`, `|---|${projects.map(() => "---:").join("|")}|`);
  for (const s of states) {
    const cells = projects.map((p) => {
      const r = rows.find((x) => x.project === p && x.state === s);
      if (!r) return "–";
      const n = r.violations.reduce((k, v) => k + v.nodes.length, 0);
      return `${n}${r.excepted.length ? ` (${r.excepted.length})` : ""}`;
    });
    lines.push(`| ${s} | ${cells.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function group<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}
