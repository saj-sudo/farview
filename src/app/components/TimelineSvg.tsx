import { dayNumber, formatMonthDay } from '../../engine/dates';
import type { TimelineLayout, BarGeometry } from '../../engine/timeline/layout';
import { AXIS_H } from '../../engine/timeline/layout';
import type { LocalDate, MilestoneItem, TimelineItem } from '../../engine/types';

/**
 * Pure SVG rendering of a TimelineLayout. One bold move — the gradient
 * now-line — over a quiet scene: alternating calendar bands, hairline
 * grid, soft bars filled by elapsed time. The past sits under a single
 * veil rect instead of per-item styling, so everything left of now
 * (gridlines included) recedes together.
 */

export interface TimelineSvgProps {
  layout: TimelineLayout;
  today: LocalDate;
  milestones: ReadonlyMap<string, MilestoneItem[]>;
  selectedId: string | null;
  onSelect: (item: TimelineItem | null, anchor: { x: number; y: number } | null) => void;
}

function barAria(bar: BarGeometry): string {
  const { item } = bar;
  const parts = [item.title];
  if (item.start && item.target) parts.push(`${item.start} to ${item.target}`);
  else if (item.target) parts.push(`target ${item.target}`);
  else if (item.start) parts.push(`started ${item.start}, no target`);
  if (item.statusLabel) parts.push(item.statusLabel);
  if (item.group) parts.push(item.group);
  if (bar.overdue) parts.push('target passed');
  if (item.flags.targetBeforeStart) parts.push('target is before start');
  return parts.join(', ');
}

export function TimelineSvg(props: TimelineSvgProps) {
  const { layout } = props;
  const chartH = layout.height - AXIS_H;
  const clampX = (x: number) => Math.max(0, Math.min(layout.width, x));

  const bandRect = (startDay: number, endDay: number) => {
    const x = clampX(layout.scale.xOf(startDay));
    const w = clampX(layout.scale.xOf(endDay)) - x;
    return { x, w };
  };

  const veilEnd = clampX(layout.nowX);

  return (
    <svg
      class="tl-svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="false"
    >
      <defs>
        <linearGradient id="fv-now" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2ab3a6" />
          <stop offset="0.55" stop-color="#5b67e8" />
          <stop offset="1" stop-color="#9a6ae8" />
        </linearGradient>
        <linearGradient id="fv-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--bg)" stop-opacity="0" />
          <stop offset="1" stop-color="var(--bg)" stop-opacity="1" />
        </linearGradient>
      </defs>

      {/* Calendar bands: months → quarters → years by density. */}
      {layout.ticks.bands.map((band, i) => {
        const { x, w } = bandRect(band.startDay, band.endDay);
        if (w <= 0) return null;
        return (
          <g key={`band-${i}`}>
            {band.alt && <rect x={x} y={0} width={w} height={chartH} class="tl-band" />}
            {band.label !== null && w > 60 && (
              <text x={x + w / 2} y={Math.min(64, chartH - 8)} class="tl-band-label">
                {band.label}
              </text>
            )}
          </g>
        );
      })}
      {layout.ticks.weekendBands.map((band, i) => {
        const { x, w } = bandRect(band.startDay, band.endDay);
        if (w <= 0) return null;
        return <rect key={`we-${i}`} x={x} y={0} width={w} height={chartH} class="tl-weekend" />;
      })}

      {/* Gridlines at calendar boundaries. */}
      {layout.ticks.ticks.map((tick, i) => {
        const x = layout.scale.xOf(tick.day);
        if (x < 0 || x > layout.width) return null;
        return (
          <line
            key={`grid-${i}`}
            x1={x}
            y1={0}
            x2={x}
            y2={chartH}
            class={tick.level === 'major' ? 'tl-grid-major' : 'tl-grid-minor'}
          />
        );
      })}

      {/* Lane separators. */}
      {layout.lanes.map((lane, i) =>
        i === 0 ? null : (
          <line
            key={`lane-${lane.label}`}
            x1={0}
            y1={lane.y}
            x2={layout.width}
            y2={lane.y}
            class="tl-lane-line"
          />
        ),
      )}

      {/* Bars, points, dots. */}
      {layout.bars.map((bar) => (
        <Bar
          key={bar.item.id}
          bar={bar}
          milestones={props.milestones.get(bar.item.id) ?? []}
          layout={layout}
          selected={props.selectedId === bar.item.id}
          onSelect={props.onSelect}
        />
      ))}

      {/* The past veil: one rect, everything before now recedes at once. */}
      {veilEnd > 0 && (
        <rect x={0} y={0} width={veilEnd} height={chartH} class="tl-veil" />
      )}

      {/* The now-line: the signature element. */}
      {layout.nowX >= 0 && layout.nowX <= layout.width && (
        <g class="tl-now">
          <line x1={layout.nowX} y1={0} x2={layout.nowX} y2={chartH} class="tl-now-glow" />
          <line
            x1={layout.nowX}
            y1={0}
            x2={layout.nowX}
            y2={chartH}
            stroke="url(#fv-now)"
            stroke-width="2"
          />
          {chartH > 60 && (
            <g class="tl-now-pill">
              <rect x={layout.nowX - 46} y={6} width={92} height={20} rx={10} />
              <text x={layout.nowX} y={20}>
                {`Today · ${formatMonthDay(props.today)}`}
              </text>
            </g>
          )}
        </g>
      )}

      {/* Axis labels. */}
      {layout.ticks.ticks.map((tick, i) => {
        if (tick.label === null) return null;
        const x = layout.scale.xOf(tick.day);
        if (x < -40 || x > layout.width + 40) return null;
        return (
          <text
            key={`ax-${i}`}
            x={x + 4}
            y={layout.height - 9}
            class={tick.level === 'major' ? 'tl-axis-major' : 'tl-axis-minor'}
          >
            {tick.label}
          </text>
        );
      })}
    </svg>
  );
}

function Bar(props: {
  bar: BarGeometry;
  milestones: MilestoneItem[];
  layout: TimelineLayout;
  selected: boolean;
  onSelect: TimelineSvgProps['onSelect'];
}) {
  const { bar, layout } = props;
  const cy = bar.y + bar.h / 2;
  const activate = (): void =>
    props.onSelect(bar.item, { x: bar.x + Math.min(bar.w, 240) / 2, y: bar.y + bar.h });

  const classes = [
    'tl-item',
    bar.done ? 'is-done' : '',
    bar.overdue ? 'is-overdue' : '',
    props.selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <g
      class={classes}
      tabindex={0}
      role="button"
      aria-label={barAria(bar)}
      onClick={(e) => {
        e.stopPropagation();
        activate();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      {bar.kind === 'dot' ? (
        <circle cx={bar.x + bar.w / 2} cy={cy} r={3.2} fill={bar.color} />
      ) : bar.kind === 'point' ? (
        <PointMark bar={bar} cy={cy} />
      ) : (
        <>
          <rect
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            rx={6}
            class="tl-track"
            fill={bar.color}
            stroke={bar.color}
          />
          {bar.fillW > 0 && (
            <rect
              x={bar.x}
              y={bar.y}
              width={Math.max(bar.fillW, 4)}
              height={bar.h}
              rx={6}
              class="tl-fill"
              fill={bar.color}
            />
          )}
          {bar.kind === 'openEnded' && (
            <rect
              x={bar.x + Math.max(bar.w - 26, 0)}
              y={bar.y - 1}
              width={Math.min(26, bar.w)}
              height={bar.h + 2}
              fill="url(#fv-fade)"
            />
          )}
          {bar.clampedLeft && (
            <text x={bar.x + 3} y={cy + 4} class="tl-chevrons" text-anchor="start">
              «
            </text>
          )}
          {bar.clampedRight && (
            <text x={bar.x + bar.w - 3} y={cy + 4} class="tl-chevrons" text-anchor="end">
              »
            </text>
          )}
          {bar.done && bar.w > 30 && (
            <text x={bar.x + bar.w - 8} y={cy + 4} class="tl-check" text-anchor="end">
              ✓
            </text>
          )}
          {/* Milestone ticks along the bar (lazy-loaded, §8.1). */}
          {props.milestones.map((m) => {
            if (m.date === null) return null;
            const mx = layout.scale.xOf(dayNumber(m.date));
            if (mx < bar.x + 2 || mx > bar.x + bar.w - 2) return null;
            return (
              <line
                key={m.id}
                x1={mx}
                y1={bar.y + 3}
                x2={mx}
                y2={bar.y + bar.h - 3}
                class={m.done ? 'tl-milestone done' : 'tl-milestone'}
              >
                <title>{m.title}</title>
              </line>
            );
          })}
        </>
      )}

      {/* Overdue: a weight shift and a quiet diamond — never red (§9.3). */}
      {bar.overdue && bar.kind !== 'point' && (
        <path
          d={`M ${bar.x + bar.w + 9} ${cy - 4.5} l 4.5 4.5 l -4.5 4.5 l -4.5 -4.5 Z`}
          class="tl-overdue-mark"
          stroke={bar.color}
        />
      )}

      {bar.label.placement !== 'hidden' && (
        <text
          x={bar.label.x}
          y={cy + 4}
          class={`tl-label ${bar.label.placement === 'inside' ? 'inside' : ''}`}
          text-anchor={bar.label.placement === 'left' ? 'end' : 'start'}
        >
          {bar.label.text}
        </text>
      )}

      {props.selected && (
        <rect
          x={bar.x - 4}
          y={bar.y - 4}
          width={Math.max(bar.w, 10) + 8}
          height={bar.h + 8}
          rx={9}
          class="tl-focus-ring"
        />
      )}
    </g>
  );
}

function PointMark(props: { bar: BarGeometry; cy: number }) {
  const { bar, cy } = props;
  const cx = bar.x + 1;
  if (bar.item.kind === 'goal') {
    // Goals fly a small pennant.
    return (
      <>
        <line x1={cx} y1={bar.y + 1} x2={cx} y2={bar.y + bar.h - 1} stroke={bar.color} stroke-width="2" />
        <path
          d={`M ${cx + 1} ${bar.y + 2} h 12 l -4 4.5 l 4 4.5 h -12 Z`}
          fill={bar.color}
          class="tl-flag"
        />
      </>
    );
  }
  if (bar.item.flags.targetBeforeStart) {
    // Reversed dates: a diamond with a dashed halo, flagged on the card.
    return (
      <>
        <circle cx={cx} cy={cy} r={9} class="tl-halo" stroke={bar.color} />
        <path
          d={`M ${cx} ${cy - 6} l 6 6 l -6 6 l -6 -6 Z`}
          fill={bar.color}
        />
      </>
    );
  }
  return <circle cx={cx} cy={cy} r={5} fill={bar.color} />;
}
