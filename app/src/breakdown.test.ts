import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OwnPinned, ownSlots } from "./Breakdown";
import { inDollars, ownSentence, ownView } from "./breakdownModel";
import { compute, type OwnCache } from "./compute";
import { derive, figureName, metricSection } from "./derive";
import Methodology from "./Methodology";
import { type MetricId, metricKind, type WorkContext } from "./metrics";
import { ASSUMPTIONS, blankOffer, DEFAULT_HOUSEHOLD, sampleOffers, toHousehold, toOfferInput } from "./model";
import { priceWords } from "./prices";
import type { CompareRequest } from "./protocol";
import { SECTIONS } from "./sections";
import { initialSession, reducer } from "./session";
import { alone, context, footsAsDisplayed, ownOffers, renderAlone, renderBreakdowns, VALUATION } from "./testing";
import { WorkProvider } from "./Tickmarks";

// An offer's breakdown, stop 5A (docs/v2-plan.md, item 5): one offer is enough, its bottom line (A-1) over its own stay at its own
// prices, the worker's per-offer job remembered by its inputs, the ledger's "On its own" row with two or more offers.

const offerOf = (ctx: WorkContext, i = 0) => (toOfferInput(ctx.offers[i]) as { offer: CompareRequest["offers"][number] }).offer;
/** A static render's text, as it reads: tickmarks out, each element's text apart from the next. */
const words = (html: string) => html.replace(/<span class="tick tick-[a-zA-Z]+" aria-hidden="true">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/ ([,.:;)])/g, "$1").replace(/\( /g, "(").trim();

describe("A-1, the bottom line: sample A on its own, as the plan works it out (v2-plan.md, item 5, A-1)", () => {
  const ctx = alone("A");
  const v = ownView("A", ctx.own!.breakdowns.A!, offerOf(ctx), priceWords(undefined), true);

  it("a month over its own stay, in today's New York dollars: $6,671 to spend + $892 saved = $7,563", () => {
    // Total rewards 500,588 − rent 171,439 = 329,149 of present value after rent at New York prices; ÷ 43.5191 = 7,563.32, shown 7,563.
    // Saved at face value 38,823 ÷ 43.5191 = 892.09, shown 892; to spend is the difference, 7,563 − 892 = 6,671 (the line taking the rounding).
    expect(v.pv).toEqual({ totalRewards: 500_588, rent: 171_439, total: 329_149, saved: 38_823, spend: 290_326 });
    expect(v.factor).toBe(43.5191);
    expect(v.month).toEqual({ total: 7_563, saved: 892, spend: 6_671 });
    expect(v.place).toBe("New York");
    expect([v.start, v.last, v.years, v.months]).toEqual(["2026-07-13", "2030-07-12", 4, 48]);
  });

  it("at U.S. prices, the comparison's figure: New York $7,563 − New York prices $367 = U.S.-avg $7,196 (the rank list's 313,175)", () => {
    // 313,175 ÷ 43.5191 = 7,196.26, shown 7,196; the step 7,563 − 7,196 = 367.
    expect(v.ref).toEqual({ pv: 313_175, month: 7_196, step: 367, place: "U.S.-avg" });
    expect(context().results!.view.row.values.colAdjustedTotal![0]).toBeCloseTo(313_175, 0);
  });

  it("year 1, as paid: $55,762 to spend and $9,900 saved, $4,647 and $825 a month", () => {
    // Take-home 102,862 − rent 45,600 − out-of-pocket 1,500 = 55,762; 55,762 ÷ 12 = 4,646.83. Saved: your 401(k) 6,600 + the vested match 3,300.
    expect(v.year1 && [v.year1.spend, v.year1.saved, v.year1.spendMonth, v.year1.savedMonth]).toEqual([55_762, 9_900, 4_647, 825]);
    expect(v.differs).toBe("Your stay's figure is in today's dollars, over all 4 years, and later years pay more: year 1's bonus is for part of a year, a "
      + "promotion (Jul 13, 2029, base case), bonuses grow each year and rent rises at each anniversary.");
  });

  it("tax 32.4% of its pay over your stay; New York $22.96 an hour; bear case New York $6,245, 17% under the base case", () => {
    // 265,889 ÷ 821,486 = 0.32367. After rent at New York prices as paid, 367,398 ÷ 16,000 hours = 22.96. Bear: 271,770 ÷ 43.5191 = 6,244.95;
    // (7,563 − 6,245) ÷ 7,563 = 0.1743, shown 17%.
    expect(v.tax).toEqual({ tax: 265_889, gross: 821_486, rate: 265_889 / 821_486 });
    expect(v.hour!.hours).toBe(16_000);
    expect(Math.round(v.hour!.value * 100) / 100).toBe(22.96);
    expect(v.bear).toEqual({ pv: 271_770, month: 6_245, drop: (7_563 - 6_245) / 7_563 });
  });

  it("the page: A-1 pinned, each sentence saying its dollars once, in words; no prices line at U.S. prices with one offer", () => {
    const html = renderAlone(ctx);
    const text = words(html);
    expect(text).toContain("A · NYC bank, on its own");
    expect(text).toContain("A-1 The bottom line");
    expect(text).toContain("Your 4-year stay (Jul 13, 2026 – Jul 12, 2030), a month, in today's dollars at New York prices: $7,563 a month over your stay "
      + "= $6,671 to spend after rent + $892 saved");
    expect(text).toContain("Year 1, as paid, in New York dollars: $4,647 a month to spend after rent + $825 a month saved.");
    expect(text).toContain("Tax: 32.4% of its pay over your stay · Per hour worked over your stay, after tax and rent, in New York dollars: $22.96");
    expect(text).toContain("Bear case, in New York dollars: $6,245 a month over your stay, 17% under the base case over your stay.");
    expect(text).not.toContain("U.S.-avg");
    expect(text).not.toMatch(/New York \$\d/);
    // Each figure's label keeps its dollars, as a table's head would.
    expect(html).toMatch(/aria-label="[^"]*New York \$7,563 a month over your stay/);
    expect(ownSentence(v)).toBe("A leaves you about $7,563 a month over your stay, after rent: $6,671 to spend and $892 saved, in today's dollars at "
      + "New York prices.");
  });

  it("with Prices in a city, one more line restates it there, the step inline: Charlotte prices are below New York's", () => {
    const clt = alone("A", undefined, { pricesIn: "16740" });
    const text = words(renderAlone(clt));
    expect(text).toMatch(/At the prices you picked: \$7,563 in New York dollars − \$[\d,]+ for New York's higher prices = \$[\d,]+ in Charlotte dollars, a month over your stay/);
    const w = ownView("A", clt.own!.breakdowns.A!, offerOf(clt), priceWords("16740"), true);
    expect(w.month).toEqual(v.month); // its own dollars don't move with Prices in
    expect(w.month.total - w.ref!.step).toBe(w.ref!.month);
  });

  it("an offer in the city whose prices are picked has no prices line: its own dollars are the common ones", () => {
    const b = alone("B", undefined, { pricesIn: "16740" });
    const w = ownView("A", b.own!.breakdowns.A!, offerOf(b), priceWords("16740"), true);
    expect(w.ref).toBeNull();
    expect(w.place).toBe("Charlotte");
  });

  it("no ranges entered: the bear case says so, with no figure", () => {
    const flat = alone("A", (o) => ({ ...o, draft: { ...o.draft, salary: { ...o.draft.salary, promotions: [] },
      bonus: { ...o.draft.bonus, amounts: o.draft.bonus.amounts.map((x) => (x ? { bear: x.base, base: x.base, bull: x.base } : x)) } } }));
    const w = ownView("A", flat.own!.breakdowns.A!, offerOf(flat), priceWords(undefined), false);
    expect(w.bear).toBeNull();
    expect(words(renderAlone(flat))).toContain("Bear case: no ranges entered, so it's the base case.");
  });
});

describe("A-1's Show the work", () => {
  const ctx = alone("A");
  const html = renderAlone(ctx);

  it("every figure has a tickmark kind, a methodology section and a derivation that foots as displayed, drill-downs included", () => {
    const ids = [...new Set([...html.matchAll(/data-metric="([^"]+)"/g)].map((m) => m[1] as MetricId))].filter((id) => id.startsWith("own."));
    expect(ids.sort()).toEqual(["own.A.bear", "own.A.drop", "own.A.hour", "own.A.rate", "own.A.saved", "own.A.spend", "own.A.total", "own.A.y1saved",
      "own.A.y1spend"]);
    const seen = new Set<string>();
    const check = (id: MetricId) => {
      if (seen.has(id)) return;
      seen.add(id);
      expect(SECTIONS[metricSection(id, ctx)], id).toBeTruthy();
      expect(metricKind(id, ctx)).toBe(id.startsWith("in.") || id.startsWith("about.") ? metricKind(id, ctx) : "recomputed");
      const d = derive(id, ctx);
      footsAsDisplayed(id, d);
      expect(figureName(id, ctx)).not.toBe(id);
      for (const l of d.lines) if (l.ref) check(l.ref);
    };
    for (const id of ids) check(id);
    expect(seen.has("own.A.af")).toBe(true);
  }, 30_000);

  it("the month: total rewards less rent, present value, ÷ the annuity factor as shown", () => {
    const d = derive("own.A.total", ctx);
    expect(d.title).toBe("A-1 · A on its own: a month over your stay, in New York dollars");
    expect(d.section).toBe("M-7.2");
    expect(d.lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "500,588"], ["−", "171,439"], ["=", "329,149"], ["÷", "43.5191"], ["=", "$7,563"]]);
    expect(derive("own.A.spend", ctx).lines.map((l) => l.value)).toEqual(["$7,563", "$892", "$6,671"]);
    expect(derive("own.A.rate", ctx).lines.map((l) => l.value)).toEqual(["265,889", "821,486", "32.4%"]);
    expect(derive("own.A.af", ctx).lines.at(-1)!.value).toBe("43.5191");
  });

  it("the prices step and the ledger's row: New York $7,563 − New York prices $367 = U.S.-avg $7,196", () => {
    const c = context();
    expect(derive("own.A.prices", c).lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "$7,563"], ["−", "$7,196"], ["=", "$367"]]);
    const row = derive("alone.A", c);
    expect(row.kind).toBe("crossFooted");
    expect(row.lines.map((l) => [l.op ?? "", l.label, l.value])).toEqual([
      ["", "A-1: a month over your stay, New York $", "$7,563"], ["−", "New York prices", "$367"], ["=", "In the common dollars, U.S.-avg $", "$7,196"]]);
    // Charlotte is cheaper than the U.S. average: its step adds.
    expect(derive("alone.B", c).lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "$4,412"], ["+", "$98"], ["=", "$4,510"]]);
    for (const id of ["own.A.prices", "own.A.ref", "alone.A", "alone.B", "alone.C"] as MetricId[]) footsAsDisplayed(id, derive(id, c));
  });
});

describe("the worker's per-offer job (v2-plan.md, item 5, \"The worker\")", () => {
  const today = VALUATION;
  const offers = sampleOffers(today).map((o) => (toOfferInput(o) as { offer: CompareRequest["offers"][number] }).offer);
  const request = (os: typeof offers): CompareRequest => ({
    offers: os, household: toHousehold({ ...DEFAULT_HOUSEHOLD, stayYears: 4 }, 2026), stays: [2, 3, 4, 5], stayYears: 4, valuationDate: today,
    inflation: ASSUMPTIONS.inflation, discountRate: ASSUMPTIONS.discountRate,
  });

  it("one offer: its breakdown and no comparison", () => {
    const out = compute({ offers: request([offers[0]]), ids: ["a"], rents: [] });
    expect(out.sweep).toBeNull();
    expect(out.detail).toBeNull();
    expect(Object.keys(out.breakdowns!)).toEqual(["a"]);
    expect(out.breakdowns!.a.window).toEqual({ start: "2026-07-13", end: "2030-07-13" });
  });

  it("remembers each offer's job by its inputs: an edit to B projects B alone, and the comparison reuses each breakdown on the same start", () => {
    const cache: OwnCache = new Map();
    const first = compute({ offers: request(offers), ids: ["a", "b", "c"], rents: [] }, cache);
    expect(first.projected).toBe(3);
    // Every sample starts on the comparison's first day: its projection there is its breakdown's, the same object.
    expect(first.detail!.offers.every((d, i) => d === first.breakdowns![["a", "b", "c"][i]].detail)).toBe(true);
    const edited = compute({ offers: request([offers[0], { ...offers[1], salary: { ...offers[1].salary, annual: 90_000 } }, offers[2]]),
      ids: ["a", "b", "c"], rents: [] }, cache);
    expect(edited.projected).toBe(1);
    expect(edited.breakdowns!.a).toBe(first.breakdowns!.a);
    expect(edited.breakdowns!.b).not.toBe(first.breakdowns!.b);
  });

  it("a later start: its breakdown runs from its own start, and the comparison projects it again over the earlier window", () => {
    const later = { ...offers[1], startDate: "2026-09-01" };
    const out = compute({ offers: request([offers[0], later]), ids: ["a", "b"], rents: [] });
    expect(out.breakdowns!.b.window.start).toBe("2026-09-01");
    expect(out.detail!.offers[1]).not.toBe(out.breakdowns!.b.detail);
    expect(out.detail!.offers[1].window.start).toBe("2026-07-13");
  });

  it("adding an offer never changes another's breakdown (B3)", () => {
    const one = compute({ offers: request([offers[0]]), ids: ["a"], rents: [] }).breakdowns!.a;
    const three = compute({ offers: request(offers), ids: ["a", "b", "c"], rents: [] }).breakdowns!.a;
    expect(three).toEqual(one);
  });
});

describe("one offer is enough (v2-plan.md, item 5, \"Quick mode from one offer\")", () => {
  it("\"Start with my offer\" makes one blank offer A; the last offer can't be removed; + adds the next letter", () => {
    const blank = reducer(initialSession(VALUATION), { type: "startBlank" });
    expect(blank.offers.map((o) => o.letter)).toEqual(["A"]);
    expect(blank.offers[0].sample).toBeNull();
    expect(reducer(blank, { type: "removeOffer", id: blank.offers[0].id })).toBe(blank);
    expect(reducer(blank, { type: "addOffer" }).offers.map((o) => o.letter)).toEqual(["A", "B"]);
  });

  it("until it's complete, the pinned column says what's missing", () => {
    const ctx = { ...alone("A"), offers: [blankOffer("A")], own: { breakdowns: {}, withRef: false } };
    const x = ownOffers(ctx)[0];
    const html = renderToStaticMarkup(createElement(WorkProvider, { ctx, children: [createElement(OwnPinned, { key: "o", x, prices: priceWords(undefined),
      withRef: false, updating: false, sample: false, problems: null, notes: [], firstUse: true, dispatch: () => {} })] }));
    expect(words(html)).toContain("Add a salary, a city and a start date to see A on its own.");
    expect(html).toContain('id="own-title"');
  });

  it("the page's slots: with one offer A-1 pinned, its bar and sentence; with two or more, the section and the ledger's row instead", () => {
    const one = alone("A");
    const slots = (ctx: WorkContext) => ownSlots({ offers: ctx.offers, breakdowns: Object.fromEntries(ctx.offers.map((o) => [o.id, ctx.own!.breakdowns[o.letter]!])),
      prices: priceWords(undefined), stayYears: 4, updating: false, sample: true, notes: [], firstUse: false, dispatch: () => {}, problems: null });
    const s1 = slots(one);
    expect([!!s1.pinned, !!s1.section, !!s1.foot, !!s1.bar("bottom")]).toEqual([true, false, false, true]);
    expect(s1.said).toMatch(/^A leaves you about \$7,563 a month over your stay, after rent: .* in today's dollars at New York prices\.$/);
    expect(s1.own.withRef).toBe(false);
    const s3 = slots(context());
    expect([!!s3.pinned, !!s3.section, !!s3.foot, s3.bar("bottom"), s3.said]).toEqual([false, true, true, null, null]);
    expect(s3.own.withRef).toBe(true);
  });

  it("the bar with one offer: A-1's figure with its dollars, and one button to A-1", () => {
    const ctx = alone("A");
    const s = ownSlots({ offers: ctx.offers, breakdowns: { [ctx.offers[0].id]: ctx.own!.breakdowns.A! }, prices: priceWords(undefined), stayYears: 4,
      updating: false, sample: true, notes: [], firstUse: false, dispatch: () => {}, problems: null });
    const bar = words(renderToStaticMarkup(s.bar("bottom")!));
    expect(bar).toBe("A New York $7,563 a month · stay 4 yrs. Go to its bottom line A-1");
    expect(words(renderToStaticMarkup(s.bar("top")!))).toBe("A New York $7,563 a month over your stay, after rent · stay 4 years. Go to its bottom line A-1");
  });
});

describe("two or more offers: the ledger's \"On its own\" row and the section, one offer at a time", () => {
  const ctx = context();
  const html = renderBreakdowns(ctx);

  it("each offer's bottom line over its own stay, in the common dollars, never its own city's (condition 1)", () => {
    expect(words(html)).toContain("On its own A month over its own stay, in today's U.S.-average dollars. U.S.-avg $7,196 Its breakdown U.S.-avg $4,510 "
      + "Its breakdown U.S.-avg $7,683 Its breakdown");
    expect(html).not.toMatch(/data-metric="alone\.[ABC]"[^>]*>(?:<span class="fig-value">)?(?:New York|Charlotte|Seattle) \$/);
    // In the rank list's dollars: each offer starts on the comparison's first day, so each is its present value ÷ the same factor.
    const r = ctx.results!;
    r.letters.forEach((l, i) => expect(inDollars("U.S.-avg", Math.round(Math.round(r.view.row.values.colAdjustedTotal![i]) / 43.5191))).toBe(
      { A: "U.S.-avg $7,196", B: "U.S.-avg $4,510", C: "U.S.-avg $7,683" }[l]));
  });

  it("the section: a tab per offer, the heading naming the offer shown, A-1 with the prices line beside the own-city figure", () => {
    expect(html).toContain('role="tablist" aria-label="Offers, one at a time"');
    expect(html).toContain('id="own-tab-B" class="tab offer-B" aria-selected="false"');
    const text = words(html);
    expect(text).toContain("B · Charlotte corp, on its own");
    expect(text).toContain("In the comparison: $4,412 in Charlotte dollars + $98 for Charlotte's lower prices = $4,510 in U.S.-average dollars, a month over your stay");
    expect(text).toContain("Skip to the comparison");
  });
});

describe("the methodology with one offer", () => {
  it("works without a comparison: M-1's year 1 at its own prices, M-7.2 with its bottom line, M-12 with its assumptions", () => {
    const ctx = alone("A");
    const text = words(renderToStaticMarkup(createElement(Methodology, { ctx, section: null, sample: true })));
    expect(text).toContain("Your numbers: A, year 1, as paid");
    expect(text).toContain("total rewards $111,262 → after rent, at New York prices, New York $65,662.");
    expect(text).toContain("A's total after rent, present value, New York $ 329,149 ÷ Annuity factor: 48 month-ends at 5% a year 43.5191 = A month over "
      + "your stay, New York $ $7,563");
    expect(text).toContain("Taxed as a full-year resident of NY and New York City.");
    expect(text).not.toContain("Fill in two offers to see this worked with your numbers");
  }, 30_000);
});
