import type { Tick } from './ticks';

/**
 * Keeping text at the chart's edges readable: the today pill and the axis
 * labels are clamped inside the chart instead of being cut off by it. Pure,
 * so the rules are tested here rather than in the DOM.
 */

export const PILL_MARGIN = 2;

/**
 * The plain "Today" label that sits on the axis row beside the today line.
 * It starts 5px right of the line and flips to the left when it would run
 * off the chart.
 */
export function todayLabel(
  nowX: number,
  width: number,
  text: string,
): { x: number; w: number; text: string } {
  const w = text.length * 6.6 + 4;
  let x = nowX + 5;
  if (x + w > width - PILL_MARGIN) x = nowX - 5 - w;
  x = Math.min(Math.max(PILL_MARGIN, width - w - PILL_MARGIN), Math.max(PILL_MARGIN, x));
  return { x, w, text };
}

/** Estimated width of an axis label: major ticks are 11px bold, minor 10px. */
export function axisLabelWidth(label: string, level: Tick['level']): number {
  return label.length * (level === 'major' ? 7 : 6) + 2;
}

export interface AxisLabel {
  label: string;
  level: Tick['level'];
  x: number;
  w: number;
  /** Index into the tick list, for a stable key. */
  index: number;
}

/**
 * Axis labels that fit: each starts 4px past its tick, is kept inside
 * [2, width - w - 2], and is dropped when it would overlap the one before
 * it. A major label pushes out a minor one it would collide with.
 */
export function axisLabels(
  ticks: readonly Tick[],
  xOf: (day: number) => number,
  width: number,
  /** A stretch of the axis row already taken (the today label): labels touching it drop. */
  avoid?: readonly [number, number],
): AxisLabel[] {
  const gap = 6;
  const candidates = ticks
    .map((tick, index) => ({ tick, index, tx: xOf(tick.day) }))
    .filter(
      (c): c is { tick: Tick & { label: string }; index: number; tx: number } =>
        c.tick.label !== null && c.tx >= -40 && c.tx <= width,
    )
    .sort((a, b) => a.tx - b.tx);
  const out: AxisLabel[] = [];
  for (const { tick, index, tx } of candidates) {
    const w = axisLabelWidth(tick.label, tick.level);
    if (w + 2 * PILL_MARGIN > width) continue;
    const x = Math.min(width - w - PILL_MARGIN, Math.max(PILL_MARGIN, tx + 4));
    if (avoid && x < avoid[1] + gap && x + w > avoid[0] - gap) continue;
    const label: AxisLabel = { label: tick.label, level: tick.level, x, w, index };
    const prev = out[out.length - 1];
    if (prev && x < prev.x + prev.w + gap) {
      if (tick.level === 'major' && prev.level === 'minor') {
        out.pop();
        const before = out[out.length - 1];
        if (before && x < before.x + before.w + gap) continue;
        out.push(label);
      }
      continue;
    }
    out.push(label);
  }
  return out;
}
