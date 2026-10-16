import type { Component, ValueBasis } from "../../src/offer/types";
import { shownIndexes, type ShownYear, shownStay, shownYears } from "./footing";
import { detailOf, indexOf, type L6Line, offerByLetter, pricesOf, res, shortCity, type TaxLine, type WorkContext } from "./metrics";
import { cashName } from "./byYearModel";
import { type AppOffer, CITY_TAX, cityTax, type Letter } from "./model";
import type { TaxRun, WorkOffer, WorkPayment, WorkTaxYear } from "./protocol";
import { cents, dayBefore, dollars, figure, longDate, percent } from "./text";

// L-6 · The work (docs/ui-design.md §4.8): each offer's employment years line by line (cash; total rewards and hours;
// after rent), its stay's totals tied to the lead schedule and L-1, every payment with its formula and tax, and each calendar
// year's tax with and without the offer. Every column adds up as displayed: the year figures are footing.ts's, the payments
// are to the cent and their subtotals add them exactly, and each tax year's columns foot (below). Pure: no React. Shared by
// TheWork.tsx and the derivations (derive.ts), so a figure and its work are the same number.

type L = Letter;

// ---- the employment years ----------------------------------------------------------------------------

export type L6Section = "cash" | "rewards" | "rent";

export interface L6Row {
  line: L6Line;
  /** Its number in the table: what "L-6.A, year 1, line 8" names. Carried rows have their own number too. */
  no: number;
  section: L6Section;
  label: string;
  /** "less" or "plus" before the label, as in the bridge. */
  lead?: "less" | "plus";
  gloss?: string;
  /**
   * line: a figure; subtotal: the lines since the last subtotal (or the section's start), added; total: the section's last
   * subtotal (a double rule); carried: a subtotal from above, again, to start a section; memo: not in a footing (hours).
   */
  kind: "line" | "subtotal" | "total" | "carried" | "memo";
  /** A carried row: the number of the line it repeats. */
  from?: number;
  /** dollars (signed: what the line adds to its footing; a deduction shows in parentheses), hours, or dollars an hour. */
  unit: "dollars" | "hours" | "perHour";
  /** Year 1 through your stay. */
  values: number[];
  /** The years added (hours too); per hour, the years' dollars ÷ their hours. */
  sum: number;
}

/** What each subtotal adds up: its lines, in order (those shown). */
export const FOOTS: Partial<Record<L6Line, L6Line[]>> = {
  gross: ["salary", "bonus", "cash", "rsu", "clawback"],
  afterTax: ["gross", "tax", "premiums"],
  takeHome: ["afterTax", "yours"],
  totalRewards: ["afterTax", "employer", "oop", "hsa", "perks"],
  local: ["takeHome", "savings", "rent"],
  total: ["atRef", "oopRef", "face"],
};

export interface YearTable {
  letter: L;
  /** Your stay, in years: the table's year columns. */
  n: number;
  years: ShownYear[];
  rows: L6Row[];
  /** After rent: the offer's city, the prices picked (and their dollars on a figure: "U.S.-avg"), and the two BEA indexes as shown. */
  prices?: { city: string; place: string; unit: string; ref: string; area: string };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** "NYC" or "Philadelphia", for an offer taxed by the city it's in; null otherwise. */
const cityLine = (o: AppOffer | undefined) => (o && cityTax(o.draft) ? CITY_TAX[cityTax(o.draft)!].line : null);

/** L-6's employment-year table for one offer, over your stay. */
export function yearTable(ctx: WorkContext, letter: L): YearTable {
  const r = res(ctx);
  const n = r.view.row.years;
  const d = detailOf(ctx, letter);
  const ys = shownYears(d).slice(0, n);
  const o = offerByLetter(ctx, letter);
  const rows: L6Row[] = [];
  const any = (f: (y: ShownYear) => number) => ys.some((y) => f(y) !== 0);
  const add = (row: Omit<L6Row, "no" | "sum"> & { sum?: number }) =>
    rows.push({ ...row, no: rows.length + 1, sum: row.sum ?? row.values.reduce((s, v) => s + v, 0) });
  const line = (l: L6Line, section: L6Section, label: string, f: (y: ShownYear) => number, more: Partial<L6Row> = {}) =>
    add({ line: l, section, label, kind: "line", unit: "dollars", values: ys.map(f), ...more });
  const sub = (l: L6Line, section: L6Section, label: string, f: (y: ShownYear) => number, kind: "subtotal" | "total" = "subtotal") =>
    add({ line: l, section, label, kind, unit: "dollars", values: ys.map(f) });
  const carry = (l: L6Line, section: L6Section, label: string, f: (y: ShownYear) => number) => {
    const from = rows.find((x) => x.line === l && x.kind !== "carried")!.no;
    add({ line: l, section, label: `${label}, line ${from}`, kind: "carried", from, unit: "dollars", values: ys.map(f) });
  };
  const perHour = (l: L6Line, section: L6Section, label: string, f: (y: ShownYear) => number) => {
    const hours = ys.reduce((s, y) => s + (y.hours ?? 0), 0);
    add({ line: l, section, label, kind: "memo", unit: "perHour", values: ys.map((y) => (y.hours ? f(y) / y.hours : 0)),
      sum: hours ? ys.reduce((s, y) => s + f(y), 0) / hours : 0 });
  };
  const col = ys.length > 0 && ys.every((y) => y.col);

  // Cash: what's paid, its tax, and what reaches you.
  line("salary", "cash", "Salary", (y) => y.salary);
  if (any((y) => y.bonus)) line("bonus", "cash", "Bonus", (y) => y.bonus);
  if (any((y) => y.cash)) line("cash", "cash", cap(cashName(o)), (y) => y.cash);
  if (any((y) => y.rsu)) line("rsu", "cash", "RSUs vested", (y) => y.rsu);
  if (any((y) => y.clawback)) line("clawback", "cash", "Clawbacks repaid", (y) => y.clawback, { lead: "less" });
  sub("gross", "cash", "Pay", (y) => y.gross);
  line("tax", "cash", "Tax", (y) => -y.tax, { lead: "less", gloss: taxWho(ctx, letter) });
  if (any((y) => y.premiums)) line("premiums", "cash", "Health premiums", (y) => -y.premiums, { lead: "less" });
  sub("afterTax", "cash", "After-tax pay", (y) => y.afterTax);
  const yours = any((y) => y.yours);
  if (yours) line("yours", "cash", "Your 401(k) and HSA", (y) => -y.yours, { lead: "less", gloss: "pre-tax, but saved, not spent" });
  if (yours || col) sub("takeHome", "cash", "Take-home pay", (y) => y.takeHome, "total");
  else rows[rows.length - 1].kind = "total";

  // Total rewards and hours.
  carry("afterTax", "rewards", "After-tax pay", (y) => y.afterTax);
  if (any((y) => y.credited)) line("employer", "rewards", "Employer 401(k), vested", (y) => y.employer, { lead: "plus", gloss: vestedGloss(ctx, letter) });
  if (any((y) => y.oop)) line("oop", "rewards", "Expected out-of-pocket health costs", (y) => -y.oop, { lead: "less" });
  if (any((y) => y.hsa)) line("hsa", "rewards", "Employer HSA money", (y) => y.hsa, { lead: "plus" });
  if (any((y) => y.perks)) line("perks", "rewards", "Perks", (y) => y.perks, { lead: "plus", gloss: "tax-free, at face value" });
  sub("totalRewards", "rewards", "Total rewards", (y) => y.totalRewards, "total");
  const hours = ys.length > 0 && ys.every((y) => y.hours !== null);
  if (hours) {
    add({ line: "hours", section: "rewards", label: "Hours worked", kind: "memo", unit: "hours", values: ys.map((y) => y.hours!) });
    perHour("afterTaxHour", "rewards", "After-tax pay an hour", (y) => y.afterTax);
    perHour("totalRewardsHour", "rewards", "Total rewards an hour", (y) => y.totalRewards);
  }

  // After rent, at the prices picked.
  let prices: YearTable["prices"];
  if (col) {
    const x = { ...shownIndexes(d), city: shortCity(d.costOfLiving!.area.name) };
    const p = pricesOf(ctx);
    prices = { city: x.city, place: p.place, unit: p.unit.slice(0, -2), ref: x.ref, area: x.area };
    carry("takeHome", "rent", "Take-home pay", (y) => y.takeHome);
    if (any((y) => y.col!.savings)) line("savings", "rent", "Planned savings", (y) => -y.col!.savings, { lead: "less" });
    line("rent", "rent", "Rent", (y) => -y.col!.rent, { lead: "less", gloss: rentGloss(d) });
    sub("local", "rent", `Spending after rent, at ${x.city} prices`, (y) => y.col!.local);
    line("atRef", "rent", `The same, at ${p.place} prices`, (y) => y.col!.atRef,
      { gloss: x.info.area.code === x.info.reference.code ? "the prices you picked: a factor of 1" : `× ${x.ref} ÷ ${x.area}, BEA's non-housing prices` });
    if (any((y) => y.col!.oopRef)) {
      line("oopRef", "rent", `Out-of-pocket health costs, at ${p.place} prices`, (y) => -y.col!.oopRef, { lead: "less", gloss: `line ${rowNo(rows, "oop")}, likewise` });
    }
    line("face", "rent", "Saved, at face value", (y) => y.col!.face, { lead: "plus", gloss: faceGloss(ys) });
    sub("total", "rent", cap(p.phrase), (y) => y.col!.total, "total");
    if (hours) perHour("totalHour", "rent", `${cap(p.phrase)}, an hour`, (y) => y.col!.total);
  }
  return { letter, n, years: ys, rows, ...(prices ? { prices } : {}) };
}

/** A dollar figure as the tables show it: a deduction in parentheses. */
export const moneyText = (v: number) => (v < 0 ? `(${figure(-v)})` : figure(v));
/** A year line's figure as the table shows it: dollars, hours, or dollars an hour. */
export const rowText = (row: L6Row, v: number) => (row.unit === "perHour" ? cents(v) : row.unit === "hours" ? figure(v) : moneyText(v));
/** The years table's sections, by name (the after-rent section takes its total's label). */
export const SECTION_NAME: Record<L6Section, string> = { cash: "Cash", rewards: "Total rewards and hours", rent: "" };
export const sectionName = (t: YearTable, s: L6Section) => (s === "rent" ? t.rows.find((x) => x.line === "total")!.label : SECTION_NAME[s]);

const rowNo = (rows: L6Row[], l: L6Line) => rows.find((x) => x.line === l && x.kind !== "carried")?.no;

/** A line's number in an offer's table (its first row, not a carried one). */
export function lineNo(ctx: WorkContext, letter: L, l: L6Line): number {
  const no = rowNo(yearTable(ctx, letter).rows, l);
  if (no === undefined) throw new Error(`L-6.${letter} has no such line.`);
  return no;
}

/** The figure in a line's year (1 through your stay) or its years added ("sum"), as the table has it. */
export function yearCell(t: YearTable, l: L6Line, col: number | "sum"): number {
  const row = t.rows.find((x) => x.line === l);
  if (!row) throw new Error(`L-6.${t.letter} has no such line.`);
  if (col === "sum") return row.sum;
  if (!(col >= 1 && col <= row.values.length)) throw new Error(`Year ${col} isn't in your stay.`);
  return row.values[col - 1];
}

/** "federal, FICA, NY, NYC": the taxes an offer pays. */
function taxWho(ctx: WorkContext, letter: L): string {
  const d = detailOf(ctx, letter);
  const o = offerByLetter(ctx, letter);
  const t = d.taxYears;
  return [
    t.some((x) => x.parts.federal) && "federal", t.some((x) => x.parts.fica) && "FICA",
    t.some((x) => x.parts.state) && (o?.draft.residence.state ?? "state"), t.some((x) => x.parts.local) && (cityLine(o) ?? "local"),
  ].filter(Boolean).join(", ");
}

function vestedGloss(ctx: WorkContext, letter: L): string {
  const ret = detailOf(ctx, letter).assumptions.find((a) => a.code === "retirement");
  if (ret?.code !== "retirement") return "the part vested by the end of your stay";
  const s = ret.params.vestedShare;
  return s >= 1 ? "all of it vested by the end of your stay" : s > 0 ? `${percent(s)} vested by the end of your stay` : "none vested by the end of your stay";
}

function rentGloss(d: ReturnType<typeof detailOf>): string {
  const info = d.costOfLiving!;
  return `${dollars(info.monthlyRent)} a month the first lease year${info.rentGrowth ? `, rising ${percent(info.rentGrowth)} a year` : ""}`;
}

function faceGloss(ys: ShownYear[]): string {
  const parts = [
    ys.some((y) => y.col!.savings) && "planned savings", ys.some((y) => y.yours) && "your 401(k) and HSA", ys.some((y) => y.employer) && "the vested match",
    ys.some((y) => y.hsa) && "employer HSA money", ys.some((y) => y.perks) && "perks",
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : "nothing saved";
}

// ---- your stay: tied to L-1 and the lead schedule --------------------------------------------------------

export interface StayRow {
  basis: ValueBasis;
  label: string;
  /** Its line in the year table: its years added are that line's sum. */
  line: L6Line;
  years: number;
  /** What the years count past your stay's last day (a later start), not counted. */
  after: number;
  /** Your stay, as paid: L-1's "Your stay, as paid" on this basis. */
  stay: number;
  /** Present value today: the rank list's figure on this basis. */
  pv: number;
}

export const BASIS_LINE: Record<ValueBasis, L6Line> = { cash: "afterTax", totalRewards: "totalRewards", colAdjustedTotal: "total" };

/** Your stay's totals on each dollar basis the offers have. */
export function stayRows(ctx: WorkContext, letter: L): StayRow[] {
  const r = res(ctx);
  const n = r.view.row.years;
  const s = shownStay(detailOf(ctx, letter), n);
  const i = indexOf(ctx, letter);
  const label: Record<ValueBasis, string> = { cash: "After-tax pay", totalRewards: "Total rewards", colAdjustedTotal: cap(pricesOf(ctx).phrase) };
  return (["cash", "totalRewards", "colAdjustedTotal"] as ValueBasis[]).flatMap((b) => {
    const pv = r.view.row.values[b]?.[i];
    const years = s.years[b];
    if (pv === undefined || years === null) return [];
    return [{ basis: b, label: label[b], line: BASIS_LINE[b], years, after: s.after[b]!, stay: s.stay[b]!, pv }];
  });
}

// ---- every payment --------------------------------------------------------------------------------------

/** Adds amounts to the cent, exactly. */
export const addCents = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;
/** "9,166.67", "−10,000.00": a payment's figure (the table's unit is dollars). */
const TO_CENT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const toCent = (x: number) => `${x < 0 ? "−" : ""}${TO_CENT.format(Math.abs(x))}`;

export const COMPONENTS: Component[] = ["salary", "bonus", "cash", "rsu", "clawback"];
/** Each kind of payment's name in the list. */
export const KIND_NAME: Record<Component, string> = { salary: "Salary", bonus: "Bonus", cash: "Cash awards", rsu: "RSUs", clawback: "Clawbacks" };

export interface PaymentGroup {
  component: Component;
  /** `i`: the payment's place in the offer's list (its figure's id). */
  rows: Array<{ i: number; p: WorkPayment }>;
  /** The group's pay and tax, added to the cent. */
  gross: number;
  tax: number;
}
export interface PaymentYear {
  /** An employment year of your stay, or "after": payments past it in the tax years shown (taxed with them, not counted). */
  ey: number | "after";
  start?: string;
  end?: string;
  groups: PaymentGroup[];
  /** The year's tax, added to the cent: its tax line in the year table, to the dollar. */
  tax: number;
}

/** The worker's payments and tax years for an offer (L-6 open), or an error to show while they're on their way. */
export function workOf(ctx: WorkContext, letter: L): WorkOffer {
  const w = res(ctx).work?.[indexOf(ctx, letter)];
  if (!w) throw new Error("Open L-6, The work, to see this.");
  return w;
}

/** An offer's payments, by employment year of your stay and then by kind, as L-6 lists them. */
export function paymentYears(ctx: WorkContext, letter: L): PaymentYear[] {
  const w = workOf(ctx, letter);
  const r = res(ctx);
  const n = r.view.row.years;
  const ys = shownYears(detailOf(ctx, letter)).slice(0, n);
  const indexed = w.payments.map((p, i) => ({ i, p }));
  const year = (ey: number | "after", list: typeof indexed): PaymentYear => {
    const groups = COMPONENTS.flatMap((c): PaymentGroup[] => {
      const rows = list.filter((x) => x.p.component === c);
      return rows.length ? [{ component: c, rows, gross: addCents(rows.map((x) => x.p.gross)), tax: addCents(rows.map((x) => x.p.tax)) }] : [];
    });
    const y = typeof ey === "number" ? ys[ey - 1] : undefined;
    return { ey, ...(y ? { start: y.start, end: y.end } : {}), groups, tax: addCents(list.map((x) => x.p.tax)) };
  };
  const out = ys.map((y) => year(y.n, indexed.filter((x) => x.p.ey === y.n)));
  const after = indexed.filter((x) => x.p.ey > n);
  return after.length ? [...out, year("after", after)] : out;
}

/** A payment's place in L-6's list. */
export function paymentAt(ctx: WorkContext, letter: L, i: number): WorkPayment {
  const p = workOf(ctx, letter).payments[i];
  if (!p) throw new Error(`No payment ${i + 1} for ${letter}.`);
  return p;
}

/**
 * A payment before rounding to the cent: the engine's own arithmetic, from how it was worked out. Its tax is this × its
 * calendar year's rate, rounded once.
 */
export function exactPay(p: WorkPayment): number {
  const d = p.detail;
  switch (d.kind) {
    case "salary": return (d.annual / 12) * (d.days / d.daysInMonth);
    case "bonus": return d.basis === "percentOfSalary" ? d.rate * d.salaryEarned : (d.amount * d.daysEmployed) / d.periodDays;
    case "cash": return d.amount;
    case "rsu": return d.fraction * d.grantValue * d.priceFactor;
    case "clawback": return p.gross;
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** "Salary, August 2026", "Salary, Jul 13 – 31, 2026", "Bonus for 2026", "Sign-on", "New-hire RSUs, tranche 1 of 7". */
export function paymentLabel(p: WorkPayment): string {
  const d = p.detail;
  switch (d.kind) {
    case "salary": {
      const [y, m, a] = parts(d.from);
      const [, , b] = parts(d.to);
      return d.days === d.daysInMonth ? `Salary, ${MONTHS[m - 1]} ${y}` : `Salary, ${SHORT[m - 1]} ${a}${a === b ? "" : ` – ${b}`}, ${y}`;
    }
    case "bonus": return `Bonus for ${periodText(d.periodFrom, d.periodTo)}`;
    case "cash": return d.award;
    case "rsu": return `${d.grant.kind === "grant" ? d.grant.label : `${d.grant.label ?? "Refresher"} ${d.grant.number}`}, tranche ${d.tranche} of ${d.tranches}`;
    case "clawback": return `${d.award} repaid`;
  }
}

/** "2026" for a calendar-year period; "Jul 1, 2026 – Jun 30, 2027" otherwise. */
const periodText = (from: string, to: string) =>
  (from.endsWith("-01-01") && to === `${from.slice(0, 4)}-12-31` ? from.slice(0, 4) : `${longDate(from)} – ${longDate(to)}`);

/** Dollars, with cents when there are any: "110,000", "84,872.32". */
const amount = (x: number) => (Number.isInteger(x) ? figure(x) : toCent(x));

/** How a payment was worked out, in a line: "110,000 ÷ 12 × 19/31 days". */
export function paymentFormula(p: WorkPayment): string {
  const d = p.detail;
  switch (d.kind) {
    case "salary": return `${amount(d.annual)} a year ÷ 12${d.days === d.daysInMonth ? "" : ` × ${d.days}/${d.daysInMonth} days`}`;
    case "bonus": return d.basis === "percentOfSalary"
      ? `${percent(d.rate)} of ${toCent(d.salaryEarned)} salary earned in the period`
      : `${amount(d.amount)}${d.employmentYear ? ` (year ${d.employmentYear}'s)` : ""} × ${d.daysEmployed}/${d.periodDays} days worked`;
    case "cash": return "paid once";
    case "rsu": return `${amount(d.grantValue)} × ${+(d.fraction * 100).toFixed(4)}%${Math.abs(d.priceFactor - 1) > 1e-9 ? ` × ${d.priceFactor.toFixed(4)} share-price growth` : ""}`
      + `${d.nominalDate ? `; due ${longDate(d.nominalDate)}, vests on the company's next date` : ""}`;
    case "clawback": return `${toCent(d.amount)} × ${percent(d.fraction)}`;
  }
}

/** The fewest decimals (in percent, 2 to 8) at which a year's rate × each payment before rounding gives its tax to the cent. */
export function rateDigits(rate: number, payments: WorkPayment[]): number {
  // Up to 12: a payment whose tax is within a hair of a half cent needs them all to multiply out to its cent.
  for (let digits = 2; digits <= 12; digits++) {
    const r = Number((rate * 100).toFixed(digits)) / 100;
    if (payments.every((p) => Math.round(exactPay(p) * r * 100) === Math.round(p.tax * 100))) return digits;
  }
  return 12;
}
/** A rate in percent at `digits` decimals: "27.2735%". */
export const rateText = (rate: number, digits: number) => `${(rate * 100).toFixed(digits)}%`;

// ---- each calendar year's tax ---------------------------------------------------------------------------

export type TaxCol = "with" | "without" | "offer";
export interface TaxRow {
  line: TaxLine;
  label: string;
  gloss?: string;
  /** what goes in (wages, deductions), taxable income, a tax, the total, or the offer's rate. */
  kind: "input" | "memo" | "tax" | "total" | "rate";
  with?: number;
  without?: number;
  offer?: number;
}
export interface TaxTable {
  year: number;
  projectedLaw: boolean;
  rows: TaxRow[];
  /** The offer's tax ÷ its pay, unrounded: every payment in the year carries it. */
  rate: number;
  digits: number;
  /** The payments in the year, to the cent: their pay and tax added, by employment year (L-6's list). */
  pay: number;
  tax: number;
  parts: Array<{ ey: number | "after"; gross: number; tax: number }>;
  /** The with-offer federal income tax before it takes the rounding: the engine's figure, unrounded. */
  federal: number;
  t: WorkTaxYear;
}

const R = (x: number) => Math.round(x) + 0;
const TAX_LINES: Array<{ line: TaxLine; key: keyof TaxRun }> = [
  { line: "ss", key: "ss" }, { line: "medicare", key: "medicare" }, { line: "state", key: "stateIncome" },
  { line: "statePayroll", key: "statePayroll" }, { line: "local", key: "local" },
];

/**
 * An offer's calendar years of tax, as L-6 shows them, each column footing as displayed. The offer's pay and tax are its
 * payments that year, added to the cent and rounded once, so they tie to its list. Without the offer, each line is the tax
 * engine's figure, rounded, and the total adds them. With it, the total is the one without plus the offer's tax, and its
 * federal income tax (the largest line) takes the rounding: the total less the other lines as rounded. The offer's column is
 * with less without, line by line.
 */
export function taxTables(ctx: WorkContext, letter: L): TaxTable[] {
  const w = workOf(ctx, letter);
  const o = offerByLetter(ctx, letter);
  const st = o?.draft.residence.state ?? "State";
  const local = cityLine(o) ?? "Local";
  const joint = ctx.household.filingStatus === "joint";
  const n = res(ctx).view.row.years;
  // Worked out once for a result (the derivations ask for a year at a time).
  const key = `${n}|${st}|${local}|${joint}`;
  const hit = taxMemo.get(w)?.get(key);
  if (hit) return hit;
  const out = taxTablesOf(w, st, local, joint, n);
  if (!taxMemo.has(w)) taxMemo.set(w, new Map());
  taxMemo.get(w)!.set(key, out);
  return out;
}

const taxMemo = new WeakMap<WorkOffer, Map<string, TaxTable[]>>();

function taxTablesOf(w: WorkOffer, st: string, local: string, joint: boolean, n: number): TaxTable[] {
  // A line shows when it's not zero in any year, with or without the offer.
  const shows = (key: keyof TaxRun) => w.taxYears.some((t) => R(t.with[key]) !== 0 || R(t.without[key]) !== 0);
  return w.taxYears.map((t): TaxTable => {
    const inYear = w.payments.filter((p) => p.calendarYear === t.year);
    const pay = addCents(inYear.map((p) => p.gross));
    const tax = addCents(inYear.map((p) => p.tax));
    const eys = [...new Set(inYear.map((p) => (p.ey > n ? "after" as const : p.ey)))];
    const parts = eys.map((ey) => {
      const list = inYear.filter((p) => (ey === "after" ? p.ey > n : p.ey === ey));
      return { ey, gross: addCents(list.map((p) => p.gross)), tax: addCents(list.map((p) => p.tax)) };
    });
    const offerPay = R(pay);
    const offerTax = R(tax);
    const other = R(t.without.wages);
    const rows: TaxRow[] = [
      { line: "wages", label: "Wages", gloss: "your other wages, and the offer's pay", kind: "input", with: other + offerPay, without: other, offer: offerPay },
      ...(joint && (t.with.spouseWages || t.without.spouseWages) ? [{ line: "spouse" as const, label: "Your spouse's wages", kind: "input" as const, with: R(t.with.spouseWages), without: R(t.without.spouseWages), offer: 0 }] : []),
      ...(t.with.pretax401k || t.without.pretax401k ? [{ line: "pretax401k" as const, label: "Pre-tax 401(k)", gloss: "out of wages before income tax", kind: "input" as const,
        with: R(t.with.pretax401k), without: R(t.without.pretax401k), offer: R(t.with.pretax401k) - R(t.without.pretax401k) }] : []),
      ...(t.with.section125 || t.without.section125 ? [{ line: "section125" as const, label: "Health premiums and HSA, pre-tax", gloss: "section 125: out of wages before every tax",
        kind: "input" as const, with: R(t.with.section125), without: R(t.without.section125), offer: R(t.with.section125) - R(t.without.section125) }] : []),
      { line: "taxable", label: "Federal taxable income", gloss: "after the deduction", kind: "memo", with: R(t.with.taxableIncome), without: R(t.without.taxableIncome),
        offer: R(t.with.taxableIncome) - R(t.without.taxableIncome) },
    ];
    // Without the offer: each line rounded, the total their sum. With it: the total without plus the offer's tax.
    const lines = TAX_LINES.filter((x) => x.line === "ss" || x.line === "medicare" || shows(x.key));
    const withoutFed = R(t.without.federal);
    const withoutTotal = withoutFed + lines.reduce((s, x) => s + R(t.without[x.key]), 0);
    const withTotal = withoutTotal + offerTax;
    const withFed = withTotal - lines.reduce((s, x) => s + R(t.with[x.key]), 0);
    const label = (line: TaxLine) => ({ ss: "Social Security", medicare: "Medicare", state: `${st} income tax`, statePayroll: `${st} payroll tax`,
      local: `${local} income tax` } as Record<string, string>)[line];
    rows.push({ line: "federal", label: "Federal income tax", kind: "tax", with: withFed, without: withoutFed, offer: withFed - withoutFed });
    for (const x of lines) {
      rows.push({ line: x.line, label: label(x.line), kind: "tax", with: R(t.with[x.key]), without: R(t.without[x.key]), offer: R(t.with[x.key]) - R(t.without[x.key]),
        ...(x.line === "medicare" ? { gloss: "the additional 0.9% over $200,000 included" } : x.line === "statePayroll" ? { gloss: "disability, paid leave or long-term care" } : {}) });
    }
    rows.push({ line: "total", label: "Total tax", kind: "total", with: withTotal, without: withoutTotal, offer: offerTax });
    const rate = t.offerTaxRate;
    const digits = rateDigits(rate, inYear);
    rows.push({ line: "rate", label: `The offer's tax ÷ its ${t.year} pay`, gloss: "the rate on each of its payments this year", kind: "rate" });
    return { year: t.year, projectedLaw: t.projectedLaw, rows, rate, digits, pay, tax, parts, federal: t.with.federal, t };
  });
}

/** One calendar year's table for an offer. */
export function taxTable(ctx: WorkContext, letter: L, year: number): TaxTable {
  const t = taxTables(ctx, letter).find((x) => x.year === year);
  if (!t) throw new Error(`No ${year} tax for ${letter} in L-6.`);
  return t;
}

/** "Year 1 (Jul 13, 2026 – Jul 12, 2027)", or for payments past your stay "After your stay". */
export const yearName = (y: PaymentYear) =>
  (y.ey === "after" ? "After your stay" : `Year ${y.ey}${y.start && y.end ? ` (${longDate(y.start)} – ${longDate(dayBefore(y.end))})` : ""}`);
