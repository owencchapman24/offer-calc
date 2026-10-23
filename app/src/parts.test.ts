import { describe, expect, it } from "vitest";
import { arrivalsOf, centsText, cliffLines, hundredOf, taxYearsOf } from "./partsModel";
import { derive } from "./derive";
import type { WorkContext } from "./metrics";
import { alone, context, footsAsDisplayed, renderAlone, renderBreakdowns, renderPage, withBenefits, withEspp } from "./testing";
import { taxTable, yearTable } from "./workpaper";

// An offer's breakdown, A-2 to A-7 (docs/v2-plan.md, item 5, stop 5B), against the plan's worked example: sample A at the samples'
// fixed dates (start Jul 13, 2026, valued that day, a 4-year stay). Hand-checked values carry their arithmetic.

const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/[✓^<]/g, " ")
  .replace(/\s+/g, " ").trim();
const own = (ctx: WorkContext, l: "A" | "B" | "C") => ctx.own!.breakdowns[l]!;

describe("A-2: where each $100 of year 1's pay goes (the plan's sketch)", () => {
  const ctx = alone("A");
  const h = hundredOf(own(ctx, "A").detail, 1)!;
  it("tax, rent, health costs, saved and left to spend, to the cent, adding to $100.00", () => {
    // Paid 152,986: tax 41,724 / 152,986 = 0.272731 -> $27.27; rent 45,600 -> 0.298067 -> $29.81; health 1,800 premiums + 1,500
    // out-of-pocket = 3,300 -> 0.021571 -> $2.16; saved, your 401(k) 6,600 -> 0.043141 -> $4.31; left to spend takes the rounding,
    // 100.00 - 63.55 = $36.45, and in dollars 152,986 - 41,724 - 45,600 - 3,300 - 6,600 = 55,762.
    expect(h.paid).toBe(152_986);
    expect(h.parts.map((p) => [p.part, p.dollars, centsText(p.cents)])).toEqual([
      ["tax", 41_724, "$27.27"], ["rent", 45_600, "$29.81"], ["health", 3_300, "$2.16"], ["saved", 6_600, "$4.31"], ["spend", 55_762, "$36.45"],
    ]);
    expect(h.parts.reduce((s, p) => s + p.cents, 0)).toBe(10_000);
    // Left to spend, / 12, is A-1's year 1: 55,762 / 12 = $4,647.
    expect(Math.round(h.parts[4].dollars / 12)).toBe(4_647);
  });
  it("the employer's money is outside the $100: 401(k) money credited, all of it vested by the end of a 4-year stay", () => {
    expect([h.credited, h.vestedShare, h.hsa, h.perks]).toEqual([3_300, 1, 0, 0]);
  });
  it("each share's work foots as displayed: the part ÷ the pay × 100", () => {
    const d = derive("a2.A.1.taxShare", ctx);
    expect(d.lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "41,724"], ["÷", "152,986"], ["×", "100"], ["=", "$27.27"]]);
    expect(derive("a2.A.1.spendShare", ctx).lines.at(-1)!.value).toBe("$36.45");
    expect(derive("a2.A.1.hundred", ctx).lines.at(-1)!.value).toBe("$100.00");
  });
  it("A-2's bridge ends at New York prices, then (with a comparison) steps to U.S. prices, tying to L-1", () => {
    const parts = words(renderBreakdowns(context()));
    expect(parts).toContain("After rent, at New York prices 65,662");
    expect(parts).toContain("less New York prices non-housing prices");
    // The month restates the line at its own prices, which the step to U.S. prices follows: it says so.
    expect(parts).toContain("After rent at A's own prices = $4,647 a month to spend after rent + $825 a month saved, in year 1, in New York dollars");
    expect(words(renderAlone(alone("A"))))
      .toContain("New York prices 65,662 = $4,647 a month to spend after rent");
  }, 30_000);
});

describe("A-3: pay by year, and when each payment arrives", () => {
  const ctx = alone("A");
  it("the table is A-7's lines: salary, bonus and sign-on, footed into pay each year", () => {
    const t = yearTable(ctx, "A");
    const pay = t.rows.find((r) => r.line === "gross")!;
    expect(pay.values[0]).toBe(152_986);
    for (let i = 0; i < pay.values.length; i++) {
      expect(pay.values[i]).toBe(t.rows.filter((r) => ["salary", "bonus", "cash", "rsu", "clawback"].includes(r.line)).reduce((s, r) => s + r.values[i], 0));
    }
  });
  it("lists every payment that isn't salary by date: the sign-on, then each January's bonus", () => {
    const a = arrivalsOf(own(ctx, "A").detail, 4);
    expect(a.map((x) => [x.date, x.kind])).toEqual([
      ["2026-08-12", "cash"], ["2027-01-31", "bonus"], ["2028-01-31", "bonus"], ["2029-01-31", "bonus"], ["2030-01-31", "bonus"],
    ]);
    // The first bonus is for Jul 13 - Dec 31, 2026 only: 70,000 x 172 / 365 = 32,986.30.
    expect([a[1].label, a[1].note, Math.round(a[1].gross * 100) / 100]).toEqual(["Bonus for Jul 13, 2026 – Dec 31, 2026", "for part of a year", 32_986.3]);
  });
});

describe("A-4: the terms that can bite", () => {
  const ctx = alone("A");
  it("its terms in words, its cliffs inside the stay, and the next one from its start", () => {
    const text = words(renderBreakdowns(context()));
    expect(text).toContain("Its first bonus is paid Jan 31, 2027; you must be employed on each payout date.");
    expect(text).toContain("The $10,000 sign-on is repaid in full if you leave before Jul 12, 2027.");
    expect(text).toContain("Its employer 401(k) money vests after 3 years of service.");
    const t = ctx.own!.terms!.A!;
    const lines = cliffLines(t.cliffs).map((c) => (c.kind === "cliff" ? [c.cliff.date, c.cliff.kind] : [c.from, "steps"]));
    // The sign-on paid Aug 12, 2026; each bonus on Jan 31; the clawback's end on the day before its 12 months are up; 401(k) money
    // vesting on the day before the third anniversary, the last day that completes 3 years.
    expect(lines).toEqual([
      ["2026-08-12", "cashAward"], ["2027-01-31", "bonus"], ["2027-07-12", "clawbackCleared"], ["2028-01-31", "bonus"], ["2029-01-31", "bonus"],
      ["2029-07-12", "retirementVest"], ["2030-01-31", "bonus"],
    ]);
    expect([t.from, t.next?.date, t.next?.cliffs.map((c) => c.kind)]).toEqual(["2026-07-13", "2026-08-12", ["cashAward"]]);
    // Staying until the sign-on is worth what you'd keep on its day less on your first: its 30 days' pay, since leaving right after it
    // repays it in full. The engine's value of staying is the same, before rounding.
    expect(Math.abs(t.kept!.at - t.kept!.from - t.next!.valueOfStaying.afterTaxComp)).toBeLessThan(0.01);
    expect(derive("nextup.A", ctx).lines.map((l) => l.op ?? "")).toEqual(["", "−", "="]);
  });
  it("the bad case: bear and bull a month over the stay at New York prices, and what goes wrong", () => {
    const text = words(renderBreakdowns(context()));
    expect(text).toMatch(/Bad case, in New York dollars: \$6,245 a month over your stay, 17% under the base case; in the bull case, \$[\d,]+ a month over your stay\./);
    expect(text).toContain("In the bear case, bonuses 20% under target; no promotion in 2029.");
  }, 30_000);
});

describe("4a: days off, and unused vacation paid when you leave", () => {
  // Sample A with its employer in California, giving 15 vacation days a year; you'd take the default 11, so 4 bank a year.
  const ca = alone("A", (o) => ({ ...o, draft: { ...o.draft, employerState: "CA", timeOff: { ...o.draft.timeOff, gives: 15 } } }));
  it("A-1 says where its hours come from: 80 a week for 48.2 weeks, after the default days off", () => {
    expect(words(renderAlone(alone("A")))).toContain("$23.82 (80 hours a week for 48.2 weeks a year, after 11 vacation days, 8 holidays and no "
      + "sick days)");
  });
  it("A-4 names the policy, and leaving on the day picked pays the days banked, at the salary ÷ 260", () => {
    const text = words(renderAlone(ca));
    expect(text).toContain("It gives 15 vacation days a year and you'd take 11, so 4 bank each year; California requires unused vacation be paid "
      + "when you leave.");
    // A-4's first last day, Jan 12, 2027: 184 of year 1's 365 days worked, 4 × 184 ÷ 365 = 2.016438 days, × 110,000 ÷ 260 = 853.11.
    const p = ca.own!.leave!.panels.A!;
    expect(p.vacation).toMatchObject({ banked: expect.closeTo((4 * 184) / 365, 9), paid: 853.11, annual: 110_000 });
    expect(text).toContain("with $853 before tax for 2.02 days of unused vacation paid out,");
    const vac = derive("vac.A", ca);
    footsAsDisplayed("vac.A", vac);
    expect(vac.lines.map((l) => l.value)).toEqual(["110,000", "2.016438", "260", "853"]);
    // What you'd keep shows it on a line of its own, and still foots.
    const kept = derive("kept.A", ca);
    footsAsDisplayed("kept.A", kept);
    expect(kept.lines.find((l) => l.label === "Unused vacation paid out")?.value).toBe("853");
  });
  it("where the state doesn't require it, the days banked are named but not paid; unlimited banks nothing", () => {
    const nc = alone("A", (o) => ({ ...o, draft: { ...o.draft, employerState: "NC", timeOff: { ...o.draft.timeOff, gives: 15 } } }));
    expect(nc.own!.leave!.panels.A!.vacation.paid).toBe(0);
    expect(words(renderAlone(nc))).toContain("2.02 days of unused vacation aren't paid out (NC doesn't require it).");
    const unlimited = alone("A", (o) => ({ ...o, draft: { ...o.draft, employerState: "CA", timeOff: { ...o.draft.timeOff, policy: "unlimited" } } }));
    const text = words(renderAlone(unlimited));
    expect(text).toContain("Its vacation is unlimited: nothing builds up, so nothing is paid when you leave.");
    expect(text).toMatch(/McPherson/);
  });
  it("A-5: paid time off, 19 days a year, is 19 × 110,000 ÷ 260 = 8,038.46 of its starting salary, in no total", () => {
    const ctx = alone("A");
    expect(words(renderAlone(ctx))).toContain("Paid time off: 11 vacation days, 8 holidays and no sick days, 19 days a year. $8,038 of its starting salary a "
      + "year is for those days, as paid");
    const d = derive("a5.A.pto", ctx);
    footsAsDisplayed("a5.A.pto", d);
    expect(d.lines.map((l) => l.value)).toEqual(["110,000", "19", "260", "8,038"]);
  });
});

describe("an ESPP (4i): sample A putting 10% of salary in, at the plan's defaults", () => {
  // 15% off with a lookback, 6-month offerings from Jan 1, the share price flat. A starts Jul 13, 2026, after Jul 1's offering began, so it
  // joins Jan 1, 2027's: Jan-Jun's 6 × 110,000 ÷ 12 × 10% = 5,500 buys 5,500 ÷ 0.85 = 6,470.59 of stock on Jun 30, sold at once, a gain of
  // 970.59. Jul 1-12, 2027's 110,000 ÷ 12 × 12/31 × 10% = 354.84 is still in the plan at year 1's end (Jul 12).
  const ctx = alone("A", (o) => withEspp(o));
  const d = own(ctx, "A").detail;
  const t = yearTable(ctx, "A");
  const line = (l: string) => t.rows.find((r) => r.line === l)!;
  it("A-3 lists each purchase's gain by date, and its pay line adds them", () => {
    const buys = arrivalsOf(d, 4).filter((a) => a.kind === "espp");
    // Dec 31, 2029's offering straddles the promotion (Jul 13, 2029, to 148,500): 354.84 + 148,500 ÷ 12 × 19/31 × 10% = 758.47, + 5 months of
    // 1,237.50 = 7,300.81, a gain of 7,300.81 ÷ 0.85 - 7,300.81 = 1,288.38; Jun 30, 2030's 6 × 1,237.50 = 7,425 gains 1,310.29.
    expect(buys.map((a) => [a.date, a.gross])).toEqual([["2027-06-30", 970.59], ["2027-12-31", 970.59], ["2028-06-30", 970.59], ["2028-12-31", 970.59],
      ["2029-06-30", 970.59], ["2029-12-31", 1_288.38], ["2030-06-30", 1_310.29]]);
    expect(buys[0].label).toBe("ESPP purchase, the offering from Jan 1, 2027");
    // Years 2 and 3 have two purchases each, 2 × 970.59 = 1,941.18; year 4, 1,288.38 + 1,310.29 = 2,598.67.
    expect(line("espp").values).toEqual([971, 1_941, 1_941, 2_599]);
    expect(line("gross").values[0]).toBe(152_986 + 971);
  });
  it("A-2: the money held at year 1's end is a share of its own, 355, $0.23 of each $100; saved stays the 401(k)'s 6,600", () => {
    const h = hundredOf(d, 1)!;
    // Paid 152,986 + 971 = 153,957. Saved 6,600 ÷ 153,957 = 0.042869 -> $4.29; in the ESPP 355 ÷ 153,957 = 0.002306 -> $0.23; left to
    // spend, 153,957 - 42,071 tax - 45,600 rent - 3,300 health - 6,600 - 355 = 56,031.
    expect(h.parts.map((p) => [p.part, p.dollars])).toEqual([["tax", 42_071], ["rent", 45_600], ["health", 3_300], ["saved", 6_600], ["espp", 355],
      ["spend", 56_031]]);
    expect(h.parts.filter((p) => p.part === "saved" || p.part === "espp").map((p) => centsText(p.cents))).toEqual(["$4.29", "$0.23"]);
    expect(h.parts.reduce((s, p) => s + p.cents, 0)).toBe(10_000);
    for (const id of ["a2.A.1.espp", "a2.A.1.esppShare", "a2.A.1.spend", "a2.A.1.hundred", "br.A.1.saved", "br.A.1.inEspp"] as const) footsAsDisplayed(id, derive(id, ctx));
    // The bridge's month: 56,031 ÷ 12 = $4,669 to spend + (10,255 at face value - 355) ÷ 12 = $825 saved + 355 ÷ 12 = $30 in the ESPP.
    expect(words(renderAlone(ctx))).toContain("= $4,669 a month to spend after rent + $825 a month saved + $30 a month held in the ESPP, in year 1, in New York dollars");
  });
  it("A-7: take-home pay is after-tax pay less the 401(k) and the money held; its work foots", () => {
    // Put in 5,854.84 (5,500 + 354.84), out 5,500 at the purchase: 354.84 held.
    expect(line("esppHeld").values[0]).toBe(-355);
    expect(line("takeHome").values[0]).toBe(t.years[0].afterTax - 6_600 - 355);
    const held = derive("l6y.A.esppHeld.1", ctx);
    footsAsDisplayed("l6y.A.esppHeld.1", held);
    expect(held.lines.map((l) => l.value)).toEqual(["5,854.84", "5,500.00", "355"]);
    for (const id of ["l6y.A.espp.1", "l6y.A.face.1", "br.A.1.espp", "own.A.y1saved", "own.A.y1spend"] as const) footsAsDisplayed(id, derive(id, ctx));
  });
  it("A-5: what goes in over the stay, 5,855 + 11,000 + 11,000 + 14,850 = 42,705, and the holding note", () => {
    const esppIn = derive("a5.A.esppIn", ctx);
    footsAsDisplayed("a5.A.esppIn", esppIn);
    expect(esppIn.lines.map((l) => l.value)).toEqual(["5,855", "11,000", "11,000", "14,850", "42,705"]);
    const text = words(renderAlone(ctx));
    expect(text).toContain("Its ESPP puts 10% of salary toward company stock at 15% off, with a lookback: $42,705 over the stay, as paid.");
    expect(text).toContain("Holding shares after purchase is an investment decision and isn't modeled.");
  });
  it("A-4: leaving on its first last day, Jan 12, 2027, gives back Jan 1-12's 110,000 ÷ 12 × 12/31 × 10% = 354.84, without a gain", () => {
    expect(ctx.own!.leave!.panels.A!.esppRefund).toBe(354.84);
    const text = words(renderAlone(ctx));
    expect(text).toContain("get back $355 put toward an ESPP purchase,");
    expect(text).toContain("Its first ESPP purchase is Jun 30, 2027; leaving before a purchase gives back what you've put toward it, without the gain.");
    footsAsDisplayed("refund.A", derive("refund.A", ctx));
  });
  it("A-7's tax: the gain is wages for income tax, not FICA: 2027's two purchases, 2 × 970.59 = 1,941", () => {
    const row = taxTable(ctx, "A", 2027).rows.find((r) => r.line === "statutory")!;
    expect([row.label, row.with, row.without, row.offer]).toEqual(["Of which, ESPP gain", 1_941, 0, 1_941]);
  });
});

describe("other benefits (4j): sample A with a $1,200 taxable wellness stipend and $600 of tax-free gym money", () => {
  // Each a twelfth a month: year 1, Jul 13, 2026 - Jul 12, 2027, has Jul 13-31 (19/31), eleven whole months and Jul 1-12 (12/31), so
  // 100 x 31/31 + 1,100 = 1,200 of the stipend and 50 x 31/31 + 550 = 600 of gym money, every year of the 4.
  const ctx = alone("A", (o) => withBenefits(o));
  const plain = alone("A");
  const d = own(ctx, "A").detail;
  const text = words(renderAlone(ctx));
  it("A-2: the taxable one is pay, inside the $100 (152,986 + 1,200 = 154,186); the tax-free one is outside it, by name", () => {
    expect(hundredOf(d, 1)!.paid).toBe(154_186);
    expect(text).toContain("plus taxable benefits, paid with salary Wellness 1,200");
    expect(text).toMatch(/\$600 T? ?of tax-free benefits \(Gym\)/);
  });
  it("A-1: tax-free benefits on a line of their own, not in saved; to spend + saved + tax-free = the total, as shown", () => {
    const v = own(ctx, "A");
    const b = ctx.own!.breakdowns.A!;
    expect(b.detail.window.costOfLiving!.presentValue!.taxFree).toBeGreaterThan(0);
    for (const id of ["own.A.total", "own.A.spend", "own.A.saved", "own.A.taxFree", "own.A.y1taxFree", "own.A.y1saved", "br.A.1.taxFree", "br.A.1.saved",
      "br.A.1.benefit"] as const) footsAsDisplayed(id, derive(id, ctx));
    // Saved is what it was without the benefits: the gym money isn't savings.
    expect(derive("own.A.saved", ctx).lines.at(-1)!.value).toBe(derive("own.A.saved", plain).lines.at(-1)!.value);
    // Year 1: 600 / 12 = $50 a month.
    expect(text).toMatch(/\+ \$50 a month in tax-free benefits\. Your stay's figure/);
    expect(text).toMatch(/= \$[\d,]+ to spend after rent \+ \$[\d,]+ saved \+ \$\d+ in tax-free benefits/);
    void v;
  });
  it("A-3: the taxable one by year, and a month with salary: 1,200 / 12 = $100", () => {
    const t = yearTable(ctx, "A");
    expect(t.rows.find((r) => r.line === "benefit")!.values).toEqual([1_200, 1_200, 1_200, 1_200]);
    expect(text).toContain("a month at its starting salary, with $100 a month of taxable benefits.");
    footsAsDisplayed("when.A.benefit", derive("when.A.benefit", ctx));
  });
  it("A-4 says they stop on your last day; A-5 names each, over the stay, the taxable one after tax; A-6 names the tax-free one", () => {
    expect(text).toContain("Its other benefits (Wellness, Gym) stop on your last day.");
    expect(text).toMatch(/Wellness, taxable \(pay\): \$1,200 T? ?a year, \$4,800 over the stay, as paid \( ?\$[\d,]+ after tax\)\./);
    expect(text).toMatch(/Gym, tax-free, as entered: \$600 T? ?a year, \$2,400 over the stay, as paid\./);
    for (const id of ["a5.A.ob.0.stay", "a5.A.ob.0.afterTax", "a5.A.ob.1.stay"] as const) footsAsDisplayed(id, derive(id, ctx));
    expect(text).toContain("Counted tax-free, as entered: Gym.");
  });
});

describe("A-6: tax by calendar year", () => {
  it("each year's kinds add to its tax as shown, and its rate is that tax ÷ its pay", () => {
    for (const l of ["A", "B", "C"] as const) {
      const b = own(context(), l);
      const rows = taxYearsOf(b.detail, b.window);
      expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
      for (const r of rows) {
        const v = r.values;
        expect(v.federal + v.fica + v.state + v.local).toBe(v.tax);
        expect(r.rate).toBe(v.tax / v.gross);
      }
    }
  });
});

describe("B3: a breakdown is its offer's alone", () => {
  it("adding offers changes none of A's parts: its $100, its payments by date, its tax years", () => {
    const one = own(alone("A"), "A");
    const three = own(context(), "A");
    expect(hundredOf(three.detail, 1)).toEqual(hundredOf(one.detail, 1));
    expect(arrivalsOf(three.detail, 4)).toEqual(arrivalsOf(one.detail, 4));
    expect(taxYearsOf(three.detail, three.window)).toEqual(taxYearsOf(one.detail, one.window));
  });
  it("where an offer starts later, the comparison's figure shows the step from its own stay", () => {
    const later = context("colAdjustedTotal", (os) => os.map((o) => (o.letter === "B" ? { ...o, draft: { ...o.draft, startDate: "2026-10-01" } } : o)));
    const note = derive("pv.B.colAdjustedTotal", later).notes.at(-1)!;
    const m = note.match(/^B on its own \(A-1, Oct 1, 2026 – Sep 30, 2030\): ([\d,]+), less ([\d,]+) that falls after the comparison's window ends \(Jul 12, 2030\), = ([\d,]+) in the comparison\.$/);
    expect(m, note).toBeTruthy();
    const [ownPv, less, here] = m!.slice(1).map((x) => Number(x.replace(/,/g, "")));
    expect(ownPv - less).toBe(here);
    // Its A-7 is over its own stay: it has no present-value column (it isn't the rank list's).
    expect(renderBreakdowns(later)).not.toContain('data-metric="l6s.B.colAdjustedTotal.pv"');
  }, 30_000);
});

describe("the comparison without L-5 and L-6 (B8)", () => {
  it("their schedules are gone; each offer's warnings and tables are in its A-6 and A-7", () => {
    const page = renderPage(context());
    expect(page).not.toContain('id="l5-title"');
    expect(page).not.toContain('id="l6-title"');
    const parts = renderBreakdowns(context());
    for (const l of ["A", "B", "C"]) {
      expect(parts).toContain(`id="${l}-6-title"`);
      expect(parts).toContain(`id="${l}-7-title"`);
    }
  });
});

describe("while an input has a problem", () => {
  // The slow lane's last results answer older inputs (their keys no longer match): nothing newer is on its way.
  const stale = (status: "invalid" | null) => renderAlone(alone("A"), { parts: (p) => ({
    ...p, status, slow: { work: { ...p.slow.work, key: "older" }, terms: { ...p.slow.terms, key: "older" }, cursor: { ...p.slow.cursor, key: "older" } },
  }) });
  const busy = (html: string, n: number) => new RegExp(`<section class="part[^"]*" aria-labelledby="A-${n}-title" aria-busy="true"`).test(html);
  it("A-4 and A-7 show their last valid results, not busy, the breakdown dimmed", () => {
    const html = stale("invalid");
    expect([busy(html, 4), busy(html, 7)]).toEqual([false, false]);
    expect(html).toContain('class="own-parts is-invalid"');
    expect(words(html)).toMatch(/If you left on : you'd keep \$[\d,]+/);
  });
  it("while new inputs are worked out, they're busy", () => {
    const html = stale(null);
    expect([busy(html, 4), busy(html, 7)]).toEqual([true, true]);
    expect(words(html)).toContain("If you left on : working it out…");
  });
});
