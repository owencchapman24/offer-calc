import fc from "fast-check";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Basis } from "../../src/offer/types";
import { aboutYou, appOffers, type Case, cases, runs } from "./arbitrary";
import { hasRanges, riskView } from "./cases";
import { buildDoc, toHtml, toText } from "./copyDoc";
import { build as csvBuild, type CsvTable } from "./csv";
import { derive } from "./derive";
import { firstLastDay, leaveAxis } from "./leaveModel";
import type { Derivation, MetricId, WorkContext } from "./metrics";
import { compareOf, contextOf, footsAsDisplayed, half, parseShown, renderPage, withLeave, withTies, withWork } from "./testing";
import { dollars } from "./text";
import { TheWork } from "./TheWork";
import { WorkProvider } from "./Tickmarks";
import { marginText, verdict } from "./verdict";
import { priceWords } from "./prices";

// Properties of what the page shows, over generated offers and households (arbitrary.ts): the whole page as the app would
// render it, with L-3, L-4 and L-6 worked out as the worker would, every figure's Show the work, the CSVs and the copied
// document. These are the checks the samples already pass (l6.test.ts, metrics.test.ts, copydoc.test.ts), run where the samples
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
    + r.letters.map((l) => renderToStaticMarkup(createElement(WorkProvider, { ctx, children: [createElement(TheWork, { key: "w", ...worked.props, ctx, letter: l })] }))).join("");
  const ids = [...new Set([...html.matchAll(/data-metric="([^"]+)"/g)].map((m) => m[1] as MetricId))];
  const derivations = new Map(ids.map((id) => [id, derive(id, ctx)]));
  // L-2's table (and its CSV) is there only when some offer has a range.
  const ranges = compareOf(ctx).offers.some(hasRanges);
  const tables: CsvTable[] = [{ kind: "l1", running: false }, { kind: "l1", running: true }, ...(ranges ? [{ kind: "l2" as const }] : []),
    ...r.letters.flatMap((letter) => (["years", "stay", "payments", "tax"] as const).map((part) => ({ kind: "l6" as const, letter, part })))];
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

  // Audit C12, C14, C15: present-value derivations subtract unrounded gaps under rounded figures, the BEA products accept a dollar
  // off, negative spending loses its sign, fractional 401(k) vesting is rounded on its own, L-6's rate is checked at one precision
  // and shown at another.
  it.fails("every figure's Show the work adds up as displayed", () => {
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

  // Audit C12, C13: the verdict's month is the present-value gap / the annuity factor, but the gap shown is the unrounded one, and
  // the month is rounded twice (to the cent by the engine, then to the dollar), so it can read $488 where its own work and L-2's base
  // case say $487 (about one lead in 200). Only the verdict's work and L-2 are worked out here, for every dollar basis and stay, so
  // many more cases run.
  it.fails("the verdict's month, on every basis and stay, is its work's, and L-2's base case's", () => {
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
          const l2 = riskView(at).leads.base;
          if (l2.winner === view.lead.winnerLetter) {
            expect(sameFigure(month, dollars(l2.margin / row.annuityFactor)), `${basis}: the verdict says ${month}; L-2's base case `
              + `${dollars(l2.margin / row.annuityFactor)}`).toBe(true);
          }
        }
      }
    }), runs(40));
  }, 600_000);
});
