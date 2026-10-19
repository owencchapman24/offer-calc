import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import Methodology, { sectionAnchor } from "./Methodology";
import { blankDraft, type Letter, type OfferDraft } from "./model";
import { derive, highlightedSentence, metricSection } from "./derive";
import { type MetricId, metricKind, type WorkContext } from "./metrics";
import { bridge, byYear } from "./byYearModel";
import { SECTIONS } from "./sections";
import { context, footsAsDisplayed, renderAllInputs, renderBreakdowns, renderPage, renderWork, withLeave, withTies, withWork } from "./testing";
import { dayBefore, figure } from "./text";
import { extraHoursView } from "./verdict";
import type { OfferInput } from "../../src/offer/types";
import { caseChanges, changeText, hasRanges, riskView } from "./cases";
import { Risk } from "./Risk";
import { WorkProvider } from "./Tickmarks";

const LETTERS: Letter[] = ["A", "B", "C"];

/** Only what quick mode asks for, as your own offer would have it: a 10% bonus on the default timing, and an estimated rent. */
function quickOnly(d: OfferDraft): OfferDraft {
  const b = blankDraft();
  return { ...b, label: d.label, salary: { ...b.salary, annual: d.salary.annual }, residence: d.residence, startDate: d.startDate,
    costOfLiving: { ...b.costOfLiving, area: d.costOfLiving.area }, bonus: { ...b.bonus, amount: { bear: 0.1, base: 0.1, bull: 0.1 } } };
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
    expect(local).toBe(v("Spending money after rent")); // as displayed: the lines above it, as shown
    // The two BEA indexes, not a factor: the product foots to the dollar as displayed (here at 3 decimals).
    const us = d.lines.find((l) => l.label === "U.S. non-housing prices (BEA)")!;
    const ny = d.lines.find((l) => l.label === "New York non-housing prices (BEA)")!;
    expect([us.op, us.value, us.ref, ny.op, ny.value, ny.ref]).toEqual(["×", "99.880", "rpp.A.ref", "÷", "105.696", "rpp.A.area"]);
    expect(Math.round((v("Spending money after rent") * parse(us.value)) / parse(ny.value))).toBe(v("The same spending"));
    const total = v("The same spending") - v("Out-of-pocket") + v("Saved, at face value");
    expect(total).toBe(v("After rent, at U.S. prices")); // exactly: the money saved at face value takes the rounding
    expect(d.lines[d.lines.length - 1].value).toBe("313,175");
    expect(d.notes[1]).toMatch(/= 313,175\.$/); // total rewards - rent + (factor - 1) x (spending - out-of-pocket)
    expect(d.uses).toEqual(["in.A.costOfLiving.monthlyRent", "in.A.costOfLiving.area"]);
  });
  it("after-tax pay is gross - tax - premiums, in present value", () => {
    const d = derive("pv.C.cash", ctx);
    const [gross, tax, premiums, net] = d.lines.map((l) => parse(l.value));
    expect(gross - tax - premiums).toBe(net); // exactly: the tax line takes the rounding
    expect(d.lines.map((l) => l.ref)).toEqual(["part.C.gross", "part.C.tax", "part.C.premiums", undefined]);
  });
});

describe("pay per extra hour (docs/ui-design.md §4.2)", () => {
  it("A asks 1,687 more hours a year than C for $5,577 a year less after rent; after tax they pay $9.95 each", () => {
    const ctx = context();
    const lines = extraHoursView(ctx.results!.view, LETTERS);
    const ac = lines.find((x) => x.more === "A" && x.fewer === "C")!;
    // (80 − 45) × 48.2 weeks, from the default days off.
    expect(ac).toMatchObject({ hoursPerYear: 1_687, basis: "colAdjustedTotal", perExtraHour: null });
    expect(Math.round(ac.gapPerYear)).toBe(-5_577);
    expect(ac.lower!.basis).toBe("cash");
    expect(ac.lower!.perExtraHour).toBe(9.95);
    // A's average after tax: its 4-year after-tax pay as paid / 15,424 hours (80 a week x 48.2 weeks x 4 years).
    expect(ac.lower!.average).toBeCloseTo(ctx.results!.view.row.nominal.cash![0] / 15_424, 9);
    const d = derive("extra.AC.colAdjustedTotal", ctx);
    // The two 4-year totals as shown, subtracted: −22,308 (−5,576.87 × 4 = −22,307.48 before rounding them); ÷ 4 = −5,577.
    expect(d.lines.find((l) => l.label === "A pays less")!.value).toBe("−22,308");
    footsAsDisplayed("extra.AC.colAdjustedTotal", d);
    expect(d.lines[d.lines.length - 1].value).toBe("−5,577");
  });
  it("only pairs with the lead's winner are shown: B vs C, not A vs B", () => {
    const lines = extraHoursView(context().results!.view, LETTERS);
    expect(lines.map((x) => `${x.more}${x.fewer}`)).toEqual(["AC", "BC"]);
  });
});

describe("the bridge from the offer letter (docs/ui-design.md §5, W4), in A-2 since stop 5B", () => {
  const ctx = context();
  it("A, year 1: the letter's 190,000 to 62,594 after rent, W4's lines footed as shown at every subtotal", () => {
    const b = bridge(ctx, "A", 1);
    // W4 has 109,463, 111,263 and 62,595: the engine's figures, each rounded once. Shown, every subtotal is the lines above it as shown,
    // added (footing.ts): 152,986 - 41,724 - 1,800 = 109,462; + 3,300 - 1,500 = 111,262; take-home 109,462 - 6,600 = 102,862, less rent
    // 45,600 = 57,262 to spend, x 99.880 / 105.696 = 54,111 at U.S. prices, less out-of-pocket 1,500 x 99.880 / 105.696 = 1,417, plus 9,900
    // saved = 62,594. Since stop 5B it stops at A's own prices first: 111,262 - 45,600 = 65,662 after rent at New York prices (v2-plan.md,
    // item 5, A-2), then the price line, 62,594 - 65,662 = -3,068.
    expect(b.rows.map((r) => [r.kind, r.label, r.value])).toEqual([
      ["letter", "Offer letter: salary + target bonus + sign-on", 190_000],
      ["change", "first bonus is a stub", -37_014],
      ["subtotal", "Paid in year 1", 152_986],
      ["less", "tax", -41_724], ["less", "health premiums", -1_800],
      ["subtotal", "After-tax pay", 109_462],
      ["plus", "employer 401(k)", 3_300], ["less", "expected out-of-pocket health costs", -1_500],
      ["subtotal", "Total rewards", 111_262],
      ["less", "rent", -45_600],
      ["subtotal", "After rent, at New York prices", 65_662],
      ["less", "New York prices", -3_068],
      ["total", "After rent, at U.S. prices", 62_594],
    ]);
    expect(b.rows[1].gloss).toBe("paid Jan 31 for Jul–Dec only"); // the bonus year runs Jan-Dec; A worked from Jul 13
    expect(b.rows[3].gloss).toBe("federal, FICA, NY, NYC");
    // Each subtotal foots as shown: the rows since the last one, added, to the dollar.
    let running = 0;
    for (const r of b.rows) {
      if (r.kind === "subtotal" || r.kind === "total") {
        expect(r.value).toBe(running);
        running = r.value;
      } else running += r.value;
    }
    // A month, at its own prices: 57,262 to spend - 1,500 out-of-pocket = 55,762, / 12 = $4,647, and 9,900 saved / 12 = $825: A-1's
    // year 1 (v2-plan.md's A-2 sketch).
    expect([Math.round(b.spend!), Math.round(b.saved!), b.city]).toEqual([4_647, 825, "New York"]);
    // It ties to A's year 1 in L-1 on the after-rent basis.
    expect(byYear(ctx, "A").years[0].value).toBe(b.rows[b.rows.length - 1].value);
    expect(derive("br.A.1.total", ctx).ties).toEqual(["ey.A.1", "l6y.A.total.1"]);
  });
  it("C, year 2: RSUs vest on company dates, so less than the letter's schedule lands in year 2", () => {
    const rsu = bridge(ctx, "C", 2).rows.find((r) => r.line === "rsu")!;
    expect([rsu.label, Math.round(rsu.value), rsu.gloss]).toEqual(["RSUs vest on company dates", -3_000, "vests Aug 15 and Feb 15"]);
  });
  it("year 1's tax splits across 2026 and 2027 at each year's rate and adds up", () => {
    const d = derive("br.A.1.tax", ctx);
    // Each part is its payments' tax, to the cent: 13,786.99 + 27,936.63 = 41,723.62, which is 41,724 to the dollar.
    expect(d.lines.map((l) => l.value)).toEqual(["13,786.99", "27,936.63", "41,724"]);
    expect(d.lines.map((l) => l.label.replace(/[\d,.]+ paid/, "# paid"))).toEqual(["On # paid in 2026", "On # paid in 2027", "Tax in year 1, to the dollar"]);
  });
});

describe("show the work reaches every detailed input (step 0.4)", () => {
  const ctx = context();
  const refs = (id: MetricId, c = ctx) => (derive(id, c).inputs ?? []).map((x) => `${x.ref} = ${x.value}`);
  it("the bridge's RSU line points to each grant and its vesting, share-price growth and refreshers", () => {
    expect(refs("br.C.2.rsu")).toEqual([
      "in.C.equity.grants.0.value = $120,000", "in.C.equity.grants.0.schedule = 5/15/40/40, semiannual after a 1-year cliff; on company dates",
      "in.C.equity.priceGrowth = 0%", "in.C.equity.refreshers = $10,000 / $25,000 / $40,000 a year, from month 12",
    ]);
    expect(derive("br.C.2.rsu", ctx).uses).toContain("in.C.also"); // quick mode's row lights up where the inputs are hidden
  });
  it("the bridge's bonus line points to the amount and the payout date; the salary line to raises and promotions", () => {
    expect(refs("br.A.1.bonus")).toEqual(["in.A.bonus.amounts = Year 1 $56,000 / $70,000 / $84,000; Year 2 $68,000 / $85,000 / $102,000; "
      + "Year 3 $80,000 / $100,000 / $120,000; Year 4 $92,000 / $115,000 / $138,000; Year 5, and after $104,000 / $130,000 / $156,000",
      "in.A.bonus.payOn = Jan 31", "in.A.bonus.periodStart = Jan 1"]);
    expect(metricKind("in.A.bonus.periodStart", ctx)).toBe("default");
    expect(metricKind("in.A.bonus.payOn", ctx)).toBe("traced");
  });
  it("per hour points to weekly hours and the days off, and each day off shows its default and why", () => {
    const c = context("perHour");
    expect(refs("ph.A", c)).toEqual(["in.A.hours.weekly = 80 hours a week", "in.A.timeOff.vacation = 11 days", "in.A.timeOff.holidays = 8 days",
      "in.A.timeOff.sick = None"]);
    const vacation = derive("in.A.timeOff.vacation", c);
    expect([vacation.kind, vacation.lines[0].value, vacation.notes[0]]).toEqual(["default", "11 days", "A default, not something you entered. "
      + "BLS's average for private-industry workers with paid vacation, after a year's service (National Compensation Survey, March 2026)."]);
    expect(vacation.edit).toEqual({ letter: "A", path: "timeOff.vacation" });
    // The weeks: 52 − (11 + 8 + 0) ÷ 5 = 48.2, and 80 × 48.2 = 3,856 hours a year.
    const hours = derive("l6y.A.hours.1", c);
    expect(hours.lines.map((l) => [l.label, l.value])).toEqual([["Hours a week", "80"], ["Weeks worked a year", "48.2"], ["Hours worked", "3,856"]]);
    expect(hours.lines[1].note).toBe("52 − (11 vacation days + 8 holidays + 0 sick days) ÷ 5");
  });
  it("a range reads bear / base / bull; a promotion that isn't certain says so", () => {
    expect(derive("in.B.bonus.amount", ctx).lines.map((l) => [l.label, l.value])).toEqual([
      ["Bonus, bear case", "5%"], ["Bonus, base case", "10%"], ["Bonus, bull case", "12%"]]);
    expect(derive("in.A.salary.promotions", ctx).lines.map((l) => [l.label, l.value, l.note]))
      .toEqual([["Promotion 1", "+35%", "on Jul 13, 2029, base and bull only"]]);
  });
});

describe("L-2 if things go badly (docs/ui-design.md §4.4)", () => {
  const ctx = context();
  const page = (c: WorkContext) => renderToStaticMarkup(createElement(WorkProvider, { ctx: c, children: createElement(Risk, { ctx: c, sample: true }) }));
  const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/✓/g, "").replace(/&#x27;/g, "'");

  it("each offer's bear, base and bull values are §4.4's, and the base case is the rank list's figure to the cent", () => {
    const v = riskView(ctx);
    const rounded = Object.fromEntries(v.rows.map((r) => [r.letter, [r.values.bear, r.values.base, r.values.bull].map(Math.round)]));
    expect(rounded).toEqual({ A: [258_793, 313_175, 347_199], B: [187_316, 196_270, 199_847], C: [313_862, 334_357, 355_704] });
    for (const r of v.rows) expect(r.values.base).toBe(ctx.results!.view.ranks.find((x) => x.letter === r.letter)!.value);
    expect(v.rows.map((r) => r.letter)).toEqual(["C", "A", "B"]); // sorted by the bear case
  });

  it("the sentence: C holds up best and wins every scenario; A has the most to lose, $1,250 a month (−17%)", () => {
    // Bear: C 313,862 - A 258,793 = 55,070 / 43.5191 = $1,265 a month. A's drop: 313,175 - 258,793 = 54,382 / 43.5191 = $1,250 (17%).
    expect(text(page(ctx))).toContain("C holds up best, and wins in every scenario. In the bear case it leads A by $1,265 a month over your stay, in "
      + "U.S.-average dollars. A has the most to lose: $1,250 a month below its base case over your stay, in U.S.-average dollars (−17%), because its "
      + "bonuses and promotion carry the risk.");
  });

  it("at 5 years A wins only the bull case, and the sentence says so", () => {
    expect(text(page(context("colAdjustedTotal", (o) => o, 5))))
      .toContain("C holds up best: it wins the bear and base cases, and A the bull case.");
    expect(text(page(context("colAdjustedTotal", (o) => o, 5)))).toContain("A comes out ahead only if things go well.");
  });

  it("what goes wrong lists exactly the inputs whose bear value differs from base, in each offer's A-4 (since stop 5B)", () => {
    expect(text(page(ctx))).toContain("What goes wrong in each offer's bear case is in its breakdown, under A-4");
    const parts = text(renderBreakdowns(ctx));
    expect(parts).toContain("In the bear case, bonuses 20% under target; no promotion in 2029.");
    expect(parts).toContain("In the bear case, bonus 5% of each year's salary instead of 10%.");
    expect(parts).toContain("In the bear case, bonus 10% of each year's salary instead of 15%; refreshers $10,000 instead of $25,000.");
  });

  it("only what can move the figure: a promotion after your stay, price growth without equity, hours off the per-hour basis", () => {
    const base: OfferInput = { label: "T", residence: { state: "TX" }, employerState: "TX", startDate: "2026-07-13", salary: { annual: 100_000,
      raise: { bear: 0.01, base: 0.03, bull: 0.05 }, promotions: [{ on: "2031-01-01", stepUp: 0.2, scenarios: ["base", "bull"] }] },
      equity: { grants: [], priceGrowth: { bear: -0.1, base: 0, bull: 0.1 } }, hours: { weekly: { bear: 60, base: 50, bull: 50 } } };
    expect(caseChanges(base, "bear", "2030-07-13", false)).toEqual([{ kind: "raise", value: 0.01, base: 0.03 }]);
    expect(caseChanges(base, "bear", "2031-07-13", true).map((c) => c.kind)).toEqual(["raise", "promotion", "hours"]);
    // A bull-only range has no bear changes, but it's still a range.
    const bullOnly: OfferInput = { ...base, salary: { annual: 100_000, raise: { bear: 0.03, base: 0.03, bull: 0.05 } }, equity: undefined, hours: undefined };
    expect(caseChanges(bullOnly, "bear", "2030-07-13", false)).toEqual([]);
    expect(hasRanges(bullOnly)).toBe(true);
    expect(changeText({ kind: "priceGrowth", value: -0.1, base: 0 })).toBe("share price −10% a year instead of +0%");
  });

  it("an offer without ranges shows one value and says so", () => {
    const flat = context("colAdjustedTotal", (os) => os.map((o) => (o.letter !== "B" ? o
      : { ...o, draft: { ...o.draft, bonus: { ...o.draft.bonus, amount: { bear: 0.1, base: 0.1, bull: 0.1 } } } })));
    const html = page(flat);
    expect(html).toContain('data-metric="risk.B.base"');
    expect(html).not.toContain('data-metric="risk.B.bear"');
    expect(text(renderBreakdowns(flat))).toContain("Bad case: no ranges entered, so the bear and bull cases are the base case.");
  });

  it("with no ranges anywhere, L-2 is one line pointing to + range", () => {
    const none = context("colAdjustedTotal", (os) => os.map((o) => ({ ...o, sample: null, draft: quickOnly(o.draft) })));
    const html = page(none);
    expect(text(html)).toContain("No ranges entered, so there's no downside to show. Add a range (+ range)");
    expect(html).not.toContain("risk-chart");
    expect(html).not.toContain("data-metric=");
  });

  it("the derivations foot: A's drop, the bear-case lead, and the base case's tie to the rank list and the verdict", () => {
    const drop = derive("drop.A", ctx);
    expect(drop.lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "313,175"], ["−", "258,793"], ["=", "54,382"], ["÷", "43.5191"], ["=", "$1,250"]]);
    expect(drop.notes[0]).toBe("That's 17% of A's base case.");
    expect(derive("win.bear", ctx).lines.at(-1)!.value).toBe("$1,265");
    const base = derive("risk.C.base", ctx);
    expect([base.kind, base.section, base.ties]).toEqual(["crossFooted", "M-8", ["pv.C.colAdjustedTotal"]]);
    expect(derive("win.base", ctx).ties).toEqual(["hero", "stay.4", "step.colAdjustedTotal"]);
    expect(derive("win.base", ctx).lines.at(-1)!.value).toBe("$487"); // the verdict
    // A's bear case is worked like its base case, with the bear inputs named and traced.
    const bear = derive("risk.A.bear", ctx);
    expect(bear.lines.at(-1)!.value).toBe("258,793");
    expect(bear.notes[0]).toBe("The bear case sets every uncertain input to its bear value at once. For A: bonuses 20% under target; no promotion in 2029.");
    expect(bear.inputs!.map((x) => x.ref)).toEqual(["in.A.bonus.amounts", "in.A.salary.promotions"]);
  });
});

describe("L-1 by year", () => {
  it("the years add up to the stay as paid; a later start's last year runs past it and is reconciled", () => {
    const a = byYear(context(), "A");
    // As shown (footing.ts): W4a has 62,595 and 80,562, the engine's figures rounded once; each year's lines, as shown, add up to these.
    expect(a.years.map((y) => y.value)).toEqual([62_594, 80_563, 87_631, 118_764]); // W4a's end label: 118,764
    expect(a.sum!).toBeCloseTo(a.window!, 1);
    const later = context("colAdjustedTotal", (os) => os.map((o) => (o.letter === "B" ? { ...o, draft: { ...o.draft, startDate: "2026-10-01" } } : o)));
    const b = byYear(later, "B");
    expect(b.sum! - b.window!).toBeGreaterThan(1_000); // B's year 4 ends Sep 30, 2030, after the stay's last day, Jul 12, 2030
    const d = derive("eysum.B", later);
    expect(d.lines.map((l) => l.label)).toContain("After your stay's last day (not counted)");
    expect(d.lines[d.lines.length - 1].value).toBe(figure(b.window!));
  });
});

describe("every figure has a tickmark kind, a methodology section and a derivation", () => {
  // L-1 with its table view open, each year or running, the bridge for one offer, and every view of the inputs.
  const render = (ctx: WorkContext, running = false, bridgeOf: Letter = "A") => renderPage(ctx, { running, bridgeOf });
  // The samples on each basis, and with B as your own offer (default bonus timing) on an estimated rent.
  const contexts: Array<[string, WorkContext]> = [
    ["after rent", context()],
    ["per hour", context("perHour")],
    ["after tax, B yours with an estimated rent", context("cash", (os) => os.map((o) => (o.letter !== "B" ? o
      : { ...o, sample: null, draft: quickOnly(o.draft) })))],
    // A close call: the flip line in the lead.
    ["after rent, a 5-year stay", context("colAdjustedTotal", undefined, 5)],
    // Prices in Charlotte (slice 8): B's city is the reference, its factor 1; A's indexes need 4 decimals. The rent note shows.
    ["after rent, prices in Charlotte", context("colAdjustedTotal", undefined, 4, { pricesIn: "16740" })],
  ];

  for (const [name, plain] of contexts) {
    it(name, () => {
      // L-3 and the close-call line worked out; L-4 with its panel six months in, and again on your stay's last day (the reconciliation).
      const tied = withTies(plain);
      const six = withLeave(tied.ctx);
      const end = withLeave(tied.ctx, dayBefore(plain.results!.view.row.window.end));
      const parts = renderBreakdowns(six.ctx);
      // The bridge is in each offer's A-2 (its detail open here), since stop 5B.
      expect(parts).toContain('id="bridge-A"');
      checkAll(six.ctx, render(six.ctx) + render(six.ctx, true, "C") + renderAllInputs(six.ctx)
        + renderPage(six.ctx, { leave: six.props, ties: tied.props }) + parts);
      checkAll(end.ctx, renderPage(end.ctx, { leave: end.props, ties: tied.props }));
      // A-7 open on each offer, with its payments and tax years: every line, payment and tax figure.
      const worked = withWork(six.ctx).ctx;
      checkAll(worked, renderWork(worked) + render(worked));
    }, 30_000); // every figure on the page and its drill-downs: a few seconds, longer on a busy runner
  }
  function checkAll(ctx: WorkContext, html: string) {
    {
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
        if (depth < 3) for (const ref of [...d.lines.flatMap((l) => (l.ref ? [l.ref] : [])), ...(d.inputs ?? []).map((x) => x.ref)]) check(ref, depth + 1);
      };
      for (const id of ids) check(id, 0);
      expect(seen.size).toBeGreaterThan(15);
    }
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
    expect(metricKind("in.B.costOfLiving.monthlyRent", ctx)).toBe("estimate");
    expect(metricKind("in.A.costOfLiving.monthlyRent", ctx)).toBe("traced");
    expect(render(ctx)).toContain('data-tick="in.B.costOfLiving.monthlyRent"');
    expect(derive("in.B.costOfLiving.monthlyRent", ctx).lines[0].value).toBe(`$${figure(ctx.rents["16740|NC"].monthlyRent)}`);
  });
});
