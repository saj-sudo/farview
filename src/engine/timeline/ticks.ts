import {
  addDays,
  addMonths,
  dateOfDayNumber,
  dayNumber,
  isWeekend,
  MONTH_ABBR,
  MONTH_FULL,
  monthOf,
  quarterOf,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  weekdayOf,
  yearOf,
} from '../dates';
import type { LocalDate } from '../types';

/**
 * Axis furniture, chosen by density rather than by zoom preset — so any
 * intermediate window (mid-animation, free wheel-zoom) still reads
 * correctly. Zooming out feels like detail condensing: weekdays give
 * way to months, months to quarters, quarters to years, years to the
 * shape of a decade.
 *
 *   pxPerDay ≥ 6      weeks + month bands + weekend stripes
 *   1.2 – 6           months + quarter structure
 *   0.35 – 1.2        quarters + year bands
 *   < 0.35            years + half-decade emphasis, year numerals in-band
 */

export interface Tick {
  day: number;
  level: 'minor' | 'major';
  label: string | null;
}

export interface Band {
  startDay: number;
  endDay: number;
  /** Large in-band numeral text (decade zoom years only). */
  label: string | null;
  alt: boolean;
}

export type TickUnit = 'week' | 'month' | 'quarter' | 'year' | 'multiyear';

export interface TickSet {
  unit: TickUnit;
  ticks: Tick[];
  bands: Band[];
  /** Saturday–Monday micro-stripes; only produced at week density. */
  weekendBands: Band[];
}

export function unitFor(pxPerDay: number): TickUnit {
  if (pxPerDay >= 6) return 'week';
  if (pxPerDay >= 1.2) return 'month';
  if (pxPerDay >= 0.35) return 'quarter';
  return 'multiyear';
}

/** First calendar boundary at or before the window start, then step. */
function* boundaries(
  startDay: number,
  endDay: number,
  floor: (d: LocalDate) => LocalDate,
  step: (d: LocalDate) => LocalDate,
): Generator<{ day: number; date: LocalDate }> {
  let date = floor(dateOfDayNumber(Math.floor(startDay)));
  while (dayNumber(date) <= endDay) {
    yield { day: dayNumber(date), date };
    date = step(date);
  }
}

function bandsFrom(
  points: { day: number; date: LocalDate }[],
  endDay: number,
  altOf: (date: LocalDate) => boolean,
  labelOf: (date: LocalDate) => string | null = () => null,
): Band[] {
  const out: Band[] = [];
  for (const [i, point] of points.entries()) {
    const next = points[i + 1];
    out.push({
      startDay: point.day,
      endDay: next ? next.day : endDay,
      label: labelOf(point.date),
      alt: altOf(point.date),
    });
  }
  return out;
}

export function generateTicks(
  startDay: number,
  endDay: number,
  pxPerDay: number,
): TickSet {
  const unit = unitFor(pxPerDay);
  const ticks: Tick[] = [];
  let bands: Band[] = [];
  const weekendBands: Band[] = [];

  if (unit === 'week') {
    // Minors on Mondays; majors on month starts, labeled with the month
    // (year attached at January and at the first major in view).
    const monthPoints = [...boundaries(startDay, endDay, startOfMonth, (d) => addMonths(d, 1))];
    bands = bandsFrom(monthPoints, endDay, (d) => monthOf(d) % 2 === 0);
    let firstMajor = true;
    for (const point of monthPoints) {
      const withYear = firstMajor || monthOf(point.date) === 1;
      firstMajor = false;
      ticks.push({
        day: point.day,
        level: 'major',
        label: `${MONTH_FULL[monthOf(point.date) - 1]!}${withYear ? ` ${yearOf(point.date)}` : ''}`,
      });
    }
    const floorMonday = (d: LocalDate): LocalDate => addDays(d, -(weekdayOf(d) - 1));
    for (const point of boundaries(startDay, endDay, floorMonday, (d) => addDays(d, 7))) {
      if (point.date !== startOfMonth(point.date)) {
        ticks.push({ day: point.day, level: 'minor', label: null });
      }
    }
    // Weekend stripes: free texture that says "day resolution".
    let cursor = dateOfDayNumber(Math.floor(startDay));
    while (dayNumber(cursor) <= endDay) {
      if (weekdayOf(cursor) === 6) {
        weekendBands.push({
          startDay: dayNumber(cursor),
          endDay: dayNumber(cursor) + 2,
          label: null,
          alt: false,
        });
        cursor = addDays(cursor, 7);
      } else {
        cursor = addDays(cursor, 1);
      }
    }
  } else if (unit === 'month') {
    // Minors on month starts (abbreviated); majors on quarter starts.
    const quarterPoints = [...boundaries(startDay, endDay, startOfQuarter, (d) => addMonths(d, 3))];
    bands = bandsFrom(quarterPoints, endDay, (d) => quarterOf(d) % 2 === 0);
    for (const point of quarterPoints) {
      ticks.push({
        day: point.day,
        level: 'major',
        label: `Q${quarterOf(point.date)} ${yearOf(point.date)}`,
      });
    }
    for (const point of boundaries(startDay, endDay, startOfMonth, (d) => addMonths(d, 1))) {
      if (point.date !== startOfQuarter(point.date)) {
        ticks.push({
          day: point.day,
          level: 'minor',
          label: MONTH_ABBR[monthOf(point.date) - 1]!,
        });
      }
    }
  } else if (unit === 'quarter') {
    // Minors on quarter starts; majors on year starts.
    const yearPoints = [...boundaries(startDay, endDay, startOfYear, (d) => addMonths(d, 12))];
    bands = bandsFrom(yearPoints, endDay, (d) => yearOf(d) % 2 === 0);
    for (const point of yearPoints) {
      ticks.push({ day: point.day, level: 'major', label: String(yearOf(point.date)) });
    }
    for (const point of boundaries(startDay, endDay, startOfQuarter, (d) => addMonths(d, 3))) {
      if (quarterOf(point.date) !== 1) {
        ticks.push({
          day: point.day,
          level: 'minor',
          label: `Q${quarterOf(point.date)}`,
        });
      }
    }
  } else {
    // Decade scale: alternating year bands carry large quiet numerals —
    // the structure IS the label. Majors emphasize half-decades.
    const yearPoints = [...boundaries(startDay, endDay, startOfYear, (d) => addMonths(d, 12))];
    bands = bandsFrom(
      yearPoints,
      endDay,
      (d) => yearOf(d) % 2 === 0,
      (d) => String(yearOf(d)),
    );
    for (const point of yearPoints) {
      const emphasized = yearOf(point.date) % 5 === 0;
      ticks.push({
        day: point.day,
        level: emphasized ? 'major' : 'minor',
        label: emphasized ? String(yearOf(point.date)) : null,
      });
    }
  }

  ticks.sort((a, b) => a.day - b.day);
  return { unit, ticks, bands, weekendBands };
}
