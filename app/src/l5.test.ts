import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { Lead } from "./Lead";
import Methodology from "./Methodology";
import type { WorkContext } from "./metrics";
import type { AppOffer } from "./model";
import { context, renderBreakdowns, withLeave } from "./testing";
import { WorkProvider } from "./Tickmarks";
import { changingWarnings } from "./warningKinds";

// Each offer's warnings, in its breakdown's A-6 (L-5 until stop 5B: docs/ui-design.md §4.7, docs/v2-plan.md item 5, B8), the lead's
// pointer to them, and M-8 and M-9's live numbers. The samples start Jul 13, 2026 and are valued then.

const text = (ctx: WorkContext, el: ReactElement) => renderToStaticMarkup(createElement(WorkProvider, { ctx, children: el }))
  .replace(/<(li|p|tr)[^>]*>/g, "\n").replace(/<[^>]+>/g, "").replace(/[✓^]/g, "").replace(/&#x27;/g, "'").replace(/&lt;/g, "<");
const clean = (html: string) => html.replace(/<(li|p|tr)[^>]*>/g, "\n").replace(/<[^>]+>/g, "").replace(/[✓^]/g, "").replace(/&#x27;/g, "'")
  .replace(/&lt;/g, "<");
/** An offer's A-6, as its breakdown shows it. */
const a6 = (ctx: WorkContext, letter: string) => {
  const m = renderBreakdowns(ctx).match(new RegExp(`<section class="part tax-warnings" id="${letter}-6"[\\s\\S]*?</section>`));
  if (!m) throw new Error(`No ${letter}-6`);
  return clean(m[0]);
};
const tweak = (letter: string, f: (o: AppOffer) => AppOffer) => (os: AppOffer[]) => os.map((o) => (o.letter === letter ? f(o) : o));

describe("A-6: every warning for an offer's stay", () => {
  it("the samples: withholding falls short in the later years, each offer in its own A-6, each year a figure", () => {
    const ctx = context();
    const a = a6(ctx, "A");
    expect(a).toContain("Cash timing");
    expect(a).toContain("Federal withholding falls short of the federal income tax on its pay by $1,173 for 2028, $1,075 for 2029 and $3,284 for "
      + "2030, owed each following April: bonuses and RSU vests are withheld at the flat 22% supplemental rate, below the real rate on them.");
    expect(a6(ctx, "C")).toContain("Federal withholding falls short of the federal income tax on its pay by $1,084 for 2029 and $1,219 for 2030");
    expect(a).not.toContain("Changes your numbers");
    expect(changingWarnings(context().results!.detail!.offers, 2030)).toBe(0);
  }, 30_000);
  it("a year's shortfall foots as displayed: the offer's federal tax - withheld from salary - withheld at 22% (M-4)", () => {
    const d = derive("wh.A.2028", context());
    expect(d.lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "32,948"], ["−", "13,075"], ["−", "18,700"], ["=", "1,173"]]);
    expect(d.section).toBe("M-4");
  });
  it("a limit reached changes your numbers: listed first, with Show at the field, and the lead points to it", () => {
    // C deferring 30% of pay reaches the 402(g) limit every year of the stay.
    const ctx = context("colAdjustedTotal", tweak("C", (o) => ({ ...o, draft: { ...o.draft,
      retirement: { ...(o.draft.retirement as object), contributionPct: 0.3 } as AppOffer["draft"]["retirement"] } })));
    const t = a6(ctx, "C");
    // Listed first: before any other kind of warning.
    expect(t.indexOf("Changes your numbers")).toBeGreaterThan(-1);
    for (const other of ["Cash timing", "Not modeled"]) if (t.includes(other)) expect(t.indexOf("Changes your numbers")).toBeLessThan(t.indexOf(other));
    // One line for the limit in every year of the stay it's reached (2027 to 2030: half of 2026 stays under it; 2031 is after the
    // stay), counted once.
    expect(t).toMatch(/Its 401\(k\) deferrals reach the 402\(g\) limit before the end of 2027 to 2030 \(\$[\d,]+ in 2027, rising to \$[\d,]+ in 2030\): deferrals and the match stop for the rest of each of those years/);
    expect(t).toContain("Show at the field");
    expect(t).not.toContain("2031 (");
    const n = changingWarnings(ctx.results!.detail!.offers, 2030);
    expect(n).toBe(1);
    expect(ctx.results!.detail!.changes).toBe(1); // the worker's count, which the lead reads
    expect(context().results!.detail!.changes).toBe(0);
    const lead = text(ctx, createElement(Lead, { view: ctx.results!.view, letters: ctx.results!.letters, stayYears: 4, updating: false, error: null,
      notes: [], sample: true, dispatch: () => {}, changes: n, warnAt: ["C"], onWarnings: () => {} }));
    expect(lead).toContain("A warning changes these numbers. See C-6");
  }, 30_000);
  it("what the model leaves out that may cost you: the convenience-of-employer rule", () => {
    const ctx = context("colAdjustedTotal", tweak("A", (o) => ({ ...o, draft: { ...o.draft, residence: { ...o.draft.residence, state: "NJ", locality: null },
      employerState: "NY" } } as AppOffer)));
    const t = a6(ctx, "A");
    expect(t).toContain("Not modeled: may cost you");
    expect(t).toContain("You'd live in NJ and work for an employer in NY. NY's convenience-of-employer rule may tax your remote days there too");
  });
});

describe("the methodology's live numbers: M-8 and M-9", () => {
  const page = (ctx: WorkContext) => text(ctx, createElement(Methodology, { ctx, section: null, sample: true }));

  it("M-8: each offer's bear, base and bull cases over your stay, and what differs in the bear case", () => {
    const t = page(context());
    expect(t).toContain("Your numbers, after rent, at U.S. prices, 4-year total, present value");
    expect(t).toContain("A258,793313,175347,199bonuses 20% under target; no promotion in 2029");
    expect(t).toContain("C holds up best: it has the highest bear case.");
  });
  it("M-9: what leaving early would cost under each offer's terms, and L-4's panel once it's worked one out", () => {
    expect(page(context())).toContain("A: its first bonus is paid Jan 31, 2027; you must be employed on each payout date; the $10,000 sign-on is "
      + "repaid in full if you leave before Jul 12, 2027; its employer 401(k) money vests after 3 years of service.");
    // With L-4 at six months: A forfeits the 2026 stub (32,986.30) and 12 days toward 2027 (2,794.52): 35,780.82.
    expect(page(withLeave(context()).ctx)).toContain("At the last day picked in L-4, Jan 12, 2027, it keeps $41,200 after tax, repays $10,000 and "
      + "forfeits $35,781 earned toward bonuses.");
  });
});
