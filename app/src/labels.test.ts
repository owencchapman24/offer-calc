import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Basis } from "../../src/offer/types";
import { buildDoc, type Doc, toText } from "./copyDoc";
import { build as csvBuild, type Built, type CsvTable } from "./csv";
import { derive } from "./derive";
import { firstLastDay, leaveAxis } from "./leaveModel";
import { cityName, type MetricId, type WorkContext } from "./metrics";
import type { Letter } from "./model";
import { priceWords, shortCity } from "./prices";
import {
  alone, compareOf, context, renderAlone, renderBreakdowns, renderPage, withLeave, withTies, withWork,
} from "./testing";
import { TheWork } from "./TheWork";
import { WorkProvider } from "./Tickmarks";
import { hasRanges } from "./cases";

// The label rules approved with the offer breakdown (docs/v2-plan.md, item 5, conditions 1 and 4), checked wherever figures are
// shown: every breakdown part, the ledger's "On its own" row, the comparison's schedules, every Show the work, the CSVs and the
// copied document. It fails on
// - an after-rent figure that doesn't name its dollars ("New York $6,671", "U.S.-avg $7,196"), or a dollar figure before rent and
//   prices without its "$": on the figure or in its column's head, in its accessible name, in its Show the work and its CSV column;
// - two offers' own-city figures in one row, table, list or chart (where offers sit together, they're in the common dollars);
// - a rate or share that doesn't state its period ("a month over your stay", "of its 2027 pay", "in year 1").

/** What a figure is, by its id: which dollars it's in, whether it's a rate or share, and whose own-city dollars it's in. */
interface Expect {
  /** "after": after rent, in `unit`'s dollars; "paid": dollars before rent and prices; "prices": the step between two places' dollars. */
  money: "after" | "paid" | "prices" | null;
  /** The dollars an after-rent figure is in: "U.S.-avg $", "New York $". */
  unit?: string;
  /** A rate or share: a month, an hour, a year, a percent. */
  rate: boolean;
  /** Its offer, when it's in that offer's own city's dollars. */
  own?: Letter;
}

function expectOf(id: string, ctx: WorkContext): Expect | null {
  const [head, a, b, c] = id.split(".");
  const p = priceWords(ctx.household.pricesIn);
  const r = ctx.results;
  const perHourOf = r?.sweep.perHourOf ?? "colAdjustedTotal";
  const after = (basis: Basis | undefined) => basis === "colAdjustedTotal" || (basis === "perHour" && perHourOf === "colAdjustedTotal");
  const common = (rate: boolean): Expect => ({ money: "after", unit: p.unit, rate });
  const by = (basis: Basis | undefined, rate: boolean): Expect => (after(basis) ? common(rate) : { money: "paid", rate });
  const city = (l: string) => `${shortCity(cityName(ctx.offers.find((o) => o.letter === l)!.draft.costOfLiving.area))} $`;
  const basis = r?.view.basis;
  switch (head) {
    case "in": case "about": case "af": case "rpp": return null;
    case "hero": case "stay": return by(basis, true);
    case "step": return by(a as Basis, true);
    case "pv": return by(b as Basis, false);
    case "ph": return by("perHour", true);
    case "avg": return by(b as Basis, true);
    case "extra": return b === "hours" ? { money: null, rate: true } : by(b as Basis, true);
    case "part": return { money: "paid", rate: false };
    case "ey": case "run": return by(basis, basis === "perHour");
    case "eysum": return by(basis, false);
    case "br":
      if (c === "prices") return { money: "prices", rate: false };
      return c === "total" ? common(false) : c === "spend" || c === "saved" ? common(true) : { money: "paid", rate: false };
    case "risk": return by(basis, basis === "perHour");
    case "drop": case "win": return by(basis, true);
    // A starting salary, and the change to it that ties: amounts a year, as a salary is, not rates over a stay.
    case "flip": return { money: "paid", rate: false };
    case "tie": {
      if (a === "target") return by(basis === "perHour" ? perHourOf : basis, false);
      return { money: "paid", rate: b === "rent" };
    }
    case "rentnote": return { money: "paid", rate: true };
    case "l6y":
      if (b === "local") return { money: "after", unit: city(a), rate: false, own: a as Letter };
      if (["atRef", "oopRef", "face", "total"].includes(b)) return common(false);
      if (b === "totalHour") return common(true);
      if (b === "hours") return null;
      return { money: "paid", rate: b === "afterTaxHour" || b === "totalRewardsHour" };
    case "l6s": return by(b as Basis, false);
    case "l6t": return b === "rate" || c === "rate" ? { money: null, rate: true } : { money: "paid", rate: false };
    case "own":
      if (b === "af") return null;
      if (b === "rate" || b === "drop") return { money: null, rate: true };
      if (b === "ref") return common(true);
      if (b === "prices") return { money: "prices", rate: true };
      return { money: "after", unit: city(a), rate: true, own: a as Letter };
    case "alone": return common(true);
  }
  return { money: "paid", rate: false };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Dollars named on a figure: "U.S.-avg $7,196", "New York −$120", "U.S.-avg +$487". */
const named = (unit: string) => new RegExp(`${escape(unit.replace(/ \$$/, ""))} [−+]?\\$\\d`);
/** A dollar figure before rent and prices: "$110,000", "−$510", "($41,724)". */
const PAID = /[−+(]?\$\d/;
/** A period: over a stay, in a year, of a year's pay, the first lease year. */
const PERIOD = /over (?:your|its own|its|the|a \d+-year|your \d+-year|its \d+-year|the \d+-year) stay|if you stay \d+|\bstay \d+ (?:yrs?|years?)\b|in year \d+|\byear-\d+\b|\byear \d+\b|in \d{4}|of its \d{4} pay|\b\d{4} pay\b|first lease year|over \d+ years|each employment year|over the \d+ years|\byears? \d+ ?(?:–|to) ?\d+|\b\d+ yrs?\b|\byearly\b|\d% a year|starting salary|\d+-year total|\byour stay\b/i;
/** Words that name a place's dollars, beside a figure or in its column's head. */
const dollarsWords = (unit: string) => {
  const place = unit.replace(/ \$$/, "").replace(/-avg$/, "");
  return new RegExp(`${escape(unit.replace(/ \$$/, ""))} \\$|${escape(place)}(?:-average)? dollars|at ${escape(place)} prices|${escape(unit)}`);
};

// ---- a static render, as a tree ---------------------------------------------------------------------------------------------

interface Node { tag: string; attrs: Record<string, string>; children: Array<Node | string>; parent: Node | null }
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "col", "area", "source", "wbr"]);
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&");

function parse(html: string): Node {
  const root: Node = { tag: "#root", attrs: {}, children: [], parent: null };
  let at = root;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) { at.children.push(decode(m[5])); continue; }
    const [, close, tag, rawAttrs, self] = m;
    if (close) {
      for (let n: Node | null = at; n; n = n.parent) if (n.tag === tag) { at = n.parent ?? root; break; }
      continue;
    }
    const attrs = Object.fromEntries([...rawAttrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map((x) => [x[1], decode(x[2] ?? "")]));
    const node: Node = { tag, attrs, children: [], parent: at };
    at.children.push(node);
    if (!self && !VOID.has(tag)) at = node;
  }
  return root;
}
/** An element's text, as it reads: its parts apart, tickmarks out. */
const text = (n: Node | string): string => (typeof n === "string" ? n
  : n.attrs.class?.split(" ").includes("tick") ? "" : n.children.map((c) => (typeof c === "string" ? c : ` ${text(c)} `)).join("").replace(/\s+/g, " ").trim());
const all = (n: Node, f: (x: Node) => boolean, out: Node[] = []): Node[] => {
  if (f(n)) out.push(n);
  for (const c of n.children) if (typeof c !== "string") all(c, f, out);
  return out;
};
const has = (n: Node, cls: string) => n.attrs.class?.split(" ").includes(cls) ?? false;
const ancestors = (n: Node) => { const out: Node[] = []; for (let p = n.parent; p; p = p.parent) out.push(p); return out; };

/** What labels a figure on the page: its sentence or cell, and the heads of the table, list or chart it's in. */
function context_(fig: Node, root: Node): string {
  const parts: string[] = [];
  const ups = ancestors(fig);
  const block = ups.find((x) => ["p", "li", "td", "th", "dd"].includes(x.tag) || ["cell", "rowheader"].includes(x.attrs.role ?? "")
    || has(x, "step") || has(x, "bar-text") || has(x, "end-label") || has(x, "own-cell"));
  if (block) parts.push(text(block));
  for (const x of ups) {
    if (x.tag === "tr") parts.push(...x.children.filter((c): c is Node => typeof c !== "string" && c.tag === "th").map(text));
    // A table's row groups have a head of their own ("After rent, at U.S. prices", "2027 · 2026 tax law").
    if (x.tag === "tbody") parts.push(...all(x, (y) => y.tag === "th" && y.attrs.scope === "rowgroup").map(text));
    // A chart's title sits just before it, and its slider names what it reads.
    if (has(x, "chart")) parts.push(...all(x, (y) => y.attrs.role === "slider").map((y) => y.attrs["aria-label"] ?? ""));
    if (has(x, "chart") && x.parent) {
      const sibs = x.parent.children.filter((c): c is Node => typeof c !== "string");
      parts.push(...sibs.slice(0, sibs.indexOf(x)).filter((c) => has(c, "chart-title")).map(text));
    }
    if (["table", "ol", "ul", "fieldset", "figure"].includes(x.tag) || x.attrs.role === "table" || has(x, "chart") || has(x, "row")) {
      parts.push(...all(x, (y) => ["caption", "thead", "legend", "figcaption"].includes(y.tag) || has(y, "chart-unit")
        || ["columnheader", "rowheader"].includes(y.attrs.role ?? "") || has(y, "row-label")).map(text));
      const by = x.attrs["aria-labelledby"] ?? x.attrs["aria-label"];
      if (x.attrs["aria-label"]) parts.push(x.attrs["aria-label"]);
      if (x.attrs["aria-labelledby"]) parts.push(...all(root, (y) => y.attrs.id === by).map(text));
    }
    // A ledger row's cells sit in a grid of display: contents rows: its label is the row's first cell.
    if (has(x, "row")) parts.push(...x.children.filter((c): c is Node => typeof c !== "string" && has(c, "row-label")).map(text));
  }
  return parts.join(" · ");
}

interface Shown { id: string; name: string; value: string; around: string; node: Node }

function figures(html: string): { root: Node; figs: Shown[] } {
  const root = parse(html);
  const figs = all(root, (n) => n.tag === "button" && !!n.attrs["data-metric"]).map((n) => ({
    id: n.attrs["data-metric"], name: n.attrs["aria-label"] ?? "", value: text(n), around: context_(n, root), node: n,
  }));
  return { root, figs };
}

// ---- the checks -------------------------------------------------------------------------------------------------------------

function checkPage(ctx: WorkContext, html: string, where: string): string[] {
  const problems: string[] = [];
  const { root, figs } = figures(html);
  for (const f of figs) {
    const found = expectOf(f.id, ctx);
    if (!found) continue;
    // L-2's drop is a figure a month in its sentence and a share in its table.
    const e = f.value.includes("%") ? { ...found, money: null } : found;
    const say = (what: string) => problems.push(`${where}: ${f.id} "${f.value}" (${f.name}): ${what}`);
    if (e.money === "after") {
      if (!named(e.unit!).test(f.name)) say(`its accessible name doesn't name its dollars (${e.unit})`);
      if (!named(e.unit!).test(f.value) && !dollarsWords(e.unit!).test(f.around)) say(`neither it nor its head names its dollars (${e.unit})`);
    }
    if (e.money === "paid" && !PAID.test(f.name)) say("its accessible name has no $");
    if (e.money === "prices" && !/ prices\b/.test(f.name)) say("its accessible name doesn't name the prices it steps across");
    if (e.rate) {
      if (!PERIOD.test(f.name)) say("its accessible name doesn't state its period");
      if (!PERIOD.test(`${f.value} ${f.around}`)) say("neither it nor its sentence or head states its period");
    }
  }
  // Two offers' own-city figures in one row, table, list or chart.
  for (const box of all(root, (n) => ["tr", "table", "ol", "ul"].includes(n.tag) || ["row", "table"].includes(n.attrs.role ?? "") || has(n, "row")
    || has(n, "chart"))) {
    const owners = new Set(all(box, (n) => n.tag === "button" && !!n.attrs["data-metric"]).flatMap((n) => expectOf(n.attrs["data-metric"], ctx)?.own ?? []));
    if (owners.size > 1) problems.push(`${where}: ${[...owners].join(" and ")}'s own-city figures side by side in a ${box.tag}.${box.attrs.class ?? ""}`);
  }
  return problems;
}

/** Every derivation the page reaches: its title and scope name the dollars, and a rate's states its period. */
function checkWork(ctx: WorkContext, html: string, where: string): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const id of new Set(figures(html).figs.map((f) => f.id))) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = expectOf(id, ctx);
    if (!e) continue;
    const d = derive(id as MetricId, ctx);
    const head = `${d.title} · ${d.scope ?? ""}`;
    const say = (what: string) => problems.push(`${where}: ${id}'s Show the work "${head}": ${what}`);
    if (e.money === "after" && !dollarsWords(e.unit!).test(`${head} · ${d.lines.at(-1)?.label ?? ""}`)) say(`doesn't name its dollars (${e.unit})`);
    if (e.rate && !PERIOD.test(`${head} · ${d.lines.at(-1)?.label ?? ""}`)) say("doesn't state its period");
  }
  return problems;
}

/** A CSV: each figure's column head (or its row's label) names its dollars, and a rate's states its period. */
function checkCsv(ctx: WorkContext, b: Built): string[] {
  const problems: string[] = [];
  for (const row of b.rows) {
    const labels = row.filter((c): c is string => typeof c === "string").join(" · ");
    row.forEach((c, i) => {
      if (!c || typeof c === "string" || !c.id) return;
      const found = expectOf(c.id, ctx);
      if (!found) return;
      // A share's column (L-2's drop) is a percent, not dollars.
      const e = /%/.test(b.header[i]) ? { ...found, money: null } : found;
      const head = `${b.header[i]} · ${labels}`;
      const say = (what: string) => problems.push(`CSV ${b.slug}: ${c.id} under "${b.header[i]}" (${labels}): ${what}`);
      if (e.money === "after" && !dollarsWords(e.unit!).test(head)) say(`doesn't name its dollars (${e.unit})`);
      if (e.money === "paid" && !/\$/.test(head)) say("has no $ in its head");
      if (e.rate && !PERIOD.test(`${head} · ${b.title}`)) say("doesn't state its period");
    });
  }
  return problems;
}

/**
 * The copied document: a table's after-rent rows name their dollars (in the table's title, head or the row's label), its rates
 * their period; a sentence that states an after-rent figure names its prices, and one that states a rate or share its period.
 */
function checkDoc(ctx: WorkContext, doc: Doc): string[] {
  const problems: string[] = [];
  const p = priceWords(ctx.household.pricesIn);
  const words = dollarsWords(p.unit);
  for (const b of doc.blocks) {
    if (b.kind === "table") {
      const t = b.table;
      for (const row of t.rows) {
        const around = `${t.title ?? ""} · ${t.head.join(" · ")} · ${row.label}`;
        if (/after rent/i.test(row.label) && row.cells.some((x) => /\d/.test(x)) && !words.test(around)) {
          problems.push(`document table "${t.title}": the row "${row.label}" doesn't name its dollars`);
        }
        for (const cell of row.cells) {
          if (/\d.*(a month|an hour|a year)|%/.test(cell) && !PERIOD.test(`${around} · ${cell}`)) {
            problems.push(`document table "${t.title}": "${row.label}: ${cell}" doesn't state its period`);
          }
        }
      }
    }
    if (b.kind === "para" || b.kind === "note") {
      const para = b.runs.map((x) => (typeof x === "string" ? x : "b" in x ? x.b : x.href)).join("");
      for (const s of para.split(/(?<=[.:;])\s+(?=[A-Z(])/)) {
        if (/\$\d[\d,.]*\s+(a month|an hour|a year)|\d%/.test(s) && !PERIOD.test(s)) problems.push(`document: "${s}" doesn't state its period`);
        if (/after rent/i.test(s) && /\$\d/.test(s) && !words.test(s)) problems.push(`document: "${s}" doesn't name its dollars`);
      }
    }
  }
  return problems;
}

// ---- what's rendered ---------------------------------------------------------------------------------------------------------

/** The comparison as the app shows it, every schedule worked out, L-6 open on each offer, and its CSVs and document. */
function comparison(ctx0: WorkContext) {
  const tied = withTies(ctx0);
  const left = withLeave(tied.ctx);
  const worked = withWork(left.ctx);
  const ctx = worked.ctx;
  const r = ctx.results!;
  const html = renderPage(ctx, { leave: { ...left.props, ctx }, ties: tied.props }) + renderPage(ctx, { running: true, bridgeOf: "C" })
    + r.letters.map((l) => renderToStaticMarkup(createElement(WorkProvider, { ctx, children: [createElement(TheWork, { key: "w", ...worked.props, ctx, letter: l })] }))).join("")
    + renderBreakdowns(ctx);
  const ranges = compareOf(ctx).offers.some(hasRanges);
  const tables: CsvTable[] = [{ kind: "l1", running: false }, { kind: "l1", running: true }, ...(ranges ? [{ kind: "l2" as const }] : []),
    ...r.letters.flatMap((letter) => (["years", "stay", "payments", "tax"] as const).map((part) => ({ kind: "l6" as const, letter, part })))];
  const at = firstLastDay(leaveAxis(r.view.row.window.start, r.view.row.years));
  const doc = buildDoc(ctx, { offers: compareOf(ctx).offers, at, picked: false });
  return { ctx, html, csv: tables.map((t) => csvBuild(ctx, t)), doc };
}

const CLT = "16740";

describe("every figure names its dollars, and every rate or share its period (conditions 1 and 4)", () => {
  it("one offer on its own: A-1, its Show the work, at U.S. prices and at Charlotte's", () => {
    const problems: string[] = [];
    for (const [where, ctx] of [["A alone", alone("A")], ["B alone", alone("B")], ["C alone, Charlotte prices", alone("C", undefined, { pricesIn: CLT })]] as const) {
      const html = renderAlone(ctx);
      expect(html).toContain('data-metric="own.A.total"');
      problems.push(...checkPage(ctx, html, where), ...checkWork(ctx, html, where));
    }
    expect(problems).toEqual([]);
  }, 60_000);

  for (const basis of ["colAdjustedTotal", "perHour", "cash"] as const) {
    it(`the comparison on the ${basis} basis: every schedule, the breakdowns, the "On its own" row, Show the work, the CSVs and the document`, () => {
      const c = comparison(context(basis));
      expect(c.html).toContain('data-metric="alone.A"');
      expect(c.html).toContain('data-metric="own.C.ref"');
      const problems = [...checkPage(c.ctx, c.html, basis), ...checkWork(c.ctx, c.html, basis), ...c.csv.flatMap((b) => checkCsv(c.ctx, b)),
        ...checkDoc(c.ctx, c.doc)];
      expect(problems).toEqual([]);
    }, 120_000);
  }

  it("at Charlotte prices, the common dollars are Charlotte's everywhere offers sit together", () => {
    const c = comparison(context("colAdjustedTotal", undefined, 4, { pricesIn: CLT }));
    const problems = [...checkPage(c.ctx, c.html, "Charlotte"), ...checkWork(c.ctx, c.html, "Charlotte"), ...c.csv.flatMap((b) => checkCsv(c.ctx, b)),
      ...checkDoc(c.ctx, c.doc)];
    expect(problems).toEqual([]);
    expect(toText(c.doc)).toContain("Charlotte");
  }, 120_000);
});

describe("the test itself catches what it's for", () => {
  const ctx = alone("A");
  const html = renderAlone(ctx);
  it("an after-rent figure without its dollars", () => {
    const bare = html.replace(/(data-metric="own\.A\.total"[^>]*aria-label="[^"]*?)New York \$/, "$1$");
    expect(checkPage(ctx, bare, "test").some((x) => x.includes("own.A.total") && x.includes("accessible name doesn't name its dollars"))).toBe(true);
  });
  it("two offers' own-city figures side by side", () => {
    const compared = context();
    const row = renderBreakdowns(compared).replace(/data-metric="alone\.([AB])"/g, (_, l: string) => `data-metric="own.${l}.total"`);
    expect(checkPage(compared, row, "test").some((x) => x.includes("A and B's own-city figures side by side"))).toBe(true);
  });
  it("a rate or share without its period", () => {
    const bare = html.replace(/(data-metric="own\.A\.rate"[^>]*aria-label="[^"]*?) of its pay over your stay/, "$1");
    expect(checkPage(ctx, bare, "test").some((x) => x.includes("own.A.rate") && x.includes("doesn't state its period"))).toBe(true);
  });
});
