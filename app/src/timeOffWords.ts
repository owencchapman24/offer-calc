import { daysOff, VACATION_PAYOUT_STATES, weeksWorked } from "../../src/offer/timeOff";
import type { OfferInput, VacationPayoutRule } from "../../src/offer/types";

// Days off and unused vacation in words (docs/v2-plan.md, 4a): A-1's weeks, A-4's terms and "if you left on", L-4's panel and the
// copied document say them the same way. Loaded only with the chunks that use it (never the main thread: it reads the engine's rules).

const PAYOUT_STATE_NAMES: Record<string, string> = {
  CA: "California", CO: "Colorado", IL: "Illinois", LA: "Louisiana", ME: "Maine", MA: "Massachusetts", MT: "Montana", NE: "Nebraska",
  ND: "North Dakota", RI: "Rhode Island",
};
const stateName = (s: string) => PAYOUT_STATE_NAMES[s] ?? s;
const num = (x: number) => `${+x.toFixed(2)}`;

/** Days, to two decimals at most: unused vacation banks by the day ("8 days", "8.01 days"). */
export const daysText = (x: number) => `${num(x)} ${num(x) === "1" ? "day" : "days"}`;

/** "11 vacation days, 8 holidays and no sick days". */
export function daysOffWords(o: Pick<OfferInput, "timeOff">): string {
  const d = daysOff(o.timeOff);
  const n = (x: number, one: string, many: string) => (x === 0 ? `no ${many}` : `${num(x)} ${num(x) === "1" ? one : many}`);
  return `${n(d.vacation, "vacation day", "vacation days")}, ${n(d.holidays, "holiday", "holidays")} and ${n(d.sick, "sick day", "sick days")}`;
}

/** Weeks worked a year, as shown: four decimals at most, so weekly hours × weeks foots. */
export const weeksText = (o: Pick<OfferInput, "hours" | "timeOff">) => `${+weeksWorked(o).toFixed(4)}`;

/** The vacation policy as a term that can bite (A-4, M-9, the document); null when nothing banks. */
export function vacationTerm(o: OfferInput): string | null {
  const t = o.timeOff;
  if (t?.policy === "unlimited") return "its vacation is unlimited: nothing builds up, so nothing is paid when you leave";
  const taken = daysOff(t).vacation;
  const gives = t?.gives ?? taken;
  if (!(gives > taken)) return null;
  const law = VACATION_PAYOUT_STATES[o.employerState];
  const banks = `it gives ${num(gives)} vacation days a year and you'd take ${num(taken)}, so ${num(gives - taken)} bank each year${
    t?.cap !== undefined ? `, up to ${num(t.cap)}` : ""}`;
  const paid = law
    ? `${stateName(o.employerState)} requires unused vacation be paid when you leave${law.afterYears ? " after a year's service" : ""}`
    : t?.payout === "always" ? "the offer's policy pays it when you leave"
    : `${o.employerState} doesn't require unused vacation be paid when you leave, so it isn't counted unless the offer's policy pays it`;
  return `${banks}; ${paid}`;
}

/** Why vacation banked by a last day isn't paid, in words: null when it's paid, or nothing banked. */
export function unpaidVacationText(v: { banked: number; paid: number; rule: VacationPayoutRule | null }): string | null {
  if (v.paid >= 0.5 || v.banked < 0.005 || !v.rule || v.rule.paid) return null;
  const are = num(v.banked) === "1" ? "isn't" : "aren't";
  return v.rule.why === "underAYear"
    ? `${daysText(v.banked)} of unused vacation ${are} paid before a year's service (${stateName(v.rule.state)})`
    : `${daysText(v.banked)} of unused vacation ${are} paid out (${v.rule.state} doesn't require it)`;
}

/** Why it's paid, for its work: the state's law (its statute) or the offer's policy. */
export function paidBecause(rule: VacationPayoutRule): string {
  if (!rule.paid) return "";
  return rule.why === "policy" ? "The offer's policy pays unused vacation when you leave (Hours › Unused vacation when you leave)."
    : `${stateName(rule.state)} requires unused vacation be paid when you leave (${VACATION_PAYOUT_STATES[rule.state]?.source ?? "its law"}).`;
}
