import { addDays, dateOfDayNumber } from '../dates';
import type { DateChange } from '../editor';
import type { TimelineItem } from '../types';

/**
 * Dropping an undated item on the timeline gives it dates. The drop point is
 * the day the work starts, and a project runs for DEFAULT_SPAN_DAYS from
 * there, which is long enough to see and easy to stretch afterwards.
 */
export const DEFAULT_SPAN_DAYS = 28;

export interface WritableDates {
  start: boolean;
  target: boolean;
}

/**
 * The dates a drop on `dropDay` (a day number) writes, or null when this
 * item has no date the space lets us write. Only the writable dates are
 * named, so nothing the mapping marks read-only is ever sent.
 *
 * - Both dates writable: starts on the drop day, ends DEFAULT_SPAN_DAYS later.
 * - Only the target writable (a goal, or a project with no start property):
 *   the target is the drop day.
 * - Only the start writable: the start is the drop day.
 *
 * An item that already has a date keeps it: a drop never moves work that was
 * already placed, so a half-dated item gets only the missing date.
 */
export function datesForDrop(
  item: TimelineItem,
  dropDay: number,
  writable: WritableDates,
): DateChange | null {
  const day = dateOfDayNumber(Math.round(dropDay));
  const change: DateChange = {};
  if (writable.start && writable.target) {
    if (item.start === null) change.start = day;
    if (item.target === null) change.target = addDays(item.start ?? day, DEFAULT_SPAN_DAYS);
  } else if (writable.target) {
    if (item.target === null) change.target = day;
  } else if (writable.start) {
    if (item.start === null) change.start = day;
  }
  return Object.keys(change).length > 0 ? change : null;
}
