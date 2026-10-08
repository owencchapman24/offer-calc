// Display formatting for the app (the engine returns numbers; this and src/format write them).

const DOLLARS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "$1,234" (whole dollars). */
export const dollars = (x: number) => `${x < 0 ? "−" : ""}$${DOLLARS.format(Math.abs(Math.round(x)))}`;
/** "1,234" with no sign or symbol, for tables whose unit is in the header. */
export const figure = (x: number) => DOLLARS.format(Math.round(x));
/** "$19.47" */
export const cents = (x: number) => `$${CENTS.format(x)}`;
/** "Jul 13, 2027" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
/** The day before an ISO date (window ends are exclusive). */
export function dayBefore(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Accepts "110k", "110,000", "$110000", "1.2m"; blank is null; anything else is NaN. */
export function parseMoney(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (t === "") return null;
  const m = t.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!m) return Number.NaN;
  return Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
}

/** Accepts "10", "10%", "12.5". */
export function parsePercent(text: string): number | null {
  const t = text.trim().replace(/%$/, "").trim();
  if (t === "") return null;
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** Today in the user's time zone, as YYYY-MM-DD: the valuation date. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
