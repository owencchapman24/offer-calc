import { describe, expect, it } from "vitest";
import { buildDoc, type Doc, type DocOptions, num, SAMPLE_LINE, type Table, toHtml, toText, vestingText } from "./copyDoc";
import { firstLastDay, leaveAxis } from "./leaveModel";
import { bridge, byYear, type WorkContext } from "./metrics";
import type { AppOffer } from "./model";
import { dollars, figure, longDate } from "./text";
import { compareOf, context, withLeave, withTies } from "./testing";
import { verdictSentence } from "./verdict";

// "Copy as document" (docs/copy-as-document-plan.md): every total in the document adds up as displayed, every calculation it
// states works out as displayed, the HTML and the plain text carry the same figures, and its figures are the page's.

/** The document for a comparison, with L-3's ties and L-4's panel at its last day worked out, as the worker would. */
function made(base: WorkContext, at?: string) {
  const ctx = withLeave(withTies(base).ctx, at).ctx;
  const r = ctx.results!;
  const opts: DocOptions = { offers: compareOf(ctx).offers, at: at ?? firstLastDay(leaveAxis(r.view.row.window.start, r.view.row.years)), picked: !!at };
  const doc = buildDoc(ctx, opts);
  return { ctx, doc, html: toHtml(doc), text: toText(doc) };
}

const tables = (doc: Doc): Table[] => doc.blocks.flatMap((b) => (b.kind === "table" ? [b.table] : []));
/** The HTML's text, as a reader sees it: tags out, entities back. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
/** Every figure, in order: "190,000", "$1,373", "5.82", "2026". */
const figures = (s: string) => s.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
/** Half the last place shown: "1,373" -> 0.5, "43.5191" -> 0.00005, "7.8%" -> 0.05. */
const half = (shown: string) => {
  const d = shown.replace(/%$/, "").match(/\.(\d+)$/);
  return d ? 0.5 * 10 ** -d[1].length : 0.5;
};

/** No ranges anywhere: every bear and bull at the base, every promotion in every scenario. */
function flat(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(flat);
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o.base === "number" && "bear" in o && "bull" in o) return { bear: o.base, base: o.base, bull: o.base };
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === "scenarios" && Array.isArray(v) ? ["bear", "base", "bull"] : flat(v)]));
  }
  return x;
}

const later = () => context("colAdjustedTotal", (os) => os.map((o) => (o.letter === "B" ? { ...o, draft: { ...o.draft, startDate: "2026-10-01" } } : o)),
  4, { otherWagesThisYear: 20_000 });
const CONTEXTS: Array<[string, () => WorkContext]> = [
  ["the samples", () => context()],
  ["a 5-year stay (a close call)", () => context("colAdjustedTotal", undefined, 5)],
  ["per hour", () => context("perHour")],
  ["total rewards", () => context("totalRewards")],
  ["prices in Charlotte", () => context("colAdjustedTotal", undefined, 4, { pricesIn: "16740" })],
  ["B starting later, with other wages in 2026", later],
  ["two offers", () => context("colAdjustedTotal", (os) => os.filter((o) => o.letter !== "C"))],
  ["no ranges, not samples", () => context("colAdjustedTotal", (os) => os.map((o) => ({ ...o, sample: null, draft: flat(o.draft) as AppOffer["draft"] })))],
];

describe("Copy as document: every total adds up as displayed", () => {
  for (const [name, make] of CONTEXTS) {
    it(`${name}: each table's totals are the lines above them, and each worked line works out, as shown`, () => {
      const { doc, html, text } = made(make());
      const footed = tables(doc).filter((t) => t.foots);
      expect(footed.length).toBeGreaterThanOrEqual(2);
      for (const t of footed) {
        for (let j = 0; j < t.head.length - 1; j++) {
          let acc: number | null = null;
          for (const row of t.rows) {
            if (row.kind === "group") continue;
            const v = num(row.cells[j]);
            const total = row.kind === "subtotal" || row.kind === "total";
            if (total) expect(v, `${t.title ?? "table"}, ${t.head[j + 1]}: ${row.label}`).toBe(acc);
            acc = total ? v : (acc ?? 0) + v;
          }
        }
      }
      expect(doc.worked.length).toBeGreaterThan(3);
      const htmlText = textOf(html);
      for (const w of doc.worked) {
        const [a, b] = w.of.map(num);
        const is = num(w.is);
        const said = `${w.of.join(` ${w.op} `)} = ${w.is}`;
        if (w.op === "+") expect(w.of.reduce((s, x) => s + num(x), 0), said).toBeCloseTo(is, 6);
        else if (w.op === "−") expect(a - b, said).toBeCloseTo(is, 6);
        else {
          // To the precision shown: the result's last place, plus what the operands' own rounding can move it.
          const scale = w.percent ? 100 : 1;
          const slack = half(w.is) + scale * (half(w.of[0]) / Math.abs(b) + (Math.abs(a) * half(w.of[1])) / b ** 2);
          expect(Math.abs((scale * Math.abs(a)) / Math.abs(b) - Math.abs(is)), said).toBeLessThanOrEqual(slack + 1e-9);
        }
        // Each is in the document, in both flavors.
        for (const s of [...w.of, w.is]) {
          if (s === "$0") continue;
          expect(text, `${said}: "${s}" in the text`).toContain(s);
          expect(htmlText, `${said}: "${s}" in the HTML`).toContain(s);
        }
      }
    }, 30_000);
  }
});

describe("Copy as document: the HTML and the plain text carry identical figures", () => {
  for (const [name, make] of CONTEXTS) {
    it(name, () => {
      const { html, text } = made(make());
      const a = figures(textOf(html));
      expect(a.length).toBeGreaterThan(150);
      expect(a).toEqual(figures(text));
    }, 30_000);
  }
});

describe("Copy as document: its figures are the page's", () => {
  const { ctx, doc, text } = made(context());
  const r = ctx.results!;
  const all = tables(doc);
  const rowOf = (label: string | RegExp) => all.flatMap((t) => t.rows).find((x) => (typeof label === "string" ? x.label === label : label.test(x.label)))!;

  it("the verdict, the totals in today's dollars, and each step", () => {
    expect(text).toContain(verdictSentence(r.view));
    expect(rowOf("Your stay, in today's dollars").cells).toEqual(r.letters.map((_, i) => figure(r.view.row.values.colAdjustedTotal![i])));
    expect(rowOf("After rent, at U.S. prices").cells.slice(0, 3)).toEqual(r.letters.map((_, i) => figure(r.view.row.values.colAdjustedTotal![i])));
    expect(rowOf("After rent, per hour worked").cells[3]).toBe("C, $19.47 an hour");
    expect(text).toContain("A pays more; C wins once rent and prices are counted.");
  });

  it("the bridge is the page's bridge, line by line, and each year is L-1's", () => {
    const totals = all.find((t) => t.rows.some((x) => x.label === "Paid in year 1"))!;
    for (const [i, l] of r.letters.entries()) {
      const b = bridge(ctx, l, 1);
      for (const line of ["letter", "paid", "afterTax", "totalRewards", "total"] as const) {
        const value = b.rows.find((x) => x.line === line)!.value;
        expect(totals.rows.some((x) => x.cells[i] === figure(value))).toBe(true);
      }
      byYear(ctx, l).years.forEach((y) => expect(rowOf(new RegExp(`^Year ${y.n}\\b`)).cells[i]).toBe(figure(y.value)));
    }
    // W4's year 1 for A, as the page shows it since slice 6 (the year figures as shown).
    expect(rowOf("After rent, at U.S. prices").kind).toBe("key");
    expect(text).toMatch(/After rent, at U\.S\. prices\s+62,594\s+53,929\s+73,093/);
  });

  it("what would tie is L-3's, and leaving early is L-4's panel", () => {
    const a = r.ties!.l3!.rows.find((x) => r.letters[x.offer] === "A")!;
    expect(rowOf("A: starting salary").cells).toEqual(["$110,000", dollars(a.salary.to!), "+$8,626 (+7.8%)"]);
    expect(text).toContain("This depends on rent: at HUD's estimate for New York ($2,729 a month), A wins.");
    const panels = r.leave!.panels;
    expect(rowOf("You'd keep, after tax, as paid").cells).toEqual(panels.map((p) => dollars(p!.afterTaxCompKept)));
  });
});

describe("Copy as document: for a reader who has never seen the tool", () => {
  it("says the samples are illustrative, first and last, and only when there are samples", () => {
    const { text, html } = made(context());
    const lines = text.trim().split("\n");
    expect(lines.slice(0, 5)).toContain(`*** ${SAMPLE_LINE} ***`);
    expect(lines[lines.length - 1]).toBe(`*** ${SAMPLE_LINE} ***`);
    expect(html.split(SAMPLE_LINE).length - 1).toBe(2);
    const none = made(context("colAdjustedTotal", (os) => os.map((o) => ({ ...o, sample: null }))));
    expect(none.text).not.toContain(SAMPLE_LINE);
    expect(none.html).not.toContain(SAMPLE_LINE);
  });

  it("has no tickmarks, workpaper references or jargon, and no styles, classes, scripts or images to lose in a paste", () => {
    const { text, html } = made(context());
    expect(text).not.toMatch(/[✓^]|\b[LM]-\d|\bbasis\b|\btickmark/);
    expect(html).not.toMatch(/<style|class=|<script|<img/);
    for (const cell of html.match(/<t[dh][\s>][^>]*>|<t[dh]>/g) ?? []) expect(cell).toMatch(/ style="/);
  });

  it("describes vesting and refreshers precisely", () => {
    const { text } = made(context());
    expect(text).toContain("RSUs: a $120,000 new-hire grant vesting 5/15/40/40 (back-loaded), semiannual after a 1-year cliff, plus $25,000 refresher "
      + "grants each year from the first anniversary, each vesting 25/25/25/25 (even), quarterly after a 1-year cliff, on the company's vest dates "
      + "(Feb, May, Aug and Nov 15)");
    expect(vestingText({ tranches: [12, 24, 36, 48].map((month, i) => ({ month, fraction: [0.4, 0.3, 0.2, 0.1][i] })) }))
      .toBe("40/30/20/10 (front-loaded), annual");
    expect(vestingText({ tranches: [{ month: 12, fraction: 1 }] })).toBe("100, all at month 12");
  });

  it("the L-2 sentence comes only with a range", () => {
    expect(made(context()).text).toContain("If things go badly (every uncertain input at its low value at once, the bear case): C holds up best");
    expect(made(CONTEXTS[7][1]()).text).not.toContain("If things go badly");
  });

  it("leaving early: one last day, L-4's (six months in unless one was picked), and where to see any other", () => {
    const six = made(context());
    const r = six.ctx.results!;
    const day = firstLastDay(leaveAxis(r.view.row.window.start, r.view.row.years));
    expect(six.text).toContain(`If your last day were ${longDate(day)}, 6 months in\n`);
    expect(six.text).toContain("Offer Calc's Leaving early section shows any other last day.");
    const picked = made(context(), "2027-07-12");
    expect(picked.text).toContain("If your last day were Jul 12, 2027, 12 months in (the day picked in Offer Calc)");
  });

  it("plain-text tables fit in 80 columns", () => {
    for (const [name, make] of CONTEXTS) {
      const { doc } = made(make());
      for (const t of tables(doc)) {
        for (const line of toText({ blocks: [{ kind: "table", table: t }], worked: [] }).split("\n").slice(t.title ? 1 : 0)) {
          expect(line.length, `${name}: ${line}`).toBeLessThanOrEqual(80);
        }
      }
    }
  }, 60_000);
});
