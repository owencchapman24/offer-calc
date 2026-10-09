// Number and date words shared by src/format's modules. English, U.S. conventions.
import type { MonthDay } from "../offer/types";

const WHOLE = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const PLAIN = new Intl.NumberFormat("en-US");
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const round2 = (x: number) => Math.round(x * 100) / 100;

/** "$150,000" or "$62,054.79" */
export const usd = (x: number) => `$${(Number.isInteger(x) ? WHOLE : CENTS).format(x)}`;
/** A fraction as a percent with up to `digits` decimals: pct(0.06125) = "6.125%". */
export const pct = (x: number, digits = 4) => `${+(x * 100).toFixed(digits)}%`;
/** "Mar 15" */
export const monthDay = (md: MonthDay) => `${MONTHS[md.month - 1]} ${md.day}`;
