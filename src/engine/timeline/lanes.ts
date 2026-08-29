import { dayNumber } from '../dates';
import type { LocalDate, TimelineItem } from '../types';

/**
 * Lane and row assignment. A lane is a group; rows within a lane are
 * greedy interval packing so bars never overlap — and the occupied
 * interval includes the label's reserved width, so labels never collide
 * either. Deterministic: sorted by effective start, id as tiebreak.
 */

export interface Placed {
  item: TimelineItem;
  startDay: number | null;
  targetDay: number | null;
  /** The span the bar occupies on the axis (label reservation excluded). */
  effStart: number;
  effEnd: number;
  /** Placed by a rollup span derived from children, not its own dates. */
  usesDerived: boolean;
}

export interface Lane {
  group: string | null;
  /** Second-level lane within `group` (an area under its pillar). */
  subGroup: string | null;
  /** True for the first lane of each primary group — the header prints once. */
  firstOfGroup: boolean;
  rows: Placed[][];
  /** Items beyond maxRows, kept countable rather than silently dropped. */
  overflow: Placed[];
}

export interface PackOptions {
  todayDay: number;
  pxPerDay: number;
  /** Group names in configured lane order; unknown groups follow, null last. */
  groupOrder: string[];
  /** Sub-group names in configured order, for lanes nested under a group. */
  subGroupOrder?: string[];
  maxRows?: number;
  /** Estimated px width of a label; injectable-free heuristic. */
  labelPx?: (title: string) => number;
}

/** Char-width heuristic at font-size 12; pure so tests can pin it. */
export function estTextWidth(text: string): number {
  return text.length * 6.4 + 8;
}

/** Where an item sits on the axis, before pixels exist. */
export function place(item: TimelineItem, todayDay: number): Placed | null {
  let startDay = item.start !== null ? dayNumber(item.start as LocalDate) : null;
  let targetDay = item.target !== null ? dayNumber(item.target as LocalDate) : null;
  let usesDerived = false;
  if (startDay === null && targetDay === null) {
    // No dates of its own: a rollup span derived from children still
    // earns a (dashed) place on the line; truly undated → Someday tray.
    if (item.derived === null) return null;
    startDay = item.derived.start !== null ? dayNumber(item.derived.start) : null;
    targetDay = item.derived.target !== null ? dayNumber(item.derived.target) : null;
    if (startDay === null && targetDay === null) return null;
    usesDerived = true;
  }
  if (item.flags.targetBeforeStart) {
    // Rendered as a point at the target (§11) — never swapped.
    return { item, startDay, targetDay, effStart: targetDay!, effEnd: targetDay! + 1, usesDerived };
  }
  if (startDay !== null && targetDay !== null) {
    return { item, startDay, targetDay, effStart: startDay, effEnd: Math.max(targetDay, startDay + 1), usesDerived };
  }
  if (startDay !== null) {
    // Start-only: open-ended through today.
    return { item, startDay, targetDay, effStart: startDay, effEnd: Math.max(todayDay, startDay + 1), usesDerived };
  }
  return { item, startDay, targetDay, effStart: targetDay!, effEnd: targetDay! + 1, usesDerived };
}

export function packLanes(items: TimelineItem[], opts: PackOptions): Lane[] {
  const labelPx = opts.labelPx ?? estTextWidth;
  const maxRows = opts.maxRows ?? Infinity;
  const gapDays = 6 / Math.max(opts.pxPerDay, 0.001);

  const placed = items
    .map((item) => place(item, opts.todayDay))
    .filter((p): p is Placed => p !== null)
    .sort((a, b) => a.effStart - b.effStart || (a.item.id < b.item.id ? -1 : 1));

  // Lanes are keyed by (group, subGroup): a pillar's areas become its
  // own nested lanes, so both levels of a two-level taxonomy survive.
  const SEP = '\u0000';
  const keyOf = (p: Placed): string =>
    `${p.item.group ?? SEP}${SEP}${p.item.subGroup ?? SEP}`;
  const byLane = new Map<string, Placed[]>();
  const laneKeys = new Map<string, { group: string | null; subGroup: string | null }>();
  for (const p of placed) {
    const key = keyOf(p);
    laneKeys.set(key, { group: p.item.group, subGroup: p.item.subGroup });
    const list = byLane.get(key);
    if (list) list.push(p);
    else byLane.set(key, [p]);
  }

  const rank = (value: string | null, order: string[]): [number, string] => {
    if (value === null) return [2, '']; // ungrouped sits last, always
    const i = order.indexOf(value);
    return i >= 0 ? [0, String(i).padStart(6, '0')] : [1, value];
  };
  const subOrder = opts.subGroupOrder ?? [];
  const orderedKeys = [...laneKeys.keys()].sort((a, b) => {
    const ka = laneKeys.get(a)!;
    const kb = laneKeys.get(b)!;
    const [pa, sa] = rank(ka.group, opts.groupOrder);
    const [pb, sb] = rank(kb.group, opts.groupOrder);
    if (pa !== pb) return pa - pb;
    if (sa !== sb) return sa < sb ? -1 : 1;
    const [qa, ta] = rank(ka.subGroup, subOrder);
    const [qb, tb] = rank(kb.subGroup, subOrder);
    if (qa !== qb) return qa - qb;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  let previousGroup: string | null | undefined = undefined;
  return orderedKeys.map((key) => {
    const { group, subGroup } = laneKeys.get(key)!;
    const firstOfGroup = previousGroup === undefined || previousGroup !== group;
    previousGroup = group;
    const rows: Placed[][] = [];
    const rowEnds: number[] = [];
    const overflow: Placed[] = [];
    for (const p of byLane.get(key)!) {
      // Reserve label width past the bar when it will sit outside it.
      const barPx = (p.effEnd - p.effStart) * opts.pxPerDay;
      const labelWidth = labelPx(p.item.title);
      const reserveDays =
        barPx >= labelWidth + 16 ? 0 : labelWidth / Math.max(opts.pxPerDay, 0.001);
      const occupiedEnd = p.effEnd + reserveDays + gapDays;

      let placedInRow = false;
      for (let r = 0; r < rows.length; r += 1) {
        if (rowEnds[r]! <= p.effStart) {
          rows[r]!.push(p);
          rowEnds[r] = occupiedEnd;
          placedInRow = true;
          break;
        }
      }
      if (!placedInRow) {
        if (rows.length < maxRows) {
          rows.push([p]);
          rowEnds.push(occupiedEnd);
        } else {
          overflow.push(p);
        }
      }
    }
    return { group, subGroup, firstOfGroup, rows, overflow };
  });
}
