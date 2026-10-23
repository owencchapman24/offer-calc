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
  alone, BENEFITS, compareOf, context, ESPPS, ownOffers, renderAlone, renderBreakdowns, renderPage, requestOf, withLeave, withTies, withWork,
} from "./testing";
import { TheWork } from "./TheWork";
import { WorkProvider } from "./Tickmarks";
import { hasRanges } from "./cases";
import { sentenceOf } from "./Breakdown";
import { verdictSentence } from "./verdict";

// The label rules approved with the offer breakdown (docs/v2-plan.md, item 5, conditions 1 and 4, with condition 1 as the user
// amended it on 2026-10-16), checked wherever figures are shown: every breakdown part, the ledger's "On its own" row, the
// comparison's schedules, every Show the work, the CSVs, the copied document and the sentences said to screen readers. It fails on
// - an after-rent figure that doesn't name its dollars, or a dollar figure before rent and prices without its "$": in its accessible
//   name ("New York $6,671", "U.S.-avg $7,196"), in its Show the work and its CSV column, and on the figure or in its column's head;
// - a sentence that doesn't say its after-rent figures' dollars once, in words ("in U.S.-average dollars", "at New York prices"):
//   one that doesn't say them, says them twice, or puts them on a figure in the compact style ("U.S.-avg $507"), which is for
//   tables, column heads and figure labels;
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
      // A-2's bridge (stop 5B): after rent at the offer's own prices, and its month, in its own city's dollars; then the prices picked.
      if (c === "prices") return { money: "prices", rate: false };
      if (c === "own") return { money: "after", unit: city(a), rate: false, own: a as Letter };
      if (c === "spend" || c === "saved" || c === "inEspp") return { money: "after", unit: city(a), rate: true, own: a as Letter };
      return c === "total" ? common(false) : { money: "paid", rate: false };
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
    // A-2 to A-6 (stop 5B): dollars as paid; a share of each $100 states its year; A-5's month and A-6's rate their periods.
    case "a2": return c.endsWith("Share") || c === "hundred" ? { money: null, rate: true } : { money: "paid", rate: false };
    case "when": case "cliff": case "nextup": return { money: "paid", rate: b === "salary" };
    case "a5": return { money: "paid", rate: b === "month" };
    case "a6": return c === "rate" ? { money: null, rate: true } : { money: "paid", rate: false };
  }
  return { money: "paid", rate: false };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Dollars named on a figure: "U.S.-avg $7,196", "New York −$120", "U.S.-avg +$487". */
const named = (unit: string) => new RegExp(`${escape(unit.replace(/ \$$/, ""))} [−+]?\\$\\d`);
/** A dollar figure before rent and prices: "$110,000", "−$510", "($41,724)". */
const PAID = /[−+(]?\$\d/;
/** A period: over a stay, in a year, of a year's pay, the first lease year. */
const PERIOD = /over (?:your|its own|its|the|a \d+-year|your \d+-year|its \d+-year|the \d+-year) stay|if you stay \d+|\bstay \d+ (?:yrs?|years?)\b|in year \d+|\byear-\d+\b|\byear \d+\b|in \d{4}|of its \d{4} pay|\b\d{4} pay\b|first lease year|over \d+ years|each employment year|over the \d+ years|\byears? \d+ ?(?:–|to) ?\d+|\b\d+ yrs?\b|\byearly\b|\d% a year|starting salary|\d+-year total|\byour stay\b|of (?:each|that) calendar year's pay|of each year's (?:salary|pay)/i;
/** A place's dollars in words, as a sentence says them: "U.S.-average dollars", "at U.S. prices", "New York dollars". */
const wordsOf = (unit: string, flags = "") => {
  const place = escape(unit.replace(/ \$$/, "").replace(/-avg$/, ""));
  return new RegExp(`${place}(?:-average)? dollars|at ${place} prices`, flags);
};
/** Words that name a place's dollars, beside a figure or in its column's head: in words, or the compact "U.S.-avg $". */
const dollarsWords = (unit: string) => new RegExp(`${wordsOf(unit).source}|${escape(unit.replace(/ \$$/, ""))} \\$|${escape(unit)}`);

/** A block's sentences: split at a full stop or semicolon before a capital, and at " · ". A colon's lead-in stays with what follows. */
const sentences = (t: string) => t.split(/(?<=[.;])\s+(?=[A-Z(])|\s+·\s+/);

/**
 * A sentence's dollars (condition 1, as amended on 2026-10-16): said once, in words, for each place whose after-rent figures it
 * states (`units`), and never in the compact style on a figure (`known`: every place's units the page might use).
 */
function checkSentence(sentence: string, units: string[], known: string[]): string[] {
  const out: string[] = [];
  for (const u of new Set(units)) {
    const n = sentence.match(wordsOf(u, "g"))?.length ?? 0;
    if (n === 0) out.push(`doesn't say its dollars (${u}) in words`);
    if (n > 1) out.push(`says its dollars (${u}) ${n} times`);
  }
  for (const u of new Set(known)) if (named(u).test(sentence)) out.push(`puts its dollars on a figure in the compact style (${u})`);
  return out;
}

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

/** The prose a figure sits in, if any: a paragraph, or a list's item that isn't the rank list's (a figure and its letter). */
const proseOf = (fig: Node) => {
  const block = ancestors(fig).find((x) => x.tag === "p" || x.tag === "li");
  return block && !(block.tag === "li" && ancestors(block).some((x) => has(x, "ranks"))) ? block : null;
};
const MARK = "\u0001";
/** A block's text with a figure marked, so its sentence can be found. */
const marked = (n: Node | string, fig: Node): string => (typeof n === "string" ? n : n === fig ? `${MARK}${text(n)}`
  : n.attrs.class?.split(" ").includes("tick") ? ""
  : n.children.map((c) => (typeof c === "string" ? c : ` ${marked(c, fig)} `)).join("").replace(/\s+/g, " ").trim());

interface Shown { id: string; name: string; value: string; around: string; node: Node; sentence: string | null }

function figures(html: string): { root: Node; figs: Shown[] } {
  const root = parse(html);
  const figs = all(root, (n) => n.tag === "button" && !!n.attrs["data-metric"]).map((n) => {
    const prose = proseOf(n);
    const sentence = prose ? sentences(marked(prose, n)).find((x) => x.includes(MARK))!.replace(MARK, "") : null;
    return { id: n.attrs["data-metric"], name: n.attrs["aria-label"] ?? "", value: text(n), around: context_(n, root), node: n, sentence };
  });
  return { root, figs };
}

/** Every place's units the page might use: the prices picked and each offer's city. */
const unitsOf = (ctx: WorkContext) => [priceWords(ctx.household.pricesIn).unit,
  ...ctx.offers.map((o) => `${shortCity(cityName(o.draft.costOfLiving.area))} $`)];

// ---- the checks -------------------------------------------------------------------------------------------------------------

function checkPage(ctx: WorkContext, html: string, where: string): string[] {
  const problems: string[] = [];
  const { root, figs } = figures(html);
  const known = unitsOf(ctx);
  // Each sentence with a figure in it, and the after-rent dollars its figures are in: checked once each, below.
  const said = new Map<string, Set<string>>();
  for (const f of figs) {
    const found = expectOf(f.id, ctx);
    if (!found) continue;
    // L-2's drop is a figure a month in its sentence and a share in its table.
    const e = f.value.includes("%") ? { ...found, money: null } : found;
    const say = (what: string) => problems.push(`${where}: ${f.id} "${f.value}" (${f.name}): ${what}`);
    if (f.sentence !== null && !said.has(f.sentence)) said.set(f.sentence, new Set());
    if (e.money === "after") {
      if (!named(e.unit!).test(f.name)) say(`its accessible name doesn't name its dollars (${e.unit})`);
      if (f.sentence !== null) said.get(f.sentence)!.add(e.unit!);
      else if (!named(e.unit!).test(f.value) && !dollarsWords(e.unit!).test(f.around)) say(`neither it nor its head names its dollars (${e.unit})`);
    }
    if (e.money === "paid" && !PAID.test(f.name)) say("its accessible name has no $");
    if (e.money === "prices" && !/ prices\b/.test(f.name)) say("its accessible name doesn't name the prices it steps across");
    if (e.rate) {
      if (!PERIOD.test(f.name)) say("its accessible name doesn't state its period");
      if (!PERIOD.test(f.sentence ?? `${f.value} ${f.around}`)) say(`neither it nor its ${f.sentence === null ? "head" : "sentence"} states its period`);
    }
  }
  for (const [sentence, units] of said) for (const x of checkSentence(sentence, [...units], known)) problems.push(`${where}: "${sentence}" ${x}`);
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
function checkDoc(ctx: WorkContext, doc: Doc, letter?: Letter): string[] {
  const problems: string[] = [];
  const p = priceWords(ctx.household.pricesIn);
  const known = unitsOf(ctx);
  // One offer's breakdown (stop 5C), alone or as a part of "both": its own city's dollars, or the prices picked.
  const cityOf = (l: string) => `${shortCity(cityName(ctx.offers.find((o) => o.letter === l)!.draft.costOfLiving.area))} $`;
  let own: string | null = letter ? cityOf(letter) : null;
  for (const b of doc.blocks) {
    if (b.kind === "part") {
      const l = /^([A-C]),/.exec(b.text)?.[1];
      own = l ? cityOf(l) : null;
      continue;
    }
    const units = own ? [p.unit, own] : [p.unit];
    if (b.kind === "table") {
      const t = b.table;
      for (const row of t.rows) {
        const around = `${t.title ?? ""} · ${t.head.join(" · ")} · ${row.label}`;
        if (/after rent/i.test(row.label) && row.cells.some((x) => /\d/.test(x)) && !units.some((u) => dollarsWords(u).test(around))) {
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
      for (const s of sentences(para)) {
        if (/\$\d[\d,.]*\s+(a month|an hour|a year)|\d%/.test(s) && !PERIOD.test(s)) problems.push(`document: "${s}" doesn't state its period`);
        // A sentence that states an after-rent figure says its dollars once, in words, and none puts them on a figure.
        const named = units.filter((u) => wordsOf(u).test(s));
        const said = /after rent/i.test(s) && /\$\d/.test(s) ? (named.length ? named : [own ?? p.unit]) : [];
        for (const x of checkSentence(s, said, known)) problems.push(`document: "${s}" ${x}`);
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
    ...r.letters.flatMap((letter) => (["years", "stay", "payments", "tax"] as const).map((part) => ({ kind: "a7" as const, letter, part }))),
    ...r.letters.flatMap((letter) => (["a2", "bridge", "a3", "a5", "a6"] as const).map((part) => ({ kind: "part" as const, letter, part })))];
  const at = firstLastDay(leaveAxis(r.view.row.window.start, r.view.row.years));
  const opts = { offers: compareOf(ctx).offers, at, picked: false, letters: r.letters };
  const doc = buildDoc(ctx, opts);
  // Copy as document's other two (stop 5C): each offer's breakdown, and both.
  const docs: Array<[Doc, Letter | undefined]> = [[doc, undefined], ...(["summary", "full"] as const).flatMap((detail) => [
    [buildDoc(ctx, { ...opts, kind: "both", detail }), undefined] as [Doc, undefined],
    ...r.letters.map((l): [Doc, Letter] => [buildDoc(ctx, { ...opts, kind: "breakdown", letter: l, detail }), l])])];
  return { ctx, html, csv: tables.map((t) => csvBuild(ctx, t)), doc, docs };
}

const CLT = "16740";

describe("every figure names its dollars, and every rate or share its period (conditions 1 and 4)", () => {
  it("one offer on its own: A-1, its Show the work, at U.S. prices and at Charlotte's", () => {
    const problems: string[] = [];
    for (const [where, ctx] of [["A alone", alone("A")], ["B alone", alone("B")], ["C alone, Charlotte prices", alone("C", undefined, { pricesIn: CLT })]] as const) {
      const html = renderAlone(ctx);
      expect(html).toContain('data-metric="own.A.total"');
      problems.push(...checkPage(ctx, html, where), ...checkWork(ctx, html, where));
      // The live region's sentence with one offer: its dollars said once, in words.
      const x = ownOffers(ctx).find((o) => o.input)!;
      const said = sentenceOf(x, priceWords(ctx.household.pricesIn))!;
      problems.push(...checkSentence(said, [`${shortCity(cityName(x.offer.draft.costOfLiving.area))} $`], unitsOf(ctx)).map((y) => `${where}: "${said}" ${y}`));
      // Its copied breakdown (stop 5C).
      for (const detail of ["summary", "full"] as const) {
        const doc = buildDoc(ctx, { offers: requestOf(ctx).offers, at: ctx.own!.leave!.at, picked: false, kind: "breakdown", letter: "A", letters: ["A"], detail });
        problems.push(...checkDoc(ctx, doc, "A").map((y) => `${where}, ${detail}: ${y}`));
      }
    }
    expect(problems).toEqual([]);
  }, 60_000);

  for (const basis of ["colAdjustedTotal", "perHour", "cash"] as const) {
    it(`the comparison on the ${basis} basis: every schedule, the breakdowns, the "On its own" row, Show the work, the CSVs and the document`, () => {
      const c = comparison(context(basis));
      expect(c.html).toContain('data-metric="alone.A"');
      expect(c.html).toContain('data-metric="own.C.ref"');
      const problems = [...checkPage(c.ctx, c.html, basis), ...checkWork(c.ctx, c.html, basis), ...c.csv.flatMap((b) => checkCsv(c.ctx, b)),
        ...c.docs.flatMap(([d, l]) => checkDoc(c.ctx, d, l))];
      // The verdict as the live region and the tablet's bar say it: its dollars once, in words, after rent.
      const v = c.ctx.results!.view;
      const said = verdictSentence(v);
      const after = basis === "colAdjustedTotal" || (basis === "perHour" && v.perHourOf === "colAdjustedTotal");
      problems.push(...checkSentence(said, after ? [v.prices.unit] : [], unitsOf(c.ctx)).map((y) => `"${said}" ${y}`));
      expect(problems).toEqual([]);
    }, 120_000);
  }

  it("offers with an ESPP (4i): its lines, its notes, their Show the work, the CSVs and the documents", () => {
    const c = comparison(context("colAdjustedTotal", ESPPS));
    for (const id of ["a5.B.esppIn", "l6y.B.esppHeld.1", "l6y.B.espp.sum", "br.B.1.espp", "br.C.1.espp"]) expect(c.html).toContain(`data-metric="${id}"`);
    const problems = [...checkPage(c.ctx, c.html, "ESPP"), ...checkWork(c.ctx, c.html, "ESPP"), ...c.csv.flatMap((b) => checkCsv(c.ctx, b)),
      ...c.docs.flatMap(([d, l]) => checkDoc(c.ctx, d, l))];
    expect(problems).toEqual([]);
  }, 120_000);

  it("offers with other benefits (4j): their lines, A-1's own line, A-5's, their Show the work, the CSVs and the documents", () => {
    const c = comparison(context("colAdjustedTotal", BENEFITS));
    for (const id of ["own.A.taxFree", "own.A.y1taxFree", "br.A.1.taxFree", "br.A.1.benefit", "a5.A.ob.0.stay", "a5.A.ob.0.afterTax", "a5.A.ob.1.stay",
      "when.A.benefit", "l6y.A.benefit.1"]) expect(c.html).toContain(`data-metric="${id}"`);
    const problems = [...checkPage(c.ctx, c.html, "benefits"), ...checkWork(c.ctx, c.html, "benefits"), ...c.csv.flatMap((b) => checkCsv(c.ctx, b)),
      ...c.docs.flatMap(([d, l]) => checkDoc(c.ctx, d, l))];
    expect(problems).toEqual([]);
  }, 120_000);

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
  it("passes a sentence that says its dollars once, in words, its figures without them", () => {
    expect(html).toContain("dollars at New York prices:");
    expect(checkPage(ctx, html, "test")).toEqual([]);
  });
  it("a sentence that doesn't say its dollars", () => {
    const bare = html.replace("dollars at New York prices:", "dollars:");
    expect(checkPage(ctx, bare, "test").some((x) => x.includes("$7,563 a month over your stay") && x.includes("doesn't say its dollars (New York $) in words")))
      .toBe(true);
    const said = "C leaves you about $487 a month more than A over your stay, after rent.";
    expect(checkSentence(said, ["U.S.-avg $"], unitsOf(ctx))).toEqual(["doesn't say its dollars (U.S.-avg $) in words"]);
  });
  it("a sentence that says its dollars twice", () => {
    const twice = html.replace("Year 1, as paid, in New York dollars:", "Year 1, as paid, in New York dollars, at New York prices:");
    expect(checkPage(ctx, twice, "test").some((x) => x.includes("Year 1, as paid") && x.includes("says its dollars (New York $) 2 times"))).toBe(true);
  });
  it("a sentence that puts its dollars on a figure, in the compact style", () => {
    const compact = html.replace(/(data-metric="own\.A\.y1spend"[^>]*>(?:<[^>]*>)*)\$/, "$1New York $");
    expect(compact).not.toBe(html);
    expect(checkPage(ctx, compact, "test").some((x) => x.includes("Year 1, as paid") && x.includes("compact style (New York $)"))).toBe(true);
    const said = "C leaves you about U.S.-avg $487 a month more than A over your stay, after rent, at U.S. prices.";
    expect(checkSentence(said, ["U.S.-avg $"], unitsOf(ctx))).toEqual(["puts its dollars on a figure in the compact style (U.S.-avg $)"]);
  });
});
