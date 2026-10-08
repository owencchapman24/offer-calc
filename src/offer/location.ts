/**
 * States that tax a nonresident's remote-work wages when the remote work is for the employee's
 * convenience rather than the employer's necessity (decision 9, docs/offer-model.md). CT and NJ
 * apply the rule only to residents of states that have one (reciprocity). E.g. NY: 20 NYCRR
 * 132.18(a). We warn; nonresident tax and the resident credit aren't computed.
 */
export const CONVENIENCE_RULE_STATES = {
  always: ["NY", "DE", "NE", "PA"],
  reciprocal: ["CT", "NJ"],
} as const;

const has = (list: readonly string[], s: string) => list.includes(s);

export function convenienceRuleWarning(residenceState: string, employerState: string): string | undefined {
  if (residenceState === employerState) return undefined;
  const { always, reciprocal } = CONVENIENCE_RULE_STATES;
  const residenceHasRule = has(always, residenceState) || has(reciprocal, residenceState);
  if (!has(always, employerState) && !(has(reciprocal, employerState) && residenceHasRule)) return undefined;
  return `The employer is in ${employerState}, which can tax a nonresident's remote-work wages under its `
    + `convenience-of-employer rule. If you work from home in ${residenceState}, ${employerState} may tax this pay `
    + `too, and ${residenceState}'s credit may not offset it fully. This projection taxes ${residenceState} residence only.`;
}
