import type { SectionId } from "./sections";
import type { LedgerSection } from "./session";

// Help on every input (docs/ui-design.md §3.5), keyed by input path: the draft's path with array
// indexes left out ("equity.grants.0.value" -> "equity.grants.value"). Each has three layers: a hint
// of 12 words or fewer, always visible; 2-4 sentences behind the ⓘ (what it means, an example, what
// its default does); and "How this is used →", a link to the methodology. A test renders every input
// and fails if one lacks any of them.
//
// Every field's name and place are here (field names, "Edit it" and the section flags need them), and
// the text for quick mode and About you. Detailed mode's text (helpText.ts) loads with detailed mode.

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
  // ---- hours ----
  "hours.weekly": { label: "Weekly hours", section: "M-5.4", group: "hours" },
  "hours.weeksPerYear": { label: "Weeks a year", section: "M-5.4", group: "hours" },
  // ---- about you ----
  "about.filing": { label: "Filing status", section: "M-4", group: "about" },
  "about.stay": { label: "How long do you expect to stay?", section: "M-7.3", group: "about" },
  "about.wages": { label: "Other wages", section: "M-4", group: "about" },
};

/** Quick mode's and About you's text. */
const QUICK_TEXT: Record<string, FieldText> = {
  label: {
    hint: "Your own name for each offer.",
    help: "A short name you'll recognize, such as the firm or the city. It appears beside the offer's letter in the bridge and the "
      + "methodology. It doesn't change any number.",
  },
  "salary.annual": {
    hint: "Per year, before tax.",
    help: "Your starting base salary from the offer letter. Raises and promotions are separate inputs, under Pay in detailed mode. "
      + "Pay accrues by calendar month, so a July start earns about half of it in its first calendar year.",
  },
  startDate: {
    hint: "Your first day of work.",
    help: "We compare every offer from the earliest start date, so a later start counts as pay you don't get yet. Tax data starts "
      + "in 2026, so the date must be in 2026 or later. A date before today means present values count pay already received.",
  },
  "bonus.amount": {
    hint: "Target bonus; the first one is prorated.",
    help: "The target from your offer, as a % of salary or dollars a year; leave it blank for none. It's paid once a year for the "
      + "year before, so a July start gets a partial first bonus the next spring. Its timing is under Bonus in detailed mode.",
  },
  "costOfLiving.area": {
    hint: "Where you'd live, not the office.",
    help: "We tax you as a resident of this state (and New York City, if you say so) and price your spending with this metro's "
      + "price level (BEA Regional Price Parities). If you'd commute across a state line, pick where you'd live.",
  },
  "costOfLiving.monthlyRent": {
    hint: "What you'd pay there.",
    help: "If you leave it blank we use HUD's Fair Market Rent: what recent movers pay for a typical 1-bedroom across the metro "
      + "(the 40th percentile, utilities included). City-center rents usually run higher, so enter yours if you know it.",
  },
  "about.filing": {
    hint: "How you'd file your federal return.",
    help: "It sets the tax brackets and the standard deduction for every offer. Single is the default: most new grads file single. "
      + "Married filing jointly adds your spouse's wages, if any.",
  },
  "about.stay": {
    hint: "Sets how many years we compare.",
    help: "We compare every offer over the same stretch, starting on the earliest start date. Pay after that isn't counted. The row "
      + "under the verdict shows whether the winner changes if you stay 2, 3, 4 or 5 years.",
  },
  "about.wages": {
    hint: "An internship or the job you're leaving.",
    help: "Pay you earn in the year the earliest offer starts, before the new job begins. It's taxed in the same year, so it changes "
      + "the new job's first-year tax. Leave it at $0 if there's none.",
  },
};

/** Every input's help. A detailed field's hint and help are empty until detailed mode's text arrives (addHelpText). */
export const HELP: Record<string, FieldHelp> = Object.fromEntries(Object.entries(META).map(([k, m]) => [k, { ...m, ...(QUICK_TEXT[k] ?? { hint: "", help: "" }) }]));

/** Fills in detailed mode's text (helpText.ts, loaded with detailed mode). */
export function addHelpText(text: Record<string, FieldText>): void {
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
  { id: "hours", title: "Hours", holds: "per week, weeks a year" },
  { id: "where", title: "Where you'd live", holds: "city, rent, employer state" },
];
