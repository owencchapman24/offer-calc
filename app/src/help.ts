import type { SectionId } from "./sections";
import type { LedgerSection } from "./session";

// Help on every input (docs/ui-design.md §3.5), keyed by input path: the draft's path with array
// indexes left out ("equity.grants.0.value" -> "equity.grants.value"). Each has three layers: a hint
// of 12 words or fewer, always visible; 2-4 sentences behind the ⓘ (what it means, an example, what
// its default does); and "How this is used →", a link to the methodology. A test renders every input
// and fails if one lacks any of them.

export interface FieldHelp {
  /** The row's label. */
  label: string;
  /** Always visible: 12 words or fewer. */
  hint: string;
  /** Behind the ⓘ: two to four sentences. */
  help: string;
  /** "How this is used →". */
  section: SectionId;
  /** Where the field is in detailed mode. */
  group: LedgerSection | "about" | "head";
  /** The row whose editor holds it, for fields inside a row editor. */
  editor?: string;
}

/** An input path's help key: the path without its array indexes. */
export const helpKey = (path: string) => path.split(".").filter((k) => !/^\d+$/.test(k)).join(".");

/** An input's name out of context ("Promotions, date"): a field inside an editor is named with its editor. */
export function fieldName(path: string): string {
  const key = helpKey(path);
  const h = HELP[key];
  if (!h) return "Input";
  return h.editor && h.editor !== key && HELP[h.editor] ? `${HELP[h.editor].label}, ${h.label.toLowerCase()}` : h.label;
}

const tranches = (owner: string, editor: string): Record<string, FieldHelp> => ({
  [`${owner}.schedule.tranches.month`]: {
    label: "Month", hint: "Months after the vesting start.", section: "M-3", group: "equity", editor,
    help: "When this tranche vests, in whole months after the vesting start: month 12 is the first anniversary. A company vest "
      + "calendar can move it later. Tranches can be in any order.",
  },
  [`${owner}.schedule.tranches.fraction`]: {
    label: "Vests", hint: "This tranche's share of the grant.", section: "M-3", group: "equity", editor,
    help: "The percent of the grant that vests at that month. All the tranches must add up to 100%: for thirds, enter 33.33, 33.33 "
      + "and 33.34. If they're a little off, the editor offers to fix the last one.",
  },
  [`${owner}.schedule.vestDates`]: {
    label: "Company vest dates", hint: "Vests move to the firm's next vest date.", section: "M-3", group: "equity", editor,
    help: "Many firms vest on fixed dates, say February, May, August and November 15. Each tranche then moves to the next of those "
      + "dates, sometimes into the next employment year. None is the default: tranches vest on the schedule's own dates.",
  },
});

export const HELP: Record<string, FieldHelp> = {
  // ---- the offer's name and quick mode's fields ----
  label: {
    label: "Name", hint: "Your own name for each offer.", section: "M-1", group: "head",
    help: "A short name you'll recognize, such as the firm or the city. It appears beside the offer's letter in the bridge and the "
      + "methodology. It doesn't change any number.",
  },
  "salary.annual": {
    label: "Salary", hint: "Per year, before tax.", section: "M-2", group: "pay",
    help: "Your starting base salary from the offer letter. Raises and promotions are separate inputs, under Pay in detailed mode. "
      + "Pay accrues by calendar month, so a July start earns about half of it in its first calendar year.",
  },
  startDate: {
    label: "Start date", hint: "Your first day of work.", section: "M-7.3", group: "pay",
    help: "We compare every offer from the earliest start date, so a later start counts as pay you don't get yet. Tax data starts "
      + "in 2026, so the date must be in 2026 or later. A date before today means present values count pay already received.",
  },
  "bonus.amount": {
    label: "Bonus", hint: "Target bonus; the first one is prorated.", section: "M-2", group: "bonus",
    help: "The target from your offer, as a % of salary or dollars a year; leave it blank for none. It's paid once a year for the "
      + "year before, so a July start gets a partial first bonus the next spring. Its timing is under Bonus in detailed mode.",
  },
  "costOfLiving.area": {
    label: "City", hint: "Where you'd live, not the office.", section: "M-6.1", group: "where",
    help: "We tax you as a resident of this state (and New York City, if you say so) and price your spending with this metro's "
      + "price level (BEA Regional Price Parities). If you'd commute across a state line, pick where you'd live.",
  },
  "costOfLiving.monthlyRent": {
    label: "Rent a month", hint: "What you'd pay there.", section: "M-6.2", group: "where",
    help: "If you leave it blank we use HUD's Fair Market Rent: what recent movers pay for a typical 1-bedroom across the metro "
      + "(the 40th percentile, utilities included). City-center rents usually run higher, so enter yours if you know it.",
  },

  // ---- pay ----
  "salary.raise": {
    label: "Merit raise", hint: "A yearly raise, as a percent; 0% unless you know.", section: "M-2", group: "pay",
    help: "Your expected yearly merit raise, such as 3%. Raises compound, and they're separate from inflation, which moves only tax "
      + "law and rent. It's 0% by default because raises are uncertain; add a range for a bear and a bull case.",
  },
  "salary.raiseOn": {
    label: "Raises take effect", hint: "Each work anniversary, or each January 1.", section: "M-2", group: "pay",
    help: "When a merit raise starts: on each anniversary of your start date (the default), or each January 1 after you start, as "
      + "at firms with one review cycle. A January raise reaches a July start after six months instead of twelve.",
  },
  "salary.promotions": {
    label: "Promotions", hint: "A date and a step-up, like analyst to associate.", section: "M-2", group: "pay", editor: "salary.promotions",
    help: "Each promotion raises your salary by a percent on its date: for example 35% after three years. Merit raises then "
      + "compound from the new salary. A promotion that isn't certain can count in some scenarios only.",
  },
  "salary.promotions.on": {
    label: "Date", hint: "The day the new salary starts.", section: "M-2", group: "pay", editor: "salary.promotions",
    help: "The promotion's first day at the new pay. It must be after your start date. Promotions often land on an anniversary or "
      + "on a firm-wide date.",
  },
  "salary.promotions.stepUp": {
    label: "Step-up", hint: "The raise at promotion, as a percent.", section: "M-2", group: "pay", editor: "salary.promotions",
    help: "How much the promotion raises your salary: for example 35% from analyst to associate. It multiplies the salary on that "
      + "date, raises included.",
  },
  "salary.promotions.scenarios": {
    label: "Counts in", hint: "Scenarios that include it; all three by default.", section: "M-8", group: "pay", editor: "salary.promotions",
    help: "Untick bear if the promotion isn't certain: the bear case then leaves it out. The verdict uses the base case. By default "
      + "a promotion counts in all three scenarios.",
  },

  // ---- bonus ----
  "bonus.basis": {
    label: "Basis", hint: "% of salary, dollars a year, or dollars by year.", section: "M-2", group: "bonus",
    help: "How your offer states the bonus: a percent of salary (the default, the usual quote), a dollar amount, or dollars that "
      + "change by employment year. A percent applies to the salary earned in the bonus year, so it picks up raises. Dollar amounts "
      + "are prorated by days worked.",
  },
  "bonus.amounts": {
    label: "Bonus by year", hint: "Dollars for each employment year; the last repeats.", section: "M-2", group: "bonus", editor: "bonus.amounts",
    help: "For bonuses that grow with seniority, as for banking analysts. Each payout uses the employment year its bonus year ends "
      + "in, prorated by days worked. After the last year you enter, its amount repeats.",
  },
  "bonus.payOn": {
    label: "Payout date", hint: "When each year's bonus is paid.", section: "M-2", group: "bonus",
    help: "The date each year's bonus is paid, for the bonus year just ended. March 15 is the default: the most common date. A later "
      + "payout is worth a little less today, and your first one waits until then.",
  },
  "bonus.periodStart": {
    label: "Bonus year starts", hint: "The first day of each bonus year.", section: "M-2", group: "bonus",
    help: "Most bonus years are the calendar year, starting January 1 (the default). Some firms run a fiscal year, say from July 1. "
      + "Your first bonus covers the part of that year you work.",
  },
  "bonus.cutoff": {
    label: "Cutoff", hint: "Start on or after it, and that year pays nothing.", section: "M-2", group: "bonus",
    help: "Some firms pay no bonus for a year if you start late in it, say on or after October 1. Your first bonus is then a year "
      + "later. None is the default: the first bonus is prorated, however late you start.",
  },
  "bonus.firstPayoutGuaranteed": {
    label: "First payout guaranteed", hint: "The first bonus pays the target in every scenario.", section: "M-8", group: "bonus",
    help: "Some offers guarantee the first bonus at target, so the bear case can't cut it, only later ones. No is the default. It "
      + "changes the bear and bull cases, not the verdict, which is the base case.",
  },
  "bonus.mustBeEmployedOnPayDate": {
    label: "Must be employed on the pay date", hint: "Leave before payout and you lose that bonus.", section: "M-9", group: "bonus",
    help: "Most firms pay a bonus only if you still work there on the payout date: yes, the default. If yours prorates the bonus "
      + "when you leave, choose no. It matters if you leave early; the comparison over your stay assumes you stay.",
  },

  // ---- equity ----
  "equity.grants": {
    label: "RSU grants", hint: "Stock units: the value at grant and the vesting.", section: "M-3", group: "equity", editor: "equity.grants",
    help: "Enter each grant at its dollar value on the grant date, as the offer quotes it. Each tranche counts as pay the day it "
      + "vests, taxed as wages, and we assume you sell then. Options and private-company equity count as $0 for now.",
  },
  "equity.grants.label": {
    label: "Name", hint: "What you call this grant.", section: "M-3", group: "equity", editor: "equity.grants",
    help: "A label for the grant, such as New-hire RSUs. It names the grant's vests in Show the work. It doesn't change any number.",
  },
  "equity.grants.value": {
    label: "Value at grant", hint: "Dollars, as quoted (shares × grant price).", section: "M-3", group: "equity", editor: "equity.grants",
    help: "The grant's value on its grant date, as the offer letter quotes it. If you have a share count, multiply it by the grant "
      + "price. Share-price growth, if you enter it, applies from the grant date.",
  },
  "equity.grants.grantDate": {
    label: "Grant date", hint: "Starts the share-price growth clock.", section: "M-3", group: "equity", editor: "equity.grants",
    help: "When the grant is made; it matters only for share-price growth. Your start date is the default, as for most new-hire "
      + "grants.",
  },
  "equity.grants.vestStart": {
    label: "Vesting start", hint: "Tranche months count from this date.", section: "M-3", group: "equity", editor: "equity.grants",
    help: "The date the vesting schedule counts from. Your start date is the default. Some firms start the clock on the first day "
      + "of a month or a quarter after you join.",
  },
  "equity.grants.schedule": {
    label: "Vesting", hint: "How much vests when: a preset or your own.", section: "M-3", group: "equity", editor: "equity.grants",
    help: "Pick the schedule from your offer, or enter your own tranches by month. The default is 25% a year, quarterly after a "
      + "1-year cliff, the most common. Your own tranches must add up to 100%.",
  },
  ...tranches("equity.grants", "equity.grants"),
  "equity.priceGrowth": {
    label: "Share-price growth", hint: "The yearly change in the share price; 0% by default.", section: "M-3", group: "equity",
    help: "How much you expect the share price to rise or fall each year, from each grant date to its vests. It's 0% by default "
      + "because no one knows; add a range for a bear and a bull case. Shares are sold at vest, so later moves don't count.",
  },
  "equity.refreshers": {
    label: "Refreshers", hint: "Top-up grants while you stay; none unless promised.", section: "M-3", group: "equity", editor: "equity.refreshers",
    help: "Some firms add a refresher grant each year once you've been there a while. Enter its value and timing if your offer or "
      + "recruiter gives them; it's none by default because it isn't promised. Each refresher vests on its own schedule from its "
      + "own grant date.",
  },
  "equity.refreshers.value": {
    label: "Value", hint: "Dollars per refresher grant.", section: "M-3", group: "equity", editor: "equity.refreshers",
    help: "The value of each refresher at its grant date. Add a range if it depends on performance: the bear case uses the low end.",
  },
  "equity.refreshers.firstAfterMonths": {
    label: "First after", hint: "Months from your start to the first refresher.", section: "M-3", group: "equity",
    editor: "equity.refreshers",
    help: "When the first refresher is granted, in months after your start date. 12 is the default: after your first year. Each "
      + "later one follows at the interval below.",
  },
  "equity.refreshers.everyMonths": {
    label: "Every", hint: "Months between refresher grants.", section: "M-3", group: "equity", editor: "equity.refreshers",
    help: "How often a refresher is granted. 12 is the default: once a year. Only the tranches that vest during your stay count.",
  },
  "equity.refreshers.schedule": {
    label: "Vesting", hint: "How each refresher vests: a preset or your own.", section: "M-3", group: "equity", editor: "equity.refreshers",
    help: "Each refresher vests on this schedule from its own grant date. The default is 25% a year, quarterly after a 1-year cliff. "
      + "Your own tranches must add up to 100%.",
  },
  ...tranches("equity.refreshers", "equity.refreshers"),

  // ---- hours ----
  "hours.weekly": {
    label: "Weekly hours", hint: "Hours you expect to work; blank isn't counted.", section: "M-5.4", group: "hours",
    help: "Enter the hours you expect, such as 50, or 80 in banking; add a range if they vary. Left blank, hours aren't counted, and "
      + "per-hour figures appear only when every offer has hours. We don't guess one: 40 and 80 are both common.",
  },
  "hours.weeksPerYear": {
    label: "Weeks a year", hint: "Weeks worked; 50 allows two weeks off.", section: "M-5.4", group: "hours",
    help: "The weeks you work in a year, after vacation and holidays. 50 is the default: two weeks off. It multiplies weekly hours.",
  },

  // ---- about you ----
  "about.filing": {
    label: "Filing status", hint: "How you'd file your federal return.", section: "M-4", group: "about",
    help: "It sets the tax brackets and the standard deduction for every offer. Single is the default: most new grads file single. "
      + "Married filing jointly adds your spouse's wages, if any.",
  },
  "about.stay": {
    label: "How long do you expect to stay?", hint: "Sets how many years we compare.", section: "M-7.3", group: "about",
    help: "We compare every offer over the same stretch, starting on the earliest start date. Pay after that isn't counted. The row "
      + "under the verdict shows whether the winner changes if you stay 2, 3, 4 or 5 years.",
  },
  "about.wages": {
    label: "Other wages", hint: "An internship or the job you're leaving.", section: "M-4", group: "about",
    help: "Pay you earn in the year the earliest offer starts, before the new job begins. It's taxed in the same year, so it changes "
      + "the new job's first-year tax. Leave it at $0 if there's none.",
  },
};

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
