import type { FarBar, FarGroup, FarLayout } from '../../engine/timeline/farLayout';
import { FAR_AXIS_H, FAR_HEAD_H, FAR_ROW_H, farOccupied } from '../../engine/timeline/farLayout';
import type { TimelineItem } from '../../engine/types';

/**
 * Pure SVG rendering of a FarLayout: the stretched view from this quarter
 * out to a decade. Goals are flags on poles, their projects hang beneath,
 * and every item's name and dates sit above its bar. The group names are
 * drawn in the SVG itself, so a saved file needs nothing added.
 */

export interface FarViewSvgProps {
  layout: FarLayout;
  selectedId: string | null;
  onSelect: (item: TimelineItem | null, anchor: { x: number; y: number } | null) => void;
}

function aria(bar: FarBar): string {
  const { item } = bar;
  const parts = [item.title];
  if (item.kind === 'goal') parts.push('goal');
  if (item.start && item.target) parts.push(`${item.start} to ${item.target}`);
  else if (item.target) parts.push(`target ${item.target}`);
  else if (item.start) parts.push(`started ${item.start}, no target`);
  else if (bar.derived) parts.push('placed by the dates of its parts');
  if (item.statusLabel) parts.push(item.statusLabel);
  if (item.group) parts.push(item.group);
  if (bar.passed) parts.push('target passed');
  if (item.flags.targetBeforeStart) parts.push('target is before start');
  return parts.join(', ');
}

export function FarViewSvg(props: FarViewSvgProps) {
  const { layout } = props;
  const chartH = layout.height - FAR_AXIS_H;
  const fades = [...new Set(layout.bars.filter((b) => b.kind === 'openEnded').map((b) => b.color))];

  return (
    <svg
      class="tl-svg fv-svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="false"
    >
      <defs>
        {fades.map((color, i) => (
          <linearGradient key={color} id={`fv-open-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0.45" stop-color={color} stop-opacity="1" />
            <stop offset="1" stop-color={color} stop-opacity="0" />
          </linearGradient>
        ))}
      </defs>

      {/* The stretches of time: the tint deepens with distance. */}
      {layout.scale.segments.map((s, i) => (
        <g key={s.id}>
          <rect
            x={s.x0}
            y={0}
            width={s.x1 - s.x0}
            height={chartH}
            class={`fv-seg fv-seg-${s.id}`}
          />
          {i > 1 && <line x1={s.x0} y1={0} x2={s.x0} y2={chartH} class="fv-seam" />}
        </g>
      ))}
      <line x1={0} y1={FAR_HEAD_H - 4} x2={layout.width} y2={FAR_HEAD_H - 4} class="tl-lane-line" />
      {layout.headings.map((h) =>
        h.label === null ? null : (
          <text key={h.id} x={h.x + 6} y={18} class="fv-heading">
            {h.label}
          </text>
        ),
      )}

      {layout.ticks.map((tick) => {
        const x = layout.scale.xOf(tick.day);
        return (
          <line
            key={`g-${tick.day}`}
            x1={x}
            y1={FAR_HEAD_H - 4}
            x2={x}
            y2={chartH}
            class="tl-grid-minor"
          />
        );
      })}

      {layout.groups.map((group, i) =>
        i === 0 ? null : (
          <line
            key={`sep-${group.y}`}
            x1={0}
            y1={group.y - 6}
            x2={layout.width}
            y2={group.y - 6}
            class="tl-lane-line is-sub"
          />
        ),
      )}

      {/* Today: one thin line. */}
      <g class="tl-now">
        <line
          x1={layout.nowX}
          y1={FAR_HEAD_H - 4}
          x2={layout.nowX}
          y2={chartH}
          class="tl-now-line"
        />
        <text x={layout.today.x} y={layout.height - 9} class="tl-now-label">
          {layout.today.text}
        </text>
      </g>

      {/* Poles first, so labels print over them. */}
      {layout.groups.map((group) =>
        group.poleX === null ? null : (
          <line
            key={`pole-${group.y}`}
            x1={group.poleX}
            y1={group.y + 5}
            x2={group.poleX}
            y2={group.poleBottom}
            class="fv-pole"
          />
        ),
      )}

      {layout.groups.map((group) => (
        <GroupHead key={`head-${group.y}`} group={group} nowX={layout.nowX} {...props} />
      ))}

      {layout.bars.map((bar) => (
        <Entry
          key={bar.item.id}
          bar={bar}
          fade={fades.indexOf(bar.color)}
          selected={props.selectedId === bar.item.id}
          onSelect={props.onSelect}
        />
      ))}

      {layout.axis.map((label) => (
        <text key={`ax-${label.index}`} x={label.x} y={layout.height - 9} class="tl-axis-minor">
          {label.label}
        </text>
      ))}
    </svg>
  );
}

function Label(props: { bar: FarBar }) {
  const { label } = props.bar;
  return (
    <text x={label.x} y={label.y} class="tl-label" text-anchor={label.anchor}>
      <tspan class="fv-name">{label.text}</tspan>
      {label.meta !== null && <tspan class="fv-meta">{` · ${label.meta}`}</tspan>}
    </text>
  );
}

function interactive(
  bar: FarBar,
  selected: boolean,
  onSelect: FarViewSvgProps['onSelect'],
): Record<string, unknown> {
  const activate = (): void =>
    onSelect(bar.item, {
      x: bar.x + Math.min(bar.w, 240) / 2,
      y: bar.y + bar.h + 6,
    });
  return {
    class: ['tl-item', 'fv-item', bar.done ? 'is-done' : '', selected ? 'is-selected' : '']
      .filter(Boolean)
      .join(' '),
    tabindex: 0,
    role: 'button',
    'aria-label': aria(bar),
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      activate();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    },
  };
}

function GroupHead(props: FarViewSvgProps & { group: FarGroup; nowX: number }) {
  const { group } = props;
  if (group.goal === null) {
    return group.title === null ? null : (
      <text x={Math.max(6, props.nowX + 6)} y={group.y + 18} class="fv-group-title">
        {group.title}
      </text>
    );
  }
  const bar = group.goal;
  const selected = props.selectedId === bar.item.id;
  const [left, right] = farOccupied(bar);
  return (
    <g {...interactive(bar, selected, props.onSelect)}>
      <rect x={left} y={group.y} width={right - left} height={FAR_ROW_H - 8} class="fv-hit" />
      {bar.kind === 'flag' ? (
        <path d={`M ${bar.x} ${bar.y} h 13 l -4 5.5 l 4 5.5 h -13 Z`} class="tl-flag fv-flag" />
      ) : (
        <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={4} class="fv-span" />
      )}
      <Label bar={bar} />
      {selected && (
        <rect
          x={left - 3}
          y={group.y + 1}
          width={right - left + 6}
          height={FAR_ROW_H - 10}
          rx={8}
          class="tl-focus-ring"
        />
      )}
    </g>
  );
}

function Entry(props: {
  bar: FarBar;
  fade: number;
  selected: boolean;
  onSelect: FarViewSvgProps['onSelect'];
}) {
  const { bar } = props;
  const [left, right] = farOccupied(bar);
  const rowTop = bar.y - 20;
  const cy = bar.y + bar.h / 2;
  const labelRight = bar.connectorX === null ? right : Math.min(right, bar.x + bar.w + 20);
  return (
    <g {...interactive(bar, props.selected, props.onSelect)}>
      <rect x={left} y={rowTop} width={right - left} height={FAR_ROW_H - 4} class="fv-hit" />
      {bar.connectorX !== null && (
        <line
          x1={bar.x + bar.w + (bar.passed ? 16 : 3)}
          y1={cy}
          x2={bar.connectorX}
          y2={cy}
          class="fv-connector"
        />
      )}
      {bar.kind === 'point' ? (
        <path d={`M ${bar.x} ${cy - 6} l 6 6 l -6 6 l -6 -6 Z`} fill={bar.color} />
      ) : bar.kind === 'span' ? (
        <rect
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={5}
          class="fv-span"
          stroke={bar.color}
        />
      ) : (
        <rect
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={5}
          class="fv-bar"
          fill={bar.kind === 'openEnded' ? `url(#fv-open-${props.fade})` : bar.color}
        />
      )}
      {bar.clampedLeft && bar.kind !== 'point' && (
        <path d={`M ${bar.x + 7} ${cy - 3.5} l -4 3.5 l 4 3.5`} class="fv-chevron" />
      )}
      {bar.clampedRight && bar.kind !== 'point' && (
        <path d={`M ${bar.x + bar.w - 7} ${cy - 3.5} l 4 3.5 l -4 3.5`} class="fv-chevron" />
      )}
      {/* A passed target: a quiet hollow diamond, never red. */}
      {bar.passed && bar.kind !== 'point' && (
        <path
          d={`M ${bar.x + bar.w + 8} ${cy - 4.5} l 4.5 4.5 l -4.5 4.5 l -4.5 -4.5 Z`}
          class="tl-overdue-mark"
          stroke={bar.color}
        />
      )}
      <Label bar={bar} />
      {props.selected && (
        <rect
          x={left - 3}
          y={rowTop + 3}
          width={labelRight - left + 6}
          height={FAR_ROW_H - 6}
          rx={8}
          class="tl-focus-ring"
        />
      )}
    </g>
  );
}
