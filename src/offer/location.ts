import type { OfferWarning } from "./types";

/**
 * States that tax a nonresident's remote-work wages when the remote work is for the employee's
 * convenience rather than the employer's necessity (decision 9, docs/offer-model.md). CT and NJ
 * apply the rule only to residents of states that have one (reciprocity). E.g. NY: 20 NYCRR
 * 132.18(a). We warn; nonresident tax and the resident credit aren't computed.
 *
 * Nebraska has no such rule for taxable years beginning on or after January 1, 2025: Neb. Rev.
 * Stat. 77-2733(8)(c), as amended by Laws 2024, LB1023, section 13, counts "Only compensation paid
 * to the individual for services performed within this state" (Nebraska Department of Revenue,
 * "2024 Nebraska Legislative Changes"). The engine's years start in 2026, so it isn't in `always`.
 * It's in `named`: New Jersey's FAQ on its rule (last updated Oct 30, 2025) still names Nebraska
 * among the states whose residents it reaches, so NJ, and CT by the same test, may still apply theirs.
 *
 * `notReaching`: residents an employer state's rule doesn't reach, though their own state has one.
 * New Jersey's FAQ, "Convenience of the Employer Sourcing Rule Enacted for Gross Income Tax"
 * (NJ Division of Taxation, https://www.nj.gov/treasury/taxation/conveniencerulefaq.shtml, last
 * updated Oct 30, 2025), under "Who does the Convenience of the Employer Rule not apply to?":
 * - Pennsylvania: "This legislation does not apply to Pennsylvania residents who work in New Jersey,
 *   since there is a Reciprocal Agreement in place with that state."
 * - Connecticut: "Based on the reciprocal nature of Connecticut's law, an employee who works from home
 *   in Connecticut for a New Jersey employer will not be subject to New Jersey's convenience of the
 *   employer rule."
 */
export const CONVENIENCE_RULE_STATES = {
  always: ["NY", "DE", "PA"],
  reciprocal: ["CT", "NJ"],
  named: ["NE"],
  notReaching: { NJ: ["PA", "CT"] },
} as const;

const has = (list: readonly string[], s: string) => list.includes(s);
const notReaching: Readonly<Record<string, readonly string[]>> = CONVENIENCE_RULE_STATES.notReaching;

export function convenienceRuleWarning(residenceState: string, employerState: string): OfferWarning | undefined {
  if (residenceState === employerState) return undefined;
  if (has(notReaching[employerState] ?? [], residenceState)) return undefined;
  const { always, reciprocal, named } = CONVENIENCE_RULE_STATES;
  const residenceHasRule = has(always, residenceState) || has(reciprocal, residenceState) || has(named, residenceState);
  if (!has(always, employerState) && !(has(reciprocal, employerState) && residenceHasRule)) return undefined;
  return { code: "convenienceRule", params: { residenceState, employerState } };
}
