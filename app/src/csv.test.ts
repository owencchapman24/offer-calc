import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ByYear } from "./ByYear";
import { build, type Cell, type CsvTable, csvFile, guard, type L6Part, plain, SAMPLE_LINE } from "./csv";
import type { MetricId, WorkContext } from "./metrics";
import type { AppOffer, Letter } from "./model";
import { Risk } from "./Risk";
import { initialSession } from "./session";
import { context, renderPage, renderWork, VALUATION, withWork } from "./testing";
import { TheWork } from "./TheWork";
import { WorkProvider } from "./Tickmarks";
import { Printing, type PrintScope, TICKS, type TickKind } from "./ui";

// CSV export of each table (slice 6, stop B; docs/ui-design.md §4.8, §10): every figure is the figure shown, as a plain number,
// with its tickmark beside it; line 1 flags samples and the name ends -sample; text cells are guarded against formulas, numbers
// never are.

const LETTERS: Letter[] = ["A", "B", "C"];
const PARTS: L6Part[] = ["years", "stay", "payments", "tax"];

/** A CSV's rows, read back (RFC 4180: quotes, doubled quotes, commas and line breaks inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; } else cell += c;
  }
  return rows;
}

/** Every figure on a rendered page: its id, the text shown and its tickmark. */
function shownFigures(html: string): Map<string, { text: string; kind: TickKind }> {
  const out = new Map<string, { text: string; kind: TickKind }>();
  const re = /data-metric="([^"]+)"[^>]*><span class="fig-value">([^<]*)<\/span><span class="tick tick-(\w+)"/g;
  for (const m of html.matchAll(re)) out.set(m[1], { text: m[2], kind: m[3] as TickKind });
  return out;
}

/** The figures in a table's rows: each number with an id, and the tickmark in the cell after it. */
function csvFigures(rows: Cell[][]): Array<{ id: MetricId; num: string; mark: Cell }> {
  return rows.flatMap((r) => r.flatMap((c, i) => (c && typeof c === "object" && c.id ? [{ id: c.id, num: c.num, mark: r[i + 1] }] : [])));
}

const tables = (letters: Letter[]): CsvTable[] => [
  { kind: "l1", running: false }, { kind: "l1", running: true }, { kind: "l2" },
  ...letters.flatMap((letter) => PARTS.map((part): CsvTable => ({ kind: "a7", letter, part }))),
];

describe("CSV: every figure is the figure shown, with its tickmark", () => {
  const contexts: Array<[string, () => WorkContext]> = [
    ["the samples", () => context()],
    ["per hour, a 5-year stay", () => context("perHour", undefined, 5)],
    ["prices in Charlotte", () => context("colAdjustedTotal", undefined, 4, { pricesIn: "16740" })],
  ];
  for (const [name, make] of contexts) {
    it(name, () => {
      const ctx = withWork(make()).ctx;
      const html = renderWork(ctx) + renderPage(ctx) + renderPage(ctx, { running: true });
      const shown = shownFigures(html);
      for (const t of tables(LETTERS)) {
        const b = build(ctx, t);
        const figs = csvFigures(b.rows);
        expect(figs.length, JSON.stringify(t)).toBeGreaterThan(2);
        for (const f of figs) {
          const s = shown.get(f.id);
          // L-1's per-hour footer reads "per hour" on screen; its CSV has the figure it opens (the rank list's).
          if (!s || !/\d/.test(s.text)) continue;
          expect(f.num, `${f.id} shows ${s.text}`).toBe(plain(s.text));
          expect(f.mark, f.id).toBe(TICKS[s.kind].mark);
        }
        // Each table's figures on screen are all in its CSV (L-1 and L-2: the table views'; A-7: the offer's).
        const ids = new Set(figs.map((f) => f.id));
        const of = t.kind === "a7" ? ({ years: /^l6y\./, stay: /^l6s\./, payments: /^l6[pg]\./, tax: /^l6t\./ })[t.part]
          : t.kind === "l2" ? /^(risk|drop)\./ : t.running && ctx.results!.view.basis !== "perHour" ? /^(run|eysum)\./ : /^(ey|eysum)\./;
        const want = [...shown.keys()].filter((id) => of.test(id) && (t.kind !== "a7" || id.split(".")[1] === t.letter));
        expect(want.length, JSON.stringify(t)).toBeGreaterThan(3);
        for (const id of want) expect(ids.has(id as MetricId), `${id} in ${JSON.stringify(t)}`).toBe(true);
      }
    });
  }

  it("ties to the tables shown: A's year 1 after rent is L-1's, the bridge's and A-7's 62,594", () => {
    const ctx = withWork(context()).ctx;
    const years = build(ctx, { kind: "a7", letter: "A", part: "years" });
    const total = years.rows.find((r) => r[2] === "After rent, at U.S. prices")!;
    expect(total.slice(4, 6)).toEqual([{ num: "62594", id: "l6y.A.total.1" }, "^"]);
    const l1 = build(ctx, { kind: "l1", running: false });
    expect(l1.rows[0].slice(0, 3)).toEqual(["Year 1", { num: "62594", id: "ey.A.1" }, "✓"]);
    // The stay's present value is the rank list's, cross-footed.
    const stay = build(ctx, { kind: "a7", letter: "C", part: "stay" });
    expect(stay.rows.find((r) => r[0] === "After rent, at U.S. prices")!.slice(-2)).toEqual([{ num: "334357", id: "l6s.C.colAdjustedTotal.pv" }, "<"]);
  });
});

describe("CSV: plain numbers, units in the headers", () => {
  const ctx = withWork(context()).ctx;
  it("money cells have no separators, signs or parentheses; negatives are -123.45", () => {
    for (const t of tables(LETTERS)) {
      const text = csvFile(ctx, t).text;
      for (const f of csvFigures(build(ctx, t).rows)) {
        expect(f.num, f.id).toMatch(/^-?\d+(\.\d+)?$/);
        expect(text).toContain(f.num);
      }
    }
    // Deductions are negative numbers: A's year 1 tax, and the tax's share in a tax year, and a clawback-free payment's tax.
    const years = build(ctx, { kind: "a7", letter: "A", part: "years" });
    const tax = years.rows.find((r) => r[2] === "Tax")!;
    expect((tax[4] as { num: string }).num).toMatch(/^-\d+$/);
    expect(years.header.slice(4, 6)).toEqual(["Year 1 ($, as paid)", "Year 1 tickmark"]);
  });
  it("whole dollars where the table shows dollars, cents where it shows cents, rates as shown", () => {
    const payments = csvFigures(build(ctx, { kind: "a7", letter: "C", part: "payments" }).rows);
    expect(payments.every((f) => /^-?\d+\.\d\d$/.test(f.num))).toBe(true);
    const years = csvFigures(build(ctx, { kind: "a7", letter: "C", part: "years" }).rows);
    expect(years.filter((f) => !/Hour\./.test(f.id)).every((f) => /^-?\d+$/.test(f.num))).toBe(true);
    const tax = build(ctx, { kind: "a7", letter: "A", part: "tax" });
    const rate = tax.rows.find((r) => /^The offer's tax ÷ its \d{4} pay/.test(String(r[2])))!;
    expect(rate[2]).toBe("The offer's tax ÷ its 2026 pay (%)");
    expect((rate[8] as { num: string }).num).toMatch(/^\d+\.\d{2,8}$/);
    const l2 = build(ctx, { kind: "l2" });
    expect(l2.header).toContain("Bear vs base, over your stay (%)");
    expect(csvFigures(l2.rows).filter((f) => f.id.startsWith("drop.")).every((f) => /^-?\d+$/.test(f.num))).toBe(true);
  });
  it("reads back as a table: every row the header's width, labels with commas intact", () => {
    for (const t of tables(["C"])) {
      const { text } = csvFile(ctx, t);
      const rows = parseCsv(text.replace(/^\uFEFF/, ""));
      const head = build(ctx, t).header;
      const at = rows.findIndex((r) => r.join("|") === head.join("|"));
      expect(at, JSON.stringify(t)).toBe(3); // sample line, title, scope, then the header
      const body = rows.slice(at + 1, at + 1 + build(ctx, t).rows.length);
      for (const r of body) expect(r.length).toBe(head.length);
      expect(text.endsWith("\r\n")).toBe(true);
    }
    const pay = parseCsv(csvFile(ctx, { kind: "a7", letter: "A", part: "payments" }).text);
    expect(pay.some((r) => r[2] === "Salary, July 2026" || /^Salary, Jul \d+ – 31, 2026$/.test(r[2]))).toBe(true);
  });
});

describe("CSV: the sample flag and the file name", () => {
  it("line 1 says so whenever any offer is a sample, and the name ends -sample", () => {
    const ctx = withWork(context()).ctx;
    const f = csvFile(ctx, { kind: "a7", letter: "A", part: "years" });
    expect(f.fileName).toBe(`offer-calc-${VALUATION}-A-7-employment-years-sample.csv`);
    // A byte-order mark, then the flag, quoted (it has a comma).
    expect(f.text.charCodeAt(0)).toBe(0xfeff);
    expect(f.text.slice(1).startsWith(`"${SAMPLE_LINE}"\r\n`)).toBe(true);
    expect(parseCsv(f.text.slice(1))[0]).toEqual([SAMPLE_LINE]);
    // One edited sample is still a sample.
    const edited = withWork(context("colAdjustedTotal", (os) => os.map((o, i) => ({ ...o, sample: i === 0 ? "edited" : null })))).ctx;
    expect(csvFile(edited, { kind: "l2" }).fileName).toBe(`offer-calc-${VALUATION}-L-2-if-things-go-badly-sample.csv`);
  });
  it("with no samples, no flag: line 1 is the title, and no -sample", () => {
    const mine = withWork(context("colAdjustedTotal", (os) => os.map((o) => ({ ...o, sample: null })))).ctx;
    const f = csvFile(mine, { kind: "l1", running: true });
    expect(f.fileName).toBe(`offer-calc-${VALUATION}-L-1-by-year-running-total.csv`);
    expect(parseCsv(f.text.replace(/^\uFEFF/, ""))[0][0]).toMatch(/^L-1 · By year · After rent, at U\.S\. prices, each employment year, running total\. Offers: A /);
    expect(f.text).not.toContain(SAMPLE_LINE);
  });
});

describe("CSV: the formula guard, on text cells only", () => {
  it("a text cell starting with =, +, -, @, a tab or a carriage return gets a leading '", () => {
    for (const t of ["=1+2", "+1", "-5", "@SUM(A1)", "\tx", "\rx"]) expect(guard(t)).toBe(`'${t}`);
    for (const t of ["Salary", "A-7", "1+1", " =x", "(5)"]) expect(guard(t)).toBe(t);
  });
  it("free text is guarded (an award named like a formula); negative numbers aren't", () => {
    const evil = (os: AppOffer[]) => os.map((o) => (o.letter !== "A" ? o : {
      ...o, draft: { ...o.draft, label: "=cmd|' /C calc'!A0", cashAwards: o.draft.cashAwards.map((a) => ({ ...a, label: "=HYPERLINK(\"http://x\",\"pay\")" })) },
    }));
    const ctx = withWork(context("colAdjustedTotal", evil)).ctx;
    const { text } = csvFile(ctx, { kind: "a7", letter: "A", part: "payments" });
    const rows = parseCsv(text.replace(/^\uFEFF/, ""));
    const award = rows.find((r) => r[1] === "Cash awards")!;
    expect(award[2]).toBe("'=HYPERLINK(\"http://x\",\"pay\")");
    // The raw line: quoted (it has a comma and quotes), with the guard inside the quotes.
    expect(text).toContain('"\'=HYPERLINK(""http://x"",""pay"")"');
    // The label sits inside the title, which starts with the reference, so it can't run.
    expect(rows[1][0].startsWith("A-7 · =cmd")).toBe(true);
    // Numbers stay numbers: a negative figure is written as it is, unquoted and unguarded.
    const years = csvFile(ctx, { kind: "a7", letter: "A", part: "years" }).text;
    expect(years).toMatch(/,-\d+,✓/);
    expect(years).not.toMatch(/'-\d/);
  });
});

describe("Print: every schedule expanded; a summary or the full workpaper", () => {
  const ctx = withWork(context()).ctx;
  const provide = (printing: PrintScope | null, el: ReturnType<typeof createElement>) =>
    renderToStaticMarkup(createElement(WorkProvider, { ctx, children: createElement(Printing.Provider, { value: printing, children: el }) }));
  // Each offer's A-7, as its breakdown prints it, closed on screen.
  const work = (scope: PrintScope) => {
    const w = withWork(context());
    return LETTERS.map((l) => provide(scope, createElement(TheWork, { ...w.props, ctx: w.ctx, letter: l, open: false }))).join("");
  };
  it("the full workpaper: each offer's A-7 open, every payment listed", () => {
    const html = work("full");
    for (const l of LETTERS) {
      expect(html).toContain(`data-metric="l6y.${l}.total.1"`);
      expect(html).toContain(`data-metric="l6p.${l}.0.gross"`);
      expect(html).toContain(`data-metric="l6t.${l}.2027.total.offer"`);
    }
    expect(html.match(/class="year-table l6-table l6-payments"/g)).toHaveLength(3);
    expect(html).toContain("every payment with its formula and tax");
  });
  it("the summary: everything but the list of every payment, which it says where to find", () => {
    const html = work("summary");
    for (const l of LETTERS) {
      expect(html).toContain(`data-metric="l6y.${l}.total.1"`);
      expect(html).toContain(`data-metric="l6s.${l}.colAdjustedTotal.pv"`);
      expect(html).toContain(`data-metric="l6t.${l}.2027.total.offer"`);
    }
    expect(html).not.toContain('data-metric="l6p.');
    expect(html).not.toContain('data-metric="l6g.');
    expect(html).not.toContain("l6-payments");
    expect(html.match(/class="note l6-elsewhere"/g)).toHaveLength(3);
    expect(html).toContain("The list of every payment is in the full workpaper.");
  });
  it("L-1's and L-2's table views are open, in either", () => {
    const ui = initialSession(VALUATION).ui;
    for (const [scope, open] of [[null, false], ["summary", true], ["full", true]] as const) {
      expect(provide(scope, createElement(ByYear, { ctx, ui, sample: true, dispatch: () => {} })).includes('id="l1-table"'), String(scope)).toBe(open);
      expect(provide(scope, createElement(Risk, { ctx, sample: true })).includes('id="l2-table"'), String(scope)).toBe(open);
    }
  });
});
