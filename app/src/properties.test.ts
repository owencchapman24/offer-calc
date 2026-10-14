import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { comparisonWindow, projectOffer } from "../../src/offer/compare";
import { daysInMonth, nextMonthStart, toDays } from "../../src/offer/dates";
import type { Household as EngineHousehold, OfferInput } from "../../src/offer/types";
import { validateOffer } from "../../src/offer/validate";
import { computeTaxes, type Locality, paramsForYear, type TaxInput } from "../../src/tax";
import { aboutYou, appOffers, type Case, cases, type Household, type Place, PLACES, runs } from "./arbitrary";
import { ASSUMPTIONS, firstYear, toHousehold, toOfferInput } from "./model";

// Properties of the engine as the app drives it, over generated offers and households (arbitrary.ts), where the samples'
// hand-checked numbers can't reach. Each states what should hold for anyone; a counterexample is shrunk to the smallest case
// that breaks it. `npm test` runs them on a fixed seed; `npm run fuzz` on a random one, with more runs.
//
// `it.fails` marks a property that a known bug breaks (docs/audit-2026-10.md): it passes while the property fails, so the fix
// that makes it hold has to turn it into `it`.

const INFLATION = ASSUMPTIONS.inflation;

/** The engine's inputs for a case, as the app builds them; null when the engine's validator finds a problem with them. */
export function inputs(c: Case): { offers: OfferInput[]; household: EngineHousehold; wagesYear: number } | null {
  const apps = appOffers(c);
  const offers = apps.map((o) => {
    const r = toOfferInput(o);
    if (!("offer" in r)) throw new Error(`A generated offer is incomplete: ${r.missing.join(", ")}`);
    return r.offer;
  });
  const wagesYear = firstYear(apps, c.today);
  const household = toHousehold(aboutYou(c.household), wagesYear);
  return offers.every((o) => validateOffer(o, household).length === 0) ? { offers, household, wagesYear } : null;
}

/** The tax on a household's wages: the city tax its place has, and the spouse's wages for a joint return. */
function householdTax(h: Household, place: Place, year: number, wages: number, wagesYear: number): number {
  const locality: Locality | undefined = place.city === "nyc" ? { kind: "nyc" } : place.city === "philadelphia" ? { kind: "philadelphia", resident: true }
    : undefined;
  const input: TaxInput = {
    year, filingStatus: h.filingStatus, state: place.state, wages, ...(locality ? { locality } : {}),
    ...(h.filingStatus === "joint" ? { spouseWages: h.spouseWages * (1 + INFLATION) ** (year - wagesYear) } : {}),
  };
  return computeTaxes(input, paramsForYear(year, { inflation: INFLATION })).totalTax;
}

/**
 * Each calendar year, the offer's tax is what the household owes with the offer's pay less what it owes without it: the
 * household as described (filing status, the spouse's wages, other wages in the first year, the city it lives in).
 */
function taxStacksOnTheHousehold(c: Case) {
  const x = inputs(c);
  fc.pre(x !== null);
  const { offers, household, wagesYear } = x!;
  offers.forEach((offer, i) => {
    const s = projectOffer(offer, household, { valuationDate: c.today, years: 3, inflation: INFLATION }).scenarios.base;
    for (const cy of s.calendarYears) {
      const other = cy.year === wagesYear ? c.household.otherWagesThisYear : 0;
      const pay = cy.withOffer.input.wages - cy.withoutOffer.input.wages;
      const place = c.offers[i].place;
      const owed = householdTax(c.household, place, cy.year, other + pay, wagesYear) - householdTax(c.household, place, cy.year, other, wagesYear);
      expect(Math.abs(cy.offerTax - owed), `${"ABC"[i]} ${cy.year} (${place.state}${place.city ? `, ${place.city}` : ""}, ${c.household.filingStatus}): `
        + `the engine's ${cy.offerTax.toFixed(2)}, the household's ${owed.toFixed(2)}`).toBeLessThan(0.02);
    }
  });
}

describe("tax: each year's tax on the offer stacks on the household's other income", () => {
  // Pay, bonuses and cash awards only, so the year's wages are the offer's taxable wages (no 401(k) or cafeteria plan).
  const outsideCities = PLACES.filter((p) => p.city !== "philadelphia");
  const simple = cases({ simple: true });

  it("single filers and heads of household, living anywhere but Philadelphia", () => {
    fc.assert(fc.property(simple.filter((c) => c.household.filingStatus !== "joint" && c.offers.every((o) => outsideCities.includes(o.place))),
      taxStacksOnTheHousehold), runs(40));
  });

  // Audit C1: About you had no spouse's wages, so a joint return taxed the offer as if the spouse earned nothing.
  it("married, filing jointly: the offer's pay stacks on the spouse's wages", () => {
    fc.assert(fc.property(simple.filter((c) => c.household.filingStatus === "joint" && c.household.spouseWages > 0
      && c.offers.every((o) => outsideCities.includes(o.place))), taxStacksOnTheHousehold), runs(40));
  });

  // Audit C2: the app never set Philadelphia as a locality, so its 3.74% resident wage tax was never applied.
  it("Philadelphia residents pay its wage tax", () => {
    fc.assert(fc.property(simple.filter((c) => c.household.filingStatus !== "joint" && c.offers.some((o) => o.place.city === "philadelphia")),
      taxStacksOnTheHousehold), runs(40));
  });
});

/** Salary earned on the days in [from, to): annual / 12 for each calendar month, a partial month by its days. */
function salaryFor(annual: number, from: number, to: number): number {
  let sum = 0;
  for (let d = from; d < to;) {
    const end = Math.min(nextMonthStart(d), to);
    sum += (annual / 12) * ((end - d) / daysInMonth(d));
    d = end;
  }
  return sum;
}

describe("the comparison window", () => {
  /** Salary only, at one rate: no raises, promotions, bonus or cash. */
  const flat = cases({ simple: true }).map((c) => ({
    ...c,
    offers: c.offers.map((o) => ({ ...o, draft: { ...o.draft, salary: { ...o.draft.salary, raise: null, promotions: [] },
      bonus: { ...o.draft.bonus, amount: null }, cashAwards: [] } })),
  }));

  // Audit C3: pay accrued in the window's last month is dated at the month's end, past the window, so an offer starting after
  // the 1st of a month loses up to a month of pay while its hours for those days still count.
  it.fails("each offer's salary in the window is its salary for its own days in the window", () => {
    fc.assert(fc.property(flat, (c) => {
      const x = inputs(c);
      fc.pre(x !== null);
      const window = comparisonWindow(x!.offers, c.household.stayYears);
      x!.offers.forEach((offer, i) => {
        const s = projectOffer(offer, x!.household, { valuationDate: c.today, window, inflation: INFLATION }).scenarios.base;
        const inWindow = s.events.filter((e) => e.inWindow && e.component === "salary").reduce((sum, e) => sum + e.gross, 0);
        const days = salaryFor(offer.salary.annual, toDays(offer.startDate), toDays(s.window.end));
        const months = Math.ceil((toDays(s.window.end) - toDays(offer.startDate)) / 28);
        expect(Math.abs(inWindow - days), `${"ABC"[i]} starts ${offer.startDate}; the window is ${window.start} to ${s.window.end}`)
          .toBeLessThanOrEqual(0.005 * months + 1e-6);
      });
    }), runs(40));
  });

  // Audit C4: a payment dated before the offer's start date (relocation money paid before day one) counts in employment year 1, and
  // so in L-1, the bridge and L-6, but falls before the window and out of the verdict.
  it.fails("a payment in one of your stay's employment years is in the comparison, unless it comes after the stay ends", () => {
    fc.assert(fc.property(cases({ simple: true }), (c) => {
      const x = inputs(c);
      fc.pre(x !== null);
      const window = comparisonWindow(x!.offers, c.household.stayYears);
      x!.offers.forEach((offer, i) => {
        const s = projectOffer(offer, x!.household, { valuationDate: c.today, window, years: c.household.stayYears, inflation: INFLATION }).scenarios.base;
        for (const e of s.events) {
          if (e.employmentYear > c.household.stayYears) continue;
          expect(e.inWindow || e.date >= s.window.end, `${"ABC"[i]} starts ${offer.startDate}: its ${e.component} of ${e.date}, employment year `
            + `${e.employmentYear}, is outside the window ${s.window.start} to ${s.window.end}`).toBe(true);
        }
      });
    }), runs(60));
  });
});

describe("bonuses", () => {
  /** A bonus as a range of percentages, the first payout guaranteed, and no raises, so salary is the same in every scenario. */
  const guaranteed = cases({ simple: true, offers: [2, 2] }).map((c) => ({
    ...c,
    offers: c.offers.map((o) => ({ ...o, draft: { ...o.draft, salary: { ...o.draft.salary, raise: null, promotions: [] },
      bonus: { ...o.draft.bonus, basis: null, amount: { bear: 0, base: 0.1, bull: 0.15 }, firstPayoutGuaranteed: true } } })),
  }));

  // Audit C5: when the cutoff skips the first bonus period, the guarantee is used up on the period that isn't paid, and the first bonus
  // actually paid takes the scenario's amount (the bear case's $0).
  it.fails("a guaranteed first payout is the target in every scenario", () => {
    fc.assert(fc.property(guaranteed, (c) => {
      const x = inputs(c);
      fc.pre(x !== null);
      x!.offers.forEach((offer, i) => {
        const p = projectOffer(offer, x!.household, { valuationDate: c.today, years: 3, inflation: INFLATION }).scenarios;
        const first = (s: "bear" | "base" | "bull") => p[s].events.find((e) => e.component === "bonus");
        fc.pre(first("base") !== undefined);
        expect([first("bear")?.gross, first("bull")?.gross], `${"ABC"[i]} starts ${offer.startDate}, cutoff ${JSON.stringify(offer.bonus?.cutoff)}`)
          .toEqual([first("base")!.gross, first("base")!.gross]);
      });
    }), runs(60));
  });
});
