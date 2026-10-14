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
 * `notReaching`: residents an employer state's rule doesn't reach.
 * New Jersey's FAQ, "Convenience of the Employer Sourcing Rule Enacted for Gross Income Tax"
 * (NJ Division of Taxation, https://www.nj.gov/treasury/taxation/conveniencerulefaq.shtml, last
 * updated Oct 30, 2025), under "Who does the Convenience of the Employer Rule not apply to?":
 * - Pennsylvania: "This legislation does not apply to Pennsylvania residents who work in New Jersey,
 *   since there is a Reciprocal Agreement in place with that state."
 * - Connecticut: "Based on the reciprocal nature of Connecticut's law, an employee who works from home
 *   in Connecticut for a New Jersey employer will not be subject to New Jersey's convenience of the
 *   employer rule."
 * - Pennsylvania's rule doesn't reach New Jersey residents: under the two states' reciprocal compensation agreement, Pennsylvania
 *   doesn't tax a New Jersey resident's wages at all. PA Department of Revenue, 2025 PA-40 instructions, Line 1a, "Reciprocal
 *   Compensation Agreement States": "Pennsylvania has agreements with Indiana, Maryland, New Jersey, Ohio, Virginia, and West
 *   Virginia. Generally, under these agreements, one state will not tax a resident of the other state on compensation that is
 *   subject to employer withholding. These agreements apply to most types of W-2 compensation ..."; and a reciprocal state's
 *   resident whose employer withheld PA tax may get it back: "You report zero taxable compensation on Line 1a". The same in the
 *   PA Personal Income Tax Guide, "Gross Compensation", "Reciprocal Compensation Agreements". That guidance doesn't name the
 *   convenience doctrine (the guide states it under "Nonresident - Allocation of Pennsylvania Compensation"), but the doctrine only
 *   allocates compensation Pennsylvania taxes, and it taxes none of a New Jersey resident's W-2 pay. The agreements cover Indiana,
 *   Maryland, Ohio, Virginia and West Virginia residents alike; only New Jersey's is entered so far.
 */
export const CONVENIENCE_RULE_STATES = {
  always: ["NY", "DE", "PA"],
  reciprocal: ["CT", "NJ"],
  named: ["NE"],
  notReaching: { NJ: ["PA", "CT"], PA: ["NJ"] },
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
