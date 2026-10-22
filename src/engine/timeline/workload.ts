import { addMonths, dateOfDayNumber, dayNumber, startOfMonth } from '../dates';
import type { TimelineItem } from '../types';
import { place } from './lanes';

/**
 * How much runs at once: for each month, how many projects are active at some
 * point in it. A project counts in every month its bar touches, from its start
 * to its target. It states a fact and makes no judgement, so there is no
 * threshold and no colour for "too many".
 */

export interface MonthLoad {
  /** First day of the month, as a day number. */
  startDay: number;
  /** First day of the next month: the month spans [startDay, endDay). */
  endDay: number;
  year: number;
  /** 1 to 12. */
  month: number;
  /** Projects whose bar touches this month. */
  count: number;
}

/**
 * The months that overlap [firstDay, lastDay], each with its count. Goals are
 * flags, not running work, and items with no dates are in the Someday tray, so
 * neither is counted. An item placed by a span derived from its children counts,
 * since its dashed bar is on the chart.
 */
export function projectsPerMonth(
  items: readonly TimelineItem[],
  firstDay: number,
  lastDay: number,
  todayDay: number,
): MonthLoad[] {
  const spans: { start: number; end: number }[] = [];
  for (const item of items) {
    if (item.kind !== 'project') continue;
    const placed = place(item, todayDay);
    if (placed) spans.push({ start: placed.effStart, end: placed.effEnd });
  }

  const months: MonthLoad[] = [];
  let cursor = startOfMonth(dateOfDayNumber(Math.floor(firstDay)));
  for (let guard = 0; guard < 1200; guard += 1) {
    const startDay = dayNumber(cursor);
    if (startDay > lastDay) break;
    const next = addMonths(cursor, 1);
    const endDay = dayNumber(next);
    const count = spans.filter((s) => s.start < endDay && s.end > startDay).length;
    months.push({
      startDay,
      endDay,
      year: Number(cursor.slice(0, 4)),
      month: Number(cursor.slice(5, 7)),
      count,
    });
    cursor = next;
  }
  return months;
}
