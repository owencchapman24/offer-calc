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
    help: "Some offers guarantee the first bonus at target, so the bear case can't cut it, only later ones; starting after the "
      + "cutoff, that's the first one actually paid. No is the default. It changes the bear and bull cases, not the verdict, which is "
      + "the base case.",
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
  "timeOff.vacation": {
    hint: "Workdays of vacation you'd actually take.",
    help: "The vacation days you expect to take each year, in workdays. With weekly hours, weeks worked = 52 − (vacation + holidays + "
      + "sick days) ÷ 5. The default, 11, is BLS's average after a year's service. With an unlimited policy, enter what you'd expect to take.",
  },
  "timeOff.holidays": {
    hint: "Paid holidays a year, in workdays.",
    help: "The paid holidays the offer lists, such as New Year's Day and Thanksgiving. The default, 8, is BLS's average for private "
      + "industry. Holidays only change the weeks you work.",
  },
  "timeOff.sick": {
    hint: "Sick days you expect to take; none by default.",
    help: "The sick days you'd expect to take in a year: they lower the weeks you work, so per hour rises. None count by default, since "
      + "how many you take is personal. Sick leave isn't paid out when you leave; one bank for vacation and sickness (PTO) goes in "
      + "vacation, with sick days at 0.",
  },
  "timeOff.policy": {
    hint: "A number of days a year, or unlimited.",
    help: "Most offers give a number of vacation days a year, which build up as you work. Unlimited means no set number: nothing builds "
      + "up, so nothing is paid when you leave. In California, a policy that's unlimited in name but capped in practice has owed a "
      + "payout (McPherson, a 2020 appeals case): if yours caps what you can take, enter it as days a year.",
  },
  "timeOff.gives": {
    hint: "The days it gives; extra days you don't take bank.",
    help: "The vacation days the offer gives each year. Days you don't take bank, evenly through the year, and leaving pays them out "
      + "where that's required. The default is the days you'd take, so nothing banks. Example: it gives 15 and you take 11, so 4 bank "
      + "a year.",
  },
  "timeOff.cap": {
    hint: "The most banked days the policy allows; blank: none.",
    help: "Many policies stop days banking once you have a set number, often one or two years' worth. Blank means no cap. It matters "
      + "only when the offer gives more days than you'd take.",
  },
  "timeOff.payout": {
    hint: "Paid out where the state requires it, or always.",
    help: "California, Colorado, Illinois, Louisiana, Maine, Massachusetts, Montana, Nebraska, North Dakota and Rhode Island (after a "
      + "year) require unused vacation to be paid when you leave; the state is the employer's. Elsewhere it's the employer's policy: "
      + "pick Always if the offer's pays it. It's paid at your salary on the last day ÷ 260 a day, taxed as wages.",
  },
  ...tranches("equity.grants"),
  ...tranches("equity.refreshers"),

  // ---- sign-on and other cash ----
  cashAwards: {
    hint: "Sign-on, relocation or a later bonus: cash on a date.",
    help: "Each payment counts on the day it's paid, taxed as wages. Add one for each payment: a sign-on paid in two installments is "
      + "two. A clawback says what you'd owe back if you left early.",
  },
  "cashAwards.label": {
    hint: "What you call this payment.",
    help: "A label, such as Sign-on or Relocation. It names the payment in Show the work. It doesn't change any number.",
  },
  "cashAwards.amount": {
    hint: "Dollars, before tax.",
    help: "The payment as the offer states it, before withholding. It's taxed as wages in the calendar year it's paid. Enter "
      + "installments as separate payments.",
  },
  "cashAwards.paidOn": {
    hint: "Days after you start, or a date.",
    help: "When the payment lands. 30 days after your start date is the default: sign-ons usually come with the first paycheck or "
      + "two. A date before your start, such as relocation paid before day one, counts with your first year, taxed in the year it's "
      + "paid. Dates before 2026 aren't supported.",
  },
  "cashAwards.clawback": {
    hint: "What you'd owe back if you left early.",
    help: "Many sign-ons must be repaid, in full or in part, if you leave within a window, often 12 months. None is the default. "
      + "The comparison over your stay assumes you stay; a clawback matters if you leave early.",
  },
  "cashAwards.clawback.months": {
    hint: "Months you must stay to keep it all.",
    help: "You're clear once you've worked through the day before the window ends. 12 months is the default, the most common "
      + "window. It's a whole number of months, at least 1.",
  },
  "cashAwards.clawback.kind": {
    hint: "All of it, or the unworked share.",
    help: "Full: leave inside the window and you owe it all back. Prorated, the default: you owe the share of the window you "
      + "didn't work. Your contract says which.",
  },
  "cashAwards.clawback.per": {
    hint: "By completed months, or by days.",
    help: "By completed months is the default: leaving after 6 of 12 months owes half. By day shrinks what you'd owe every day "
      + "instead.",
  },
  "cashAwards.clawback.from": {
    hint: "Your start date, or the day it's paid.",
    help: "The window usually runs from your start date, the default. For a later installment, it may run from the payment date "
      + "instead.",
  },
  "cashAwards.clawback.repay": {
    hint: "The full amount, or what you received.",
    help: "Gross is the default and the usual contract term: you repay the full amount, though you received it after withholding. "
      + "Some contracts ask only for what you received after tax.",
  },

  // ---- 401(k) ----
  retirement: {
    hint: "Add it to count your deferrals and the match.",
    help: "Enter the plan if the offer has one, or say there's none. Your own deferrals stay your money; the employer's money "
      + "counts once it's vested. Left as not entered, it isn't counted at all.",
  },
  "retirement.contributionPct": {
    hint: "What you'd put in, as a % of pay.",
    help: "Your deferral as a percent of the pay that counts, capped each year at the federal limit. It's 0% by default: this tool "
      + "doesn't advise how much to save. The note under it says what the full match needs.",
  },
  "retirement.type": {
    hint: "Pre-tax lowers income tax now; Roth doesn't.",
    help: "Pre-tax deferrals, the default, lower your income tax this year but not Social Security and Medicare. Roth deferrals "
      + "come out after tax. Tax on withdrawal and investment growth aren't modeled either way.",
  },
  "retirement.eligiblePay": {
    hint: "Salary only, or salary and bonus.",
    help: "The pay your deferral and the match apply to. Most plans count base salary, the default; some count bonuses too. Your "
      + "plan summary says which.",
  },
  "retirement.match": {
    hint: "The employer's match on what you defer.",
    help: "Enter each tier as a rate on deferrals up to a percent of pay: 100% of the first 3%, then 50% of the next 2%. It's "
      + "matched paycheck by paycheck, with no year-end true-up. None is the default.",
  },
  "retirement.match.rate": {
    hint: "How much the employer adds per dollar you defer.",
    help: "The employer's match rate in this tier: 100% matches your deferral dollar for dollar, and 50% adds half. Tiers apply in "
      + "order.",
  },
  "retirement.match.upToPct": {
    hint: "The deferral rate this tier reaches, as % of pay.",
    help: "The top of this tier, as a percent of pay. Each tier must go higher than the one before it. For 50% of everything you "
      + "defer, enter one tier up to 100%.",
  },
  "retirement.nonElectivePct": {
    hint: "Money the employer adds whatever you defer.",
    help: "Some employers add a percent of pay for everyone, deferring or not. It's 0% by default. It vests like the match.",
  },
  "retirement.vesting": {
    hint: "When the employer's money becomes yours.",
    help: "Immediate is the default: many plans vest immediately; check your plan's summary for a cliff or a graded schedule. With "
      + "a cliff you keep nothing until a number of years, then all of it. Unvested money is lost when you leave.",
  },
  "retirement.vesting.years": {
    hint: "Years of service until it's all yours.",
    help: "A cliff vests nothing before this many years of service, then everything. Three years is common. It's a whole number of "
      + "years, at least 1.",
  },
  "retirement.vesting.steps": {
    hint: "The share vested after each year of service.",
    help: "A graded schedule vests a share at each step, such as 20% after 2 years, rising to 100%. Each step must come later and "
      + "vest more than the one before. The last must reach 100%.",
  },
  "retirement.vesting.steps.years": {
    hint: "Completed years of service at this step.",
    help: "The completed years of service that reach this step. Each step comes after the one before it.",
  },
  "retirement.vesting.steps.pct": {
    hint: "The share of employer money vested then.",
    help: "The share of the employer's money that's yours at this step. It must rise at each step and end at 100%.",
  },
  "retirement.vestingService": {
    hint: "How years of service are counted.",
    help: "Years worked, the default: a year counts once you work through the day before each anniversary. Plan years with 1,000 "
      + "hours: a calendar year counts once you've worked 1,000 hours in it, which needs weekly hours. Your plan summary says which.",
  },

  // ---- health ----
  health: {
    hint: "The job's health plan, or none.",
    help: "Enter the plan if you'd take it, or say there's none, for example if you'd stay on a parent's plan. Premiums and "
      + "expected costs then count against the offer. Left as not entered, health isn't counted.",
  },
  "health.premium": {
    hint: "Your share, a year; blank isn't counted.",
    help: "What you'd pay for coverage each year, taken pre-tax. Left blank, it isn't counted: we don't guess a premium you haven't "
      + "seen. Enter 0 if the employer pays it all.",
  },
  "health.outOfPocket": {
    hint: "Spending beyond premiums, if you use little, some or a lot.",
    help: "Your own estimates of a year's deductibles, copays and the like, at low, medium and high use. Health use in About you "
      + "picks which one counts, medium by default. Left blank, it isn't counted.",
  },
  "health.oopMax": {
    hint: "The most you'd pay in a year.",
    help: "The plan's out-of-pocket maximum caps your expected spending. Left blank, your estimates aren't capped. It's in the plan "
      + "summary.",
  },
  "health.employeeHsa": {
    hint: "Your own HSA deposits, pre-tax.",
    help: "What you'd put in a health savings account each year, pre-tax and free of Social Security and Medicare. It stays your "
      + "money, so it isn't a cost. $0 is the default.",
  },
  "health.employerHsa": {
    hint: "Money the employer puts in your HSA.",
    help: "Some plans seed your HSA each year, which offsets the plan's cost. $0 is the default: enter it if your plan has it. Yours "
      + "and the employer's together are capped at the yearly limit.",
  },
  "health.coverage": {
    hint: "You alone, or family.",
    help: "It sets the HSA limit: self, the default, or family coverage. Family coverage has a higher limit.",
  },

  // ---- perks ----
  "perks.section127": {
    hint: "Tuition or student-loan help, tax-free to $5,250.",
    help: "Education assistance or student loan payments under Section 127, tax-free up to $5,250 a year; above that, only the "
      + "limit counts. It counts at face value. $0 is the default.",
  },
  "perks.commuterMonthly": {
    hint: "Transit or parking the employer pays, a month.",
    help: "Commuter benefits under Section 132(f), tax-free up to $340 a month; above that, only the limit counts. They count at "
      + "face value, though they buy local transit. $0 is the default.",
  },

  // ---- where you'd live ----
  employerState: {
    hint: "Where the employer is, if not where you'd live.",
    help: "We tax you where you'd live; the employer's state matters only for remote work. Some states, such as New York, can tax a "
      + "remote worker's pay too, and a warning says so. It defaults to the state you'd live in.",
  },
  "costOfLiving.rentGrowth": {
    hint: "How fast your rent rises each year.",
    help: "Your rent rises by this much at each anniversary of your start date. It defaults to inflation, 2.5% a year; rents in "
      + "some cities rise faster. It doesn't change pay.",
  },
};

addHelpText(DETAILED_TEXT);
