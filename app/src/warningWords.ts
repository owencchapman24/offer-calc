import type { ISODate, MonthDay, OfferWarning } from "../../src/offer/types";
import { dollars, longDate } from "./text";
import { yearOf } from "./warningKinds";

// The engine's warnings in words, one kind of warning at a time with its years (docs/ui-design.md §4.7): L-5's lines, and the
// document's (copyDoc.ts). The withholding shortfall is written with its figures in L-5 itself. Pure: no React.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (m: MonthDay) => `${MONTHS[m.month - 1]} ${m.day}`;
const period = (from: ISODate, to: ISODate) =>
  (from.endsWith("-01-01") && to === `${from.slice(0, 4)}-12-31` ? from.slice(0, 4) : `${longDate(from)} – ${longDate(to)}`);

export const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "2028", "2028 and 2030", "2028 to 2031" (three or more years in a row). */
export function yearsText(years: number[]): string {
  const ys = [...years].sort((a, b) => a - b);
  const runs = ys.length >= 3 && ys.every((y, i) => !i || y === ys[i - 1] + 1);
  return runs ? `${ys[0]} to ${ys[ys.length - 1]}` : join(ys.map(String));
}
/** A limit in one year, or how it rises over several (it's indexed each year). */
function limitsText(group: OfferWarning[], limit: (w: OfferWarning) => number, per = ""): string {
  const first = group[0];
  const last = group[group.length - 1];
  return group.length === 1 ? `${dollars(limit(first))}${per}`
    : `${dollars(limit(first))}${per} in ${yearOf(first)}, rising to ${dollars(limit(last))}${per} in ${yearOf(last)}`;
}

/** A warning in words: one kind of warning, its years listed (the withholding shortfall is written with its figures, below). */
export function warningWords(group: OfferWarning[]): string {
  const w = group[0];
  const years = yearsText(group.flatMap((x) => (yearOf(x) === null ? [] : [yearOf(x)!])));
  const lim = (x: OfferWarning) => ("limit" in x.params ? (x.params as { limit: number }).limit : 0);
  switch (w.code) {
    case "k401Cap":
      return `Its 401(k) deferrals reach the 402(g) limit before the end of ${years} (${limitsText(group, lim)}): deferrals and the match stop for `
        + `the rest of ${group.length > 1 ? "each of those years" : "that year"} (no true-up assumed).`;
    case "hsaCap":
      return `Its HSA contributions reach the limit, yours plus the employer's, in ${years} (${limitsText(group, lim)}): yours are capped there.`;
    case "section127Cap": return `Education help above the limit (${limitsText(group, lim)}) is taxable pay in ${years}: only the limit is counted tax-free.`;
    case "commuterCap": {
      const monthly = (x: OfferWarning) => ("monthlyLimit" in x.params ? (x.params as { monthlyLimit: number }).monthlyLimit : 0);
      return `Commuter benefits above the limit (${limitsText(group, monthly, " a month")}) are taxable pay in ${years}: only the limit is counted.`;
    }
    case "bonusCutoff":
      return `It starts ${longDate(w.params.start)}, on or after the ${monthDay(w.params.cutoff)} bonus cutoff, so the bonus for `
        + `${period(w.params.periodFrom, w.params.periodTo)} pays nothing.`;
    case "convenienceRule": {
      const { residenceState: r, employerState: e } = w.params;
      return `You'd live in ${r} and work for an employer in ${e}. ${e}'s convenience-of-employer rule may tax your remote days there too, and ${r}'s `
        + `credit may not offset it fully. This projection taxes ${r} residence only.`;
    }
    default: return "";
  }
}
