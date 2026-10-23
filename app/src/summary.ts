import { describeSchedule } from "../../src/format/schedule";
import type { ByScenario } from "../../src/offer/types";
import { bonusBasis, type CashAwardDraft, hasRange, type OfferDraft, type RetirementDraft, type ScheduleDraft } from "./model";
import { DEFAULT_PRESET, PRESETS } from "./presets";
import { dollars, longDate, percent } from "./text";

// One-line summaries of detailed inputs, in words: for the cells of rows whose inputs open in an
// editor, for the sections not yet editable, and for their derivations. Pure: no React.

const k = (x: number) => (Math.abs(x) >= 1000 ? `$${+(x / 1000).toFixed(1)}k` : dollars(x));
/** "3%", or "1% / 3% / 5%" with a range (bear / base / bull). */
export const rangeText = (s: ByScenario, fmt: (x: number) => string) => (hasRange(s) ? `${fmt(s.bear)} / ${fmt(s.base)} / ${fmt(s.bull)}` : fmt(s.base));

export function scheduleText(s: ScheduleDraft): string {
  const tranches = s.tranches;
  const ok = tranches?.every((t) => t.month !== null && t.fraction !== null);
  const label = !tranches ? describeSchedule(PRESETS[DEFAULT_PRESET])
    : ok && tranches.length ? describeSchedule({ tranches: tranches.map((t) => ({ month: t.month!, fraction: t.fraction! })) }) : "custom (incomplete)";
  return s.vestDates?.months.length ? `${label}; on company dates` : label;
}

export function grantsText(d: OfferDraft): string {
  const g = d.equity.grants;
  if (!g.length) return "None";
  return g.map((x) => `${x.value === null ? "$—" : dollars(x.value)} ${x.label || "RSUs"}`).join(" + ");
}

export function promotionsText(d: OfferDraft): string {
  const p = d.salary.promotions;
  if (!p.length) return "None";
  return p.map((x) => `${x.stepUp === null ? "+—" : `+${percent(x.stepUp)}`} on ${x.on ? longDate(x.on) : "—"}${
    x.scenarios && x.scenarios.length < 3 ? ` (${x.scenarios.join(" and ")} only)` : ""}`).join("; ");
}

export function bonusYearsText(d: OfferDraft): string {
  const a = d.bonus.amounts;
  if (!a.length) return "No years entered";
  const ks = a.map((x) => (x ? k(x.base) : "—"));
  return `${ks.join(", ")}${a.length > 1 ? "; the last repeats" : " a year"}`;
}

export function refreshersText(d: OfferDraft): string {
  const r = d.equity.refreshers;
  if (!r) return "None";
  const every = r.everyMonths ?? 12;
  return `${r.value ? rangeText(r.value, dollars) : "$—"} ${every === 12 ? "a year" : `every ${every} months`}, from month ${r.firstAfterMonths ?? 12}`;
}

export function bonusText(d: OfferDraft): string {
  const b = d.bonus;
  const basis = bonusBasis(b);
  if (basis === "byEmploymentYear") return `By year: ${bonusYearsText(d)}`;
  if (!b.amount || !b.amount.base) return "None";
  return basis === "percentOfSalary" ? `${rangeText(b.amount, percent)} of salary` : `${rangeText(b.amount, dollars)} a year`;
}

// ---- sections not yet editable (group 2) -------------------------------------------------------------

function cashText(a: CashAwardDraft): string {
  const paid = a.paidOn === null ? "30 days after you start" : typeof a.paidOn === "string" ? longDate(a.paidOn)
    : `${a.paidOn.daysAfterStart ?? "—"} days after you start`;
  const c = a.clawback;
  const back = !c ? "no clawback" : `${(c.kind ?? "prorated") === "full" ? "owed back in full" : "owed back prorated"} if you leave within ${c.months ?? 12} months`;
  return `${a.label || "Cash award"} ${a.amount === null ? "$—" : dollars(a.amount)}, paid ${paid}; ${back}`;
}

export const cashAwardsText = (d: OfferDraft) => (d.cashAwards.length ? d.cashAwards.map(cashText).join("; ") : "None");

export function retirementText(d: OfferDraft): string {
  const r = d.retirement;
  if (!r) return "Not entered";
  if (r === "none") return "No 401(k)";
  const tiers = r.match.map((t) => `${percent(t.rate ?? 0)} of ${t.upToPct === 1 ? "all deferrals" : `the first ${percent(t.upToPct ?? 0)}`}`);
  const v = r.vesting;
  const vesting = !v || v.kind === "immediate" ? "vests immediately" : v.kind === "cliff" ? `vests after a ${v.years}-year cliff` : "graded vesting";
  return `You defer ${percent(r.contributionPct ?? 0)}${(r.type ?? "pretax") === "pretax" ? "pre-tax" : "Roth"}; match ${tiers.length ? tiers.join(" + ") : "none"}`
    + `${r.nonElectivePct ? ` + ${percent(r.nonElectivePct)} of pay` : ""}; ${vesting}`;
}

/** "100% of the first 3%, then 50% of the first 5%". */
export function matchText(r: RetirementDraft): string {
  if (!r.match.length) return "None";
  return r.match.map((t) => `${t.rate === null ? "—" : percent(t.rate)} of ${t.upToPct === 1 ? "all you defer" : `the first ${t.upToPct === null ? "—" : percent(t.upToPct)}`}`)
    .join(", then ");
}

/** "Immediate", "After a 3-year cliff", "20% after 2, 40% after 3, ..." */
export function vestingText(r: RetirementDraft): string {
  const v = r.vesting;
  if (!v || v.kind === "immediate") return "Immediate";
  if (v.kind === "cliff") return `After a ${v.years ?? "—"}-year cliff`;
  return v.steps.map((x) => `${x.pct === null ? "—" : percent(x.pct)} after ${x.years ?? "—"} ${x.years === 1 ? "year" : "years"}`).join(", ");
}

export function healthText(d: OfferDraft): string {
  const h = d.health;
  if (!h) return "Not entered";
  if (h === "none") return "No health plan from this job";
  const o = h.outOfPocket;
  const parts = [h.premium !== null ? `premium ${dollars(h.premium)} a year` : "premium not counted",
    o.medium !== null ? `out-of-pocket ${dollars(o.medium)} (medium use)` : "out-of-pocket not counted"];
  if (h.employerHsa) parts.push(`employer HSA ${dollars(h.employerHsa)}`);
  return parts.join("; ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10% of salary, 15% off with a lookback, 6-month offerings from Jan 1; each lot sold at purchase". Blank terms read as their defaults. */
export function esppText(d: OfferDraft): string {
  const p = d.espp;
  if (!p) return "Not entered";
  if (p === "none") return "No ESPP";
  const months = p.offeringMonths ?? 6;
  const per = p.purchasesPerOffering ?? 1;
  const from = p.offeringsStart;
  return `${percent(p.contributionPct ?? 0)} of ${p.eligiblePay === "salaryAndBonus" ? "salary and bonus" : "salary"}, ${percent(p.discount ?? 0.15)} off`
    + `${p.lookback ?? true ? " with a lookback" : ", no lookback"}, ${months}-month offerings from ${from ? `${MONTHS[from.month - 1]} ${from.day}` : "—"}`
    + `${per > 1 ? `, ${per} purchases each` : ""}${p.eligibleFrom ? `, eligible from ${longDate(p.eligibleFrom)}` : ""}; each lot sold at purchase`;
}

/** "Wellness $1,200 taxable; Gym $600 tax-free", "None" (entered, none), or "Not entered" (4j). */
export function otherBenefitsText(d: OfferDraft): string {
  const list = d.otherBenefits;
  if (!list) return "Not entered";
  if (!list.length) return "None";
  return list.map((b) => `${b.label || "Benefit"} ${b.annual === null ? "$—" : dollars(b.annual)} ${b.taxable === false ? "tax-free" : "taxable"}`).join("; ");
}

export function perksText(d: OfferDraft): string {
  const p = d.perks;
  const parts = [p.section127 ? `education ${dollars(p.section127)} a year` : "", p.commuterMonthly ? `commuter ${dollars(p.commuterMonthly)} a month` : ""]
    .filter(Boolean);
  return parts.length ? parts.join("; ") : "None";
}

export const employerStateText = (d: OfferDraft) => (d.employerState ? d.employerState : `Where you'd live${d.residence.state ? ` (${d.residence.state})` : ""}`);
export const rentGrowthText = (d: OfferDraft, inflation: number) =>
  (d.costOfLiving.rentGrowth !== null ? `${percent(d.costOfLiving.rentGrowth)} a year` : `${percent(inflation)} a year (inflation)`);
