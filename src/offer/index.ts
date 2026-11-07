import * as commission from "./commission";
import * as espp from "./espp";
import { provide } from "./optional";

// The engine in full, for scripts and tests: its optional modules (optional.ts) are provided here, up front. The app's worker
// imports the engine's modules one by one and loads the optional ones on first use.
provide("commission", commission);
provide("espp", espp);

export * from "./types";
export { projectScenario } from "./project";
export { keptIfLeaving, leaveDateSweep, leaveDaySweep } from "./leave";
export { cliffs, nextCliff } from "./cliffs";
export { withholdingShortfall } from "./withholding";
export {
  annuityFactor, annuityTerms, CLOSE_CALL_SHARE, compareOffers, comparisonWindow, EXTRA_HOURS_MIN, extraHours, horizonSweep,
  monthlyEquivalent, projectOffer, rentFlipFrom,
} from "./compare";
export { breakeven, breakevenSteps, rentFlip } from "./breakeven";
export { clawbackFraction } from "./clawback";
export { byYear, VESTING_PRESETS } from "./vesting";
export { CONVENIENCE_RULE_STATES, convenienceRuleWarning } from "./location";
export { type IssueCode, type OfferIssue, realMonthDay, validateOffer } from "./validate";
export { isProvided, needs, type OptionalName, optional, provide } from "./optional";
