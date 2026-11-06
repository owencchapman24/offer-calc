import { addDefaults } from "./defaults";
import { addFields } from "./help";
import { longDate } from "./text";

// Detailed mode's defaults that nothing on the main thread reads before detailed mode or the derivations load: the days off and
// the vacation policy (docs/v2-plan.md, 4a), and an ESPP's terms (4i), with the terms' names (help.ts has the plan's own). Detailed.tsx
// and derive.ts import this module, which adds them to the registries (defaults.ts, help.ts), as helpText.ts adds detailed mode's help
// (Detailed.tsx imports this first, so helpText.ts finds the names to add to). A test checks each default against the engine
// (defaults.test.ts).

// An ESPP's terms: "ESPP" and the term, under Equity.
addFields(Object.fromEntries(([["contributionPct", "contribution"], ["eligiblePay", "pay that counts"], ["discount", "discount"],
  ["lookback", "lookback"], ["offeringMonths", "offering length"], ["purchasesPerOffering", "purchases an offering"],
  ["offeringsStart", "offerings start"], ["eligibleFrom", "eligible from"]] as const)
  .map(([k, label]) => [`espp.${k}`, { label: `ESPP ${label}`, section: "M-3" as const, group: "equity" as const }])));
// Commission's fields (4h), a section of their own after the bonus.
addFields({
  "commission.basis": { label: "Basis", section: "M-2", group: "commission" },
  "commission.amount": { label: "Expected a year", section: "M-2", group: "commission" },
  "commission.amounts": { label: "Commission by year", section: "M-2", group: "commission", editor: "commission.amounts" },
  "commission.period": { label: "Paid", section: "M-2", group: "commission" },
  "commission.payAfterDays": { label: "Days after each period", section: "M-2", group: "commission" },
  "commission.mustBeEmployedOnPayDate": { label: "When you leave", section: "M-9", group: "commission" },
  "commission.draw": { label: "Draw against commission", section: "M-2", group: "commission" },
  "commission.draw.monthly": { label: "Draw a month", section: "M-2", group: "commission" },
  "commission.draw.months": { label: "Draw for the first", section: "M-2", group: "commission" },
  "commission.draw.onLeaving": { label: "If you leave owing a recoverable draw", section: "M-9", group: "commission" },
});
// Other benefits' fields, in their editor (4j).
addFields(Object.fromEntries(([["label", "Name"], ["annual", "Amount a year"], ["taxable", "Tax"]] as const)
  .map(([k, label]) => [`otherBenefits.${k}`, { label, section: "M-5.3" as const, group: "perks" as const, editor: "otherBenefits" }])));

addDefaults({
  "timeOff.vacation": {
    value: 11, shown: () => "11 days",
    reason: "BLS's average for private-industry workers with paid vacation, after a year's service (National Compensation Survey, March 2026).",
  },
  "timeOff.holidays": { value: 8, shown: () => "8 days", reason: "BLS's average number of paid holidays in private industry (2025)." },
  "timeOff.sick": { value: 0, shown: () => "None", reason: "How many sick days you'd take is personal, so none count until you enter them." },
  "timeOff.policy": { value: "days", shown: () => "Days a year", reason: "Most offers give a number of vacation days a year. Pick Unlimited if yours sets none." },
  "timeOff.gives": {
    shown: (d) => `The days you'd take (${d.timeOff.vacation ?? 11})`,
    reason: "Unless the offer gives more days than you'd take, nothing banks, so nothing is paid when you leave.",
  },
  "timeOff.cap": { value: null, shown: () => "No cap", reason: "Many policies cap the days you can bank: enter yours if it does. It matters only if days bank." },
  "timeOff.payout": {
    value: "state", shown: () => "Where the state requires it",
    reason: "Ten states require unused vacation to be paid when you leave; elsewhere it's the employer's policy, so it counts only if you say it does.",
  },
  // Commission (4h): how often it's paid and how long after have no default (D24), so they're blank until entered.
  "commission.basis": {
    value: "fixed", shown: () => "Dollars a year", reason: "Offers usually quote commission as an amount a year at target (on-target earnings less the salary).",
    alsoClear: { "commission.amount": null, "commission.amounts": [] },
  },
  "commission.mustBeEmployedOnPayDate": {
    value: false, shown: () => "Paid for work to your last day",
    reason: "Commission earned is wages, which state laws require be paid after you leave; a plan's written terms can say it's earned only once paid.",
  },
  "commission.draw": { value: null, shown: () => "None", reason: "A draw is a term of the commission plan, so none counts until you enter one." },
  "commission.draw.months": { value: null, shown: () => "Every month", reason: "A draw with no end in the plan is paid every month you're there." },
  "commission.draw.onLeaving": {
    value: "kept", shown: () => "Kept",
    reason: "You'd owe a draw not earned back only if the plan says so: whether it can depends on its terms and the state's law.",
  },
  // An ESPP's terms: the survey is NASPP and Deloitte Tax's 2023 Employee Stock Purchase Plan Survey (209 companies).
  "espp.eligiblePay": { value: "salary", shown: () => "Salary", reason: "Plans count base salary; some count bonuses too: check your plan's document." },
  "otherBenefits.taxable": {
    value: true, shown: () => "Taxable",
    reason: "Any fringe benefit is wages unless the law excludes it (IRS Pub. 15-B), so a benefit counts as pay until you say it's tax-free.",
  },
  "espp.discount": {
    value: 0.15, shown: () => "15%",
    reason: "The most common discount, and the most section 423 allows: 85% of plans in NASPP and Deloitte's 2023 survey.",
  },
  "espp.lookback": { value: true, shown: () => "Yes", reason: "Most plans have one: 83% in NASPP and Deloitte's 2023 survey." },
  "espp.offeringMonths": { value: 6, shown: () => "6 months", reason: "The most common offering: 57% of plans in NASPP and Deloitte's 2023 survey." },
  "espp.purchasesPerOffering": {
    value: 1, shown: () => "One, at its end", reason: "In most plans the purchase period is the offering (Fidelity Stock Plan Services, 2025).",
  },
  "espp.eligibleFrom": {
    value: null, shown: (d) => (d.startDate ? `Your start date, ${longDate(d.startDate)}` : "Your start date"),
    reason: "You join the first offering that starts on or after this day. Enter a later date if the plan makes new hires wait.",
  },
});
