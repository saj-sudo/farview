import { MONTH_ABBR, MONTH_FULL } from '../../engine/dates';
import type { TimelineLayout } from '../../engine/timeline/layout';
import type { MonthLoad } from '../../engine/timeline/workload';

/**
 * How much runs at once, as a thin strip under the chart: for each month, how
 * many projects are active in it. It lines up with the chart's own axis, so
 * panning and zooming move it too. It states a count and nothing else, so there
 * is no colour for "too many".
 */

const STRIP_H = 62;
const BAR_MAX = 30;
/** The baseline sits above the month names. */
const BASE = STRIP_H - 16;
/** Below this width a month has no room for its number. */
const LABEL_MIN_PX = 26;

export function LoadStrip(props: { months: MonthLoad[]; layout: TimelineLayout }) {
  const { layout } = props;
  const shown = props.months.filter((m) => layout.scale.xOf(m.endDay) > 0 && layout.scale.xOf(m.startDay) < layout.width);
  const peak = Math.max(0, ...shown.map((m) => m.count));
  if (shown.length === 0 || peak === 0) return null;
  const monthPx = layout.scale.xOf(shown[0]!.endDay) - layout.scale.xOf(shown[0]!.startDay);
  // On a decade view a month is a sliver, and the strip would be noise.
  if (monthPx < 12) return null;

  const lowest = Math.min(...shown.map((m) => m.count));
  const summary = `Projects active each month, from ${lowest} to ${peak} across the months shown.`;

  return (
    <div class="load-strip">
      <p class="load-caption">
        <strong>Active projects each month.</strong> A project counts in every month its bar touches.
      </p>
      <svg
        class="load-svg"
        width={layout.width}
        height={STRIP_H}
        viewBox={`0 0 ${layout.width} ${STRIP_H}`}
        role="img"
        aria-label={summary}
      >
        {shown.map((m) => {
          const x0 = Math.max(0, layout.scale.xOf(m.startDay));
          const x1 = Math.min(layout.width, layout.scale.xOf(m.endDay));
          const w = x1 - x0;
          if (w <= 0) return null;
          const h = (m.count / peak) * BAR_MAX;
          return (
            <g key={`${m.year}-${m.month}`}>
              <title>
                {MONTH_FULL[m.month - 1]} {m.year}: {m.count} {m.count === 1 ? 'project' : 'projects'} active
              </title>
              <rect x={x0 + 1} y={BASE - h} width={Math.max(1, w - 2)} height={Math.max(h, m.count > 0 ? 2 : 0)} class="load-bar" />
              {w >= LABEL_MIN_PX && (
                <text x={x0 + w / 2} y={BASE - h - 4} class="load-num">
                  {m.count}
                </text>
              )}
              {w >= 54 && (
                <text x={x0 + w / 2} y={STRIP_H - 3} class="load-month">
                  {MONTH_ABBR[m.month - 1]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p class="sr-only">{summary}</p>
    </div>
  );
}
