import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { derive, indexText } from "./derive";
import Methodology from "./Methodology";
import { type MetricId, metricKind, rentNotes, type WorkContext } from "./metrics";
import { bridge } from "./byYearModel";
import { priceWords, shortCity, US_PRICES } from "./prices";
import { context, renderPage, withLeave, withTies } from "./testing";

// Slice 8, prices in a city you know (docs/ui-design.md §5, item 6), and the lead's rent note.

const CLT = "16740";
const parse = (s: string | undefined) => Number((s ?? "").replace(/[$,]/g, "").replace("−", "-"));
/** A static render's text, as it reads: tickmark glyphs and tags out, entities back. */
const words = (html: string) => html.replace(/<span class="tick tick-[a-zA-Z]+" aria-hidden="true">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("prices in a city you know", () => {
  it("the words: the U.S. average by default; a city by its first principal city", () => {
    expect(priceWords(US_PRICES)).toMatchObject({ us: true, place: "U.S.", phrase: "after rent, at U.S. prices", unit: "U.S.-avg $",
      dollars: "U.S.-average dollars", city: "an average U.S. city", average: "the U.S. average" });
    expect(priceWords(CLT)).toMatchObject({ us: false, place: "Charlotte", name: "Charlotte-Concord-Gastonia, NC-SC", phrase: "after rent, at Charlotte prices",
      unit: "Charlotte $", dollars: "Charlotte dollars", city: "Charlotte", average: "Charlotte's" });
    expect(priceWords("nowhere").us).toBe(true); // the import check keeps unknown places out; the words never fail
  });

  it("short names follow Census titles: \"--\" separates cities whose own names have a hyphen", () => {
    expect(shortCity("New York-Newark-Jersey City, NY-NJ (Metropolitan Statistical Area)")).toBe("New York");
    expect(shortCity("Scranton--Wilkes-Barre, PA")).toBe("Scranton");
    expect(shortCity("Nashville-Davidson--Murfreesboro--Franklin, TN")).toBe("Nashville-Davidson");
    expect(shortCity("Winston-Salem, NC")).toBe("Winston-Salem");
    expect(shortCity("Louisville/Jefferson County, KY-IN")).toBe("Louisville");
    expect(shortCity("Maine, outside metro areas")).toBe("nonmetro Maine");
    expect(shortCity("Maine (Nonmetropolitan Portion)")).toBe("nonmetro Maine");
  });

  const us = context();
  const clt = context("colAdjustedTotal", undefined, 4, { pricesIn: CLT });

  it("at Charlotte's own prices, Charlotte's factor is 1: B's spending isn't restated, and its bridge says why", () => {
    const b = clt.results!.detail!.offers[1].costOfLiving!;
    expect(b.nonHousingFactor).toBe(1);
    const y = clt.results!.detail!.offers[1].employmentYears[0].costOfLiving!;
    expect(y.discretionaryReference).toBe(y.nonHousingLocal);
    const rows = bridge(clt, "B", 1).rows;
    expect(rows.find((r) => r.line === "prices")).toMatchObject({ label: "Charlotte prices", value: 0, gloss: "the prices you picked under Prices in: a factor of 1" });
    expect(rows.at(-1)).toMatchObject({ label: "After rent, at Charlotte prices", kind: "total" });
  });

  it("switching the reference scales every offer's converted spending by Charlotte ÷ U.S. (0.974100) and leaves savings at face value", () => {
    // Non-housing prices: Charlotte 97.293333 ÷ U.S. 99.880190 = 0.974100 (BEA RPPs 2024; see test/offer.test.ts for the hand-check).
    const ratio = 97.29333333333334 / 99.88019047619048;
    for (let i = 0; i < 3; i++) {
      const [a, b] = [us, clt].map((c) => c.results!.detail!.offers[i].window.costOfLiving!.presentValue!);
      expect(b.discretionaryReference / a.discretionaryReference, `offer ${i}`).toBeCloseTo(ratio, 5);
      expect(b.outOfPocketReference / a.outOfPocketReference, `offer ${i}`).toBeCloseTo(ratio, 5);
      expect([b.faceValue, b.rent, b.nonHousingLocal, b.savings]).toEqual([a.faceValue, a.rent, a.nonHousingLocal, a.savings]);
    }
    // Total rewards and after-tax pay don't move at all; the after-rent totals do.
    expect(clt.results!.sweep.rows.map((r) => r.values.totalRewards)).toEqual(us.results!.sweep.rows.map((r) => r.values.totalRewards));
    expect(clt.results!.view.ranks.map((r) => r.letter)).toEqual(["C", "A", "B"]);
  });

  /** Every derivation a page reaches, drill-downs included: its words. */
  function derivationText(ctx: WorkContext, html: string): string {
    const seen = new Set<MetricId>();
    const out: string[] = [];
    const walk = (id: MetricId, depth: number) => {
      if (seen.has(id) || depth > 3) return;
      seen.add(id);
      const d = derive(id, ctx);
      out.push(d.title, d.scope ?? "", ...d.notes, ...d.lines.map((l) => `${l.label} ${l.note ?? ""}`), ...(d.inputs ?? []).map((x) => x.label));
      for (const ref of [...d.lines.flatMap((l) => (l.ref ? [l.ref] : [])), ...(d.inputs ?? []).map((x) => x.ref)]) walk(ref, depth + 1);
    };
    for (const m of html.matchAll(/data-(?:tick|metric)="([^"]+)"/g)) walk(m[1] as MetricId, 0);
    expect(seen.size).toBeGreaterThan(40);
    return out.join("\n");
  }
  /**
   * Words that name the U.S. as the prices the figures are in. BEA's index scale ("U.S. all items = 100") and the U.S. median rent are data,
   * and DEFAULT_NAMED name the default as the default.
   */
  const US_LABEL = /U\.S\. prices|U\.S\.-av|average U\.S\. city|U\.S\. non-housing|U\.S\. ÷|U\.S\. average/;
  const DEFAULT_NAMED = ["Use the U.S. average", "The U.S. average is the default", "the U.S. average by default",
    "against the U.S. average (all items = 100)"];

  it("every label that says U.S. follows the choice: the schedules, every derivation and the methodology", () => {
    const tied = withTies(clt);
    const left = withLeave(tied.ctx);
    const page = renderPage(left.ctx, { bridgeOf: "C", leave: left.props, ties: tied.props }) + renderPage(left.ctx, { running: true });
    const method = renderToStaticMarkup(createElement(Methodology, { ctx: left.ctx, section: null, sample: true }));
    const text = [words(page), derivationText(left.ctx, page), words(method)].join("\n");
    const scanned = DEFAULT_NAMED.reduce((t, x) => t.split(x).join(""), text);
    const strays = scanned.split("\n").flatMap((l) => [...l.matchAll(new RegExp(`.{0,50}(?:${US_LABEL.source}).{0,30}`, "g"))].map((m) => m[0]));
    expect(strays).toEqual([]);
    for (const w of ["after rent, at Charlotte prices", "Charlotte $, as paid", "in today's Charlotte dollars", "priced as in Charlotte",
      "Charlotte non-housing prices (BEA)", "After rent, at Charlotte prices", "M-6.3 After rent, at Charlotte prices"]) expect(text, w).toContain(w);
    // And with the default, they say U.S., as before.
    const usPage = renderPage(us);
    expect(usPage).toContain("after rent, at U.S. prices");
    expect(usPage).toContain("U.S.-avg $, as paid");
  }, 30_000);

  it("About you shows the choice, with a D tickmark only at the U.S. average, and its work", () => {
    expect(metricKind("about.prices", us)).toBe("default");
    expect(metricKind("about.prices", clt)).toBe("traced");
    expect(renderPage(us)).toContain('data-tick="about.prices"');
    const html = renderPage(clt);
    expect(html).not.toContain('data-tick="about.prices"');
    expect(html).toContain("Charlotte-Concord-Gastonia, NC-SC");
    expect(html).toContain("Use the U.S. average");
    expect(derive("about.prices", clt)).toMatchObject({ section: "M-6.1", edit: { about: "prices" },
      lines: [{ label: "Dollars", value: "Charlotte-Concord-Gastonia, NC-SC", tick: "traced" }] });
  });

  it("the BEA indexes show real decimals, never padded zeros: 105.696, not 105.696000", () => {
    expect(indexText(105.696, 6)).toBe("105.696");
    expect(indexText(100.274, 6)).toBe("100.274"); // Dallas: exactly 3 decimals
    expect(indexText(99.88019047619048, 6)).toBe("99.88019"); // the 6th decimal is a zero
    expect(indexText(97.29, 3)).toBe("97.290"); // never fewer than 3
    expect(indexText(23.77856, 5)).toBe("23.77856");
    // Charlotte's prices need 4 decimals for A to foot; they're the index's own digits (97.293333), not 97.293 padded.
    const a = derive("pv.A.colAdjustedTotal", clt);
    expect(a.lines.find((l) => l.ref === "rpp.A.ref")!.value).toBe("97.2933");
    expect(a.lines.find((l) => l.ref === "rpp.A.area")!.value).toBe("105.6958");
    const spend = parse(a.lines.find((l) => l.label.startsWith("Spending money after rent"))!.value);
    const same = parse(a.lines.find((l) => l.label.startsWith("The same spending"))!.value);
    expect(Math.abs((spend * 97.2933) / 105.6958 - same)).toBeLessThan(1);
    // Each step of an index is exact, so it foots: 112.563 − 0.16 × 148.616 = 88.78444; ÷ 0.84 = 105.696 (3 decimals).
    expect(derive("rpp.A.area", us).lines.map((l) => l.value)).toEqual(["112.563", "23.77856", "88.78444", "0.84", "105.696"]);
    // Dallas (19100) for B, priced against the U.S.: its index is exactly 100.274 at any precision.
    const dallas = context("colAdjustedTotal", (os) => os.map((o) => (o.letter !== "B" ? o
      : { ...o, draft: { ...o.draft, residence: { state: "TX", nyc: false }, costOfLiving: { ...o.draft.costOfLiving, area: "19100" } } })));
    const values = derive("rpp.B.area", dallas).lines.map((l) => l.value!);
    expect(values.at(-1)).toBe("100.274");
    expect(values.every((v) => !/\.\d{3}\d*0$/.test(v))).toBe(true);
  });
});

describe("the rent note under the verdict", () => {
  const ctx = context();

  it("samples: A's $3,800 New York rent is over the $3,303.16 that ties C, and HUD's $2,729 is under it, so at HUD's estimate A wins", () => {
    const notes = rentNotes(ctx);
    expect(notes.map((n) => [n.letter, n.wins, n.against, n.entered, n.estimate.monthlyRent, n.flip.to, n.city]))
      .toEqual([["A", "A", "C", 3_800, 2_729, 3_303.16, "New York"]]);
    const html = renderPage(ctx);
    expect(words(html)).toContain("This depends on rent: at HUD's estimate for New York ($2,729), A wins.");
    expect(html).toContain('data-metric="rentnote.A"');
    expect(metricKind("rentnote.A", ctx)).toBe("estimate");
  });

  it("its rent that ties is L-3's rent lever, to the cent, and so is C's (the winner's) cushion rent", () => {
    const l3 = withTies(ctx).ctx.results!.ties!.l3!;
    const flips = ctx.results!.detail!.rentFlips!;
    for (const row of l3.rows) {
      expect(flips[row.offer].against).toBe(row.against);
      expect(flips[row.offer].flip).toEqual(row.rent);
    }
  });

  it("its derivation foots, from the gap to the rent that ties and on to the estimate", () => {
    const d = derive("rentnote.A", withTies(ctx).ctx);
    expect(d.section).toBe("M-7.4");
    const v = d.lines.map((l) => parse(l.value));
    expect(d.lines.map((l) => l.op ?? "")).toEqual(["", "−", "=", "×", "÷", "=", "÷", "=", "", "", "="]);
    expect(Math.abs(v[0] - v[1] - v[2])).toBeLessThanOrEqual(1); // 334,357 − 313,175 = 21,182
    expect(Math.abs((v[2] * v[3]) / v[4] - v[5])).toBeLessThan(1); // × 105.696 ÷ 99.880 = 22,415
    expect(Math.abs(v[5] / v[6] - v[7])).toBeLessThan(1); // ÷ 45.1155 = $497
    expect(v[8]).toBe(3_303); // the rent that ties: $3,800 − $497
    expect(d.lines[8]).toMatchObject({ label: "Rent that ties C: your $3,800 − $497", ref: "tie.A.rent" });
    expect(d.lines[9]).toMatchObject({ value: "$2,729", tick: "estimate", label: "HUD's Fair Market Rent for New York, 1 bedroom (FY2027)" });
    expect(v[10]).toBe(574); // 3,303.16 − 2,729
    // At HUD's estimate A would lead by 574.16 × 0.9450 × 45.1155 = 24,478 in present value, $562 a month (÷ 43.5191).
    expect(d.notes[0]).toContain("at the estimate A would, by about $562 a month (24,478 in present value");
    expect(d.edit).toEqual({ letter: "A", path: "costOfLiving.monthlyRent" });
  });

  it("the winner's own rent: with HUD at $3,500 for Seattle, over C's $3,086.42, A would win; the note names whose rent", () => {
    const high = { ...ctx, rents: { ...ctx.rents, "42660|WA": { ...ctx.rents["42660|WA"], monthlyRent: 3_500 } } };
    expect(rentNotes(high).map((n) => [n.letter, n.wins, n.against, n.flip.to])).toEqual([["A", "A", "C", 3_303.16], ["C", "A", "A", 3_086.42]]);
    expect(words(renderPage(high))).toContain("This depends on rent: at HUD's estimate for New York ($2,729), A wins; at HUD's "
      + "estimate for C's rent in Seattle ($3,500), A wins.");
    const d = derive("rentnote.C", high);
    expect(d.lines.map((l) => l.label).slice(-4)).toEqual(["More rent a month it can carry", "Rent that ties A: your $2,600 + $486",
      "HUD's Fair Market Rent for Seattle, 1 bedroom (FY2027)", "Over the rent that ties by"]);
  });

  it("no note: off the after-rent basis, for an estimated rent, or with the estimate on the same side as your rent", () => {
    expect(rentNotes(context("cash"))).toEqual([]);
    expect(rentNotes(context("perHour"))).toEqual([]);
    const estimated = context("colAdjustedTotal", (os) => os.map((o) => (o.letter !== "A" ? o
      : { ...o, draft: { ...o.draft, costOfLiving: { ...o.draft.costOfLiving, monthlyRent: null } } })));
    expect(rentNotes(estimated).map((n) => n.letter)).not.toContain("A");
    // At $2,800, A leads; the rent that would end its lead is above both $2,800 and HUD's $2,729, and C's is under Seattle's $2,180.
    const near = context("colAdjustedTotal", (os) => os.map((o) => (o.letter !== "A" ? o
      : { ...o, draft: { ...o.draft, costOfLiving: { ...o.draft.costOfLiving, monthlyRent: 2_800 } } })));
    expect(near.results!.view.lead!.winnerLetter).toBe("A");
    expect(rentNotes(near)).toEqual([]);
    expect(renderPage(near)).not.toContain("This depends on rent");
  });

  it("it follows Prices in: with Charlotte prices, the same note, A's tie at $3,290.56", () => {
    const clt = context("colAdjustedTotal", undefined, 4, { pricesIn: CLT });
    expect(rentNotes(clt).map((n) => [n.letter, n.wins, n.flip.to])).toEqual([["A", "A", 3_290.56]]);
    expect(derive("rentnote.A", clt).title).toBe("A at HUD's estimate for New York · after rent, at Charlotte prices");
  });
});
