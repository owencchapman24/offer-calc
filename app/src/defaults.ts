import { describeSchedule } from "../../src/format/schedule";
import { ASSUMPTIONS, getPath, type OfferDraft } from "./model";
import { DEFAULT_PRESET, PRESETS } from "./presets";
import { helpKey } from "./help";
import { longDate, percent } from "./text";

// Defaults (docs/ui-design.md §3.6): a default is a real, visible, editable value with a D tickmark
// that says why. In a draft, null means "at its default"; this registry gives each default's value in
// words and its reason. It drives the D tickmarks, their derivations and "Reset to default" (which
// sets the field back to null), so they can't disagree. The values the engine gets for a null field
// are in model.ts (toOfferInput); a test checks the two match.

export interface DefaultSpec {
  /** The value a field shows at its default, in the draft's units (a fraction for a percent); absent where it depends on the offer. */
  value?: unknown;
  /** The default as the field shows it, for this offer: "Mar 15", "Your start date (Jul 13, 2027)". */
  shown: (d: OfferDraft) => string;
  /** Why it's the default. */
  reason: string;
  /** Other fields "Reset to default" clears with it (a bonus's amount goes with its basis). */
  alsoClear?: Record<string, unknown>;
}

const startDate = (d: OfferDraft) => (d.startDate ? `Your start date, ${longDate(d.startDate)}` : "Your start date");
const DEFAULT_SCHEDULE = describeSchedule(PRESETS[DEFAULT_PRESET]);
const schedule = (what: string): DefaultSpec => ({
  shown: () => DEFAULT_SCHEDULE,
  reason: `The most common ${what} schedule: 25% a year, the first 25% after a year (the cliff), then a slice every quarter.`,
});
const noVestDates: DefaultSpec = {
  value: null, shown: () => "None: on the schedule's dates", reason: "Each tranche vests on the date its schedule names, unless your firm vests on fixed dates.",
};

export const DEFAULTS: Record<string, DefaultSpec> = {
  "salary.raise": { value: 0, shown: () => "0%", reason: "Raises are uncertain, so they count as zero until you say otherwise. A range sets a bear and a bull case." },
  "salary.raiseOn": { value: "anniversary", shown: () => "Each work anniversary", reason: "Most merit raises come once a year, on or near the anniversary of your start." },
  "salary.promotions.scenarios": {
    value: ["bear", "base", "bull"], shown: () => "Bear, base and bull", reason: "A promotion you enter counts in every scenario unless you say it isn't certain.",
  },
  "bonus.basis": {
    value: "percentOfSalary", shown: () => "% of salary", reason: "The usual way an offer quotes a bonus: a target percent of salary.",
    alsoClear: { "bonus.amount": null, "bonus.amounts": [] },
  },
  "bonus.payOn": { value: { month: 3, day: 15 }, shown: () => "Mar 15", reason: "The most common payout date: each March, for the year before." },
  "bonus.periodStart": { value: { month: 1, day: 1 }, shown: () => "Jan 1", reason: "Most bonus years are the calendar year." },
  "bonus.cutoff": { value: null, shown: () => "None", reason: "With no cutoff, the first bonus is prorated for the part of the year you work, however late you start." },
  "bonus.firstPayoutGuaranteed": { value: false, shown: () => "No", reason: "Most offers don't guarantee the first bonus." },
  "bonus.mustBeEmployedOnPayDate": {
    value: true, shown: () => "Yes", reason: "The usual rule: a bonus is paid only to people who still work there on the payout date.",
  },
  "equity.grants.grantDate": { shown: startDate, reason: "New-hire grants are usually made on your start date." },
  "equity.grants.vestStart": { shown: startDate, reason: "Vesting usually counts from your start date." },
  "equity.grants.schedule": schedule("RSU"),
  "equity.grants.schedule.vestDates": noVestDates,
  "equity.priceGrowth": { value: 0, shown: () => "0%", reason: "No one knows a share price's path, so it counts as flat until you say otherwise." },
  "equity.refreshers": { value: null, shown: () => "None", reason: "Refreshers aren't promised in an offer, so none count until you enter them." },
  "equity.refreshers.firstAfterMonths": { value: 12, shown: () => "12 months", reason: "Refreshers usually start after your first year." },
  "equity.refreshers.everyMonths": { value: 12, shown: () => "12 months", reason: "Refreshers usually come once a year." },
  "equity.refreshers.schedule": schedule("refresher"),
  "equity.refreshers.schedule.vestDates": noVestDates,
  "cashAwards.paidOn": { shown: () => "30 days after you start", reason: "Sign-ons usually come with the first paycheck or two." },
  "cashAwards.clawback.months": { value: 12, shown: () => "12 months", reason: "The most common sign-on clawback window." },
  "cashAwards.clawback.kind": { value: "prorated", shown: () => "Prorated", reason: "Many sign-on clawbacks owe back only the share of the window you didn't work." },
  "cashAwards.clawback.per": { value: "month", shown: () => "Completed months", reason: "Prorating by completed months is the usual contract term." },
  "cashAwards.clawback.from": { value: "start", shown: () => "Your start date", reason: "The window usually runs from your start date." },
  "cashAwards.clawback.repay": {
    value: "gross", shown: () => "Gross", reason: "The usual contract term: you repay the full amount, though you received it after withholding.",
  },
  "retirement.contributionPct": {
    value: 0, shown: () => "0%", reason: "Zero until you say what you'd put in: this tool doesn't advise how much to save. The note under it says what the full match needs.",
  },
  "retirement.type": { value: "pretax", shown: () => "Pre-tax", reason: "Most plans start you on pre-tax deferrals; Roth is a choice you make." },
  "retirement.eligiblePay": { value: "salary", shown: () => "Salary", reason: "Most plans count base salary; some count bonuses too." },
  "retirement.nonElectivePct": { value: 0, shown: () => "0%", reason: "Most plans add money only as a match on what you defer." },
  "retirement.vesting": {
    shown: () => "Immediate", reason: "Many plans vest immediately; check your plan's summary for a cliff or a graded schedule.",
  },
  "retirement.vestingService": { value: "elapsedTime", shown: () => "Years worked", reason: "The usual way: each year worked counts." },
  "health.employeeHsa": { value: 0, shown: () => "$0", reason: "Zero until you choose to put money in an HSA." },
  "health.employerHsa": { value: 0, shown: () => "$0", reason: "Zero unless the plan puts money in your HSA: enter it if it does." },
  "health.coverage": { value: "self", shown: () => "Self", reason: "Coverage for you alone; family coverage has a higher HSA limit." },
  "perks.section127": { value: 0, shown: () => "$0", reason: "Zero unless the offer includes education assistance." },
  "perks.commuterMonthly": { value: 0, shown: () => "$0", reason: "Zero unless the offer includes commuter benefits." },
  employerState: {
    shown: (d) => `Where you'd live${d.residence.state ? ` (${d.residence.state})` : ""}`,
    reason: "Most people work for an employer in the state they live in. Change it if the employer is elsewhere: some states tax remote workers.",
  },
  "costOfLiving.rentGrowth": {
    value: ASSUMPTIONS.inflation, shown: () => `${percent(ASSUMPTIONS.inflation)} (inflation)`, reason: "Rent rises with inflation unless you know your city's rents rise faster or slower.",
  },
};

/**
 * Defaults that only detailed mode and the derivations read, registered when they load (detailedDefaults.ts), as helpText.ts adds
 * detailed mode's help: v2's items keep the main thread lean (at most 0.5 kB gzip each).
 */
export function addDefaults(more: Record<string, DefaultSpec>): void {
  Object.assign(DEFAULTS, more);
}

/** The default for an input path, if it has one. */
export const defaultFor = (path: string): DefaultSpec | undefined => DEFAULTS[helpKey(path)];

/** At its default: the draft holds null there and the path has a default. */
export function isDefault(d: OfferDraft, path: string): boolean {
  const key = path.endsWith(".schedule") ? `${path}.tranches` : path;
  return !!defaultFor(path) && getPath(d, key) === null;
}
