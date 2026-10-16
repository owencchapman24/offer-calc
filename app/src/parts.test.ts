import { describe, expect, it } from "vitest";
import { arrivalsOf, centsText, cliffLines, hundredOf, taxYearsOf } from "./partsModel";
import { derive } from "./derive";
import type { WorkContext } from "./metrics";
import { alone, context, renderAlone, renderBreakdowns, renderPage } from "./testing";
import { yearTable } from "./workpaper";

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
    expect(parts).toContain("= $4,647 a month to spend after rent + $825 a month saved, in year 1, in New York dollars");
  });
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
  });
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
