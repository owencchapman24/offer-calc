import type { OfferInput, TimeOff, VacationPayoutRule } from "./types";

// Days off and unused vacation paid when you leave (docs/v2-plan.md, 4a). Days off set the weeks worked, so they feed hours and
// per hour; the vacation policy sets what banks, which a leave date pays out where the law of the state where you'd work requires
// it, or the offer's policy does. A stay's end isn't a leave date, so nothing here moves a figure over your stay but hours.

/**
 * The defaults (D14, D16, approved): BLS's National Compensation Survey, Employee Benefits in the United States, March 2026
 * (USDL-26-1534): private-industry workers with paid vacation average 11 days after a year's service, and paid holidays averaged 8
 * days (BLS, The Economics Daily, 2026). Sick days default to none: how many you take is personal (D16).
 */
export const DEFAULT_DAYS_OFF = { vacation: 11, holidays: 8, sick: 0 } as const;

/** Workdays a week, and weeks a year: weeks worked = 52 - days off / 5, and a day's pay is the salary rate / (52 x 5 = 260). */
export const WORKDAYS_A_WEEK = 5;
export const WEEKS_A_YEAR = 52;
export const WORKDAYS_A_YEAR = WEEKS_A_YEAR * WORKDAYS_A_WEEK;

/** The days off a year, at their defaults where not entered. */
export function daysOff(t: TimeOff | undefined): { vacation: number; holidays: number; sick: number } {
  return {
    vacation: t?.vacation ?? DEFAULT_DAYS_OFF.vacation,
    holidays: t?.holidays ?? DEFAULT_DAYS_OFF.holidays,
    sick: t?.sick ?? DEFAULT_DAYS_OFF.sick,
  };
}

/** Weeks worked a year: `hours.weeksPerYear` if a caller gave it, else 52 - (vacation + holidays + sick days) / 5. */
export function weeksWorked(offer: Pick<OfferInput, "hours" | "timeOff">): number {
  if (offer.hours?.weeksPerYear !== undefined) return offer.hours.weeksPerYear;
  const d = daysOff(offer.timeOff);
  return WEEKS_A_YEAR - (d.vacation + d.holidays + d.sick) / WORKDAYS_A_WEEK;
}

/**
 * The states whose law pays out unused vacation at separation, where the employer gives paid vacation that accrues (re-read from
 * each statute or the state's labor agency at stop 4a, 2026-10-19; the data refresh calendar rechecks them each January). Every
 * other state leaves it to the employer's policy. `afterYears`: only after that much service.
 */
export const VACATION_PAYOUT_STATES: Record<string, { afterYears?: number; source: string }> = {
  /** Vested vacation is paid at the final rate of pay; no forfeiture (the Labor Commissioner's vacation FAQ, dir.ca.gov). */
  CA: { source: "Cal. Lab. Code §227.3; Suastez v. Plastic Dress-Up Co., 31 Cal. 3d 774 (1982)" },
  /** "The employer shall pay upon separation from employment all vacation pay earned and determinable" (C.R.S. 2023). */
  CO: { source: "C.R.S. §8-4-101(14)(a)(III); Nieto v. Clark's Market, 2021 CO 48" },
  /** "The monetary equivalent of all earned vacation shall be paid ... as part of his or her final compensation." */
  IL: { source: "820 ILCS 115/5" },
  /** Vacation accrued under the stated policy and not taken is "an amount then due"; earned vacation can't be forfeited. */
  LA: { source: "La. R.S. 23:631(D)" },
  /** Employers with 11 or more employees, for vacation accrued from Jan 1, 2023 (assumed: an employer that size). */
  ME: { source: "26 M.R.S. §626; Maine Bureau of Labor Standards, Interpretive Guidance 22-01" },
  /** "Wages" include "any holiday or vacation payments due an employee under an oral or written agreement." */
  MA: { source: "M.G.L. c. 149, §148" },
  /** Accrued vacation is wages and can't be divested (the Department of Labor and Industry's wage decisions, Herden, 2020). */
  MT: { source: "Langager v. Crazy Creek Products, 1998 MT 44; MCA §§39-3-201(6), 39-3-205" },
  /** Earned but unused vacation is wages due at separation; other paid leave isn't, unless agreed. */
  NE: { source: "Neb. Rev. Stat. §48-1229(6)" },
  /** Withheld only on a voluntary quit under a year's service with notice at hire and under five days' notice (assumed given). */
  ND: { source: "N.D.C.C. §34-14-09.2" },
  /** After completing at least one year of service, accrued vacation becomes wages, paid with the next regular pay. */
  RI: { afterYears: 1, source: "R.I. Gen. Laws §28-14-4(b)" },
};

/**
 * Whether unused vacation is paid when you leave, by the employer state's law or the offer's policy. `completedYears`: years of
 * service at the leave date (a year completes when you work through the day before its anniversary).
 */
export function payoutRule(t: TimeOff | undefined, employerState: string, completedYears: number): VacationPayoutRule {
  const law = VACATION_PAYOUT_STATES[employerState];
  if (law && completedYears >= (law.afterYears ?? 0)) return { paid: true, why: "state", state: employerState };
  if (t?.payout === "always") return { paid: true, why: "policy" };
  return law ? { paid: false, why: "underAYear", state: employerState } : { paid: false, why: "notRequired", state: employerState };
}

/**
 * Vacation days banked after `serviceYears` (whole and part employment years worked): (gives - taken) a year, accrued and used
 * evenly, up to the cap. Unlimited banks nothing; neither does taking at least what it gives.
 */
export function vacationBanked(t: TimeOff | undefined, serviceYears: number): number {
  if (t?.policy === "unlimited") return 0;
  const taken = daysOff(t).vacation;
  const perYear = (t?.gives ?? taken) - taken;
  if (!(perYear > 0)) return 0;
  return Math.min(t?.cap ?? Infinity, perYear * serviceYears);
}
