import { addHelpText } from "./help";

// The ⓘ help for quick mode's fields and About you (docs/ui-design.md §3.5): two to four sentences each, keyed like help.ts.
// Their hints stay in help.ts, always shown; this loads the first time a pointer or focus reaches an ⓘ (help.ts' quickHelp),
// or with detailed mode, so a quick visit that never opens one doesn't download it.

addHelpText({
  label: {
    help: "A short name you'll recognize, such as the firm or the city. It appears beside the offer's letter in the bridge and the "
      + "methodology. It doesn't change any number.",
  },
  "salary.annual": {
    help: "Your starting base salary from the offer letter. Raises and promotions are separate inputs, under Pay in detailed mode. "
      + "Pay accrues by calendar month, so a July start earns about half of it in its first calendar year.",
  },
  startDate: {
    help: "We compare every offer from the earliest start date, so a later start counts as pay you don't get yet. Tax data starts "
      + "in 2026, so the date must be in 2026 or later. A date before today means present values count pay already received.",
  },
  "bonus.amount": {
    help: "The target from your offer, as a % of salary or dollars a year; leave it blank for none. It's paid once a year for the "
      + "year before, so a July start gets a partial first bonus the next spring. Its timing is under Bonus in detailed mode.",
  },
  "costOfLiving.area": {
    help: "We tax you as a resident of this state (and of New York City or Philadelphia, if you say so) and price your spending with this metro's "
      + "price level (BEA Regional Price Parities). If you'd commute across a state line, pick where you'd live.",
  },
  "costOfLiving.monthlyRent": {
    help: "If you leave it blank we use HUD's Fair Market Rent: what recent movers pay for a typical 1-bedroom across the metro "
      + "(the 40th percentile, utilities included). City-center rents usually run higher, so enter yours if you know it.",
  },
  "about.filing": {
    help: "It sets the tax brackets and the standard deduction for every offer. Single is the default: most new grads file single. "
      + "Married filing jointly asks for your spouse's wages, since each offer's pay is taxed on top of theirs.",
  },
  "about.stay": {
    help: "We compare every offer over the same stretch, starting on the earliest start date. Pay after that isn't counted. The row "
      + "under the verdict shows whether the winner changes if you stay 2, 3, 4 or 5 years.",
  },
  "about.wages": {
    help: "Pay you earn in the year the earliest offer starts, before the new job begins. It's taxed in the same year, so it changes "
      + "the new job's first-year tax. Leave it at $0 if there's none.",
  },
  "about.spouse": {
    help: "Filing jointly, each offer's pay is taxed on top of your spouse's, often in a higher bracket. Enter what they'll earn in "
      + "the year the earliest offer starts; later years grow with inflation, the same for every offer. Leave it at $0 if they don't work.",
  },
  "about.prices": {
    help: "After rent, every offer's spending money is priced as in one place, so offers in different cities compare in the same "
      + "dollars. The U.S. average is the default. Pick a city you know, such as where you live now, to read the figures in its "
      + "dollars: its own price factor is 1. Spending scales by the same ratio for every offer; savings stay at face value.",
  },
  "about.healthUsage": {
    help: "Each health plan takes your low, medium or high out-of-pocket estimate; this picks one for every offer. Medium is the "
      + "default: the middle of your own estimates.",
  },
});
