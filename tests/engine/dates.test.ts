import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dateOfDayNumber,
  dayNumber,
  diffDays,
  formatLocalDate,
  isLocalDate,
  isWeekend,
  localDateFromIso,
  quarterOf,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  todayInZone,
  weekdayOf,
} from '../../src/engine/dates';
import type { LocalDate } from '../../src/engine/types';

const d = (s: string) => s as LocalDate;

describe('local dates', () => {
  it('validates real calendar dates only', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2024-02-29')).toBe(true); // leap year
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-04-31')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('not a date')).toBe(false);
  });

  it('derives today in a named zone, not UTC', () => {
    // 2026-03-08T06:30Z is still March 7 in Los Angeles (UTC-8, about to
    // spring forward) and already March 8 in Berlin.
    const now = new Date('2026-03-08T06:30:00Z');
    expect(todayInZone(now, 'America/Los_Angeles')).toBe('2026-03-07');
    expect(todayInZone(now, 'Europe/Berlin')).toBe('2026-03-08');
  });
});

describe('day arithmetic', () => {
  it('is immune to DST boundaries', () => {
    // US spring-forward 2026 is March 8. A calendar span across it is
    // exact whole days — no 23-hour day can shorten it.
    expect(diffDays(d('2026-03-10'), d('2026-03-05'))).toBe(5);
    expect(addDays(d('2026-03-07'), 3)).toBe('2026-03-10');
    // And across fall-back (Nov 1, 2026).
    expect(diffDays(d('2026-11-03'), d('2026-10-30'))).toBe(4);
  });

  it('crosses New Year cleanly', () => {
    expect(addDays(d('2026-12-30'), 3)).toBe('2027-01-02');
    expect(diffDays(d('2027-01-02'), d('2026-12-30'))).toBe(3);
    expect(addDays(d('2027-01-02'), -3)).toBe('2026-12-30');
  });

  it('round-trips through day numbers', () => {
    for (const date of ['1970-01-01', '2026-08-25', '2036-02-29']) {
      expect(dateOfDayNumber(dayNumber(d(date)))).toBe(date);
    }
    expect(dayNumber(d('1970-01-01'))).toBe(0);
    expect(dayNumber(d('1970-01-02'))).toBe(1);
  });
});

describe('calendar boundaries', () => {
  it('finds month, quarter, and year starts', () => {
    expect(startOfMonth(d('2026-08-25'))).toBe('2026-08-01');
    expect(startOfQuarter(d('2026-08-25'))).toBe('2026-07-01');
    expect(startOfQuarter(d('2026-12-31'))).toBe('2026-10-01');
    expect(startOfYear(d('2026-08-25'))).toBe('2026-01-01');
    expect(quarterOf(d('2026-01-15'))).toBe(1);
    expect(quarterOf(d('2026-08-25'))).toBe(3);
  });

  it('steps months across year boundaries', () => {
    expect(addMonths(d('2026-11-20'), 2)).toBe('2027-01-01');
    expect(addMonths(d('2026-01-05'), -1)).toBe('2025-12-01');
    expect(addMonths(d('2026-08-25'), 0)).toBe('2026-08-01');
  });

  it('knows weekdays and weekends', () => {
    expect(weekdayOf(d('2026-08-24'))).toBe(1); // a Monday
    expect(weekdayOf(d('2026-08-30'))).toBe(7); // a Sunday
    expect(isWeekend(d('2026-08-29'))).toBe(true);
    expect(isWeekend(d('2026-08-25'))).toBe(false);
  });
});

describe('parsing and display', () => {
  it('extracts dates from ISO date-ish values', () => {
    expect(localDateFromIso('2026-04-23')).toBe('2026-04-23');
    expect(localDateFromIso('2026-04-23T00:00:00.000Z')).toBe('2026-04-23');
    expect(localDateFromIso('2026-04-23 10:00')).toBe('2026-04-23');
    expect(localDateFromIso('yesterday')).toBeNull();
    expect(localDateFromIso('2026-02-30')).toBeNull();
  });

  it('formats for humans', () => {
    expect(formatLocalDate(d('2026-08-05'))).toBe('Aug 5, 2026');
  });
});
