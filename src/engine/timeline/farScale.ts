import { dayNumber, yearOf } from '../dates';
import type { LocalDate } from '../types';
import type { Scale } from './scale';

/**
 * The far view's coordinate system: one fixed window anchored on today,
 * cut into four stretches that each run at their own density. Near time
 * is wide and far time is narrow, so a decade fits on one screen without
 * the next quarter collapsing into a sliver. Each stretch is linear inside
 * itself, and the seams are drawn, so a reader can see where the scale
 * changes.
 */

export type FarSegmentId = 'recent' | 'quarter' | 'year' | 'decade';

export interface FarSegment {
  id: FarSegmentId;
  startDay: number;
  endDay: number;
  x0: number;
  x1: number;
}

export interface FarScale extends Scale {
  segments: FarSegment[];
}

/** How far back the thin strip left of today reaches. */
export const FAR_RECENT_DAYS = 60;
export const FAR_QUARTER_DAYS = 91;
export const FAR_YEAR_DAYS = 365;
/** The window ends on 1 January this many years after today's year. */
export const FAR_YEARS_OUT = 10;

/** Share of the width each stretch takes, in segment order. */
export const FAR_SHARES_WIDE = [0.08, 0.44, 0.28, 0.2] as const;
export const FAR_SHARES_NARROW = [0.06, 0.5, 0.26, 0.18] as const;

export function farEndDay(today: LocalDate): number {
  const year = String(yearOf(today) + FAR_YEARS_OUT).padStart(4, '0');
  return dayNumber(`${year}-01-01` as LocalDate);
}

export function createFarScale(today: LocalDate, widthPx: number, narrow: boolean): FarScale {
  const todayDay = dayNumber(today);
  const breaks = [
    todayDay - FAR_RECENT_DAYS,
    todayDay,
    todayDay + FAR_QUARTER_DAYS,
    todayDay + FAR_QUARTER_DAYS + FAR_YEAR_DAYS,
    farEndDay(today),
  ];
  const shares = narrow ? FAR_SHARES_NARROW : FAR_SHARES_WIDE;
  const ids: FarSegmentId[] = ['recent', 'quarter', 'year', 'decade'];
  const segments: FarSegment[] = [];
  let x = 0;
  ids.forEach((id, i) => {
    const w = shares[i]! * widthPx;
    segments.push({ id, startDay: breaks[i]!, endDay: breaks[i + 1]!, x0: x, x1: x + w });
    x += w;
  });
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  const slope = (s: FarSegment): number => (s.x1 - s.x0) / (s.endDay - s.startDay);

  // Outside the window the nearest stretch's density carries on, so the
  // mapping stays monotonic and callers can tell how far off an item is.
  const xOf = (day: number): number => {
    if (day <= first.startDay) return first.x0 + (day - first.startDay) * slope(first);
    for (const s of segments) {
      if (day <= s.endDay) return s.x0 + (day - s.startDay) * slope(s);
    }
    return last.x1 + (day - last.endDay) * slope(last);
  };
  const dayAt = (px: number): number => {
    if (px <= first.x0) return first.startDay + (px - first.x0) / slope(first);
    for (const s of segments) {
      if (px <= s.x1) return s.startDay + (px - s.x0) / slope(s);
    }
    return last.endDay + (px - last.x1) / slope(last);
  };

  return {
    startDay: first.startDay,
    endDay: last.endDay,
    // The density a reader works at: the quarter stretch.
    pxPerDay: slope(segments[1]!),
    xOf,
    dayAt,
    segments,
  };
}
