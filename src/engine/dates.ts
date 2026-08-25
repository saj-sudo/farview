import type { LocalDate } from './types';

/**
 * All calendar math for the engine. A LocalDate is a plain YYYY-MM-DD
 * string in the *user's* timezone (§11: local date, never UTC). Date.UTC
 * is used below purely as an arithmetic substrate for day counting — the
 * user's timezone only ever matters when deriving "today", which happens
 * once in todayInZone() and is injected everywhere else. Because every
 * computation runs on UTC milliseconds over calendar dates, DST cannot
 * shift a bar by an hour or a day.
 */

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  return isRealDate(Number(y), Number(mo), Number(d));
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const t = Date.UTC(year, month - 1, day);
  const dt = new Date(t);
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function fromYmd(year: number, month: number, day: number): LocalDate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}` as LocalDate;
}

function toUtcMs(date: LocalDate): number {
  const m = LOCAL_DATE_RE.exec(date)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * The current date in the given IANA timezone (browser-detected zone when
 * null). This is the only place wall-clock time enters the engine's world;
 * callers pass `now` explicitly so tests stay deterministic.
 */
export function todayInZone(now: Date, timeZone: string | null): LocalDate {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA formats as YYYY-MM-DD.
  return fmt.format(now) as LocalDate;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const dt = new Date(toUtcMs(date) + days * 86_400_000);
  return fromYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from `earlier` to `later` (positive when later is after). */
export function diffDays(later: LocalDate, earlier: LocalDate): number {
  return Math.round((toUtcMs(later) - toUtcMs(earlier)) / 86_400_000);
}

export function yearOf(date: LocalDate): number {
  return Number(date.slice(0, 4));
}

export function monthOf(date: LocalDate): number {
  return Number(date.slice(5, 7));
}

export function dayOf(date: LocalDate): number {
  return Number(date.slice(8));
}

/* ------------------------------------------------------------------ */
/* The timeline's continuous axis unit                                 */
/* ------------------------------------------------------------------ */

/**
 * Days since 1970-01-01 as an integer — the timeline's x-axis unit.
 * The scale works in day numbers so pan/zoom is plain arithmetic and
 * timezone never re-enters after "today" is derived.
 */
export function dayNumber(date: LocalDate): number {
  return Math.round(toUtcMs(date) / 86_400_000);
}

export function dateOfDayNumber(n: number): LocalDate {
  const dt = new Date(n * 86_400_000);
  return fromYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/* ------------------------------------------------------------------ */
/* Calendar boundaries for axis ticks and bands                        */
/* ------------------------------------------------------------------ */

export function startOfMonth(date: LocalDate): LocalDate {
  return fromYmd(yearOf(date), monthOf(date), 1);
}

export function addMonths(date: LocalDate, months: number): LocalDate {
  const zero = yearOf(date) * 12 + (monthOf(date) - 1) + months;
  const year = Math.floor(zero / 12);
  const month = ((zero % 12) + 12) % 12;
  return fromYmd(year, month + 1, 1);
}

/** 1-based quarter of a date. */
export function quarterOf(date: LocalDate): number {
  return Math.floor((monthOf(date) - 1) / 3) + 1;
}

export function startOfQuarter(date: LocalDate): LocalDate {
  return fromYmd(yearOf(date), (quarterOf(date) - 1) * 3 + 1, 1);
}

export function startOfYear(date: LocalDate): LocalDate {
  return fromYmd(yearOf(date), 1, 1);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: LocalDate): number {
  const wd = new Date(toUtcMs(date)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isWeekend(date: LocalDate): boolean {
  return weekdayOf(date) >= 6;
}

/* ------------------------------------------------------------------ */
/* Parsing and display                                                 */
/* ------------------------------------------------------------------ */

/**
 * Extract a LocalDate from an API date-ish value (ISO date or datetime
 * string). Returns null for anything unrecognizable.
 */
export function localDateFromIso(value: string): LocalDate | null {
  const m = /^(\d{4}-\d{2}-\d{2})([T ].*)?$/.exec(value.trim());
  if (!m) return null;
  return isLocalDate(m[1]!) ? (m[1] as LocalDate) : null;
}

export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Human display form, matching the app's own: "Aug 23, 2026". */
export function formatLocalDate(date: LocalDate): string {
  const month = MONTH_ABBR[monthOf(date) - 1]!;
  return `${month} ${dayOf(date)}, ${yearOf(date)}`;
}

/** Short form without the year: "Aug 23". */
export function formatMonthDay(date: LocalDate): string {
  return `${MONTH_ABBR[monthOf(date) - 1]!} ${dayOf(date)}`;
}
