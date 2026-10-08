import type { ISODate, MonthDay } from "./types";

// Civil-date math on day numbers (days since 1970-01-01, UTC). No local time zones anywhere.

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fromDays(day: number): ISODate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Day number of a "YYYY-MM-DD" date. Throws on malformed or impossible dates (2026-02-30). */
export function toDays(iso: ISODate): number {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Invalid date "${iso}": expected YYYY-MM-DD.`);
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
  if (fromDays(day) !== iso) throw new Error(`Invalid date "${iso}": no such day.`);
  return day;
}

export const yearOfDay = (day: number) => new Date(day * DAY_MS).getUTCFullYear();
export const jan1 = (year: number) => Date.UTC(year, 0, 1) / DAY_MS;
export const daysInYear = (year: number) => jan1(year + 1) - jan1(year);

/** First day of the month after the one containing `day`. */
export function nextMonthStart(day: number): number {
  const d = new Date(day * DAY_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS;
}

export function checkMonthDay(md: MonthDay): void {
  const ok = Number.isInteger(md.month) && md.month >= 1 && md.month <= 12
    && Number.isInteger(md.day) && md.day >= 1 && md.day <= 31;
  if (!ok) throw new Error(`Invalid month/day ${JSON.stringify(md)}.`);
}

/** Day number of `md` in `year`; the day clamps to the month's end (Feb 29 -> Feb 28). */
export function dayIn(year: number, md: MonthDay): number {
  checkMonthDay(md);
  const lastOfMonth = new Date(Date.UTC(year, md.month, 0)).getUTCDate();
  return Date.UTC(year, md.month - 1, Math.min(md.day, lastOfMonth)) / DAY_MS;
}

/** Adds calendar months; the day clamps to the month's end (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(day: number, months: number): number {
  const d = new Date(day * DAY_MS);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  return dayIn(year, { month: total - year * 12 + 1, day: d.getUTCDate() });
}

/** First day on or after `from` that falls on `md`. */
export function nextOccurrence(md: MonthDay, from: number): number {
  const d = dayIn(yearOfDay(from), md);
  return d >= from ? d : dayIn(yearOfDay(from) + 1, md);
}

/** "Mar 15" */
export const formatMonthDay = (md: MonthDay) => `${MONTHS[md.month - 1]} ${md.day}`;
