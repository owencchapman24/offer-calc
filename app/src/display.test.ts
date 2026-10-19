import fc from "fast-check";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Basis } from "../../src/offer/types";
import { aboutYou, appOffers, type Case, cases, runs } from "./arbitrary";
import { hasRanges, leadText, riskView } from "./cases";
import { buildDoc, toHtml, toText } from "./copyDoc";
import { build as csvBuild, type CsvTable } from "./csv";
import { derive } from "./derive";
import { firstLastDay, leaveAxis } from "./leaveModel";
import type { Derivation, MetricId, WorkContext } from "./metrics";
import { compareOf, contextOf, footsAsDisplayed, half, parseShown, renderAlone, renderBreakdowns, renderPage, withLeave, withTies, withWork } from "./testing";
import { ownView } from "./breakdownModel";
import { blankTimeOff, toOfferInput } from "./model";
import { TheWork } from "./TheWork";
import { WorkProvider } from "./Tickmarks";
import { marginText, verdict } from "./verdict";
import { priceWords } from "./prices";

// Properties of what the page shows, over generated offers and households (arbitrary.ts): the whole page as the app would
// render it, with L-3, L-4 and L-6 worked out as the worker would, each offer's breakdown (A-1) and the ledger's "On its own"
// row, every figure's Show the work, the CSVs and the copied document; and one offer on its own, as the app shows it then. These are the checks the samples already pass (l6.test.ts, metrics.test.ts, copydoc.test.ts), run where the samples
// never go. A few seconds a case: `npm test` runs a handful on a fixed seed, `npm run fuzz` more on a random one.

const BASES: Basis[] = ["cash", "totalRewards", "colAdjustedTotal", "perHour"];

/** Everything the page shows for a case, or null when the engine finds a problem with the generated inputs. */
interface Page { ctx: WorkContext; html: string; derivations: Map<MetricId, Derivation>; csv: string[]; doc: { html: string; text: string } }

function page(c: Case, basis: Basis): Page | null {
  const first = contextOf(appOffers(c), aboutYou(c.household), c.today, basis);
  if ("issues" in first) return null;
  // L-3 can't always tie (an offer with no days in a short window can't be paid enough to): then it says so, and has no figures.
  let tied: ReturnType<typeof withTies> | null = null;
  try {
    tied = withTies(first);
  } catch (e) {
    if (!/No breakeven/.test(String(e))) throw e;
  }
  const left = withLeave(tied?.ctx ?? first);
  const worked = withWork(left.ctx);
  const ctx = worked.ctx;
  const r = ctx.results!;
  const html = renderPage(ctx, { leave: { ...left.props, ctx }, ...(tied ? { ties: tied.props } : {}) })
    + r.letters.map((l) => renderToStaticMarkup(createElement(WorkProvider, { ctx, children: [createElement(TheWork, { key: "w", ...worked.props, ctx, letter: l })] }))).join("")
    + renderBreakdowns(ctx);
  const ids = [...new Set([...html.matchAll(/data-metric="([^"]+)"/g)].map((m) => m[1] as MetricId))];
  const derivations = new Map(ids.map((id) => [id, derive(id, ctx)]));
  // L-2's table (and its CSV) is there only when some offer has a range.
  const ranges = compareOf(ctx).offers.some(hasRanges);
  const tables: CsvTable[] = [{ kind: "l1", running: false }, { kind: "l1", running: true }, ...(ranges ? [{ kind: "l2" as const }] : []),
    ...r.letters.flatMap((letter) => (["years", "stay", "payments", "tax"] as const).map((part) => ({ kind: "a7" as const, letter, part })))];
  const csv = tables.map((t) => JSON.stringify(csvBuild(ctx, t)));
  const at = firstLastDay(leaveAxis(r.view.row.window.start, r.view.row.years));
  const doc = buildDoc(ctx, { offers: compareOf(ctx).offers, at, picked: false });
  return { ctx, html, derivations, csv, doc: { html: toHtml(doc), text: toText(doc) } };
}

/** Cases with a basis; the inputs valid for the engine. */
const pages = fc.tuple(cases(), fc.constantFrom(...BASES)).map(([c, basis]) => ({ c, basis }));
const built = (x: { c: Case; basis: Basis }) => {
  const p = page(x.c, x.basis);
  fc.pre(p !== null);
  return p!;
};

/** A figure as the page shows it: the text of each `data-metric` button. */
function shownFigures(html: string): Map<MetricId, string[]> {
  const out = new Map<MetricId, string[]>();
  for (const m of html.matchAll(/data-metric="([^"]+)"[^>]*><span class="fig-value">(.*?)<\/span>/g)) {
    const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;| /g, " ").trim();
    out.set(m[1] as MetricId, [...(out.get(m[1] as MetricId) ?? []), text]);
  }
  return out;
}

/** A figure's number and unit as shown: "$487 a month" is 487 dollars, "(41,724)" is 41,724 (a line's op carries the sign), "31.82%" a rate. */
function amountOf(shown: string): { value: number; unit: "%" | "/" | "$"; half: number } | null {
  const m = shown.match(/\(?[−-]?\+?\$?\d[\d,]*(?:\.\d+)?(?:\/\d+)?%?\)?/);
  if (!m) return null;
  const value = Math.abs(parseShown(m[0].replace("+", "")));
  if (Number.isNaN(value)) return null;
  return { value, unit: m[0].includes("%") ? "%" : m[0].includes("/") ? "/" : "$", half: half(m[0].replace(/^\(|\)$/g, "")) };
}

/** Two showings of one figure, in the same unit, agree at the coarser of their precisions. */
function sameFigure(a: string, b: string): boolean {
  const x = amountOf(a);
  const y = amountOf(b);
  if (!x || !y || x.unit !== y.unit) return true;
  return Math.abs(x.value - y.value) <= Math.max(x.half, y.half) + 1e-9;
}

describe("the page, for any offers", () => {
  it("is worked out without an error, and never shows NaN, Infinity or undefined", () => {
    fc.assert(fc.property(pages, (x) => {
      const p = built(x);
      const text = [p.html, ...[...p.derivations.values()].map((d) => JSON.stringify(d)), ...p.csv, p.doc.html, p.doc.text].join("\n");
      for (const bad of ["NaN", "Infinity", "undefined"]) expect(text.includes(bad), `"${bad}" on the page`).toBe(false);
    }), runs(6, false));
  }, 600_000);

  // Audit C12, C14, C15, C20: present-value derivations subtracted unrounded gaps under rounded figures, the BEA products accepted a
  // dollar off, negative spending lost its sign, fractional 401(k) vesting was rounded on its own, L-6's rate was checked at one
  // precision and shown at another, L-3's leads read with the wrong sign, a cliff's own part had no tax line.
  it("every figure's Show the work adds up as displayed", () => {
    fc.assert(fc.property(pages, (x) => {
      const p = built(x);
      expect(p.derivations.size).toBeGreaterThan(100);
      for (const [id, d] of p.derivations) footsAsDisplayed(id, d);
    }), runs(6, false));
  }, 600_000);

  // A figure shown in two places, or opened from another's work, reads the same (at the coarser precision of the two).
  it("a figure is the same wherever it appears: on the page, and in every derivation that uses it", () => {
    fc.assert(fc.property(pages, (x) => {
      const p = built(x);
      const shown = shownFigures(p.html);
      for (const [id, texts] of shown) {
        for (const t of texts) expect(sameFigure(t, texts[0]), `${id} shows as ${texts[0]} and ${t}`).toBe(true);
      }
      // Each line that opens another figure's work shows that figure (an input's line can show what's worked out from it: rent a year
      // later, say).
      for (const [id, d] of p.derivations) {
        for (const l of d.lines) {
          const there = l.ref && l.value && !l.ref.startsWith("in.") ? shown.get(l.ref)?.[0] : undefined;
          if (there) expect(sameFigure(l.value!, there), `${id}: its line "${l.label}" reads ${l.value}; ${l.ref} on the page reads ${there}`).toBe(true);
        }
      }
      // The verdict's lead and L-2's base case are one figure (L-2's work says so).
      const [hero, base] = [shown.get("hero")?.[0], shown.get("win.base")?.[0]];
      const r = p.ctx.results!;
      if (hero && base && r.view.basis !== "perHour") expect(sameFigure(hero, base), `the verdict says ${hero}; L-2's base case ${base}`).toBe(true);
    }), runs(6, false));
  }, 600_000);

  // Audit C12, C13: the verdict's month is the present-value gap / the annuity factor, but the gap shown was the unrounded one, and
  // the month was rounded twice (to the cent by the engine, then to the dollar), so it could read $488 where its own work and L-2's
  // base case said $487 (about one lead in 200). Only the verdict's work and L-2 are worked out here, for every dollar basis and stay, so
  // many more cases run.
  it("the verdict's month, on every basis and stay, is its work's, and L-2's base case's", () => {
    fc.assert(fc.property(cases(), (c) => {
      const first = contextOf(appOffers(c), aboutYou(c.household), c.today);
      fc.pre(!("issues" in first));
      const ctx = first as WorkContext;
      const r = ctx.results!;
      const noHours = ctx.offers.filter((o) => !o.draft.hours.weekly).map((o) => o.letter);
      for (const basis of ["cash", "totalRewards", "colAdjustedTotal"] as const) {
        for (const row of r.sweep.rows) {
          const view = verdict(r.sweep, r.letters, basis, row.years, noHours, priceWords(ctx.household.pricesIn));
          if (!view?.lead || view.lead.margin <= 0) continue;
          const at = { ...ctx, household: { ...ctx.household, stayYears: row.years }, results: { ...r, view } };
          const work = derive("hero", at);
          footsAsDisplayed("hero", work);
          const month = marginText(basis, view.lead);
          expect(sameFigure(month, work.lines[work.lines.length - 1].value!), `${basis}, ${row.years} years: the verdict says ${month}`).toBe(true);
          if (row.years !== ctx.household.stayYears) continue;
          const v = riskView(at);
          const l2 = v.leads.base;
          if (l2.winner === view.lead.winnerLetter) {
            expect(month, `${basis}: the verdict says ${month}; L-2's base case ${leadText(v, l2)}`).toBe(leadText(v, l2));
          }
        }
      }
    }), runs(40));
  }, 600_000);
});

// One offer on its own (docs/v2-plan.md, item 5): the page as the app shows it with a single offer, its bottom line (A-1) pinned.
describe("one offer on its own, for any offer", () => {
  /** A single offer's page and every figure's work; null when the engine finds a problem with the generated inputs. */
  function alonePage(c: Case) {
    const ctx = contextOf(appOffers(c), aboutYou(c.household), c.today);
    if ("issues" in ctx) return null;
    const html = renderAlone(ctx);
    const ids = [...new Set([...html.matchAll(/data-metric="([^"]+)"/g)].map((m) => m[1] as MetricId))];
    return { ctx, html, derivations: new Map(ids.map((id) => [id, derive(id, ctx)])) };
  }
  const single = cases({ offers: [1, 1] });

  it("is worked out without an error or a comparison, never shows NaN, Infinity or undefined, and every Show the work foots as displayed", () => {
    fc.assert(fc.property(single, (c) => {
      const p = alonePage(c);
      fc.pre(p !== null);
      expect(p!.ctx.results).toBeUndefined();
      expect(p!.html).toContain('data-metric="own.A.total"');
      const text = [p!.html, ...[...p!.derivations.values()].map((d) => JSON.stringify(d))].join("\n");
      for (const bad of ["NaN", "Infinity", "undefined"]) expect(text.includes(bad), `"${bad}" on the page`).toBe(false);
      for (const [id, d] of p!.derivations) footsAsDisplayed(id, d);
    }), runs(8, false));
  }, 600_000);

  it("its bottom line adds up as shown: to spend + saved = the month; at the prices picked, the month − the price step", () => {
    fc.assert(fc.property(single, (c) => {
      const p = alonePage(c);
      fc.pre(p !== null);
      const ctx = p!.ctx;
      const r = toOfferInput(ctx.offers[0]);
      const v = ownView("A", ctx.own!.breakdowns.A!, (r as { offer: Parameters<typeof ownView>[2] }).offer, priceWords(ctx.household.pricesIn), true);
      expect(v.month.spend + v.month.saved).toBe(v.month.total);
      expect(v.pv.totalRewards - v.pv.rent).toBe(v.pv.total);
      if (v.ref) expect(v.month.total - v.ref.step).toBe(v.ref.month);
      if (v.year1) expect(v.year1.spend + v.year1.saved).toBe(v.year1.y.totalRewards - v.year1.y.col!.rent);
    }), runs(20));
  }, 600_000);

  // B3: a breakdown runs over its own stay, so adding another offer changes nothing in it (when About you's year is the same).
  it("adding a second offer leaves the first one's breakdown as it was", () => {
    fc.assert(fc.property(cases({ offers: [2, 2] }), (c) => {
      const both = contextOf(appOffers(c), aboutYou(c.household), c.today);
      const first = contextOf(appOffers({ ...c, offers: c.offers.slice(0, 1) }), aboutYou(c.household), c.today);
      fc.pre(!("issues" in both) && !("issues" in first));
      const [x, y] = [both as WorkContext, first as WorkContext];
      fc.pre(x.wagesYear === y.wagesYear);
      expect(x.own!.breakdowns.A).toEqual(y.own!.breakdowns.A);
    }), runs(10));
  }, 600_000);
});

// Counterexamples `npm run fuzz` found, as shrunk, kept so every `npm test` runs them whatever the seed.
describe("the page, for the cases the nightly fuzz run found", () => {
  // FUZZ_SEED=1701905633 (2026-10-15): on L-4's last day A owes two clawbacks that both round up, 13/14 of $1,000 = $928.57 and 6/7
  // of $40,000 = $34,285.71, shown as 929 and 34,286 under L-4's total, $35,214.29, shown as 35,214. "Repaid" came to a dollar
  // more than its lines' total. The largest now takes the rounding: 929 + 34,285 = 35,214.
  const TWO_CLAWBACKS: Case = {
    today: "2026-12-31",
    household: { filingStatus: "single", spouseWages: 0, otherWagesThisYear: 0, stayYears: 1, pricesIn: "00000", healthUsage: "low" },
    offers: [
      { place: { area: "37980", state: "PA", city: null }, draft: {
        label: "Generated", residence: { state: "PA", nyc: false, philadelphia: false }, employerState: null, startDate: "2027-08-22",
        salary: { annual: 30_000, raise: null, raiseOn: null, promotions: [{ on: "2028-03-09", stepUp: 0, scenarios: null }] },
        bonus: { basis: null, amount: { bear: 0, base: 0, bull: 0 }, amounts: [], payOn: { month: 1, day: 1 }, periodStart: null, cutoff: null,
          firstPayoutGuaranteed: null, mustBeEmployedOnPayDate: null },
        cashAwards: [
          { label: "Award 1", amount: 1_000, paidOn: null, clawback: { months: 14, kind: null, per: null, from: null, repay: null } },
          { label: "Award 2", amount: 40_000, paidOn: "2027-08-22", clawback: { months: 7, kind: null, per: null, from: null, repay: null } },
        ],
        equity: { grants: [{ label: "New-hire RSUs", value: 5_000, grantDate: null, vestStart: null, schedule: { tranches: null, vestDates: null } }],
          priceGrowth: null, refreshers: null },
        retirement: "none", health: "none", perks: { section127: null, commuterMonthly: null }, hours: { weekly: null }, timeOff: blankTimeOff(),
        costOfLiving: { area: "37980", monthlyRent: 800, rentGrowth: null },
      } },
      { place: { area: "35620", state: "NY", city: "nyc" }, draft: {
        label: "Generated", residence: { state: "NY", nyc: true, philadelphia: false }, employerState: null, startDate: "2027-03-22",
        salary: { annual: 30_000, raise: null, raiseOn: null, promotions: [] },
        bonus: { basis: null, amount: null, amounts: [], payOn: null, periodStart: null, cutoff: null, firstPayoutGuaranteed: null,
          mustBeEmployedOnPayDate: null },
        cashAwards: [], equity: { grants: [], priceGrowth: null, refreshers: null }, retirement: "none",
        health: { premium: 0, outOfPocket: { low: 0, medium: 0, high: 0 }, oopMax: null, employeeHsa: null, employerHsa: 0, coverage: null },
        perks: { section127: null, commuterMonthly: null }, hours: { weekly: null }, timeOff: blankTimeOff(),
        costOfLiving: { area: "35620", monthlyRent: null, rentGrowth: null },
      } },
    ],
  };

  it("two clawbacks that both round up: the largest takes the rounding, and every derivation foots as displayed", () => {
    const p = page(TWO_CLAWBACKS, "cash")!;
    const repay = p.derivations.get("repay.A")!;
    expect(repay.lines.map((l) => [l.label, l.value])).toEqual([
      ["Award 1: 92.86% of it", "929"], ["Award 2: 85.71% of it", "34,285"], ["Repaid", "35,214"],
      ["Tax relief", "6,680"], ["What repaying costs you", "28,534"],
    ]);
    expect(repay.notes[0]).toMatch(/the largest, Award 2, takes the rounding.*\$34,285\.71/);
    for (const [id, d] of p.derivations) footsAsDisplayed(id, d);
  }, 60_000);
});
