import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { shownStay } from "./footing";
import { type MetricId, type WorkContext } from "./metrics";
import { bridge, byYear } from "./byYearModel";
import { type AppOffer, blankDraft, type Letter } from "./model";
import { context, footsAsDisplayed, renderPage, renderWork, withWork } from "./testing";
import { TheWork } from "./TheWork";
import { WorkProvider } from "./Tickmarks";
import { addCents, exactPay, FOOTS, paymentYears, stayRows, taxTables, yearCell, yearTable } from "./workpaper";

// A-7 · The work (docs/ui-design.md §4.8; L-6 from slice 6 until stop 5B): every column adds up as displayed, the tables tie to L-1,
// the bridge and the lead schedule, the payments tie to the years, and each calendar year's tax foots with and without the offer. Each
// offer's tables are over its own stay (docs/v2-plan.md, item 5, B3).

/** The samples, and the same with B starting later (its last year runs past your stay) and other wages in the first year. */
const later = () => context("colAdjustedTotal", (os) => os.map((o) => (o.letter === "B" ? { ...o, draft: { ...o.draft, startDate: "2026-10-01" } } : o)),
  4, { otherWagesThisYear: 20_000 });
const CONTEXTS: Array<[string, () => WorkContext]> = [
  ["the samples", () => context()],
  ["per hour, a 5-year stay", () => context("perHour", undefined, 5)],
  ["prices in Charlotte", () => context("colAdjustedTotal", undefined, 4, { pricesIn: "16740" })],
  ["B starting later, with other wages in 2026", later],
];
const LETTERS: Letter[] = ["A", "B", "C"];

describe("A-7: every column adds up as displayed", () => {
  for (const [name, make] of CONTEXTS) {
    it(`${name}: the years, the stay, the payments and the tax years`, () => {
      const ctx = withWork(make()).ctx;
      for (const letter of LETTERS) {
        const t = yearTable(ctx, letter);
        // Each subtotal is its lines, as shown, added, in every year and across them; each row's years add to its sum.
        for (const row of t.rows) {
          if (row.unit === "perHour") continue;
          expect(row.sum, `${letter} line ${row.no}`).toBe(row.values.reduce((s, v) => s + v, 0));
          const parts = FOOTS[row.line];
          if (!parts || row.kind === "carried") continue;
          for (let n = 1; n <= t.n; n++) {
            const shown = parts.filter((l) => t.rows.some((x) => x.line === l));
            expect(yearCell(t, row.line, n), `${letter} ${row.line} year ${n}`).toBe(shown.reduce((s, l) => s + yearCell(t, l, n), 0));
          }
        }
        // The stay: the years, less what's past the stay, is the stay as paid.
        for (const s of stayRows(ctx, letter)) {
          expect(s.years - s.after).toBe(s.stay);
          expect(s.years).toBe(yearCell(t, s.line, "sum"));
        }
        // The payments: each group's subtotal and each year's tax add the payments to the cent, and round to the year's lines.
        for (const y of paymentYears(ctx, letter)) {
          for (const g of y.groups) {
            expect(g.gross).toBe(addCents(g.rows.map((x) => x.p.gross)));
            expect(g.tax).toBe(addCents(g.rows.map((x) => x.p.tax)));
            if (typeof y.ey === "number") expect(yearCell(t, g.component, y.ey)).toBe(Math.round(g.gross));
          }
          expect(y.tax).toBe(addCents(y.groups.map((g) => g.tax)));
          if (typeof y.ey === "number") expect(-yearCell(t, "tax", y.ey)).toBe(Math.round(y.tax));
        }
        // Each calendar year: every column foots, the offer's column is with less without, and the offer's pay and tax are its payments'.
        const payments = ctx.own!.work![letter]!.payments;
        for (const tt of taxTables(ctx, letter)) {
          const taxes = tt.rows.filter((x) => x.kind === "tax");
          const total = tt.rows.find((x) => x.line === "total")!;
          for (const c of ["with", "without", "offer"] as const) expect(total[c]).toBe(taxes.reduce((s, x) => s + x[c]!, 0));
          for (const x of tt.rows.filter((r) => r.kind !== "rate")) expect(x.offer).toBe(x.with! - x.without!);
          const inYear = payments.filter((p) => p.calendarYear === tt.year);
          expect(total.offer).toBe(Math.round(addCents(inYear.map((p) => p.tax))));
          expect(tt.rows.find((x) => x.line === "wages")!.offer).toBe(Math.round(addCents(inYear.map((p) => p.gross))));
          // The federal line takes the rounding: within a few dollars of the engine's.
          expect(Math.abs(tt.rows.find((x) => x.line === "federal")!.with! - tt.federal)).toBeLessThan(4);
          // Each payment's tax is its pay before rounding × the year's rate as shown, to the cent.
          const rate = Number((tt.rate * 100).toFixed(tt.digits)) / 100;
          for (const p of inYear) expect(Math.round(exactPay(p) * rate * 100)).toBe(Math.round(p.tax * 100));
        }
      }
    });
  }

  it("every A-7 figure's derivation, and L-1's and the bridge's, foot as displayed", () => {
    for (const [, make] of CONTEXTS) {
      const ctx = withWork(make()).ctx;
      const html = renderWork(ctx) + renderPage(ctx);
      const ids = [...new Set([...html.matchAll(/data-metric="((?:l6[ygpst]|ey|run|eysum|br)\.[^"]+)"/g)].map((m) => m[1] as MetricId))];
      expect(ids.length).toBeGreaterThan(400);
      for (const id of ids) footsAsDisplayed(id, derive(id, ctx));
    }
  }, 60_000);
});

describe("A-7: a joint return with a spouse's wages (audit C1)", () => {
  it("each year's tax shows the spouse's wages, the same with and without the offer, grown with inflation, and foots", () => {
    const ctx = withWork(context("colAdjustedTotal", undefined, 4, { filingStatus: "joint", spouseWages: 90_000 })).ctx;
    for (const letter of LETTERS) {
      for (const tt of taxTables(ctx, letter)) {
        const row = tt.rows.find((x) => x.line === "spouse")!;
        const expected = Math.round(90_000 * 1.025 ** (tt.year - 2026));
        expect([row.with, row.without, row.offer], `${letter} ${tt.year}`).toEqual([expected, expected, 0]);
        for (const col of ["with", "without"] as const) footsAsDisplayed(`l6t.${letter}.${tt.year}.spouse.${col}`, derive(`l6t.${letter}.${tt.year}.spouse.${col}`, ctx));
      }
    }
    // The offer's tax is higher on top of the spouse's wages than on its own: A's first year, at 12% and 22% joint brackets and New York's.
    const alone = withWork(context("colAdjustedTotal", undefined, 4, { filingStatus: "joint" })).ctx;
    const tax = (c: typeof ctx) => taxTables(c, "A")[0].rows.find((x) => x.line === "total")!.offer!;
    expect(tax(ctx)).toBeGreaterThan(tax(alone));
    expect(derive("about.spouse", ctx).lines[0].value).toBe("$90,000");
  });
});

describe("A-7 ties to L-1, the bridge and the lead schedule", () => {
  const ctx = withWork(context()).ctx;
  it("each year's after-tax pay, total rewards and after-rent figure is L-1's and the bridge's", () => {
    for (const letter of LETTERS) {
      const t = yearTable(ctx, letter);
      byYear(ctx, letter).years.forEach((y) => expect(yearCell(t, "total", y.n)).toBe(y.value));
      for (let n = 1; n <= t.n; n++) {
        const b = bridge(ctx, letter, n);
        const at = (line: string) => b.rows.find((x) => x.line === line)!.value;
        expect([yearCell(t, "gross", n), yearCell(t, "afterTax", n), yearCell(t, "totalRewards", n), yearCell(t, "total", n)])
          .toEqual([at("paid"), at("afterTax"), at("totalRewards"), at("total")]);
      }
    }
    // A, year 1, as W8a would have it: "Ties to L-6.A, year 1, line 23" (its after-rent line).
    expect(derive("ey.A.1", ctx).ties).toEqual(["br.A.1.total", "l6y.A.total.1"]);
    expect(derive("l6y.A.total.1", ctx).ties).toEqual(["ey.A.1", "br.A.1.total"]);
  });
  it("your stay as paid is L-1's; its present value is the rank list's, to the cent", () => {
    for (const letter of LETTERS) {
      const rows = stayRows(ctx, letter);
      const after = rows.find((x) => x.basis === "colAdjustedTotal")!;
      expect(after.stay).toBe(byYear(ctx, letter).window);
      expect(after.pv).toBe(ctx.results!.view.ranks.find((x) => x.letter === letter)!.value);
      expect(rows.find((x) => x.basis === "cash")!.stay).toBe(shownStay(ctx.results!.detail!.offers[ctx.results!.letters.indexOf(letter)], 4).stay.cash);
    }
    // The rank list's figure names L-6's row; L-6's opens the rank list's work.
    expect(derive("pv.C.colAdjustedTotal", ctx).ties).toContain("l6s.C.colAdjustedTotal.pv");
    const pv = derive("l6s.C.colAdjustedTotal.pv", ctx);
    expect([pv.kind, pv.lines[0].ref, pv.lines[0].value]).toEqual(["crossFooted", "pv.C.colAdjustedTotal", "334,357"]);
    expect(derive("l6s.A.colAdjustedTotal.stay", ctx).ties).toEqual(["eysum.A"]);
  });
  it("names its rows by line number in a popover's tie sentence", () => {
    // A's after-rent line is the 23rd: salary, bonus, sign-on, pay; tax, premiums, after-tax; your 401(k), take-home; then the rest.
    expect(derive("ey.A.1", ctx).ties.includes("l6y.A.total.1")).toBe(true);
    const html = renderWork(ctx);
    expect(html).toContain('data-metric="l6y.A.total.1"');
  });
  it("titles lower a label's first letter only, so abbreviations and places keep their capitals", () => {
    expect(derive("l6y.A.total.4", ctx).title).toBe("A · year 4 · after rent, at U.S. prices");
    expect(derive("br.A.1.total", ctx).title).toBe("A · year 1 · after rent, at U.S. prices");
    expect(derive("l6t.A.2027.state.with", ctx).title).toBe("A · 2027 · NY income tax, with the offer");
    const rsu = ctx.own!.work!.C!.payments.findIndex((p) => p.component === "rsu");
    expect(derive(`l6p.C.${rsu}.gross`, ctx).title).toBe("C · new-hire RSUs, tranche 1 of 7");
  });
  it("L-1's table view keeps its years and your stay; its present-value row is in each offer's A-7", () => {
    const html = renderPage(ctx);
    expect(html).toContain('id="l1-table"');
    expect(html).not.toContain("Present value today");
    expect(html).toContain("Each year ties to the offer");
  });
});

describe("A-7 at the edges", () => {
  /** A plain offer with a cash award `days` after its start, a year's pay, and nothing else. */
  const plain = (letter: Letter, days: number): ((os: AppOffer[]) => AppOffer[]) => (os) => os.map((o) => (o.letter !== letter ? o : {
    ...o, sample: null, draft: { ...blankDraft(), label: "Plain", salary: { ...blankDraft().salary, annual: 100_000 }, residence: { state: "TX", nyc: false },
      employerState: "TX", startDate: "2026-07-13", costOfLiving: { ...blankDraft().costOfLiving, area: "19100", monthlyRent: 2_000 },
      cashAwards: [{ label: "Award", amount: 12_000, paidOn: { daysAfterStart: days }, clawback: null }] },
  }));
  // A 4-year stay from Jul 13, 2026 ends Jul 12, 2030: day 1,460 after the start. Day 1,461 (Jul 13, 2030) is the anniversary.
  it("an award paid on your stay's last day is counted; on the anniversary after it, it's year 4's but past the stay", () => {
    for (const [days, past] of [[1_460, false], [1_461, true]] as const) {
      const ctx = withWork(context("colAdjustedTotal", plain("B", days))).ctx;
      const t = yearTable(ctx, "B");
      expect(yearCell(t, "cash", 4)).toBe(12_000); // a payment on the anniversary counts toward the year just ended
      const cash = stayRows(ctx, "B").find((x) => x.basis === "cash")!;
      expect(cash.after > 0).toBe(past);
      if (past) {
        const s = derive("l6s.B.cash.stay", ctx);
        expect(s.lines.map((l) => l.label)).toContain("Past your stay's last day (not counted)");
        expect(byYear(withWork(context("cash", plain("B", days))).ctx, "B").window).toBe(cash.stay);
      }
    }
  });
});

describe("A-7 opens only when asked", () => {
  it("is collapsed by default: no tables and no figures until it's opened", () => {
    const w = withWork(context());
    const closed = renderToStaticMarkup(createElement(WorkProvider, { ctx: w.ctx, children: createElement(TheWork, { ...w.props, open: false }) }));
    expect(closed).toContain("Show the tables");
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain("data-metric=");
    const open = renderToStaticMarkup(createElement(WorkProvider, { ctx: w.ctx, children: createElement(TheWork, w.props) }));
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("Every payment");
  });
  it("without the payments yet, the years show and the payments say they're being worked out", () => {
    const w = withWork(context());
    const ctx = { ...w.ctx, own: { ...w.ctx.own!, work: undefined } };
    const html = renderToStaticMarkup(createElement(WorkProvider, { ctx, children: createElement(TheWork, { ...w.props, ctx, fresh: false }) }));
    expect(html).toContain('data-metric="l6y.A.total.1"');
    expect(html).toContain("Working out every payment…");
    expect(html).not.toContain('data-metric="l6p.');
  });
});
