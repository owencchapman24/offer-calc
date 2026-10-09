import { addHelpText, type FieldText } from "./help";

// Detailed mode's help text (docs/ui-design.md §3.5): the hint and the ⓘ help for each detailed input,
// keyed like help.ts. It loads with detailed mode and fills in help.ts's registry, so quick-mode
// visitors don't download it.

const tranches = (owner: string): Record<string, FieldText> => ({
  [`${owner}.schedule.tranches.month`]: {
    hint: "Months after the vesting start.",
    help: "When this tranche vests, in whole months after the vesting start: month 12 is the first anniversary. A company vest "
      + "calendar can move it later. Tranches can be in any order.",
  },
  [`${owner}.schedule.tranches.fraction`]: {
    hint: "This tranche's share of the grant.",
    help: "The percent of the grant that vests at that month. All the tranches must add up to 100%: for thirds, enter 33.33, 33.33 "
      + "and 33.34. If they're a little off, the editor offers to fix the last one.",
  },
  [`${owner}.schedule.vestDates`]: {
    hint: "Vests move to the firm's next vest date.",
    help: "Many firms vest on fixed dates, say February, May, August and November 15. Each tranche then moves to the next of those "
      + "dates, sometimes into the next employment year. None is the default: tranches vest on the schedule's own dates.",
  },
});

export const DETAILED_TEXT: Record<string, FieldText> = {
  "salary.raise": {
    hint: "A yearly raise, as a percent; 0% unless you know.",
    help: "Your expected yearly merit raise, such as 3%. Raises compound, and they're separate from inflation, which moves only tax "
      + "law and rent. It's 0% by default because raises are uncertain; add a range for a bear and a bull case.",
  },
  "salary.raiseOn": {
    hint: "Each work anniversary, or each January 1.",
    help: "When a merit raise starts: on each anniversary of your start date (the default), or each January 1 after you start, as "
      + "at firms with one review cycle. A January raise reaches a July start after six months instead of twelve.",
  },
  "salary.promotions": {
    hint: "A date and a step-up, like analyst to associate.",
    help: "Each promotion raises your salary by a percent on its date: for example 35% after three years. Merit raises then "
      + "compound from the new salary. A promotion that isn't certain can count in some scenarios only.",
  },
  "salary.promotions.on": {
    hint: "The day the new salary starts.",
    help: "The promotion's first day at the new pay. It must be after your start date. Promotions often land on an anniversary or "
      + "on a firm-wide date.",
  },
  "salary.promotions.stepUp": {
    hint: "The raise at promotion, as a percent.",
    help: "How much the promotion raises your salary: for example 35% from analyst to associate. It multiplies the salary on that "
      + "date, raises included.",
  },
  "salary.promotions.scenarios": {
    hint: "Scenarios that include it; all three by default.",
    help: "Untick bear if the promotion isn't certain: the bear case then leaves it out. The verdict uses the base case. By default "
      + "a promotion counts in all three scenarios.",
  },
  "bonus.basis": {
    hint: "% of salary, dollars a year, or dollars by year.",
    help: "How your offer states the bonus: a percent of salary (the default, the usual quote), a dollar amount, or dollars that "
      + "change by employment year. A percent applies to the salary earned in the bonus year, so it picks up raises. Dollar amounts "
      + "are prorated by days worked.",
  },
  "bonus.amounts": {
    hint: "Dollars for each employment year; the last repeats.",
    help: "For bonuses that grow with seniority, as for banking analysts. Each payout uses the employment year its bonus year ends "
      + "in, prorated by days worked. After the last year you enter, its amount repeats.",
  },
  "bonus.payOn": {
    hint: "When each year's bonus is paid.",
    help: "The date each year's bonus is paid, for the bonus year just ended. March 15 is the default: the most common date. A later "
      + "payout is worth a little less today, and your first one waits until then.",
  },
  "bonus.periodStart": {
    hint: "The first day of each bonus year.",
    help: "Most bonus years are the calendar year, starting January 1 (the default). Some firms run a fiscal year, say from July 1. "
      + "Your first bonus covers the part of that year you work.",
  },
  "bonus.cutoff": {
    hint: "Start on or after it, and that year pays nothing.",
    help: "Some firms pay no bonus for a year if you start late in it, say on or after October 1. Your first bonus is then a year "
      + "later. None is the default: the first bonus is prorated, however late you start.",
  },
  "bonus.firstPayoutGuaranteed": {
    hint: "The first bonus pays the target in every scenario.",
    help: "Some offers guarantee the first bonus at target, so the bear case can't cut it, only later ones. No is the default. It "
      + "changes the bear and bull cases, not the verdict, which is the base case.",
  },
  "bonus.mustBeEmployedOnPayDate": {
    hint: "Leave before payout and you lose that bonus.",
    help: "Most firms pay a bonus only if you still work there on the payout date: yes, the default. If yours prorates the bonus "
      + "when you leave, choose no. It matters if you leave early; the comparison over your stay assumes you stay.",
  },
  "equity.grants": {
    hint: "Stock units: the value at grant and the vesting.",
    help: "Enter each grant at its dollar value on the grant date, as the offer quotes it. Each tranche counts as pay the day it "
      + "vests, taxed as wages, and we assume you sell then. Options and private-company equity count as $0 for now.",
  },
  "equity.grants.label": {
    hint: "What you call this grant.",
    help: "A label for the grant, such as New-hire RSUs. It names the grant's vests in Show the work. It doesn't change any number.",
  },
  "equity.grants.value": {
    hint: "Dollars, as quoted (shares × grant price).",
    help: "The grant's value on its grant date, as the offer letter quotes it. If you have a share count, multiply it by the grant "
      + "price. Share-price growth, if you enter it, applies from the grant date.",
  },
  "equity.grants.grantDate": {
    hint: "Starts the share-price growth clock.",
    help: "When the grant is made; it matters only for share-price growth. Your start date is the default, as for most new-hire "
      + "grants.",
  },
  "equity.grants.vestStart": {
    hint: "Tranche months count from this date.",
    help: "The date the vesting schedule counts from. Your start date is the default. Some firms start the clock on the first day "
      + "of a month or a quarter after you join.",
  },
  "equity.grants.schedule": {
    hint: "How much vests when: a preset or your own.",
    help: "Pick the schedule from your offer, or enter your own tranches by month. The default is 25% a year, quarterly after a "
      + "1-year cliff, the most common. Your own tranches must add up to 100%.",
  },
  "equity.priceGrowth": {
    hint: "The yearly change in the share price; 0% by default.",
    help: "How much you expect the share price to rise or fall each year, from each grant date to its vests. It's 0% by default "
      + "because no one knows; add a range for a bear and a bull case. Shares are sold at vest, so later moves don't count.",
  },
  "equity.refreshers": {
    hint: "Top-up grants while you stay; none unless promised.",
    help: "Some firms add a refresher grant each year once you've been there a while. Enter its value and timing if your offer or "
      + "recruiter gives them; it's none by default because it isn't promised. Each refresher vests on its own schedule from its "
      + "own grant date.",
  },
  "equity.refreshers.value": {
    hint: "Dollars per refresher grant.",
    help: "The value of each refresher at its grant date. Add a range if it depends on performance: the bear case uses the low end.",
  },
  "equity.refreshers.firstAfterMonths": {
    hint: "Months from your start to the first refresher.",
    help: "When the first refresher is granted, in months after your start date. 12 is the default: after your first year. Each "
      + "later one follows at the interval below.",
  },
  "equity.refreshers.everyMonths": {
    hint: "Months between refresher grants.",
    help: "How often a refresher is granted. 12 is the default: once a year. Only the tranches that vest during your stay count.",
  },
  "equity.refreshers.schedule": {
    hint: "How each refresher vests: a preset or your own.",
    help: "Each refresher vests on this schedule from its own grant date. The default is 25% a year, quarterly after a 1-year cliff. "
      + "Your own tranches must add up to 100%.",
  },
  "hours.weekly": {
    hint: "Hours you expect to work; blank isn't counted.",
    help: "Enter the hours you expect, such as 50, or 80 in banking; add a range if they vary. Left blank, hours aren't counted, and "
      + "per-hour figures appear only when every offer has hours. We don't guess one: 40 and 80 are both common.",
  },
  "hours.weeksPerYear": {
    hint: "Weeks worked; 50 allows two weeks off.",
    help: "The weeks you work in a year, after vacation and holidays. 50 is the default: two weeks off. It multiplies weekly hours.",
  },
  ...tranches("equity.grants"),
  ...tranches("equity.refreshers"),
};

addHelpText(DETAILED_TEXT);
