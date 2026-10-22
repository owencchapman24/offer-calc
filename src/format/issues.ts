import type { OfferIssue } from "../offer/validate";

// Words for validateOffer's problems: the plain-English message under the field that caused each one.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
  "December"];

/** A share as a percent, as precise as entered: 0.9999 -> "99.99%". */
const sharePct = (x: number) => `${+(x * 100).toFixed(6)}%`;

/** The plain-English message shown under the field an input problem belongs to. */
export function formatIssue(i: OfferIssue): string {
  switch (i.code) {
    case "required":
      return { amount: "Enter an amount.", percent: "Enter a percent.", date: "Enter a date.", number: "Enter a number.",
        choice: "Pick one." }[i.params.kind];
    case "date": return `"${i.params.value}" isn't a date: use a date like 2027-07-12.`;
    case "monthDay": {
      const { month, day } = i.params;
      return month >= 1 && month <= 12 ? `${MONTH_NAMES[month - 1]} has no ${day}${ordinal(day)}.` : "Pick a month from January to December.";
    }
    case "before2026":
      return i.params.what === "start" ? "Start dates before 2026 aren't supported: tax data starts in 2026."
        : i.params.what === "vest" ? "A tranche would vest before 2026, and tax data starts in 2026: move the vesting start later."
        : "Payments before 2026 aren't supported: tax data starts in 2026.";
    case "leaveBeforeStart": return "The leave date can't be before the start date.";
    case "notAfterStart": return "The promotion date must be after your start date.";
    case "negative": return "Enter 0 or more.";
    case "rate": return "Enter more than −100%.";
    case "share": return "Enter a percent from 0 to 100.";
    case "hours": return `Weekly hours must be between ${i.params.min} and ${i.params.max}.`;
    case "weeks": return `Weeks a year must be between ${i.params.min} and ${i.params.max}.`;
    case "esppDiscount": return `An ESPP's discount can be at most ${Math.round(i.params.max * 100)}% (IRC 423(b)(6)).`;
    case "esppOffering": return `An offering is a whole number of months, from ${i.params.min} to ${i.params.max} (IRC 423(b)(7)).`;
    case "esppPurchases": return "Enter a whole number of purchases that divides the offering's months evenly.";
    case "daysOff": return `Vacation, holidays and sick days together must be under ${i.params.max}, a year's workdays.`;
    case "wholeMonths":
      return /clawback/.test(i.path) ? `A clawback window is a whole number of months, at least ${i.params.min}.`
        : `Enter a whole number of months, ${i.params.min} or more.`;
    case "wholeYears": return `Enter a whole number of years, ${i.params.min} or more.`;
    case "wholeDays": return `Enter a whole number of days, ${i.params.min} or more.`;
    case "positive": return "Each tranche must vest more than 0%.";
    case "trancheSum": {
      const { sum } = i.params;
      return sum < 1 ? `These tranches add up to ${sharePct(sum)}: ${sharePct(1 - sum)} is missing.`
        : `These tranches add up to ${sharePct(sum)}: ${sharePct(sum - 1)} too much.`;
    }
    case "noTranches": return "Add at least one tranche.";
    case "noMonths": return "Pick at least one vest month.";
    case "tierRange": return "A match tier goes up to more than 0% and at most 100% of pay, at a rate of 0% or more.";
    case "tierOrder": return "Each match tier must go higher than the one before it.";
    case "noYears": return "Enter at least one year's bonus.";
    case "needsHours": return "Counting service by plan-year hours needs weekly hours for this offer.";
    case "gradedSteps": return "Graded vesting steps must rise year by year and reach 100%.";
    case "oopOrder": return "Out-of-pocket costs should rise from low to medium to high use.";
    case "unknownArea": return "We don't have prices for this area: pick a city from the list.";
    case "unknownState": return i.params.state ? `"${i.params.state}" isn't a state we can tax: pick a U.S. state or DC.` : "Pick a state.";
    case "savingsRate": return "A savings rate is at least 0% and below 100%.";
  }
}

const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
