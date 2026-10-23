import { describe, expect, it } from "vitest";
import { buildDoc, type Doc, type DocDetail, type DocKind, type DocOptions, num, SAMPLE_LINE, SAMPLE_ONE, type Table, toHtml, toText, vestingText } from "./copyDoc";
import { firstLastDay, leaveAxis } from "./leaveModel";
import { type WorkContext } from "./metrics";
import { bridge, byYear } from "./byYearModel";
import type { AppOffer, Letter } from "./model";
import { dollars, figure, longDate } from "./text";
import { alone, BENEFITS, compareOf, context, ESPPS, requestOf, withBenefits, withEspp, withLeave, withTies } from "./testing";
import { verdictSentence } from "./verdict";

// "Copy as document" (docs/copy-as-document-plan.md): every total in the document adds up as displayed, every calculation it
// states works out as displayed, the HTML and the plain text carry the same figures, and its figures are the page's.

/**
 * The document for a comparison, with L-3's ties and L-4's panel at its last day worked out, as the worker would; or with `kind`,
 * one offer's breakdown (A-4's cliffs and last day are the context's, as the page's breakdowns ask for them) or both.
 */
function made(base: WorkContext, at?: string, kind: DocKind = "comparison", letter?: Letter, detail: DocDetail = "full") {
  if (kind === "breakdown" && !base.results) {
    const req = requestOf(base);
    const doc = buildDoc(base, { offers: req.offers, at: base.own!.leave!.at, picked: false, kind, letter: letter ?? "A", letters: base.offers.map((o) => o.letter),
      detail });
    return { ctx: base, doc, html: toHtml(doc), text: toText(doc) };
  }
  const ctx = withLeave(withTies(base).ctx, at).ctx;
  const r = ctx.results!;
  const opts: DocOptions = { offers: compareOf(ctx).offers, at: at ?? firstLastDay(leaveAxis(r.view.row.window.start, r.view.row.years)), picked: !!at, kind,
    letter, letters: r.letters, detail };
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
const CONTEXTS: Array<[string, () => WorkContext, DocKind?, Letter?, DocDetail?]> = [
  ["the samples", () => context()],
  ["a 5-year stay (a close call)", () => context("colAdjustedTotal", undefined, 5)],
  ["per hour", () => context("perHour")],
  ["total rewards", () => context("totalRewards")],
  ["prices in Charlotte", () => context("colAdjustedTotal", undefined, 4, { pricesIn: "16740" })],
  ["B starting later, with other wages in 2026", later],
  ["two offers", () => context("colAdjustedTotal", (os) => os.filter((o) => o.letter !== "C"))],
  ["no ranges, not samples", () => context("colAdjustedTotal", (os) => os.map((o) => ({ ...o, sample: null, draft: flat(o.draft) as AppOffer["draft"] })))],
  // One offer's breakdown (stop 5C): each sample on its own, at its own prices; one at Charlotte's; one in a comparison; and both.
  ["A on its own, in full", () => alone("A"), "breakdown"],
  ["A on its own, the summary", () => alone("A"), "breakdown", undefined, "summary"],
  ["B on its own, a 5-year stay", () => alone("B", undefined, { stayYears: 5 }), "breakdown"],
  ["C on its own, prices in Charlotte, the summary", () => alone("C", undefined, { pricesIn: "16740" }), "breakdown", undefined, "summary"],
  ["no ranges, not a sample, on its own", () => alone("A", (o) => ({ ...o, sample: null, draft: flat(o.draft) as AppOffer["draft"] })), "breakdown"],
  ["C's breakdown, in a comparison", () => context(), "breakdown", "C"],
  ["B's breakdown, starting later, the summary", later, "breakdown", "B", "summary"],
  ["both, the breakdowns in summary", () => context(), "both", undefined, "summary"],
  ["both, the breakdowns in full", () => context(), "both"],
  // ESPPs (4i): B's money held at each year's end, C's on salary and bonus with a rising price; A on its own with one.
  ["with ESPPs", () => context("colAdjustedTotal", ESPPS)],
  ["with ESPPs, both in full", () => context("colAdjustedTotal", ESPPS), "both"],
  ["A on its own with an ESPP, in full", () => alone("A", (o) => withEspp(o)), "breakdown"],
  // Other benefits (4j): A's taxable and tax-free, none for B, not entered for C; and A on its own with them.
  ["with other benefits, both in full", () => context("colAdjustedTotal", BENEFITS), "both"],
  ["A on its own with other benefits, in full", () => alone("A", (o) => withBenefits(o)), "breakdown"],
];

describe("Copy as document: every total adds up as displayed", () => {
  for (const [name, make, kind, letter, detail] of CONTEXTS) {
    it(`${name}: each table's totals are the lines above them, and each worked line works out, as shown`, () => {
      const { doc, html, text } = made(make(), undefined, kind, letter, detail);
      const footed = tables(doc).filter((t) => t.foots);
      expect(footed.length).toBeGreaterThanOrEqual(2);
      for (const t of footed) {
        for (let j = 0; j < t.head.length - 1; j++) {
          let acc: number | null = null;
          for (const row of t.rows) {
            if (row.kind === "group") continue;
            const v = num(row.cells[j]);
            const total = row.kind === "subtotal" || row.kind === "total";
            if (total) expect(v, `${t.title ?? "table"}, ${t.head[j + 1]}: ${row.label}`).toBeCloseTo(acc ?? NaN, 6);
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
  for (const [name, make, kind, letter, detail] of CONTEXTS) {
    it(name, () => {
      const { html, text } = made(make(), undefined, kind, letter, detail);
      const a = figures(textOf(html));
      expect(a.length).toBeGreaterThan(kind === "breakdown" && detail === "summary" ? 60 : 150);
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
    // C's per hour at the default 48.2 weeks a year: 50 weeks' $19.47 × 50 ÷ 48.2.
    expect(rowOf("After rent, at U.S. prices, per hour worked").cells[3]).toBe("C, $20.20 an hour");
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
    expect(text).toContain("This depends on rent: at HUD's estimate for New York ($2,729 a month in the first lease year), A wins.");
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
    for (const [name, make, kind, letter, detail] of CONTEXTS) {
      const { doc } = made(make(), undefined, kind, letter, detail);
      for (const t of tables(doc)) {
        for (const line of toText({ blocks: [{ kind: "table", table: t }], worked: [] }).split("\n").slice(t.title ? 1 : 0)) {
          expect(line.length, `${name}: ${line}`).toBeLessThanOrEqual(80);
        }
      }
    }
  }, 60_000);
});

describe("Copy as document, for one offer: its breakdown, for someone who's never seen the tool", () => {
  const a = made(alone("A"), undefined, "breakdown", "A", "full");
  const all = tables(a.doc);

  it("the full detail has the plan's parts in order: the bottom line, where the money goes, pay by year, terms, benefits, tax, the offer, assumptions", () => {
    const headings = a.doc.blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : []));
    expect(headings).toEqual(["1. The bottom line", "2. Where the money goes: year 1", "3. Pay by year, and when it arrives", "4. Terms that can bite",
      "5. What the benefits are worth", "6. Tax by year, and warnings", "7. The offer, as entered", "8. Assumptions"]);
    expect(a.text.split("\n")[0]).toBe("A, NYC BANK: ONE JOB OFFER, WORKED OUT");
  });

  it("the summary: the bottom line, where the money goes, pay by year, the key terms and the bad case; then the offer and assumptions", () => {
    const s = made(alone("A"), undefined, "breakdown", "A", "summary");
    expect(s.doc.blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : []))).toEqual(["1. The bottom line", "2. Where the money goes: year 1",
      "3. Pay by year", "4. The key terms, and the bad case", "5. The offer, as entered", "6. Assumptions"]);
    // Its figures are the full detail's: the same bottom line, $100 and pay by year, the same terms and bad case.
    expect(s.text).toContain("Left to spend, 55,762 ÷ 12, is $4,647 a month in year 1, after rent, in New York dollars.");
    expect(s.text).toMatch(/Bad case, after rent, in New York dollars: \$6,245 a month over your stay, 17% under the base case/);
    expect(s.text).toContain("The $10,000 sign-on is repaid in full if you leave before Jul 12, 2027.");
    for (const left of ["From the offer letter to after rent", "Every other payment in your stay", "If your last day were", "Every cliff in its stay",
      "What the benefits add", "Tax by calendar year"]) expect(s.text).not.toContain(left);
    expect(s.text).toContain("The full detail adds year 1's bridge from the offer letter, every payment and every cliff by date");
    expect(tables(s.doc)).toHaveLength(2);
  });

  it("its figures are the breakdown's: A-1's bottom line, A-2's $100 and bridge, A-6's rate (the plan's worked example)", () => {
    // A-1: $7,564 a month over the stay at New York prices = $6,672 to spend + $892 saved (as the page shows it, 5A's screenshots).
    expect(a.text).toMatch(/A leaves you about \$[\d,]+ a month over your stay, after rent, in New York dollars: \$[\d,]+ to spend and \$[\d,]+ saved\./);
    // A-2: 41,724 / 152,986 = $27.27 of each $100; left to spend takes the rounding, $36.45; 55,762 / 12 = $4,647 a month in year 1.
    const hundred = all.find((t) => t.head[1] === "Of each $100 of year-1 pay")!;
    expect(hundred.rows.map((r) => [r.label, ...r.cells])).toEqual([
      ["Tax", "$27.27", "41,724"], ["Rent", "$29.81", "45,600"], ["Health costs", "$2.16", "3,300"], ["Saved", "$4.31", "6,600"], ["Left to spend", "$36.45", "55,762"],
      ["Paid to you", "$100.00", "152,986"],
    ]);
    expect(a.text).toContain("Left to spend, 55,762 ÷ 12, is $4,647 a month in year 1, after rent, in New York dollars.");
    const bridgeRows = all.find((t) => t.title?.startsWith("From the offer letter"))!.rows;
    expect(bridgeRows.at(-1)).toEqual({ label: "After rent, at New York prices", cells: ["65,662"], kind: "total" });
  });

  it("says the sample is illustrative, first and last; a real offer, never", () => {
    const lines = a.text.trim().split("\n");
    expect(lines.slice(0, 5)).toContain(`*** ${SAMPLE_ONE} ***`);
    expect(lines[lines.length - 1]).toBe(`*** ${SAMPLE_ONE} ***`);
    const real = made(alone("A", (o) => ({ ...o, sample: null })), undefined, "breakdown");
    expect(real.text).not.toContain(SAMPLE_ONE);
  });

  it("has no tickmarks, workpaper references or jargon", () => {
    expect(a.text).not.toMatch(/[✓^]|\b[LMA]-\d|\bbasis\b|\btickmark/);
    expect(a.html).not.toMatch(/<style|class=|<script|<img/);
  });

  it("A-4's terms, cliffs and last day are the page's", () => {
    expect(a.text).toContain("The $10,000 sign-on is repaid in full if you leave before Jul 12, 2027.");
    expect(a.text).toContain("Jan 31, 2027: the bonus for 2026");
    expect(a.text).toMatch(/If your last day were Jan 12, 2027, 6 months in: you'd keep \$[\d,]+ after tax, as paid, repay \$10,000,/);
    expect(a.text).toMatch(/Bad case, after rent, in New York dollars: \$6,245 a month over your stay, 17% under the base case/);
  });

  it("days off and unused vacation (4a): the offer as entered, A-5's paid time off, the terms and the last day", () => {
    expect(a.text).toContain("80 hours a week for 48.2 weeks a year, after 11 vacation days, 8 holidays and no sick days");
    // 19 days × 110,000 ÷ 260 = 8,038.46.
    expect(a.text).toContain("Paid time off: 11 vacation days, 8 holidays and no sick days, 19 days a year; $8,038 of its starting salary a year is for "
      + "those days, which salary already counts.");
    // In California, giving 15 days: 4 bank a year, and A-4's first last day, Jan 12, 2027, pays 4 × 184 ÷ 365 days × 110,000 ÷ 260 = $853.
    const ca = made(alone("A", (o) => ({ ...o, draft: { ...o.draft, employerState: "CA", timeOff: { ...o.draft.timeOff, gives: 15 } } })),
      undefined, "breakdown", "A", "full");
    expect(ca.text).toContain("It gives 15 vacation days a year and you'd take 11, so 4 bank each year; California requires unused vacation be paid "
      + "when you leave.");
    expect(ca.text).toMatch(/you'd keep \$[\d,]+ after tax, as paid, with \$853 before tax for 2\.02 days of unused vacation paid out, repay \$10,000,/);
  });

  it("other benefits (4j): the offer as entered, the bottom line's own line, A-2's employer adds, A-5's lines, the terms and the note", () => {
    const e = made(alone("A", (o) => withBenefits(o)), undefined, "breakdown", "A", "full");
    expect(e.text).toContain("Wellness, $1,200 a year, taxable; Gym, $600 a year, tax-free as entered");
    expect(e.text).toMatch(/A leaves you about \$[\d,]+ a month over your stay, after rent, in New York dollars: \$[\d,]+ to spend, \$[\d,]+ saved and \$\d+ in tax-free benefits\./);
    expect(e.text).toContain("$600 of tax-free benefits (Gym)");
    expect(e.text).toMatch(/Wellness, taxable \(pay\): \$1,200 a year, \$4,800 over the stay, as paid \(\$[\d,]+ after tax\)\./);
    expect(e.text).toContain("Gym, tax-free, as entered: $600 a year, $2,400 over the stay, as paid.");
    expect(e.text).toContain("Its other benefits (Wellness, Gym) stop on your last day.");
    expect(e.text).toContain("Counted tax-free, as entered: Gym.");
  });

  it("an ESPP (4i): the offer as entered, its purchases by date, A-5's note, the terms and the holding note", () => {
    const e = made(alone("A", (o) => withEspp(o)), undefined, "breakdown", "A", "full");
    expect(e.text).toContain("an ESPP: 10% of salary, 15% off with a lookback, 6-month offerings, each lot sold the day it's bought");
    // A joins Jan 1, 2027's offering: Jan-Jun's 6 × 110,000 ÷ 12 × 10% = 5,500 buys 5,500 ÷ 0.85 = 6,470.59 of stock Jun 30, a gain of 970.59.
    expect(e.text).toContain("Jun 30, 2027: ESPP purchase, the offering from Jan 1, 2027, $971, in year 1 (its gain, sold at once).");
    // Jul 1-12, 2027's 110,000 ÷ 12 × 12/31 × 10% = 354.84 is held at year 1's end: a share of its own, 355 ÷ 153,957 = $0.23; saved is the 401(k)'s.
    expect(e.text).toContain("in the ESPP is what's been put into it and not yet spent on shares or given back");
    const hundred = tables(e.doc).find((t) => t.head[1] === "Of each $100 of year-1 pay")!;
    expect(hundred.rows.filter((r) => r.label === "Saved" || r.label === "In the ESPP").map((r) => [r.label, ...r.cells]))
      .toEqual([["Saved", "$4.29", "6,600"], ["In the ESPP", "$0.23", "355"]]);
    // Put in over the stay: 5,854.84 + 11,000 + 11,000 + 14,850 (year 4 at the associate's 148,500) = 42,704.84; as shown, 5,855 + ... = 42,705.
    expect(e.text).toMatch(/Its ESPP puts \$42,705 toward company stock over the stay; its purchases' gain, \$[\d,]+ before tax, is pay/);
    expect(e.text).toContain("Holding shares after purchase is an investment decision and isn't modeled.");
    expect(e.text).toContain("first ESPP purchase is Jun 30, 2027; leaving before a purchase gives back what you've put toward it, without the gain");
    // A-1's year 1: 56,031 ÷ 12 = $4,669 to spend, (10,255 - 355) ÷ 12 = $825 saved, 355 ÷ 12 = $30 held.
    expect(e.text).toContain("In year 1, as paid, in New York dollars: $4,669 a month to spend after rent, $825 a month saved and $30 a month held in the ESPP.");
  });

  it("in a comparison, a breakdown stays in its own city's dollars, and says what the comparison counts it as", () => {
    const c = made(context(), undefined, "breakdown", "C");
    expect(c.text).toMatch(/C leaves you about \$[\d,]+ a month over your stay, after rent, in Seattle dollars/);
    expect(c.text).toMatch(/In the comparison: \$[\d,]+ a month in Seattle dollars, less \$[\d,]+ for Seattle's higher prices, is \$[\d,]+ a month over your stay in U\.S\.-average dollars\./);
    expect(c.text).not.toMatch(/New York|Charlotte/);
  });

  it("both: each breakdown in turn, then the comparison, its tables in the common dollars", () => {
    const b = made(context(), undefined, "both");
    const parts = b.doc.blocks.flatMap((x) => (x.kind === "part" ? [x.text] : []));
    expect(parts).toEqual(["A, NYC bank, on its own", "B, Charlotte corp, on its own", "C, Seattle tech, on its own", "The comparison"]);
    const comparison = made(context());
    // The comparison's part is the comparison's document, its body unchanged.
    const body = (t: string) => t.slice(t.indexOf("1. THE ANSWER"), t.lastIndexOf("Worked out in your browser"));
    expect(body(b.text).endsWith(body(comparison.text))).toBe(true);
  });
});
