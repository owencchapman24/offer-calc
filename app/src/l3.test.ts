import { describe, expect, it } from "vitest";
import { breakeven, comparisonWindow } from "../../src/offer/compare";
import { projectScenario } from "../../src/offer/project";
import type { OfferInput, ValueBasis } from "../../src/offer/types";
import { cashLever, scalesText, tieView } from "./breakevenModel";
import { derive } from "./derive";
import type { WorkContext } from "./metrics";
import type { AppOffer } from "./model";
import { tieJob, type Ties } from "./protocol";
import { breakevenJob } from "./slowJobs";
import { compareOf, context, renderPage, runJob, withTies } from "./testing";

// L-3 · What it would take, and the close-call line (docs/ui-design.md §4.6, §4.1). The samples start Jul 13, 2026 and
// are valued then, as in W7a.

const text = (html: string) => html.replace(/<span class="tick [^"]*"[^>]*>[^<]*<\/span>/g, "").replace(/<(li|p)[^>]*>/g, "\n")
  .replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").trim();
const l3Text = (ctx: WorkContext) => {
  const t = withTies(ctx);
  const html = renderPage(t.ctx, { ties: t.props });
  const from = html.indexOf('id="l3-title"');
  return text(html.slice(from, html.indexOf("Methodology M-7.4", from)));
};
const ties = (ctx: WorkContext) => withTies(ctx).ctx.results!.ties!.l3!;
const basisOf = (ctx: WorkContext): ValueBasis => (ctx.results!.view.basis === "perHour" ? ctx.results!.view.perHourOf : ctx.results!.view.basis);

/** An offer's base-case total over your stay's window, with one change, as the rank list values it. */
function total(ctx: WorkContext, letter: string, change: (o: OfferInput) => OfferInput): number {
  const c = compareOf(ctx);
  const i = ctx.results!.letters.indexOf(letter as never);
  const w = projectScenario(change(c.offers[i]), c.household, { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate,
    window: comparisonWindow(c.offers, c.stayYears), scenario: "base" }).window;
  const basis = basisOf(ctx);
  return basis === "cash" ? w.presentValue!.afterTaxComp : basis === "totalRewards" ? w.totalRewards.presentValue! : w.costOfLiving!.presentValue!.total;
}
const withSalary = (annual: number) => (o: OfferInput): OfferInput => ({ ...o, salary: { ...o.salary, annual } });

describe("step 0: breakeven over the comparison window", () => {
  // B starts first, so the window starts on B's day; A and C start later. On the default basis, after rent.
  const starts: Record<string, string> = { A: "2026-09-01", B: "2026-07-13", C: "2026-10-05" };
  const ctx = context("colAdjustedTotal", (os) => os.map((o): AppOffer => ({ ...o, draft: { ...o.draft, startDate: starts[o.letter] } })));
  const t = ties(ctx);
  const view = ctx.results!.view;

  it("L-3's target is the winner's rank-list value to the cent, with three offers on different start dates", () => {
    expect(view.row.window.start).toBe("2026-07-13");
    const v = tieView(t, ctx.results!.letters, compareOf(ctx).offers)!;
    expect(v.winner).toBe(view.ranks[0].letter);
    expect(Math.round(v.target * 100)).toBe(Math.round(view.ranks[0].value * 100));
    // Every row behind the winner ties to the same figure; the cushion ties to the runner-up's.
    for (const x of v.behind) expect(x.row.salary.targetPV).toBe(v.target);
    expect(Math.round(v.cushion.row.salary.targetPV * 100)).toBe(Math.round(view.ranks[1].value * 100));
    // L-3 shows it, cross-footed to the rank list.
    const d = derive("tie.target", withTies(ctx).ctx);
    expect(d.lines[0].value).toBe(Math.round(view.ranks[0].value).toLocaleString("en-US"));
    expect(d.ties).toEqual([`pv.${v.winner}.colAdjustedTotal`]);
  });
  it("without the window, a breakeven between two offers that start after the third misses the rank list's figure", () => {
    const c = compareOf(ctx);
    const lead = view.row.leads.colAdjustedTotal!;
    const pair = breakeven(c.offers[lead.winner], c.offers[lead.runnerUp], "salary", c.household,
      { valuationDate: c.valuationDate, inflation: c.inflation, discountRate: c.discountRate, horizonYears: c.stayYears, basis: "colAdjustedTotal" });
    expect(Math.abs(pair.targetPV - view.ranks[0].value)).toBeGreaterThan(1_000);
  });
});

describe("L-3's levers tie", () => {
  for (const [name, ctx] of [["after rent", context()], ["after tax", context("cash")], ["total rewards", context("totalRewards")],
    ["after rent, a 5-year stay", context("colAdjustedTotal", undefined, 5)]] as const) {
    it(`${name}: re-entering each salary L-3 reports gives a tie, and it's right to the cent`, () => {
      const t = ties(ctx);
      const target = t.rows[0].salary.targetPV;
      for (const row of t.rows.slice(0, -1)) {
        const letter = ctx.results!.letters[row.offer];
        const s = row.salary;
        if (s.outcome !== "tie") throw new Error("no tie");
        const gap = (annual: number) => total(ctx, letter, withSalary(annual)) - target;
        // A cent of annual salary moves a 4-year total about 2.5 cents, and the engine rounds each payment to the cent, so totals
        // are noisy by a cent or two at that scale: re-entered, the salary meets the target within a few cents, and ten cents
        // either way it's clearly short or over.
        expect(Math.abs(gap(s.to)), `${letter} ${s.to}`).toBeLessThan(0.05);
        expect(gap(s.to - 0.1)).toBeLessThan(0);
        expect(gap(s.to + 0.1)).toBeGreaterThan(0);
      }
      // The winner's cushion: at the salary it reports, the runner-up ties.
      const cushion = t.rows[t.rows.length - 1];
      const W = ctx.results!.letters[cushion.offer];
      if (cushion.salary.outcome !== "tie") throw new Error("no tie");
      expect(Math.abs(total(ctx, W, withSalary(cushion.salary.to)) - cushion.salary.targetPV)).toBeLessThan(0.05);
    });
  }
  it("the cash award that ties does tie, on the award it names", () => {
    const ctx = context();
    const row = ties(ctx).rows[0];
    const cash = row.cash!;
    if (cash.outcome !== "tie") throw new Error("no tie");
    const t = total(ctx, "A", (o) => ({ ...o, cashAwards: [{ ...o.cashAwards![0], amount: cash.to }, ...o.cashAwards!.slice(1)] }));
    expect(Math.abs(t - cash.targetPV)).toBeLessThan(0.02);
  });
});

describe("L-3 on the samples (W7a)", () => {
  const ctx = context();
  const page = l3Text(ctx);

  it("A and B: the salary and the sign-on that tie C, after rent at U.S. prices, over 4 years", () => {
    expect(page).toContain("To tie C: its 4-year total after rent, at U.S. prices, 334,357 in today's dollars");
    expect(page).toMatch(/A Starting salary \$110,000 → \$118,626 \(\+\$8,626, \+7\.8%\)/);
    expect(page).toMatch(/or Sign-on, paid Aug 12, 2026: \$10,000 → \$45,487 \(\+\$35,487\)/);
    expect(page).toMatch(/B Starting salary \$80,000 → \$125,404 \(\+\$45,404, \+56\.8%\)/);
    expect(page).toMatch(/or Sign-on, paid Aug 12, 2026: \$5,000 → \$205,860 \(\+\$200,860\)/);
  });
  it("the rent lever: C still wins unless A's New York rent is under $3,303; B trails even rent-free; C's lead goes over $3,086", () => {
    expect(page).toContain("C still wins unless your New York rent for A is under $3,303 a month (now $3,800, first lease year).");
    expect(page).toContain("Even rent-free in Charlotte, B trails C (its rent now $1,700 a month).");
    expect(page).toContain("C's lead goes if your Seattle rent for C is over $3,086 a month (now $2,600, first lease year).");
  });
  it("the winner's cushion: how far C's salary could fall, and that it still leads A with no sign-on (already ahead)", () => {
    const cushion = ties(ctx).rows[2];
    expect(cushion.cash!.outcome).toBe("alreadyAhead");
    expect(page).toContain("C leads. Its cushion over A, the runner-up:");
    expect(page).toMatch(/Its starting salary could fall from \$105,000 to \$98,054 \(−\$6,946, −6\.6%\) before A ties\./);
    expect(page).toContain("C still leads A with no sign-on (now $10,000, paid Aug 12, 2026).");
    const d = derive("tie.C.cash", withTies(ctx).ctx);
    expect(d.notes[0]).toBe("With no sign-on at all, C's total stays above A's, so no amount ties: C doesn't need it to lead.");
  });
  it("says per offer what scales with salary: A's bonus is entered by year, so it doesn't", () => {
    expect(page).toContain("Promotions and the 401(k) match scale with A's salary; its bonus, entered by year, doesn't.");
    expect(page).toContain("Raises, the 10% bonus and the 401(k) match scale with B's salary.");
    expect(page).toContain("Raises, the 15% bonus and the 401(k) match scale with C's salary.");
    // On after-tax pay the match isn't counted, so it isn't said to scale.
    expect(l3Text(context("cash"))).toContain("Raises and the 15% bonus scale with C's salary.");
  });
  it("on the per-hour basis, ties the total per hour divides, and says so", () => {
    const p = l3Text(context("perHour"));
    expect(p).toContain("Per hour can't be tied by one number, so these tie the total it divides by your hours: after rent, at U.S. prices.");
    expect(p).toContain("To tie C: its 4-year total after rent, at U.S. prices, 334,357");
  });
});

describe("the cash-award lever names the award it changes", () => {
  const base: OfferInput = { label: "X", residence: { state: "TX" }, employerState: "TX", startDate: "2026-07-13", salary: { annual: 90_000 } };
  it("an offer's first award, by its own label and date; with none, the sign-on the engine adds", () => {
    expect(cashLever({ ...base, cashAwards: [{ label: "Relocation", amount: 5_000, paidOn: "2026-08-12" },
      { label: "Sign-on", amount: 20_000, paidOn: { daysAfterStart: 30 } }] })).toMatchObject({ name: "Relocation, paid Aug 12, 2026", added: false });
    expect(cashLever(base)).toMatchObject({ name: "a sign-on paid 30 days after you start (Aug 12, 2026), with no clawback", added: true });
  });
  it("in L-3, an offer with a relocation first changes the relocation, and one with no award gets a sign-on", () => {
    const ctx = context("colAdjustedTotal", (os) => os.map((o): AppOffer => (o.letter === "A"
      ? { ...o, draft: { ...o.draft, cashAwards: [{ label: "Relocation", amount: 4_000, paidOn: "2026-09-01", clawback: null }, ...o.draft.cashAwards] } }
      : o.letter === "B" ? { ...o, draft: { ...o.draft, cashAwards: [] } } : o)));
    const page = l3Text(ctx);
    expect(page).toMatch(/or Relocation, paid Sep 1, 2026: \$4,000 → \$[\d,]+ \(\+\$[\d,]+\)/);
    expect(page).toMatch(/or a sign-on paid 30 days after you start \(Aug 12, 2026\), with no clawback: \$[\d,]+/);
    const t = ties(ctx);
    // The relocation's change ties A: its total with the relocation at that amount meets C's.
    const cash = t.rows[0].cash!;
    if (cash.outcome !== "tie") throw new Error("no tie");
    expect(cash.from).toBe(4_000);
    const withReloc = total(ctx, "A", (o) => ({ ...o, cashAwards: [{ ...o.cashAwards![0], amount: cash.to }, ...o.cashAwards!.slice(1)] }));
    expect(Math.abs(withReloc - cash.targetPV)).toBeLessThan(0.02);
    expect(derive("tie.B.cash", withTies(ctx).ctx).notes[0]).toBe("B has no cash award, so this adds one: a sign-on paid 30 days after the start, with no clawback.");
  });
  it("scales text: a bonus in dollars doesn't scale; nothing at all says only the salary moves", () => {
    expect(scalesText("A", { ...base, bonus: { basis: "fixed", amount: { bear: 5_000, base: 5_000, bull: 5_000 }, payOn: { month: 3, day: 15 } } },
      "totalRewards")).toBe("Only A's salary itself moves; its bonus, entered in dollars, doesn't.");
    expect(scalesText("A", base, "cash")).toBe("Only A's salary itself moves.");
    expect(scalesText("A", { ...base, salary: { annual: 90_000, raise: { bear: 0.03, base: 0.03, bull: 0.03 } } }, "cash")).toBe("Raises scale with A's salary.");
  });
});

describe("the rent lever in L-3 is the engine's closed form", () => {
  it("re-entering A's rent that ties gives C's total, within a cent of rent", () => {
    const ctx = context();
    const rent = ties(ctx).rows[0].rent!;
    if (rent.outcome !== "tie") throw new Error("no tie");
    // A cent of monthly rent moves the total about 43 cents, well above the totals' rounding.
    const at = (monthlyRent: number) => total(ctx, "A", (o) => ({ ...o, costOfLiving: { ...o.costOfLiving!, monthlyRent } })) - rent.targetPV;
    expect(Math.abs(at(rent.to))).toBeLessThan(0.25);
    expect(at(rent.to - 0.01)).toBeGreaterThan(0);
    expect(at(rent.to + 0.01)).toBeLessThan(0);
    // The derivation foots: the gap in New York dollars over rent's factor is the change, and from − change = to, as displayed.
    const d = derive("tie.A.rent", withTies(ctx).ctx);
    const v = (label: string) => Number(d.lines.find((l) => l.label.startsWith(label))!.value!.replace(/[$,]/g, ""));
    expect(Math.round(v("The same in New York dollars") / v("Rent's present-value factor"))).toBe(v("Less rent a month"));
    expect(d.lines[d.lines.length - 1]).toMatchObject({ label: "Rent that ties: $3,800 as entered − $497", value: "$3,303" });
  });
});

describe("the close-call line (docs/ui-design.md §4.1)", () => {
  it("at 5 years the samples are a close call: $2,651 more starting salary for A would tie, the same figure as L-3's", () => {
    const ctx = context("colAdjustedTotal", undefined, 5);
    const t = withTies(ctx);
    const html = renderPage(t.ctx, { ties: t.props });
    const close = text(html.match(/<p class="close[^>]*>.*?<\/p>/)![0]);
    expect(close).toBe("Close call The lead is under 3% of C's value. $2,651 more starting salary for A would tie.");
    const flip = t.ctx.results!.ties!.flip!.rows[0];
    expect(flip.salary).toEqual(t.ctx.results!.ties!.l3!.rows[0].salary);
    expect(derive("flip", t.ctx).notes[0]).toBe("The lead is under 3% of C's value, a close call: this is the change to A's offer that would tie it.");
  });
  it("at 4 years it isn't one: no line, and no job", () => {
    const ctx = context();
    expect(ctx.results!.view.lead!.closeCall).toBe(false);
    const t = withTies(ctx);
    expect(t.ctx.results!.ties!.flip).toBeUndefined();
    expect(renderPage(t.ctx, { ties: t.props })).not.toContain("more starting salary for");
  });
});

describe("the slow job", () => {
  it("L-3 reuses the close-call line's breakeven, and yields in chunks", () => {
    const ctx = context("colAdjustedTotal", undefined, 5);
    // Inputs no other test has worked out, so nothing is in the worker's memo yet.
    const c = { ...compareOf(ctx), inflation: 0.026 };
    const lead = ctx.results!.view.lead!;
    let clock = 0;
    const steps = (lane: "flip" | "breakeven") => {
      let n = 0;
      let out: Ties | null = null;
      // Each reading of the clock moves it 3 ms: a chunk is about three projections.
      const g = breakevenJob({ ...tieJob(lane, c, "colAdjustedTotal", lead), gen: 1 }, (r) => { if (r.ok && "ties" in r) out = r.ties; }, () => (clock += 3));
      while (!g.next().done) n++;
      return { n, out: out! as Ties };
    };
    const flip = steps("flip");
    expect(flip.n).toBeGreaterThan(5);
    const l3 = steps("breakeven");
    expect(l3.out.rows[0].salary).toBe(flip.out.rows[0].salary); // the same object: from the memo
    expect(l3.out.rows.map((r) => [r.offer, r.against])).toEqual([[0, 2], [1, 2], [2, 0]]);
    const again = runJob((post) => breakevenJob({ ...tieJob("breakeven", c, "colAdjustedTotal", lead), gen: 2 }, post));
    expect(again.ok).toBe(true);
  });
});
