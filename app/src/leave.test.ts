import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toDays } from "../../src/offer/dates";
import { keptIfLeaving, leaveDateSweep } from "../../src/offer/project";
import { derive } from "./derive";
import { Leaving } from "./Leaving";
import { Risk } from "./Risk";
import { addMonthsIso, leaveAxis, leaveLines, reconcile, valueAt, worked } from "./leaveModel";
import { shownStay } from "./footing";
import type { WorkContext } from "./metrics";
import type { LeaveCurve, LeavePanel } from "./protocol";
import { cursorJob, leaveJob, sweepDays } from "./slowJobs";
import { compareOf, context, footsAsDisplayed, runJob, VALUATION, withLeave } from "./testing";
import { dayBefore } from "./text";
import { WorkProvider } from "./Tickmarks";

// L-4 · Leaving early (docs/ui-design.md §4.5). The samples start Jul 13, 2026 and are valued then, as in W6.

const page = (ctx: WorkContext, at?: string) => {
  const L = withLeave(ctx, at);
  return renderToStaticMarkup(createElement(WorkProvider, { ctx: L.ctx, children: createElement(Leaving, L.props) }))
    .replace(/<(li|p)[^>]*>/g, "\n").replace(/<[^>]+>/g, "").replace(/[✓^<]/g, "").replace(/&#x27;/g, "'");
};
const base = (ctx: WorkContext) => {
  const c = compareOf(ctx);
  return { offers: c.offers, household: c.household, inflation: c.inflation };
};
const curves = (ctx: WorkContext, end = addMonthsIso(VALUATION, 60)) => {
  const r = runJob((post) => leaveJob({ lane: "leave", gen: 1, ...base(ctx), end }, post));
  if (!r.ok || !("curves" in r)) throw new Error("leave job failed");
  return r.curves as LeaveCurve[];
};
const panels = (ctx: WorkContext, leaveDate: string) => {
  const r = runJob((post) => cursorJob({ lane: "cursor", gen: 1, ...base(ctx), leaveDate }, post));
  if (!r.ok || !("panels" in r)) throw new Error("cursor job failed");
  return r.panels as Array<LeavePanel | null>;
};

describe("L-4's curves: steps on their real dates", () => {
  const ctx = context();
  const all = curves(ctx);

  it("samples the start, each month's end, and the day before and the day of each cliff off a month's end", () => {
    // A's first year: the sign-on (Aug 12) and the clawback's end (Jul 12, 2027) fall on month ends; the bonus (Jan 31) doesn't.
    const days = sweepDays(VALUATION, all[0].cliffs, "2027-07-13");
    expect(days).toHaveLength(1 + 12 + 2);
    expect(days.slice(0, 2)).toEqual(["2026-07-13", "2026-08-12"]);
    expect(days).toContain("2027-01-30");
    expect(days).toContain("2027-01-31");
  });
  it("at each month's end the curve is the engine's leave sweep for that month", () => {
    const byMonth = leaveDateSweep(compareOf(ctx).offers[0], compareOf(ctx).household, [1, 6, 12, 60], { inflation: 0.025 });
    for (const row of byMonth) expect(all[0].points.find((p) => p.leaveDate === row.leaveDate)).toEqual((({ months: _, ...rest }) => rest)(row));
  });
  it("a prorated clawback is one segment; a full one's end is a ✓ marker", () => {
    const lines = leaveLines(all, ["A", "B", "C"], "cash");
    expect(lines.map((l) => l.segments.map((s) => [s.award, Math.round(s.perMonth), s.from, s.until]))).toEqual([
      [], [["Sign-on", 417, "2026-09-12", "2027-07-12"]], [["Sign-on", 833, "2026-09-12", "2027-07-12"]],
    ]);
    expect(lines[0].markers.find((m) => m.date === "2027-07-12")?.kinds).toEqual(["clawbackEnds"]);
    expect(lines[0].markers.find((m) => m.date === "2027-01-31")?.kinds).toEqual(["payment"]);
    expect(page(ctx)).toContain("C: Sign-on clawback shrinks $833 a month until Jul 12, 2027");
  });
  it("offers line up by calendar date: a later start begins its line on its own start", () => {
    const later = context("colAdjustedTotal", (os) => os.map((o) => (o.letter === "B" ? { ...o, draft: { ...o.draft, startDate: "2026-09-01" } } : o)));
    const c = curves(later);
    expect(leaveAxis(later.results!.view.row.window.start, 4).start).toBe("2026-07-13");
    expect(c[1].points[0].leaveDate).toBe("2026-09-01");
    expect(panels(later, "2026-08-15")[1]).toBeNull(); // B hasn't started by then
    expect(worked("2026-09-01", "2027-01-12")).toEqual({ months: 4, days: 12 });
  });
});

describe("L-4's panel (W6)", () => {
  const ctx = context();
  const text = page(ctx);

  it("keep, repay and leave behind, six months in: W6's figures", () => {
    expect(text).toContain("A 6 months worked · keep $41,200 after tax, and repay $10,000 of the sign-on (all of it).");
    expect(text).toContain("B 6 months worked · keep $34,974 after tax, and repay $2,500 of the sign-on (prorated: it shrinks $417 a month until "
      + "Jul 12, 2027).");
    expect(text).toContain("C 6 months worked · keep $47,506 after tax, and repay $5,000 of the sign-on");
    expect(text).toContain("Left behind: $120,000 of RSUs not yet vested (at grant value).");
  });
  it("unused vacation paid on the last day picked (4a): A in California, giving 15 days, banks 4 a year", () => {
    const ca = context("colAdjustedTotal", (os) => os.map((o) => (o.letter === "A"
      ? { ...o, draft: { ...o.draft, employerState: "CA", timeOff: { ...o.draft.timeOff, gives: 15 } } } : o)));
    // Six months in, Jan 12, 2027: 4 × 184 ÷ 365 = 2.016438 days, × 110,000 ÷ 260 = 853.11 before tax, in what A keeps.
    const text = page(ca);
    expect(text).toMatch(/A 6 months worked · keep \$[\d,]+ after tax, with \$853 before tax for 2\.02 days of unused vacation, and repay \$10,000 of the sign-on/);
    const kept = derive("kept.A", withLeave(ca).ctx);
    footsAsDisplayed("kept.A", kept);
    expect(kept.lines.map((l) => l.label)).toContain("Unused vacation paid out");
    // B, in North Carolina, banks nothing at its defaults, and says nothing.
    expect(text.split("\n").find((l) => l.startsWith("B 6 months worked"))).not.toMatch(/vacation/);
  }, 30_000);
  it("the next real cliff: A's bonus 19 days away (+$29,970, $26,057 of it the bonus); B skips its clawback steps to its bonus", () => {
    expect(text).toContain("Next cliff: your 2026 bonus ($32,986 before tax) on Jan 31, 2027, 19 days later. Staying until then is worth +$29,970 "
      + "after tax, $26,057 of it the cliff itself.");
    expect(text).toContain("Next cliff: your 2026 bonus ($3,742 before tax) on Mar 15, 2027, 62 days later.");
  });
  it("the warnings that leaving that day sets off are in the panel; a forfeited bonus is what was earned toward it", () => {
    // A: the 2026 stub, $70,000 x 172 / 365 days = 32,986.30, all earned; 2027, 12 days in: $85,000 x 12 / 365 = 2,794.52 of $85,000.
    expect(text).toContain("Leaving then forfeits the 2026 bonus, $32,986, all of it earned (paid Jan 31, 2027; it counts from your start) and $2,795 "
      + "earned toward the 2027 bonus (target $85,000, paid Jan 31, 2028): you must be employed on the payout date.");
    // B: the stub is 10% of the $37,419.35 salary from Jul 13 = 3,741.94; 2027 so far: 10% x 80,000 x 12/31 / 12 = 258.06.
    expect(text).toContain("Leaving then forfeits the 2026 bonus, $3,742, all of it earned (paid Mar 15, 2027; it counts from your start) and $258 "
      + "earned toward the 2027 bonus (target $8,112, paid Mar 15, 2028)");
    const d = derive("forgone.A.1", withLeave(ctx).ctx);
    // The days as a fraction, exactly (it was 0.0329, which doesn't multiply out: 85,000 × 0.0329 = 2,796.50).
    expect(d.lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "85,000"], ["×", "12/365"], ["=", "2,795"]]);
    footsAsDisplayed("forgone.A.1", d);
    expect(d.notes[0]).toBe("If you stayed through its payout on Jan 31, 2028 it would pay $85,000: $85,000 × 365 / 365 days.");
    expect(d.section).toBe("M-9");
    expect(text).toContain("Repaying the sign-on in 2027 for pay received in 2026: the Social Security and Medicare tax withheld on it isn't "
      + "refunded automatically");
  });
  it("kept = pay - clawbacks repaid - tax (net of relief) - premiums; the tax is the events' to within their rounding", () => {
    const { offers, household } = base(ctx);
    for (const at of ["2027-01-12", "2027-07-11", "2030-07-12"]) {
      panels(ctx, at).forEach((p, i) => {
        expect(p!.paid - p!.repaid - p!.tax - p!.premiums).toBeCloseTo(p!.afterTaxCompKept, 6);
        // The engine rounds each event's gross, tax and after-tax to the cent separately, so the summed event tax is cents away.
        const eventTax = keptIfLeaving(offers[i], household, toDays(at), { inflation: 0.025 }).result.events.reduce((s, e) => s + e.tax, 0);
        expect(Math.abs(p!.tax - eventTax)).toBeLessThan(0.5);
      });
    }
    const kept = derive("kept.A", withLeave(ctx).ctx);
    expect(kept.lines.map((l) => [l.op ?? "", l.value])).toEqual([["", "65,000"], ["−", "10,000"], ["−", "12,900"], ["−", "900"], ["=", "41,200"]]);
    const tr = derive("kept.C", withLeave(ctx, undefined, "totalRewards").ctx);
    expect(tr.title).toBe("C · total rewards kept");
  });
  it("what staying until the next cliff is worth foots as displayed, for every offer and both bases", () => {
    const num = (v: string | undefined) => Number((v ?? "").replace(/[,+]/g, "").replace("−", "-"));
    for (const basis of ["cash", "totalRewards"] as const) {
      const L = withLeave(ctx, undefined, basis);
      for (const l of ["A", "B", "C"] as const) {
        const v = derive(`next.${l}`, L.ctx).lines.map((x) => num(x.value));
        expect(v[0] - v[1]).toBe(v[2]); // kept at the cliff - kept now = worth staying for
        expect(v[2] - v[3]).toBe(v[4]); // = the cliff itself + pay for the days between
      }
    }
  });
});

describe("L-4 at your stay's last day: the reconciliation with the stay", () => {
  const ctx = context();
  const end = dayBefore(ctx.results!.view.row.window.end);

  it("leaving on Jul 12, 2030 keeps $2,511 more than the 4-year stay counts for A, as displayed: the last year's tax", () => {
    // L-1's stay is A's four years after tax as shown, added: 109,462 + 129,617 + 138,266 + 171,052 = 548,397 (the engine's unrounded
    // total is 548,397.54). Leaving keeps 550,908.41, shown 550,908, and the difference is between the two as shown: 550,908 - 548,397 = 2,511.
    expect(page(ctx, end)).toContain("Leaving that day, A keeps $550,908 after tax, $2,511 more than the $548,397 that L-1 counts for your stay "
      + "(after tax, as paid). It's tax: the stay taxes 2030 as though pay continued through December, at a similar next job, while leaving taxes "
      + "only what was paid in 2030, at a part year's lower rate.");
  });
  it("kept = stay + pay + tax + premiums - clawbacks, and the derivation foots", () => {
    const L = withLeave(ctx, end);
    L.ctx.results!.leave!.panels.forEach((p, i) => {
      const d = L.ctx.results!.detail!.offers[i];
      const r = reconcile(p!, d.window, shownStay(d, 4).stay);
      // The stay is as shown (its years' figures, each rounded, added); the parts are unrounded: within the rounding of four years.
      expect(Math.abs(r.stay + r.pay + r.tax + r.premiums - r.clawback - r.kept)).toBeLessThan(4);
    });
    const d = derive("recon.C", L.ctx);
    expect(d.lines.map((l) => l.value)).toEqual(["486,402", "481,282", "5,120", "5,120", "5,120"]); // foots as displayed
    expect(d.section).toBe("M-7.3");
  });
  it("a curve's value between samples is a straight line", () => {
    const line = { points: [{ date: "2027-01-01", value: 0 }, { date: "2027-01-11", value: 100 }] };
    expect([valueAt(line, "2026-12-31"), valueAt(line, "2027-01-06"), valueAt(line, "2027-02-01")]).toEqual([null, 50, 100]);
  });
});

describe("schedules whose figures are from earlier inputs say so", () => {
  const ctx = context();
  const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement(WorkProvider, { ctx, children: el }));
  it("L-4 dims and says Updating… while its slow jobs answer older inputs, and while the comparison is", () => {
    const L = withLeave(ctx);
    const stale = { ...L.props, leave: { ...L.props.leave, key: "older inputs" } };
    expect(html(createElement(Leaving, L.props))).not.toContain("Updating…");
    for (const props of [stale, { ...L.props, status: "updating" as const }]) {
      const h = html(createElement(Leaving, props));
      expect(h).toContain("Updating…");
      expect(h).toMatch(/class="schedule leaving is-updating"/);
    }
  });
  it("L-2 dims with the comparison, and says when its figures are the last valid ones, without dimming them (WCAG 1.4.3)", () => {
    expect(html(createElement(Risk, { ctx, sample: true, status: "updating" }))).toContain("Updating…");
    const invalid = html(createElement(Risk, { ctx, sample: true, status: "invalid" }));
    expect(invalid).toContain("Last valid results");
    expect(invalid).toMatch(/class="schedule risk is-invalid"/);
    expect(html(createElement(Risk, { ctx, sample: true }))).not.toMatch(/is-updating/);
  });
});
