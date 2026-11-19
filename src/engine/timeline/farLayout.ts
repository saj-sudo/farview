import {
  addMonths,
  dateOfDayNumber,
  dayNumber,
  formatLocalDate,
  formatMonthDay,
  MONTH_ABBR,
  monthOf,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  yearOf,
} from '../dates';
import type { LocalDate, TimelineItem } from '../types';
import { assignGroupColors } from './colors';
import { axisLabels, todayLabel, type AxisLabel } from './edges';
import { createFarScale, type FarScale, type FarSegmentId } from './farScale';
import { estTextWidth, place, type Placed } from './lanes';
import type { Tick } from './ticks';

/**
 * The far view's geometry. Items are grouped by goal: a goal is a flag
 * on a pole at its target date, and its projects sit in rows under it,
 * each joined to the pole by a dotted line. Every item carries its name
 * and its dates in words above its bar, so a bar a few pixels wide still
 * reads. Pure: today is passed in, and the renderer only maps this to SVG.
 */

export const FAR_HEAD_H = 30;
export const FAR_GROUP_H = 30;
export const FAR_ROW_H = 38;
export const FAR_GROUP_GAP = 12;
export const FAR_AXIS_H = 30;
export const FAR_BAR_H = 10;
/** Bars never draw narrower than this. */
export const FAR_MIN_BAR_W = 4;
/** An open-ended bar fades out this many days past today. */
export const FAR_OPEN_FADE_DAYS = 60;
const EDGE = 4;
const ROW_GAP_PX = 14;
const SEP = ' · ';

export type FarBarKind = 'bar' | 'openEnded' | 'point' | 'flag' | 'span';

export interface FarLabel {
  /** The item's name, shortened only when the chart is narrower than it. */
  text: string;
  /** Its dates in words, or null when there was no room for them. */
  meta: string | null;
  x: number;
  anchor: 'start' | 'end';
  /** Baseline. */
  y: number;
}

export interface FarBar {
  item: TimelineItem;
  kind: FarBarKind;
  x: number;
  w: number;
  y: number;
  h: number;
  clampedLeft: boolean;
  clampedRight: boolean;
  /** Target date is behind today and the item is still open: a fact, with a small marker. */
  passed: boolean;
  done: boolean;
  derived: boolean;
  color: string;
  label: FarLabel;
  /** The x of the goal's pole this project hangs from, when it sits right of the bar. */
  connectorX: number | null;
}

export interface FarGroup {
  goal: FarBar | null;
  /** Heading for a group with no goal; null when the space has no goals at all. */
  title: string | null;
  y: number;
  height: number;
  /** The pole's x and the y it runs down to; null for a goal with no target date. */
  poleX: number | null;
  poleBottom: number;
  count: number;
}

export interface FarHeading {
  id: FarSegmentId;
  x: number;
  width: number;
  /** Null when the stretch is too narrow to name. */
  label: string | null;
}

export interface FarLayout {
  width: number;
  height: number;
  scale: FarScale;
  headings: FarHeading[];
  ticks: Tick[];
  axis: AxisLabel[];
  today: { x: number; w: number; text: string };
  groups: FarGroup[];
  /** Project rows. Goals live on their groups. */
  bars: FarBar[];
  nowX: number;
  todayDay: number;
}

export interface FarLayoutOptions {
  width: number;
  today: LocalDate;
  groupOrder: string[];
  /** A phone: the near stretch takes more of the width and headings shorten. */
  narrow?: boolean;
}

/** A date in as few words as its distance from today allows. */
export function farDate(date: LocalDate, today: LocalDate): string {
  const away = Math.abs(dayNumber(date) - dayNumber(today));
  if (away <= 183) return formatMonthDay(date);
  if (away <= 456) return formatLocalDate(date);
  if (away <= 1826) return `${MONTH_ABBR[monthOf(date) - 1]!} ${yearOf(date)}`;
  return String(yearOf(date));
}

/** An item's dates in words. Never a percentage, never "overdue". */
export function farMeta(p: Placed, today: LocalDate, windowStart: number): string {
  const todayDay = dayNumber(today);
  const { item, startDay, targetDay, usesDerived } = p;
  const fmt = (day: number): string => farDate(dateOfDayNumber(day), today);
  if (item.status === 'done') return 'done';
  if (usesDerived) {
    return item.kind === 'goal' ? 'no target date' : 'no dates of its own';
  }
  if (item.flags.targetBeforeStart && targetDay !== null) return `${fmt(targetDay)}, dates reversed`;
  if (targetDay !== null && targetDay < todayDay) return `target passed ${fmt(targetDay)}`;
  if (item.kind === 'goal' && targetDay !== null) return fmt(targetDay);
  if (startDay !== null && targetDay !== null) {
    if (startDay < windowStart) {
      const d = dateOfDayNumber(startDay);
      return `since ${MONTH_ABBR[monthOf(d) - 1]!} ${yearOf(d)}, to ${fmt(targetDay)}`;
    }
    if (startDay <= todayDay) return `to ${fmt(targetDay)}`;
    return `${fmt(startDay)} to ${fmt(targetDay)}`;
  }
  if (startDay !== null) {
    return startDay > todayDay ? `from ${fmt(startDay)}, no end date` : 'no end date';
  }
  return fmt(targetDay!);
}

function shorten(text: string, px: number): string {
  const max = Math.floor((px - 8) / 6.4);
  if (text.length <= max) return text;
  if (max <= 1) return '…';
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Name and dates cut to fit `room` px: the dates go first, then the name shortens. */
function fitLabel(name: string, meta: string, room: number): { text: string; meta: string | null; w: number } {
  const full = estTextWidth(name + SEP + meta);
  if (full <= room) return { text: name, meta, w: full };
  const alone = estTextWidth(name);
  if (alone <= room) return { text: name, meta: null, w: alone };
  const text = shorten(name, room);
  return { text, meta: null, w: Math.min(room, estTextWidth(text)) };
}

/** The [left, right] px a row entry covers: bar, marker, connector and label. */
export function farOccupied(bar: Pick<FarBar, 'x' | 'w' | 'kind' | 'passed' | 'label' | 'connectorX'>): [number, number] {
  const labelW = estTextWidth(bar.label.text + (bar.label.meta ? SEP + bar.label.meta : ''));
  const [l0, l1] =
    bar.label.anchor === 'end' ? [bar.label.x - labelW, bar.label.x] : [bar.label.x, bar.label.x + labelW];
  const markLeft = bar.kind === 'point' ? bar.x - 7 : bar.x;
  let markRight = bar.kind === 'point' ? bar.x + 7 : bar.x + bar.w + (bar.passed ? 14 : 0);
  if (bar.kind === 'flag') markRight = bar.x + 14;
  if (bar.connectorX !== null) markRight = Math.max(markRight, bar.connectorX);
  return [Math.min(markLeft, l0), Math.max(markRight, l1)];
}

function headingText(id: FarSegmentId, endDay: number, today: LocalDate, narrow: boolean): string {
  const end = dateOfDayNumber(endDay);
  const monthYear = `${MONTH_ABBR[monthOf(end) - 1]!} ${yearOf(end)}`;
  // The decade stretch ends on 1 January, so its last full year is the one before.
  const lastYear = String(yearOf(end) - 1);
  if (narrow) {
    if (id === 'recent') return '';
    if (id === 'quarter') return 'This quarter';
    if (id === 'year') return `To ${monthYear}`;
    return `To ${lastYear}`;
  }
  if (id === 'recent') return 'Recent';
  if (id === 'quarter') return `This quarter, to ${farDate(end, today)}`;
  if (id === 'year') return `Next year, to ${monthYear}`;
  return `The decade, to ${lastYear}`;
}

function farTicks(scale: FarScale): Tick[] {
  const ticks: Tick[] = [];
  const [, quarter, year, decade] = scale.segments as [unknown, FarScale['segments'][number], FarScale['segments'][number], FarScale['segments'][number]];
  // Months across the quarter.
  let d = addMonths(startOfMonth(dateOfDayNumber(quarter.startDay)), 1);
  while (dayNumber(d) < quarter.endDay) {
    const jan = monthOf(d) === 1;
    ticks.push({ day: dayNumber(d), level: 'minor', label: jan ? `Jan ${yearOf(d)}` : MONTH_ABBR[monthOf(d) - 1]! });
    d = addMonths(d, 1);
  }
  // Quarters across the year after.
  d = addMonths(startOfQuarter(dateOfDayNumber(year.startDay)), 3);
  while (dayNumber(d) < year.endDay) {
    if (dayNumber(d) > year.startDay) {
      const jan = monthOf(d) === 1;
      ticks.push({ day: dayNumber(d), level: 'minor', label: jan ? `Jan ${yearOf(d)}` : MONTH_ABBR[monthOf(d) - 1]! });
    }
    d = addMonths(d, 3);
  }
  // Years across the rest.
  d = addMonths(startOfYear(dateOfDayNumber(decade.startDay)), 12);
  while (dayNumber(d) < decade.endDay) {
    ticks.push({ day: dayNumber(d), level: 'minor', label: String(yearOf(d)) });
    d = addMonths(d, 12);
  }
  return ticks;
}

export function layoutFarView(items: TimelineItem[], opts: FarLayoutOptions): FarLayout {
  const narrow = opts.narrow === true;
  const width = opts.width;
  const scale = createFarScale(opts.today, width, narrow);
  const todayDay = dayNumber(opts.today);
  const nowX = scale.xOf(todayDay);
  const right = width - EDGE;
  const room = Math.max(24, width - 2 * EDGE);

  const placedAll = items
    .map((item) => place(item, todayDay))
    .filter((p): p is Placed => p !== null);
  const goals = placedAll.filter((p) => p.item.kind === 'goal');
  const projects = placedAll.filter((p) => p.item.kind !== 'goal');

  // Colour follows the pillar, in the same order the linear zooms use.
  const rank = (g: string | null): [number, string] => {
    if (g === null) return [2, ''];
    const i = opts.groupOrder.indexOf(g);
    return i >= 0 ? [0, String(i).padStart(6, '0')] : [1, g];
  };
  const pillarOrder = [...new Set(projects.map((p) => p.item.group))].sort((a, b) => {
    const [pa, sa] = rank(a);
    const [pb, sb] = rank(b);
    return pa - pb || (sa < sb ? -1 : sa > sb ? 1 : 0);
  });
  const colors = assignGroupColors(pillarOrder);

  const clampX = (x: number): number => Math.min(width, Math.max(0, x));

  const geometry = (p: Placed, y: number, poleX: number | null): FarBar => {
    const { item, startDay, targetDay, effStart, effEnd, usesDerived } = p;
    const done = item.status === 'done';
    const isGoal = item.kind === 'goal';
    const isPoint = item.flags.targetBeforeStart || (startDay === null && targetDay !== null);
    const isOpen = !isPoint && startDay !== null && targetDay === null;
    const passed = !done && !usesDerived && targetDay !== null && targetDay < todayDay;
    const meta = farMeta(p, opts.today, scale.startDay);
    const color = isGoal ? 'var(--ink1)' : (colors.get(item.group) ?? 'var(--g6)');

    let kind: FarBarKind;
    let x: number;
    let w: number;
    let clampedLeft: boolean;
    let clampedRight: boolean;
    if (isGoal && targetDay !== null && !usesDerived) {
      kind = 'flag';
      clampedLeft = targetDay < scale.startDay;
      clampedRight = targetDay > scale.endDay;
      x = clampX(scale.xOf(targetDay));
      w = 0;
    } else if (isPoint) {
      kind = 'point';
      clampedLeft = effStart < scale.startDay;
      clampedRight = effStart > scale.endDay;
      x = clampX(scale.xOf(effStart));
      w = 0;
    } else {
      kind = isGoal || usesDerived ? 'span' : isOpen ? 'openEnded' : 'bar';
      const endDay = isOpen ? Math.max(todayDay, effStart) + FAR_OPEN_FADE_DAYS : effEnd;
      clampedLeft = effStart < scale.startDay;
      clampedRight = endDay > scale.endDay;
      x = clampX(scale.xOf(effStart));
      const endX = clampX(scale.xOf(endDay));
      w = Math.max(endX - x, FAR_MIN_BAR_W);
      if (x + w > width) x = width - w;
    }

    let fit = fitLabel(item.title, meta, room);
    let labelX: number;
    let anchor: FarLabel['anchor'] = 'start';
    if (kind === 'flag') {
      // Beside the pennant, or on the pole's other side when it would run off
      // the chart. If the dates fit on neither side, the name goes alone.
      const beside = (w: number): { x: number; anchor: FarLabel['anchor'] } | null => {
        if (x + 18 + w <= right) return { x: x + 18, anchor: 'start' };
        if (x - 6 - w >= EDGE) return { x: x - 6, anchor: 'end' };
        return null;
      };
      let spot = beside(fit.w);
      if (spot === null && fit.meta !== null) {
        const alone = fitLabel(item.title, '', estTextWidth(item.title));
        const nameOnly = { text: alone.text, meta: null, w: estTextWidth(alone.text) };
        const retry = beside(nameOnly.w);
        if (retry !== null) {
          fit = nameOnly;
          spot = retry;
        }
      }
      if (spot !== null) {
        labelX = spot.x;
        anchor = spot.anchor;
      } else labelX = Math.max(EDGE, right - fit.w);
    } else {
      const from = kind === 'point' ? x - 6 : x;
      labelX = Math.max(EDGE, Math.min(from, right - fit.w));
    }

    const barY = kind === 'flag' ? y + 5 : kind === 'span' && isGoal ? y + 19 : y + 20;
    const labelY = kind === 'flag' ? y + 15 : y + 13;
    const endOfMark = x + w + (passed ? 14 : 0);
    return {
      item,
      kind,
      x,
      w,
      y: barY,
      h: kind === 'span' && isGoal ? 8 : FAR_BAR_H,
      clampedLeft,
      clampedRight,
      passed,
      done,
      derived: usesDerived,
      color,
      label: { text: fit.text, meta: fit.meta, x: labelX, anchor, y: labelY },
      connectorX: poleX !== null && kind !== 'flag' && poleX > endOfMark + 6 ? poleX : null,
    };
  };

  const byGoal = new Map<string, Placed[]>();
  const loose: Placed[] = [];
  const goalIds = new Set(goals.map((g) => g.item.id));
  for (const p of projects) {
    const id = p.item.goalId;
    if (id !== null && goalIds.has(id)) {
      const list = byGoal.get(id);
      if (list) list.push(p);
      else byGoal.set(id, [p]);
    } else loose.push(p);
  }
  const byStart = (a: Placed, b: Placed): number =>
    a.effStart - b.effStart || (a.item.id < b.item.id ? -1 : 1);
  // Nearest goal first: by its own target, or where its derived span begins.
  const goalAnchor = (p: Placed): number =>
    !p.usesDerived && p.targetDay !== null ? p.targetDay : p.effStart;
  const orderedGoals = [...goals].sort(
    (a, b) => goalAnchor(a) - goalAnchor(b) || (a.item.id < b.item.id ? -1 : 1),
  );

  const groups: FarGroup[] = [];
  const bars: FarBar[] = [];
  let y = FAR_HEAD_H;

  // Rows pack by what each entry covers, so two far-apart items share a row
  // and nothing in a row touches.
  const packRows = (list: Placed[], top: number, poleX: number | null): number => {
    const rowEnds: number[] = [];
    for (const p of [...list].sort(byStart)) {
      const probe = geometry(p, 0, poleX);
      const [left, rightPx] = farOccupied(probe);
      let row = rowEnds.findIndex((end) => end + ROW_GAP_PX <= left);
      if (row < 0) {
        row = rowEnds.length;
        rowEnds.push(rightPx);
      } else rowEnds[row] = rightPx;
      bars.push(geometry(p, top + row * FAR_ROW_H, poleX));
    }
    return rowEnds.length;
  };

  for (const g of orderedGoals) {
    const top = y;
    const goalBar = geometry(g, top, null);
    const poleX = goalBar.kind === 'flag' ? goalBar.x : null;
    const rows = packRows(byGoal.get(g.item.id) ?? [], top + FAR_GROUP_H, poleX);
    const height = FAR_GROUP_H + rows * FAR_ROW_H;
    groups.push({
      goal: goalBar,
      title: null,
      y: top,
      height,
      poleX,
      poleBottom: rows > 0 ? top + height - 4 : top + FAR_GROUP_H - 2,
      count: (byGoal.get(g.item.id) ?? []).length,
    });
    y += height + FAR_GROUP_GAP;
  }
  if (loose.length > 0) {
    const top = y;
    const headed = goals.length > 0;
    const title = !headed
      ? null
      : loose.every((p) => p.item.goalId === null)
        ? 'No goal yet'
        : 'Other projects';
    const head = headed ? FAR_GROUP_H : 0;
    const rows = packRows(loose, top + head, null);
    const height = head + rows * FAR_ROW_H;
    groups.push({ goal: null, title, y: top, height, poleX: null, poleBottom: top, count: loose.length });
    y += height + FAR_GROUP_GAP;
  }

  const ticks = farTicks(scale);
  const today = todayLabel(nowX, width, `Today · ${formatMonthDay(opts.today)}`);
  const axis = axisLabels(ticks, (day) => scale.xOf(day), width, [today.x, today.x + today.w]);
  const headings: FarHeading[] = scale.segments.map((s) => {
    const text = headingText(s.id, s.endDay, opts.today, narrow);
    const w = s.x1 - s.x0;
    return { id: s.id, x: s.x0, width: w, label: text !== '' && text.length * 7.4 + 12 <= w ? text : null };
  });

  return {
    width,
    height: Math.max(y, FAR_HEAD_H + FAR_GROUP_H) + FAR_AXIS_H,
    scale,
    headings,
    ticks,
    axis,
    today,
    groups,
    bars,
    nowX,
    todayDay,
  };
}
