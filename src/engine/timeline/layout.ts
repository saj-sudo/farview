import { dayNumber } from '../dates';
import type { LocalDate, TimelineItem } from '../types';
import { assignGroupColors } from './colors';
import { estTextWidth, packLanes, type Placed } from './lanes';
import { createScale, type Scale, type ViewState } from './scale';
import { generateTicks, type TickSet } from './ticks';

/**
 * Compose scale + ticks + lanes into render-ready geometry. Pure: the
 * SVG component maps this straight to elements, and every visual rule
 * that matters (elapsed fill, clamping, label placement, dot collapse)
 * is decided (and therefore tested) here, not in the DOM.
 */

export const BAR_H = 22;
/** A bar a finger can hit: used on touch screens. */
export const TOUCH_BAR_H = 34;
/** On a phone the lane names sit over the chart, so the today label gets its own strip. */
export const TOUCH_TOP_PAD = 32;
export const ROW_GAP = 8;
/** With labels above bars (phones), each row gets a line for its labels. */
export const LABEL_ABOVE_H = 16;
/** The overdue diamond drawn just past a bar's end, with its breathing room. */
export const OVERDUE_MARK_W = 16;
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
  /** Elapsed time as a fraction of the span: never completion % (§9.3). */
  elapsedFrac: number;
  /** Pixel width of the elapsed fill, measured from x: clamp-safe. */
  fillW: number;
  clampedLeft: boolean;
  clampedRight: boolean;
  overdue: boolean;
  done: boolean;
  /** Placed by a derived rollup span: drawn dashed, no fill, no drag. */
  derived: boolean;
  color: string;
  /**
   * Where the title goes. 'above' sits on its own line just over the bar
   * (phones), left-aligned at x. 'left' is anchored at its end, the rest at
   * their start.
   */
  label: { placement: 'inside' | 'right' | 'left' | 'above' | 'hidden'; text: string; x: number };
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
  /** Bar height in px. Defaults to BAR_H, which suits a pointer. */
  barHeight?: number;
  /** Space above the first lane. A phone needs room for the today label. */
  topPad?: number;
  /**
   * Put a label that does not fit inside its bar on its own line just above
   * the bar, kept inside the chart. Used on phones, where a label beside a
   * bar runs off the narrow screen.
   */
  labelsAbove?: boolean;
}

const GOALS_LANE = '__goals__';

interface LabelRules {
  above: boolean;
}

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
  const barH = opts.barHeight ?? BAR_H;
  const ticks = generateTicks(scale.startDay, scale.endDay, scale.pxPerDay);
  const todayDay = dayNumber(opts.today);
  const nowX = scale.xOf(todayDay);
  const rules: LabelRules = { above: opts.labelsAbove === true };
  const labelLine = rules.above ? LABEL_ABOVE_H : 0;

  // Rows are packed by what each item really covers on screen: its bar,
  // its marks and its label, on whichever side the label lands.
  const span = (p: Placed): { start: number; end: number } => {
    const geom = barGeometry(p, scale, todayDay, 0, '', barH, rules);
    if (!geom) return { start: p.effStart, end: p.effEnd };
    const [left, right] = occupiedPx(geom);
    return { start: scale.dayAt(left), end: scale.dayAt(right) };
  };

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
      span,
      ...(opts.maxRowsPerLane !== undefined ? { maxRows: opts.maxRowsPerLane } : {}),
    },
  );
  const projectLanes = packLanes(projects, {
    todayDay,
    pxPerDay: scale.pxPerDay,
    groupOrder: opts.groupOrder,
    span,
    ...(opts.subGroupOrder ? { subGroupOrder: opts.subGroupOrder } : {}),
    ...(opts.maxRowsPerLane !== undefined ? { maxRows: opts.maxRowsPerLane } : {}),
  });

  // Color follows the PRIMARY group: a pillar's areas share its hue, so
  // the sub-lanes read as one family rather than six unrelated colors.
  const colors = assignGroupColors(projectLanes.map((l) => l.group));
  const laneGeoms: LaneGeometry[] = [];
  const bars: BarGeometry[] = [];
  let y = opts.topPad ?? TOP_PAD;

  const allLanes = [...goalLanes, ...projectLanes];
  for (const lane of allLanes) {
    const isGoals = lane.group === GOALS_LANE;
    const color = isGoals ? 'var(--g5)' : (colors.get(lane.group) ?? 'var(--g6)');
    const laneTop = y;
    y += LANE_HEADER_H;
    for (const row of lane.rows) {
      y += labelLine;
      for (const placed of row) {
        const bar = barGeometry(placed, scale, todayDay, y, color, barH, rules);
        if (bar) bars.push(bar);
      }
      y += barH + ROW_GAP;
    }
    y += LANE_PAD_BOTTOM;
    laneGeoms.push({
      group: isGoals ? null : lane.group,
      subGroup: isGoals ? null : lane.subGroup,
      firstOfGroup: isGoals ? true : lane.firstOfGroup,
      // The lane's own name: its area when nested, else its pillar. A
      // pillar's leftovers (tagged with it but with no area) trail its
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
  barH: number,
  rules: LabelRules,
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
  // clamped width: a multi-year bar clipped by the viewport would
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
  const viewW = scale.xOf(scale.endDay);
  const [markLeft, markRight] = markExtent({ kind, x, w, overdue });
  const labelW = estTextWidth(item.title);
  let placement: BarGeometry['label']['placement'];
  let labelX: number;
  let text = item.title;
  if (
    (scale.pxPerDay < LABEL_DENSITY_MIN && w < LABEL_WIDE_BAR_PX) ||
    // A bar wholly off screen keeps its label off screen too.
    markRight < 0 ||
    markLeft > viewW
  ) {
    placement = 'hidden';
    labelX = x;
  } else if (rules.above) {
    // Inside when it fits in the part of the bar on screen, else on its own
    // line above the bar, slid left only as far as it takes to fit.
    const insideX = Math.max(x + 8, 4);
    const insideRoom = Math.min(x + w, viewW) - insideX - 4;
    const right = viewW - 4;
    const aboveX = Math.max(4, Math.min(x, right - labelW));
    if (kind === 'bar' && insideRoom >= labelW) {
      placement = 'inside';
      labelX = insideX;
    } else if (right - aboveX >= 24) {
      placement = 'above';
      labelX = aboveX;
      text = truncate(text, right - aboveX);
    } else {
      placement = 'hidden';
      labelX = x;
    }
  } else if (kind === 'bar' && w >= labelW + 16) {
    placement = 'inside';
    labelX = x + 8;
    text = truncate(text, w - 12);
  } else if (markRight <= viewW - 40) {
    // Past the bar and past the overdue diamond, so the two never touch.
    placement = 'right';
    labelX = markRight + 6;
    text = truncate(text, 220);
  } else {
    placement = 'left';
    labelX = markLeft - 6;
    text = truncate(text, 220);
  }

  return {
    item,
    kind,
    x,
    w,
    y,
    h: barH,
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

/**
 * The horizontal extent of what a bar draws besides its label: a point's
 * flag or halo, and the overdue diamond past the end.
 */
export function markExtent(bar: Pick<BarGeometry, 'kind' | 'x' | 'w' | 'overdue'>): [number, number] {
  if (bar.kind === 'point') return [bar.x - 9, Math.max(bar.x + 14, bar.x + bar.w)];
  return [bar.x, bar.x + bar.w + (bar.overdue ? OVERDUE_MARK_W : 0)];
}

/** The estimated box a bar's label takes, as [left, right] px; null when it draws none outside the bar. */
export function labelBox(bar: Pick<BarGeometry, 'label'>): [number, number] | null {
  const { placement, text, x } = bar.label;
  if (placement === 'hidden' || placement === 'inside') return null;
  const w = estTextWidth(text);
  return placement === 'left' ? [x - w, x] : [x, x + w];
}

/** Everything a bar covers on its row: bar, marks and outside label. */
export function occupiedPx(bar: Pick<BarGeometry, 'kind' | 'x' | 'w' | 'overdue' | 'label'>): [number, number] {
  const [left, right] = markExtent(bar);
  const box = labelBox(bar);
  return box ? [Math.min(left, box[0]), Math.max(right, box[1])] : [left, right];
}
