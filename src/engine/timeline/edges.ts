import type { Tick } from './ticks';

/**
 * Keeping text at the chart's edges readable: the today pill and the axis
 * labels are clamped inside the chart instead of being cut off by it. Pure,
 * so the rules are tested here rather than in the DOM.
 */

export const PILL_W = 92;
export const PILL_MARGIN = 2;

/**
 * Where the today pill sits. The line stays at nowX; the pill slides to stay
 * inside [2, width - 94] and its text centres on the pill.
 */
export function todayPill(nowX: number, width: number): { x: number; w: number; textX: number } {
  const max = Math.max(PILL_MARGIN, width - PILL_W - PILL_MARGIN);
  const x = Math.min(max, Math.max(PILL_MARGIN, nowX - PILL_W / 2));
  return { x, w: PILL_W, textX: x + PILL_W / 2 };
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
