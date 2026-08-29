import { dayNumber } from '../dates';
import type { LocalDate, TimelineItem } from '../types';
import { assignGroupColors } from './colors';
import { estTextWidth, packLanes, type Placed } from './lanes';
import { createScale, type Scale, type ViewState } from './scale';
import { generateTicks, type TickSet } from './ticks';

/**
 * Compose scale + ticks + lanes into render-ready geometry. Pure: the
 * SVG component maps this straight to elements, and every visual rule
 * that matters — elapsed fill, clamping, label placement, dot collapse —
 * is decided (and therefore tested) here, not in the DOM.
 */

export const BAR_H = 22;
export const ROW_GAP = 8;
export const LANE_HEADER_H = 26;
export const LANE_PAD_BOTTOM = 10;
export const AXIS_H = 30;
export const TOP_PAD = 6;
/** Bars narrower than this collapse to dots (decade-scale density). */
export const DOT_THRESHOLD_PX = 6;
/** Below this density labels hide except on wide bars. */
export const LABEL_DENSITY_MIN = 0.35;
export const LABEL_WIDE_BAR_PX = 120;

export type BarKind = 'bar' | 'openEnded' | 'point' | 'dot';

export interface BarGeometry {
  item: TimelineItem;
  kind: BarKind;
  x: number;
  w: number;
  y: number;
  h: number;
  /** Elapsed time as a fraction of the span — never completion % (§9.3). */
  elapsedFrac: number;
  /** Pixel width of the elapsed fill, measured from x — clamp-safe. */
  fillW: number;
  clampedLeft: boolean;
  clampedRight: boolean;
  overdue: boolean;
  done: boolean;
  /** Placed by a derived rollup span: drawn dashed, no fill, no drag. */
  derived: boolean;
  color: string;
  label: { placement: 'inside' | 'right' | 'left' | 'hidden'; text: string; x: number };
}

export interface LaneGeometry {
  group: string | null;
  /** The area within the pillar, when a second grouping level is mapped. */
  subGroup: string | null;
  /** First lane of its primary group: the pillar's name prints here only. */
  firstOfGroup: boolean;
  label: string;
  color: string;
  y: number;
  height: number;
  count: number;
  overflowCount: number;
}

export interface TimelineLayout {
  width: number;
  height: number;
  scale: Scale;
  ticks: TickSet;
  lanes: LaneGeometry[];
  bars: BarGeometry[];
  nowX: number;
  todayDay: number;
}

export interface LayoutOptions {
  view: ViewState;
  width: number;
  today: LocalDate;
  groupOrder: string[];
  /** Second-level lane order (areas within a pillar). */
  subGroupOrder?: string[];
  maxRowsPerLane?: number;
}

const GOALS_LANE = '__goals__';

function truncate(text: string, px: number): string {
  const max = Math.floor((px - 8) / 6.4);
  if (text.length <= max) return text;
  if (max <= 1) return '…';
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function layoutTimeline(
  items: TimelineItem[],
  opts: LayoutOptions,
): TimelineLayout {
  const scale = createScale(opts.view, opts.width);
  const ticks = generateTicks(scale.startDay, scale.endDay, scale.pxPerDay);
  const todayDay = dayNumber(opts.today);
  const nowX = scale.xOf(todayDay);

  // Goals get their own top lane; projects lane by group.
  const goals = items.filter((i) => i.kind === 'goal');
  const projects = items.filter((i) => i.kind !== 'goal');
  const goalLanes = packLanes(
    // One goals lane, whatever their tags: sub-grouping applies to work.
    goals.map((g) => ({ ...g, group: GOALS_LANE, subGroup: null })),
    {
      todayDay,
      pxPerDay: scale.pxPerDay,
      groupOrder: [GOALS_LANE],
      ...(opts.maxRowsPerLane !== undefined ? { maxRows: opts.maxRowsPerLane } : {}),
    },
  );
  const projectLanes = packLanes(projects, {
    todayDay,
    pxPerDay: scale.pxPerDay,
    groupOrder: opts.groupOrder,
    ...(opts.subGroupOrder ? { subGroupOrder: opts.subGroupOrder } : {}),
    ...(opts.maxRowsPerLane !== undefined ? { maxRows: opts.maxRowsPerLane } : {}),
  });

  // Color follows the PRIMARY group: a pillar's areas share its hue, so
  // the sub-lanes read as one family rather than six unrelated colors.
  const colors = assignGroupColors(projectLanes.map((l) => l.group));
  const laneGeoms: LaneGeometry[] = [];
  const bars: BarGeometry[] = [];
  let y = TOP_PAD;

  const allLanes = [...goalLanes, ...projectLanes];
  for (const lane of allLanes) {
    const isGoals = lane.group === GOALS_LANE;
    const color = isGoals ? 'var(--g5)' : (colors.get(lane.group) ?? 'var(--g6)');
    const laneTop = y;
    y += LANE_HEADER_H;
    for (const row of lane.rows) {
      for (const placed of row) {
        const bar = barGeometry(placed, scale, todayDay, y, color);
        if (bar) bars.push(bar);
      }
      y += BAR_H + ROW_GAP;
    }
    y += LANE_PAD_BOTTOM;
    laneGeoms.push({
      group: isGoals ? null : lane.group,
      subGroup: isGoals ? null : lane.subGroup,
      firstOfGroup: isGoals ? true : lane.firstOfGroup,
      // The lane's own name: its area when nested, else its pillar. A
      // pillar's leftovers — tagged with it but with no area — trail its
      // areas as "Other" rather than repeating the pillar's name.
      label: isGoals
        ? 'Goals'
        : (lane.subGroup ??
          (lane.firstOfGroup
            ? (lane.group ?? (projectLanes.length > 1 ? 'Ungrouped' : 'Projects'))
            : 'Other')),
      color,
      y: laneTop,
      height: y - laneTop,
      count: lane.rows.reduce((n, r) => n + r.length, 0) + lane.overflow.length,
      overflowCount: lane.overflow.length,
    });
  }

  return {
    width: opts.width,
    height: y + AXIS_H,
    scale,
    ticks,
    lanes: laneGeoms,
    bars,
    nowX,
    todayDay,
  };
}

function barGeometry(
  placed: Placed,
  scale: Scale,
  todayDay: number,
  y: number,
  color: string,
): BarGeometry | null {
  const { item, startDay, targetDay, effStart, effEnd, usesDerived } = placed;

  // Cull far-off-screen geometry, generously, so labels never pop at edges.
  const cullMargin = 400 / Math.max(scale.pxPerDay, 0.001);
  if (effEnd < scale.startDay - cullMargin || effStart > scale.endDay + cullMargin) {
    return null;
  }

  const isPoint =
    item.flags.targetBeforeStart || (startDay === null && targetDay !== null);
  const isOpenEnded = !isPoint && startDay !== null && targetDay === null;

  const rawX = scale.xOf(effStart);
  const rawEndX = scale.xOf(effEnd);
  // Clamp long bars to just past the viewport with continuation flags (§11).
  const clampedLeft = rawX < -8;
  const clampedRight = rawEndX > scale.xOf(scale.endDay) + 8;
  const x = clampedLeft ? -8 : rawX;
  const endX = clampedRight ? scale.xOf(scale.endDay) + 8 : rawEndX;
  const w = Math.max(endX - x, 2);

  const done = item.status === 'done';
  // A derived span is a fact about children, not a commitment of this
  // item: it never fills, never reads as overdue.
  const overdue = !done && !usesDerived && targetDay !== null && targetDay < todayDay;

  let elapsedFrac = 0;
  if (usesDerived) {
    elapsedFrac = 0;
  } else if (done) {
    elapsedFrac = 1;
  } else if (startDay !== null && targetDay !== null && targetDay > startDay) {
    elapsedFrac = Math.min(1, Math.max(0, (todayDay - startDay) / (targetDay - startDay)));
  } else if (isOpenEnded) {
    elapsedFrac = 1; // the whole open-ended bar IS elapsed time
  }

  let kind: BarKind = 'bar';
  if (isPoint) kind = 'point';
  else if (w < DOT_THRESHOLD_PX) kind = 'dot';
  else if (isOpenEnded) kind = 'openEnded';

  // The fill must end at *today's pixel*, not at a fraction of the
  // clamped width — a multi-year bar clipped by the viewport would
  // otherwise show a fictional amount of elapsed time.
  let fillW = 0;
  if (usesDerived) {
    fillW = 0;
  } else if (done || isOpenEnded) {
    fillW = w;
  } else if (startDay !== null && targetDay !== null && targetDay > startDay) {
    const fillEndDay = Math.min(todayDay, targetDay);
    fillW = Math.min(w, Math.max(0, scale.xOf(fillEndDay) - x));
  }

  // Label placement, measured with the char-width heuristic.
  const labelW = estTextWidth(item.title);
  let placement: BarGeometry['label']['placement'];
  let labelX: number;
  let text = item.title;
  if (
    scale.pxPerDay < LABEL_DENSITY_MIN &&
    w < LABEL_WIDE_BAR_PX
  ) {
    placement = 'hidden';
    labelX = x;
  } else if (kind === 'bar' && w >= labelW + 16) {
    placement = 'inside';
    labelX = x + 8;
  } else if (endX <= scale.xOf(scale.endDay) - 40) {
    placement = 'right';
    labelX = endX + 6;
    text = truncate(text, 220);
  } else {
    placement = 'left';
    labelX = x - 6;
    text = truncate(text, 220);
  }
  if (placement === 'inside') text = truncate(text, w - 12);

  return {
    item,
    kind,
    x,
    w,
    y,
    h: BAR_H,
    elapsedFrac,
    fillW,
    derived: usesDerived,
    clampedLeft,
    clampedRight,
    overdue,
    done,
    color,
    label: { placement, text, x: labelX },
  };
}
