import { daysInMonth, jan1, nextMonthStart, yearOfDay } from "./dates";
import { type RawEvent, usd } from "./streams";
import type { BenefitKind, Health, Perks, Retirement } from "./types";

// Benefit flows: 401(k) money, health costs and tax-free perks. They aren't wages; the 401(k)
// pre-tax deferrals and the cafeteria-plan amounts lower taxable wages, which the caller passes
// to the engine as pretax401k and section125.

export interface RawBenefit {
  day: number;
  kind: BenefitKind;
  label: string;
  formula: string;
  amount: number;
  /** Accrued monthly flows: the first day covered (employment year follows it). */
  accruedFrom?: number;
}

const pct = (x: number) => `${+(x * 100).toFixed(4)}%`;
const round2 = (x: number) => Math.round(x * 100) / 100;
const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);

// ---- 401(k) ------------------------------------------------------------------------------

/**
 * Deferrals and employer money per eligible paycheck, in date order. Deferrals stop for the
 * calendar year at the 402(g) limit, and the match follows actual deferrals paycheck by
 * paycheck (no year-end true-up), so hitting the limit early loses match.
 */
export function retirementFlows(
  ret: Retirement, pay: RawEvent[], limitFor: (year: number) => number, warnings: string[],
): { flows: RawBenefit[]; pretaxByYear: Map<number, number> } {
  if (!(ret.contributionPct >= 0 && ret.contributionPct <= 1)) throw new Error("401(k) contributionPct must be between 0 and 1.");
  const tiers = ret.match ?? [];
  tiers.forEach((t, i) => {
    if (!(t.upToPct > 0 && t.upToPct <= 1) || !(t.rate >= 0)) throw new Error("Match tiers need 0 < upToPct <= 1 and rate >= 0.");
    if (i > 0 && t.upToPct <= tiers[i - 1].upToPct) throw new Error("Match tiers must have increasing upToPct.");
  });
  if (!((ret.nonElectivePct ?? 0) >= 0)) throw new Error("nonElectivePct can't be negative.");
  const type = ret.type ?? "pretax";
  const eligible = pay
    .filter((e) => e.component === "salary" || (ret.eligiblePay === "salaryAndBonus" && e.component === "bonus"))
    .sort((a, b) => a.day - b.day);
  const flows: RawBenefit[] = [];
  const deferred = new Map<number, number>();
  const pretaxByYear = new Map<number, number>();
  const cappedYears = new Set<number>();
  for (const e of eligible) {
    const year = yearOfDay(e.day);
    const limit = limitFor(year);
    const wanted = ret.contributionPct * e.gross;
    const deferral = Math.max(0, Math.min(wanted, limit - (deferred.get(year) ?? 0)));
    if (deferral < wanted && !cappedYears.has(year)) {
      cappedYears.add(year);
      warnings.push(`Your ${year} 401(k) deferrals reach the 402(g) limit of ${usd(round2(limit))} before year-end: `
        + "deferrals and any match stop for the rest of that year (no true-up assumed).");
    }
    add(deferred, year, deferral);
    if (type === "pretax") add(pretaxByYear, year, deferral);
    const from = e.accruedFrom !== undefined ? { accruedFrom: e.accruedFrom } : {};
    if (deferral > 0) {
      flows.push({ day: e.day, kind: "employee401k", label: `Your 401(k) deferral (${type})`,
        formula: `${pct(ret.contributionPct)} x ${usd(round2(e.gross))}${deferral < wanted ? ", capped at the 402(g) limit" : ""}`,
        amount: deferral, ...from });
    }
    const rate = e.gross > 0 ? deferral / e.gross : 0;
    let match = 0;
    let lo = 0;
    for (const t of tiers) {
      match += t.rate * Math.max(0, Math.min(rate, t.upToPct) - lo);
      lo = t.upToPct;
    }
    const employer = (match + (ret.nonElectivePct ?? 0)) * e.gross;
    if (employer > 0) {
      flows.push({ day: e.day, kind: "employer401k", label: "Employer 401(k) contribution",
        formula: `${pct(match + (ret.nonElectivePct ?? 0))} of ${usd(round2(e.gross))}`, amount: employer, ...from });
    }
  }
  return { flows, pretaxByYear };
}

/**
 * Completed years of vesting service if your last day is `vestingDay` (employed until `workEnd`,
 * exclusive). "elapsedTime": a year completes once you work through the day before its
 * anniversary. "planYearHours": each calendar plan year with 1,000+ hours counts, credited once the
 * 1,000th hour is worked; employment on the year's last day isn't required (29 CFR 2530.200b-1).
 * Hours accrue evenly: `hoursPerYear` x days employed / days in the year.
 */
export function serviceYears(
  method: "elapsedTime" | "planYearHours", hoursPerYear: number | undefined,
  start: number, workEnd: number, vestingDay: number, anniversaries: number[],
): number {
  if (method === "elapsedTime") return anniversaries.filter((d, n) => n >= 1 && d <= vestingDay + 1).length;
  if (hoursPerYear === undefined) throw new Error("vestingService \"planYearHours\" needs offer.hours.");
  let years = 0;
  for (let y = yearOfDay(start); jan1(y) <= vestingDay; y++) {
    const days = Math.max(0, Math.min(vestingDay + 1, jan1(y + 1), workEnd) - Math.max(start, jan1(y)));
    if (hoursPerYear * (days / (jan1(y + 1) - jan1(y))) >= 1_000) years++;
  }
  return years;
}

/** Vested share of employer money after `completedYears` of service. */
export function vestedFraction(v: Retirement["vesting"], completedYears: number): number {
  if (!v || v.kind === "immediate") return 1;
  if (v.kind === "cliff") return completedYears >= v.years ? 1 : 0;
  let f = 0;
  for (const s of v.steps) if (completedYears >= s.years) f = Math.max(f, s.pct);
  return f;
}

// ---- monthly accruals: health and perks -------------------------------------------------

/** [from, to) split at month starts and anniversaries, with each piece's share of its month. */
export function monthlyPieces(from: number, to: number, anniversaries: number[]) {
  const out: Array<{ a: number; b: number; share: number }> = [];
  for (let a = from; a < to;) {
    const b = Math.min(to, nextMonthStart(a), anniversaries.find((d) => d > a) ?? Infinity);
    out.push({ a, b, share: (b - a) / daysInMonth(a) });
    a = b;
  }
  return out;
}

/**
 * Health flows by month while employed: premiums and expected out-of-pocket (capped at the
 * out-of-pocket max) are costs; employer HSA money offsets them; your HSA contributions are
 * savings, capped so both together stay within the calendar year's HSA limit.
 */
export function healthFlows(
  h: Health, usage: "low" | "medium" | "high", from: number, to: number, anniversaries: number[],
  hsaLimitFor: (year: number) => number, warnings: string[],
): { flows: RawBenefit[]; section125ByYear: Map<number, number> } {
  for (const v of [h.premium, h.oopMax, h.employeeHsa ?? 0, h.employerHsa ?? 0, h.outOfPocket[usage]]) {
    if (!(v >= 0)) throw new Error("Health amounts can't be negative.");
  }
  const oop = Math.min(h.outOfPocket[usage], h.oopMax);
  const flows: RawBenefit[] = [];
  const section125ByYear = new Map<number, number>();
  const pieces = monthlyPieces(from, to, anniversaries);
  // Employer money is fixed, so reserve each calendar year's employer total first; yours get the rest.
  const employerByYear = new Map<number, number>();
  for (const { a, share } of pieces) add(employerByYear, yearOfDay(a), ((h.employerHsa ?? 0) / 12) * share);
  const hsaSoFar = new Map<number, number>();
  const warned = new Set<number>();
  for (const { a, b, share } of pieces) {
    const year = yearOfDay(a);
    const piece = (annual: number) => (annual / 12) * share;
    const of = (annual: number) => `${usd(annual)} / 12${share < 1 ? ` x ${b - a}/${daysInMonth(a)} days` : ""}`;
    const push = (kind: BenefitKind, label: string, annual: number, amount = piece(annual), note = "") => {
      if (amount > 0) flows.push({ day: b - 1, kind, label, formula: of(annual) + note, amount, accruedFrom: a });
    };
    push("premium", "Health premium (pre-tax)", h.premium);
    push("outOfPocket", `Expected out-of-pocket (${usage} usage)`, oop);
    push("employerHsa", "Employer HSA contribution", h.employerHsa ?? 0);
    const limit = hsaLimitFor(year);
    const room = Math.max(0, limit - (employerByYear.get(year) ?? 0) - (hsaSoFar.get(year) ?? 0));
    const employeeHsa = Math.min(piece(h.employeeHsa ?? 0), room);
    if (employeeHsa < piece(h.employeeHsa ?? 0) && !warned.has(year)) {
      warned.add(year);
      warnings.push(`HSA contributions in ${year} reach the ${usd(round2(limit))} limit (yours plus your employer's); `
        + "yours are capped there.");
    }
    push("employeeHsa", "Your HSA contribution (pre-tax)", h.employeeHsa ?? 0, employeeHsa,
      employeeHsa < piece(h.employeeHsa ?? 0) ? ", capped at the HSA limit" : "");
    add(hsaSoFar, year, employeeHsa); // your contributions so far this year
    add(section125ByYear, year, piece(h.premium) + employeeHsa);
  }
  return { flows, section125ByYear };
}

/** Tax-free perks by month while employed, each capped at its limit for the year. */
export function perkFlows(
  p: Perks, from: number, to: number, anniversaries: number[],
  limitsFor: (year: number) => { section127: number; commuterMonthly: number }, warnings: string[],
): RawBenefit[] {
  if (!((p.section127 ?? 0) >= 0) || !((p.commuterMonthly ?? 0) >= 0)) throw new Error("Perk amounts can't be negative.");
  const flows: RawBenefit[] = [];
  const s127SoFar = new Map<number, number>();
  const warned = new Set<string>();
  const warnOnce = (key: string, text: string) => { if (!warned.has(key)) { warned.add(key); warnings.push(text); } };
  for (const { a, b, share } of monthlyPieces(from, to, anniversaries)) {
    const year = yearOfDay(a);
    const limits = limitsFor(year);
    if (p.section127) {
      const wanted = (p.section127 / 12) * share;
      const amount = Math.min(wanted, Math.max(0, limits.section127 - (s127SoFar.get(year) ?? 0)));
      if (p.section127 > limits.section127) {
        warnOnce(`127-${year}`, `Section 127 help above ${usd(round2(limits.section127))} in ${year} is taxable; only the limit is counted.`);
      }
      add(s127SoFar, year, amount);
      if (amount > 0) {
        flows.push({ day: b - 1, kind: "section127", label: "Section 127 education / student loan help (tax-free)",
          formula: `${usd(p.section127)} / 12${share < 1 ? ` x ${b - a}/${daysInMonth(a)} days` : ""}`, amount, accruedFrom: a });
      }
    }
    if (p.commuterMonthly) {
      const monthly = Math.min(p.commuterMonthly, limits.commuterMonthly);
      if (p.commuterMonthly > limits.commuterMonthly) {
        warnOnce(`132-${year}`, `Commuter benefits above ${usd(round2(limits.commuterMonthly))} a month in ${year} are taxable; only the limit is counted.`);
      }
      flows.push({ day: b - 1, kind: "commuter", label: "132(f) commuter benefit (tax-free)",
        formula: `${usd(round2(monthly))} a month${share < 1 ? ` x ${b - a}/${daysInMonth(a)} days` : ""}`,
        amount: monthly * share, accruedFrom: a });
    }
  }
  return flows;
}
