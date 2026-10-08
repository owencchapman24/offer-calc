import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Basis } from "../../src/offer/types";
import { About } from "./About";
import { ByYear } from "./ByYear";
import { compute } from "./compute";
import { Lead } from "./Lead";
import Methodology, { sectionAnchor } from "./Methodology";
import { Ledger } from "./Ledger";
import { type AppOffer, ASSUMPTIONS, DEFAULT_HOUSEHOLD, type Letter, sampleOffers, toHousehold, toOfferInput } from "./model";
import { bridge, byYear, derive, highlightedSentence, type MetricId, metricKind, metricSection, type WorkContext } from "./metrics";
import { SECTIONS } from "./sections";
import { initialSession } from "./session";
import { figure } from "./text";
import { WorkProvider } from "./Tickmarks";
import { extraHoursView, verdict } from "./verdict";

// The samples valued on their own start date, as in docs/ui-design.md §4.1-4.2, so the numbers are the design doc's.
const VALUATION = "2026-07-13";
const LETTERS: Letter[] = ["A", "B", "C"];

function context(basis: Basis = "colAdjustedTotal", tweak: (o: AppOffer[]) => AppOffer[] = (o) => o): WorkContext {
  const offers = tweak(sampleOffers(VALUATION));
  const inputs = offers.map((o) => {
    const r = toOfferInput(o);
    if (!("offer" in r)) throw new Error("incomplete sample");
    return r.offer;
  });
  const household = DEFAULT_HOUSEHOLD;
  const out = compute({
    compare: { offers: inputs, household: toHousehold(household, 2026), stays: [2, 3, 4, 5], stayYears: 4, valuationDate: VALUATION,
      inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate },
    rents: offers.map((o) => ({ area: o.quick.area!, state: o.quick.state! })),
  });
  const view = verdict(out.sweep!, LETTERS, basis, 4)!;
  return { today: VALUATION, household, wagesYear: 2026, offers, rents: out.rents, results: { sweep: out.sweep!, detail: out.detail, view, letters: LETTERS } };
}

const parse = (s: string | undefined) => Number((s ?? "").replace(/[$,]/g, "").replace("−", "-"));

describe("show the work: the verdict a month", () => {
  const ctx = context();
  const d = derive("hero", ctx);

  it("is the present-value gap over the annuity factor: $21,181.92 / 43.5191 = $486.73 (docs/ui-design.md §4.1)", () => {
    expect(d.title).toBe("C over A · after rent, at U.S. prices");
    expect(d.lines.map((l) => [l.op ?? "", l.value])).toEqual([
      ["", "334,357"], ["−", "313,175"], ["=", "21,182"], ["÷", "43.5191"], ["=", "$487"],
    ]);
    expect(d.lines[0].ref).toBe("pv.C.colAdjustedTotal");
    expect(d.lines[3].ref).toBe("af.4");
  });
  it("says why it isn't the gap / 48 first, then what the factor is: $21,181.92 / 48 = $441.29", () => {
    expect(d.notes[1]).toMatch(/^The annuity factor is what \$1 paid/);
    expect(d.notes[0]).toBe("Not $21,182 ÷ 48 = $441: later dollars are worth less today, so it takes $487 a month, "
      + "every month for 48 months, to be worth $21,182 today.");
  });
  it("lights up the two totals it uses and ties to the same figure in the stay row and the pipeline, in one sentence", () => {
    expect(d.uses).toEqual(["pv.C.colAdjustedTotal", "pv.A.colAdjustedTotal"]);
    expect(d.ties).toEqual(["stay.4", "step.colAdjustedTotal"]);
    expect(highlightedSentence(d, ctx)).toBe("Uses and ties to the highlighted figures: C's and A's 4-year totals, the 4-year stay column "
      + "and the “− Rent & prices” step.");
    expect(highlightedSentence(d, ctx, (id) => id.startsWith("stay"))).toBe("Ties to the highlighted figures: the 4-year stay column.");
    expect(d.kind).toBe("recomputed");
    expect(d.section).toBe("M-7.2");
  });
  it("the annuity factor's month-ends add up to it: Aug 12, 2026 to Jul 12, 2030", () => {
    const af = derive("af.4", ctx);
    expect(af.lines[0].label).toBe("Aug 12, 2026");
    expect(af.lines[af.lines.length - 2].label).toBe("Jul 12, 2030");
    const sum = af.lines.slice(0, -1).reduce((s, l) => s + parse(l.value), 0);
    expect(sum).toBeCloseTo(43.5191, 4); // foots as displayed
    expect(af.lines[af.lines.length - 1].value).toBe("43.5191");
  });
});

describe("show the work: an offer's totals", () => {
  const ctx = context();
  it("after rent, at U.S. prices foots line by line and ties to total rewards", () => {
    const d = derive("pv.A.colAdjustedTotal", ctx);
    const v = (label: string) => parse(d.lines.find((l) => l.label.startsWith(label))!.value);
    const local = v("Take-home pay") - v("Rent");
    expect(local).toBeCloseTo(v("Spending money after rent"), -1); // whole-dollar display
    // The two BEA indexes, not a factor: the product foots to the dollar as displayed (here at 3 decimals).
    const us = d.lines.find((l) => l.label === "U.S. non-housing prices (BEA)")!;
    const ny = d.lines.find((l) => l.label === "New York non-housing prices (BEA)")!;
    expect([us.op, us.value, us.ref, ny.op, ny.value, ny.ref]).toEqual(["×", "99.880", "rpp.A.us", "÷", "105.696", "rpp.A.area"]);
    expect(Math.abs((v("Spending money after rent") * parse(us.value)) / parse(ny.value) - v("The same spending"))).toBeLessThan(1);
    const total = v("The same spending") - v("Out-of-pocket") + v("Saved, at face value");
    expect(Math.abs(total - v("After rent, at U.S. prices"))).toBeLessThanOrEqual(2);
    expect(d.lines[d.lines.length - 1].value).toBe("313,175");
    expect(d.notes[1]).toMatch(/= 313,175\.$/); // total rewards - rent + (factor - 1) x (spending - out-of-pocket)
    expect(d.uses).toEqual(["in.A.rent", "in.A.city"]);
  });
  it("after-tax pay is gross - tax - premiums, in present value", () => {
    const d = derive("pv.C.cash", ctx);
    const [gross, tax, premiums, net] = d.lines.map((l) => parse(l.value));
    expect(Math.abs(gross - tax - premiums - net)).toBeLessThanOrEqual(2);
    expect(d.lines.map((l) => l.ref)).toEqual(["part.C.gross", "part.C.tax", "part.C.premiums", undefined]);
  });
});

describe("pay per extra hour (docs/ui-design.md §4.2)", () => {
  it("A asks 1,750 more hours a year than C for $5,577 a year less after rent; after tax they pay $9.59 each", () => {
    const ctx = context();
    const lines = extraHoursView(ctx.results!.view, LETTERS);
    const ac = lines.find((x) => x.more === "A" && x.fewer === "C")!;
    expect(ac).toMatchObject({ hoursPerYear: 1_750, basis: "colAdjustedTotal", perExtraHour: null });
    expect(Math.round(ac.gapPerYear)).toBe(-5_577);
    expect(ac.lower!.basis).toBe("cash");
    expect(ac.lower!.perExtraHour).toBe(9.59);
    // A's average after tax: its 4-year after-tax pay as paid / 16,000 hours (80 a week x 50 weeks x 4 years).
    expect(ac.lower!.average).toBeCloseTo(ctx.results!.view.row.nominal.cash![0] / 16_000, 9);
    const d = derive("extra.AC.colAdjustedTotal", ctx);
    expect(d.lines.find((l) => l.label === "A pays less")!.value).toBe("−22,307"); // -5,576.87 x 4
    expect(d.lines[d.lines.length - 1].value).toBe("−5,577");
  });
  it("only pairs with the lead's winner are shown: B vs C, not A vs B", () => {
    const lines = extraHoursView(context().results!.view, LETTERS);
    expect(lines.map((x) => `${x.more}${x.fewer}`)).toEqual(["AC", "BC"]);
  });
});

describe("the bridge from the offer letter (docs/ui-design.md §5, W4)", () => {
  const ctx = context();
  it("A, year 1: the letter's 190,000 to 62,595 after rent, as in W4, footing at every subtotal", () => {
    const b = bridge(ctx, "A", 1);
    expect(b.rows.map((r) => [r.kind, r.label, Math.round(r.value)])).toEqual([
      ["letter", "Offer letter: salary + target bonus + sign-on", 190_000],
      ["change", "first bonus is a stub", -37_014],
      ["subtotal", "Paid in year 1", 152_986],
      ["less", "tax", -41_724], ["less", "health premiums", -1_800],
      ["subtotal", "After-tax pay", 109_463],
      ["plus", "employer 401(k)", 3_300], ["less", "expected out-of-pocket health costs", -1_500],
      ["subtotal", "Total rewards", 111_263],
      ["less", "rent", -45_600], ["less", "New York prices", -3_068],
      ["total", "After rent, at U.S. prices", 62_595],
    ]);
    expect(b.rows[1].gloss).toBe("paid Jan 31 for Jul–Dec only"); // the bonus year runs Jan-Dec; A worked from Jul 13
    expect(b.rows[3].gloss).toBe("federal, FICA, NY, NYC");
    // Each subtotal foots: the rows since the last one, added.
    let running = 0;
    for (const r of b.rows) {
      if (r.kind === "subtotal" || r.kind === "total") {
        expect(r.value).toBeCloseTo(running, 1);
        running = r.value;
      } else running += r.value;
    }
    // 62,594.52 = spending at U.S. prices 52,694.52 + saved 9,900: $4,391 a month to spend and $825 saved (W4).
    expect([Math.round(b.spend!), Math.round(b.saved!)]).toEqual([4_391, 825]);
    // It ties to A's year 1 in L-1 on the after-rent basis.
    expect(byYear(ctx, "A").years[0].value).toBe(b.rows[b.rows.length - 1].value);
    expect(derive("br.A.1.total", ctx).ties).toEqual(["ey.A.1"]);
  });
  it("C, year 2: RSUs vest on company dates, so less than the letter's schedule lands in year 2", () => {
    const rsu = bridge(ctx, "C", 2).rows.find((r) => r.line === "rsu")!;
    expect([rsu.label, Math.round(rsu.value), rsu.gloss]).toEqual(["RSUs vest on company dates", -3_000, "vests Aug 15 and Feb 15"]);
  });
  it("year 1's tax splits across 2026 and 2027 at each year's rate and adds up", () => {
    const d = derive("br.A.1.tax", ctx);
    const parts = d.lines.slice(0, -1).map((l) => parse(l.value));
    expect(Math.abs(parts.reduce((s, x) => s + x, 0) - 41_724)).toBeLessThanOrEqual(1);
    expect(d.lines.map((l) => l.label.replace(/[\d,]+ paid/, "# paid"))).toEqual(["On # paid in 2026", "On # paid in 2027", "Tax in year 1"]);
  });
});

describe("L-1 by year", () => {
  it("the years add up to the stay as paid; a later start's last year runs past it and is reconciled", () => {
    const a = byYear(context(), "A");
    expect(a.years.map((y) => Math.round(y.value))).toEqual([62_595, 80_562, 87_631, 118_764]); // W4a's end label: 118,764
    expect(a.sum!).toBeCloseTo(a.window!, 1);
    const later = context("colAdjustedTotal", (os) => os.map((o) => (o.letter === "B" ? { ...o, quick: { ...o.quick, startDate: "2026-10-01" } } : o)));
    const b = byYear(later, "B");
    expect(b.sum! - b.window!).toBeGreaterThan(1_000); // B's year 4 ends Sep 30, 2030, after the stay's last day, Jul 12, 2030
    const d = derive("eysum.B", later);
    expect(d.lines.map((l) => l.label)).toContain("After your stay's last day (not counted)");
    expect(d.lines[d.lines.length - 1].value).toBe(figure(b.window!));
  });
});

describe("every figure has a tickmark kind, a methodology section and a derivation", () => {
  const noop = () => {};
  // L-1 with its table view open, each year or running, and the bridge for one offer.
  const render = (ctx: WorkContext, running = false, bridgeOf: Letter = "A") => {
    const session = { ...initialSession(VALUATION), household: ctx.household, offers: ctx.offers };
    const ui = { ...session.ui, byYear: { mode: running ? "running" as const : "each" as const, table: true }, bridge: { letter: bridgeOf, year: running ? 2 : 1 } };
    const tree = (children: ReactElement[]) => createElement(WorkProvider, { ctx, children });
    return renderToStaticMarkup(tree([
      createElement(About, { key: "a", session, dispatch: noop, today: ctx.today, wagesYear: ctx.wagesYear }),
      createElement(Ledger, { key: "l", offers: ctx.offers, missing: new Map(), rents: ctx.rents, dispatch: noop }),
      createElement(Lead, { key: "s", view: ctx.results!.view, letters: LETTERS, stayYears: 4, updating: false, error: null, notes: [],
        sample: true, dispatch: noop }),
      createElement(ByYear, { key: "y", ctx, ui, sample: true, dispatch: noop }),
    ]));
  };
  // The samples on each basis, and with B as your own offer (default bonus timing) on an estimated rent.
  const contexts: Array<[string, WorkContext]> = [
    ["after rent", context()],
    ["per hour", context("perHour")],
    ["after tax, B yours with an estimated rent", context("cash", (os) => os.map((o) => (o.letter !== "B" ? o
      : { ...o, sample: null, base: undefined, quick: { ...o.quick, bonus: { kind: "percent" as const, value: 10 }, rent: null } })))],
  ];

  for (const [name, ctx] of contexts) {
    it(name, () => {
      const html = render(ctx) + render(ctx, true, "C");
      expect(html).toContain('id="bridge"');
      const ids = [...new Set([...html.matchAll(/data-(?:tick|metric|trace)="([^"]+)"/g)].map((m) => m[1] as MetricId))];
      const ticks = [...html.matchAll(/<button[^>]*class="[^"]*\btick-btn\b[^"]*"[^>]*>/g)];
      expect(ticks.length).toBeGreaterThan(10);
      expect(ticks.every((t) => /data-tick="/.test(t[0]))).toBe(true);
      const seen = new Set<MetricId>();
      const check = (id: MetricId, depth: number) => {
        if (seen.has(id)) return;
        seen.add(id);
        const section = metricSection(id, ctx);
        expect(SECTIONS[section], `${id}: section ${section}`).toBeTruthy();
        expect(["recomputed", "footed", "crossFooted", "traced", "default", "estimate"]).toContain(metricKind(id, ctx));
        const d = derive(id, ctx);
        expect(d.title, id).toBeTruthy();
        expect(d.lines.length, id).toBeGreaterThan(0);
        // Every drill-down a derivation offers works too.
        if (depth < 3) for (const l of d.lines) if (l.ref) check(l.ref, depth + 1);
      };
      for (const id of ids) check(id, 0);
      expect(seen.size).toBeGreaterThan(15);
    });
  }

  it("every methodology section a popover can name has its anchor on the methodology page, with live numbers", () => {
    const ctx = contexts[0][1];
    const html = renderToStaticMarkup(createElement(Methodology, { ctx, section: null, sample: true }));
    for (const id of Object.keys(SECTIONS) as Array<keyof typeof SECTIONS>) expect(html, id).toContain(`id="${sectionAnchor(id)}"`);
    // M-7.2 works the verdict's own numbers: 21,182 / 43.5191 = $487, not $441.
    expect(html).toContain("334,357");
    expect(html).toContain("43.5191");
    expect(html).toMatch(/Why not \$21,182 ÷ 48 = \$441\?/);
    // M-12 lists each offer's live assumptions.
    expect(html).toContain("Taxed as a full-year resident of NY and New York City.");
  });

  it("estimated rents carry an E tickmark; entered ones don't", () => {
    const ctx = contexts[2][1];
    expect(metricKind("in.B.rent", ctx)).toBe("estimate");
    expect(metricKind("in.A.rent", ctx)).toBe("traced");
    expect(render(ctx)).toContain('data-tick="in.B.rent"');
    expect(derive("in.B.rent", ctx).lines[0].value).toBe(`$${figure(ctx.rents["16740|NC"].monthlyRent)}`);
  });
});
