import type { SectionId } from "./sections";
import type { LedgerSection } from "./session";

// Help on every input (docs/ui-design.md §3.5), keyed by input path: the draft's path with array
// indexes left out ("equity.grants.0.value" -> "equity.grants.value"). Each has three layers: a hint
// of 12 words or fewer, always visible; 2-4 sentences behind the ⓘ (what it means, an example, what
// its default does); and "How this is used →", a link to the methodology. A test renders every input
// and fails if one lacks any of them.
//
// Every field's name and place are here (field names, "Edit it" and the section flags need them), and
// the hints for quick mode and About you. Their ⓘ help (quickHelp.ts) loads on first use, and detailed
// mode's text (helpText.ts) with detailed mode.

export interface FieldMeta {
  /** The row's label. */
  label: string;
  /** "How this is used →". */
  section: SectionId;
  /** Where the field is in detailed mode. */
  group: LedgerSection | "about" | "head";
  /** The row whose editor holds it, for fields inside a row editor. */
  editor?: string;
}

export interface FieldText {
  /** Always visible: 12 words or fewer. */
  hint: string;
  /** Behind the ⓘ: two to four sentences. */
  help: string;
}

export type FieldHelp = FieldMeta & FieldText;

/** An input path's help key: the path without its array indexes. */
export const helpKey = (path: string) => path.split(".").filter((k) => !/^\d+$/.test(k)).join(".");

/** An input's name out of context ("Promotions, date"): a field inside an editor is named with its editor. */
export function fieldName(path: string): string {
  const key = helpKey(path);
  const h = HELP[key];
  if (!h) return "Input";
  return h.editor && h.editor !== key && HELP[h.editor] ? `${HELP[h.editor].label}, ${h.label.toLowerCase()}` : h.label;
}

const tranches = (owner: string, editor: string): Record<string, FieldMeta> => ({
  [`${owner}.schedule.tranches.month`]: { label: "Month", section: "M-3", group: "equity", editor },
  [`${owner}.schedule.tranches.fraction`]: { label: "Vests", section: "M-3", group: "equity", editor },
  [`${owner}.schedule.vestDates`]: { label: "Company vest dates", section: "M-3", group: "equity", editor },
});

const META: Record<string, FieldMeta> = {
  // ---- the offer's name and quick mode's fields ----
  label: { label: "Name", section: "M-1", group: "head" },
  "salary.annual": { label: "Salary", section: "M-2", group: "pay" },
  startDate: { label: "Start date", section: "M-7.3", group: "pay" },
  "bonus.amount": { label: "Bonus", section: "M-2", group: "bonus" },
  "costOfLiving.area": { label: "City", section: "M-6.1", group: "where" },
  "costOfLiving.monthlyRent": { label: "Rent a month", section: "M-6.2", group: "where" },
  // ---- pay ----
  "salary.raise": { label: "Merit raise", section: "M-2", group: "pay" },
  "salary.raiseOn": { label: "Raises take effect", section: "M-2", group: "pay" },
  "salary.promotions": { label: "Promotions", section: "M-2", group: "pay", editor: "salary.promotions" },
  "salary.promotions.on": { label: "Date", section: "M-2", group: "pay", editor: "salary.promotions" },
  "salary.promotions.stepUp": { label: "Step-up", section: "M-2", group: "pay", editor: "salary.promotions" },
  "salary.promotions.scenarios": { label: "Counts in", section: "M-8", group: "pay", editor: "salary.promotions" },
  // ---- bonus ----
  "bonus.basis": { label: "Basis", section: "M-2", group: "bonus" },
  "bonus.amounts": { label: "Bonus by year", section: "M-2", group: "bonus", editor: "bonus.amounts" },
  "bonus.payOn": { label: "Payout date", section: "M-2", group: "bonus" },
  "bonus.periodStart": { label: "Bonus year starts", section: "M-2", group: "bonus" },
  "bonus.cutoff": { label: "Cutoff", section: "M-2", group: "bonus" },
  "bonus.firstPayoutGuaranteed": { label: "First payout guaranteed", section: "M-8", group: "bonus" },
  "bonus.mustBeEmployedOnPayDate": { label: "Must be employed on the pay date", section: "M-9", group: "bonus" },
  // ---- equity ----
  "equity.grants": { label: "RSU grants", section: "M-3", group: "equity", editor: "equity.grants" },
  "equity.grants.label": { label: "Name", section: "M-3", group: "equity", editor: "equity.grants" },
  "equity.grants.value": { label: "Value at grant", section: "M-3", group: "equity", editor: "equity.grants" },
  "equity.grants.grantDate": { label: "Grant date", section: "M-3", group: "equity", editor: "equity.grants" },
  "equity.grants.vestStart": { label: "Vesting start", section: "M-3", group: "equity", editor: "equity.grants" },
  "equity.grants.schedule": { label: "Vesting", section: "M-3", group: "equity", editor: "equity.grants" },
  ...tranches("equity.grants", "equity.grants"),
  "equity.priceGrowth": { label: "Share-price growth", section: "M-3", group: "equity" },
  "equity.refreshers": { label: "Refreshers", section: "M-3", group: "equity", editor: "equity.refreshers" },
  "equity.refreshers.value": { label: "Value", section: "M-3", group: "equity", editor: "equity.refreshers" },
  "equity.refreshers.firstAfterMonths": { label: "First after", section: "M-3", group: "equity", editor: "equity.refreshers" },
  "equity.refreshers.everyMonths": { label: "Every", section: "M-3", group: "equity", editor: "equity.refreshers" },
  "equity.refreshers.schedule": { label: "Vesting", section: "M-3", group: "equity", editor: "equity.refreshers" },
  ...tranches("equity.refreshers", "equity.refreshers"),
  // ---- sign-on and other cash ----
  cashAwards: { label: "Sign-on and other cash", section: "M-2", group: "cash", editor: "cashAwards" },
  "cashAwards.label": { label: "Name", section: "M-2", group: "cash", editor: "cashAwards" },
  "cashAwards.amount": { label: "Amount", section: "M-2", group: "cash", editor: "cashAwards" },
  "cashAwards.paidOn": { label: "Paid", section: "M-7.1", group: "cash", editor: "cashAwards" },
  "cashAwards.clawback": { label: "Clawback", section: "M-9", group: "cash", editor: "cashAwards" },
  "cashAwards.clawback.months": { label: "Window", section: "M-9", group: "cash", editor: "cashAwards" },
  "cashAwards.clawback.kind": { label: "Owed back", section: "M-9", group: "cash", editor: "cashAwards" },
  "cashAwards.clawback.per": { label: "Prorated by", section: "M-9", group: "cash", editor: "cashAwards" },
  "cashAwards.clawback.from": { label: "Clock starts", section: "M-9", group: "cash", editor: "cashAwards" },
  "cashAwards.clawback.repay": { label: "Repay", section: "M-9", group: "cash", editor: "cashAwards" },
  // ---- 401(k) ----
  retirement: { label: "401(k) plan", section: "M-5.1", group: "retirement" },
  "retirement.contributionPct": { label: "Your contribution", section: "M-5.1", group: "retirement" },
  "retirement.type": { label: "Pre-tax or Roth", section: "M-5.1", group: "retirement" },
  "retirement.eligiblePay": { label: "Pay that counts", section: "M-5.1", group: "retirement" },
  "retirement.match": { label: "Match", section: "M-5.1", group: "retirement", editor: "retirement.match" },
  "retirement.match.rate": { label: "Match rate", section: "M-5.1", group: "retirement", editor: "retirement.match" },
  "retirement.match.upToPct": { label: "On deferrals up to", section: "M-5.1", group: "retirement", editor: "retirement.match" },
  "retirement.nonElectivePct": { label: "Employer contribution", section: "M-5.1", group: "retirement" },
  "retirement.vesting": { label: "Vesting", section: "M-5.1", group: "retirement" },
  "retirement.vesting.years": { label: "Cliff after", section: "M-5.1", group: "retirement" },
  "retirement.vesting.steps": { label: "Vesting steps", section: "M-5.1", group: "retirement", editor: "retirement.vesting.steps" },
  "retirement.vesting.steps.years": { label: "After", section: "M-5.1", group: "retirement", editor: "retirement.vesting.steps" },
  "retirement.vesting.steps.pct": { label: "Vested", section: "M-5.1", group: "retirement", editor: "retirement.vesting.steps" },
  "retirement.vestingService": { label: "Vesting service", section: "M-5.1", group: "retirement" },
  // ---- health ----
  health: { label: "Health plan", section: "M-5.2", group: "health" },
  "health.premium": { label: "Premium, a year", section: "M-5.2", group: "health" },
  "health.outOfPocket": { label: "Out-of-pocket, a year", section: "M-5.2", group: "health" },
  "health.oopMax": { label: "Out-of-pocket maximum", section: "M-5.2", group: "health" },
  "health.employeeHsa": { label: "Your HSA, a year", section: "M-5.2", group: "health" },
  "health.employerHsa": { label: "Employer HSA, a year", section: "M-5.2", group: "health" },
  "health.coverage": { label: "Coverage", section: "M-5.2", group: "health" },
  // ---- perks ----
  "perks.section127": { label: "Education assistance, a year", section: "M-5.3", group: "perks" },
  "perks.commuterMonthly": { label: "Commuter, a month", section: "M-5.3", group: "perks" },
  // ---- hours ----
  "hours.weekly": { label: "Weekly hours", section: "M-5.4", group: "hours" },
  "timeOff.vacation": { label: "Vacation days you'd take, a year", section: "M-5.4", group: "hours" },
  "timeOff.holidays": { label: "Paid holidays, a year", section: "M-5.4", group: "hours" },
  "timeOff.sick": { label: "Sick days you'd take, a year", section: "M-5.4", group: "hours" },
  "timeOff.policy": { label: "Vacation policy", section: "M-9", group: "hours" },
  "timeOff.gives": { label: "Vacation days it gives, a year", section: "M-9", group: "hours" },
  "timeOff.cap": { label: "Most days you can bank", section: "M-9", group: "hours" },
  "timeOff.payout": { label: "Unused vacation when you leave", section: "M-9", group: "hours" },
  // ---- where you'd live ----
  employerState: { label: "Employer state", section: "M-4", group: "where" },
  "costOfLiving.rentGrowth": { label: "Rent growth", section: "M-6.2", group: "where" },
  // ---- about you ----
  "about.filing": { label: "Filing status", section: "M-4", group: "about" },
  "about.stay": { label: "How long do you expect to stay?", section: "M-7.3", group: "about" },
  "about.wages": { label: "Other wages", section: "M-4", group: "about" },
  "about.spouse": { label: "Spouse's wages", section: "M-4", group: "about" },
  "about.healthUsage": { label: "Health use", section: "M-5.2", group: "about" },
  "about.prices": { label: "Prices in", section: "M-6.1", group: "about" },
};

/** Quick mode's and About you's hints, always shown. Their ⓘ help loads on first use (quickHelp.ts). */
const QUICK_HINTS: Record<string, string> = {
  label: "Your own name for each offer.",
  "salary.annual": "Per year, before tax.",
  startDate: "Your first day of work.",
  "bonus.amount": "Target bonus; the first one is prorated.",
  "costOfLiving.area": "Where you'd live, not the office.",
  "costOfLiving.monthlyRent": "What you'd pay there.",
  "about.filing": "How you'd file your federal return.",
  "about.stay": "Sets how many years we compare.",
  "about.wages": "An internship or the job you're leaving.",
  "about.spouse": "Their pay that year; later years grow with inflation.",
  "about.prices": "Show after-rent figures in a city's dollars you know.",
  "about.healthUsage": "Which of your out-of-pocket estimates counts.",
};

/**
 * Every input's help. A detailed field's hint and help are empty until detailed mode's text arrives, and quick mode's and About
 * you's ⓘ help until quickHelp.ts does (addHelpText).
 */
export const HELP: Record<string, FieldHelp> = Object.fromEntries(Object.entries(META).map(([k, m]) => [k, { ...m, hint: QUICK_HINTS[k] ?? "", help: "" }]));

/** Fills in help text: detailed mode's (helpText.ts, loaded with detailed mode) and the ⓘ help for quick mode and About you (quickHelp.ts). */
export function addHelpText(text: Record<string, Partial<FieldText>>): void {
  for (const [k, t] of Object.entries(text)) if (HELP[k]) Object.assign(HELP[k], t);
}

/** The ledger's sections in detailed mode, in order (docs/ui-design.md §3.3), and what each holds. */
export const LEDGER_SECTIONS: Array<{ id: LedgerSection; title: string; holds: string }> = [
  { id: "pay", title: "Pay", holds: "salary, start date, raises, promotions" },
  { id: "bonus", title: "Bonus", holds: "target, timing, cutoff" },
  { id: "cash", title: "Sign-on and other cash", holds: "amounts, pay dates, clawbacks" },
  { id: "equity", title: "Equity", holds: "RSU grants, vesting, price growth, refreshers" },
  { id: "retirement", title: "401(k)", holds: "your deferral, the match, vesting" },
  { id: "health", title: "Health", holds: "premium, out-of-pocket, HSA" },
  { id: "perks", title: "Perks", holds: "education, commuter" },
  { id: "hours", title: "Hours and days off", holds: "per week, vacation, holidays, sick days" },
  { id: "where", title: "Where you'd live", holds: "city, rent, employer state" },
];
