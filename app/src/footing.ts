import type { EmploymentYearResult, RppUsed } from "../../src/offer/types";
import type { OfferDetail } from "./protocol";

// The year figures as shown (docs/ui-design.md §4.8, slice 6): what L-1, the bridge and L-6 show for each employment year,
// in whole dollars, so that every column adds up as displayed and a figure shown in two places is the same figure.
// - A leaf is rounded once: a year's salary, bonus, cash awards and RSUs are its payments as posted (each to the cent,
//   as L-6 lists them), added, then rounded; its tax likewise; benefits, rent and hours are the engine's figures, rounded.
// - A subtotal is the sum of its lines as shown: pay, after-tax pay, take-home pay, total rewards, after rent.
// - A product is worked from figures as shown: spending at the prices picked is spending as shown x the two BEA indexes as
//   shown, so it multiplies out.
// A subtotal can differ by a dollar or two from the engine's own figure rounded once (109,462 where the engine has
// 109,462.63). The present values (the verdict, the rank list, L-2, L-3) are the engine's, and don't change. Pure: no React.

/** Rounded to the dollar, never −0. */
const R = (x: number) => Math.round(x) + 0;

// ---- BEA's indexes, with enough decimals to foot -----------------------------------------------------

/** BEA's weight for housing rents: non-housing prices are (all items − 0.16 × housing) ÷ 0.84. */
export const HOUSING_WEIGHT = 0.16;
/** A non-housing index, exactly, from BEA's published all items and housing (the engine reports it to 3 decimals). */
export const exactIndex = (p: RppUsed) => (p.allItems - HOUSING_WEIGHT * p.housing) / (1 - HOUSING_WEIGHT);
/** An index, or a step toward one, at `digits` decimals with no zeros past the third: "100.274000" -> "100.274". */
export const indexText = (x: number, digits: number) => x.toFixed(digits).replace(/(\.\d{3}\d*?)0+$/, "$1");

/**
 * The decimals for an offer's two BEA non-housing indexes: the fewest (3 to 6) at which every "spending × reference ÷ local"
 * in its present-value derivations multiplies out to the dollar shown. (The year figures are worked from the indexes as
 * shown, so they multiply out at any number of decimals.)
 */
export function indexDigits(d: OfferDetail): number {
  const info = d.costOfLiving;
  if (!info) return 3;
  const f = info.nonHousingFactor;
  const checks: Array<[number, number]> = [];
  for (const w of [d.window, d.cases.bear, d.cases.bull]) {
    const pv = w.costOfLiving?.presentValue;
    if (pv) checks.push([pv.nonHousingLocal, pv.discretionaryReference], [pv.outOfPocketReference / f, pv.outOfPocketReference]);
  }
  for (const y of d.employmentYears) {
    const c = y.costOfLiving;
    if (c) checks.push([c.nonHousingLocal - c.outOfPocketReference / f, c.discretionaryReference - c.outOfPocketReference]);
  }
  for (const digits of [3, 4, 5, 6]) {
    const ref = Number(exactIndex(info.reference).toFixed(digits));
    const area = Number(exactIndex(info.area).toFixed(digits));
    if (checks.every(([x, y]) => Math.abs((Math.round(x) * ref) / area - Math.round(y)) < 1)) return digits;
  }
  return 6;
}

/**
 * An offer's two indexes as shown: the prices picked (`ref`) and its city's (`area`), as text and as the numbers shown. (No
 * place names here: this module is on the main thread, and naming places would pull the city list into the chunks that load
 * later, which then splits it out of the main chunk.)
 */
export function shownIndexes(d: OfferDetail) {
  const info = d.costOfLiving!;
  const digits = indexDigits(d);
  return {
    ref: indexText(exactIndex(info.reference), digits), area: indexText(exactIndex(info.area), digits), digits, info,
    refValue: Number(exactIndex(info.reference).toFixed(digits)), areaValue: Number(exactIndex(info.area).toFixed(digits)),
  };
}

// ---- an employment year, as shown --------------------------------------------------------------------

/** After rent, at the prices picked, for one year (with a city). */
export interface ShownCol {
  /** Planned savings: your savings rate × take-home pay. */
  savings: number;
  rent: number;
  /** Take-home − savings − rent: spending money after rent, at the city's prices. */
  local: number;
  /** The same spending at the prices picked: local × reference index ÷ the city's, as shown. */
  atRef: number;
  /** Out-of-pocket health costs at the prices picked, likewise. */
  oopRef: number;
  /** Saved, at face value: savings + your 401(k) and HSA + ESPP money held + vested employer 401(k) + employer HSA + perks. */
  face: number;
  /** atRef − oopRef + face. */
  total: number;
}

export interface ShownYear {
  n: number;
  start: string;
  /** Exclusive: the next anniversary. */
  end: string;
  salary: number;
  bonus: number;
  cash: number;
  rsu: number;
  /** Clawbacks repaid: zero or less. */
  clawback: number;
  /** ESPP purchases' gain, each lot sold the day it's bought (4i). */
  espp: number;
  /** salary + bonus + cash + rsu + clawback + espp. */
  gross: number;
  tax: number;
  premiums: number;
  /** gross − tax − premiums. */
  afterTax: number;
  /** Your own 401(k) and HSA contributions. */
  yours: number;
  /** ESPP money held: put into the plan in the year, less what bought shares or came back (negative when the plan pays out more). */
  esppHeld: number;
  /** afterTax − yours − esppHeld. */
  takeHome: number;
  /** Employer 401(k) money credited in the year, and the part vested by the end of your stay. */
  credited: number;
  employer: number;
  oop: number;
  hsa: number;
  perks: number;
  /** afterTax + employer − oop + hsa + perks. */
  totalRewards: number;
  /** Hours worked in the year; null without hours. */
  hours: number | null;
  col: ShownCol | null;
  /** The offer letter's year, by component: `letter` is their sum. */
  quoted: { salary: number; bonus: number; cash: number; rsu: number; letter: number };
  /** The payments behind the pay and tax lines, to the cent. */
  posted: OfferDetail["posted"][number];
}

const memo = new WeakMap<OfferDetail, ShownYear[]>();

/** Every employment year the projection has, as shown. */
export function shownYears(d: OfferDetail): ShownYear[] {
  const hit = memo.get(d);
  if (hit) return hit;
  const x = d.costOfLiving ? shownIndexes(d) : null;
  const out = d.employmentYears.map((y) => shownYear(d, y, x));
  memo.set(d, out);
  return out;
}

function shownYear(d: OfferDetail, y: EmploymentYearResult, x: ReturnType<typeof shownIndexes> | null): ShownYear {
  const p = d.posted.find((q) => q.ey === y.year) ?? { ey: y.year, salary: 0, bonus: 0, cash: 0, rsu: 0, clawback: 0, espp: 0, tax: 0 };
  const salary = R(p.salary);
  const bonus = R(p.bonus);
  const cash = R(p.cash);
  const rsu = R(p.rsu);
  const clawback = R(p.clawback);
  const espp = R(p.espp);
  const gross = salary + bonus + cash + rsu + clawback + espp;
  const tax = R(p.tax);
  const premiums = R(y.health.premiums);
  const afterTax = gross - tax - premiums;
  const yours = R(y.retirement.employee + y.health.employeeHsa);
  const esppHeld = R(y.espp.held);
  const takeHome = afterTax - yours - esppHeld;
  // Vested: the credited money as shown × the vested share, so its work multiplies out (audit C15).
  const credited = R(y.retirement.employerCredited);
  const employer = y.retirement.employerCredited ? R(credited * (y.retirement.employerVested / y.retirement.employerCredited)) : 0;
  const oop = R(y.health.outOfPocket);
  const hsa = R(y.health.employerHsa);
  const perks = R(y.perks.face);
  const totalRewards = afterTax + employer - oop + hsa + perks;
  let col: ShownCol | null = null;
  if (y.costOfLiving && x) {
    const rate = d.costOfLiving!.savingsRate;
    const savings = rate ? R(takeHome * rate) : 0;
    const rent = R(y.costOfLiving.rent);
    const local = takeHome - savings - rent;
    const atRef = R((local * x.refValue) / x.areaValue);
    const oopRef = R((oop * x.refValue) / x.areaValue);
    const face = savings + yours + esppHeld + employer + hsa + perks;
    col = { savings, rent, local, atRef, oopRef, face, total: atRef - oopRef + face };
  }
  const q = { salary: R(y.quoted.salary), bonus: R(y.quoted.bonus), cash: R(y.quoted.cash), rsu: R(y.quoted.rsu) };
  return {
    n: y.year, start: y.start, end: y.end, salary, bonus, cash, rsu, clawback, espp, gross, tax, premiums, afterTax, yours, esppHeld, takeHome,
    credited, employer, oop, hsa, perks, totalRewards, hours: y.hours === undefined ? null : R(y.hours), col,
    quoted: { ...q, letter: q.salary + q.bonus + q.cash + q.rsu }, posted: p,
  };
}

// ---- your stay -----------------------------------------------------------------------------------------

/** A total over your stay on each dollar basis. Null after rent without a city. */
export interface StayFigures { gross: number; tax: number; premiums: number; cash: number; totalRewards: number; colAdjustedTotal: number | null }

/**
 * Your stay as paid, as shown: years 1 through your stay added (`years`), less what those years run past your stay's last
 * day (`after`: an offer that starts after the earliest has its last year cut by the window's end; a payment on the
 * anniversary that ends your stay belongs to its year but falls after the window), equals your stay (`stay`). On the
 * after-tax basis, the part after is its pay less its tax and premiums, each rounded, so it foots.
 */
export interface ShownStay { years: StayFigures; after: StayFigures; stay: StayFigures }

const stayMemo = new WeakMap<OfferDetail, Map<number, ShownStay>>();

export function shownStay(d: OfferDetail, n: number): ShownStay {
  const hit = stayMemo.get(d)?.get(n);
  if (hit) return hit;
  const ys = shownYears(d).slice(0, n);
  const raw = d.employmentYears.slice(0, n);
  const add = (f: (y: ShownYear) => number) => ys.reduce((s, y) => s + f(y), 0);
  const addRaw = (f: (y: EmploymentYearResult) => number) => raw.reduce((s, y) => s + f(y), 0);
  const w = d.window;
  const hasCol = ys.every((y) => y.col) && !!w.costOfLiving;
  const years: StayFigures = {
    gross: add((y) => y.gross), tax: add((y) => y.tax), premiums: add((y) => y.premiums), cash: add((y) => y.afterTax),
    totalRewards: add((y) => y.totalRewards), colAdjustedTotal: hasCol ? add((y) => y.col!.total) : null,
  };
  const gross = R(addRaw((y) => y.gross.total) - w.nominal.gross);
  const tax = R(addRaw((y) => y.tax) - w.nominal.tax);
  const premiums = R(addRaw((y) => y.health.premiums) - w.nominal.premiums);
  const after: StayFigures = {
    gross, tax, premiums, cash: gross - tax - premiums,
    totalRewards: R(addRaw((y) => y.totalRewards) - w.totalRewards.nominal),
    colAdjustedTotal: hasCol ? R(addRaw((y) => y.costOfLiving!.total) - w.costOfLiving!.nominal.total) : null,
  };
  const stay: StayFigures = {
    gross: years.gross - after.gross, tax: years.tax - after.tax, premiums: years.premiums - after.premiums, cash: years.cash - after.cash,
    totalRewards: years.totalRewards - after.totalRewards,
    colAdjustedTotal: hasCol ? years.colAdjustedTotal! - after.colAdjustedTotal! : null,
  };
  const out = { years, after, stay };
  if (!stayMemo.has(d)) stayMemo.set(d, new Map());
  stayMemo.get(d)!.set(n, out);
  return out;
}
