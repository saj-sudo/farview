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
}

export interface Lane {
  group: string | null;
  rows: Placed[][];
  /** Items beyond maxRows, kept countable rather than silently dropped. */
  overflow: Placed[];
}

export interface PackOptions {
  todayDay: number;
  pxPerDay: number;
  /** Group names in configured lane order; unknown groups follow, null last. */
  groupOrder: string[];
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
  const startDay = item.start !== null ? dayNumber(item.start as LocalDate) : null;
  const targetDay = item.target !== null ? dayNumber(item.target as LocalDate) : null;
  if (startDay === null && targetDay === null) return null; // Someday tray
  if (item.flags.targetBeforeStart) {
    // Rendered as a point at the target (§11) — never swapped.
    return { item, startDay, targetDay, effStart: targetDay!, effEnd: targetDay! + 1 };
  }
  if (startDay !== null && targetDay !== null) {
    return { item, startDay, targetDay, effStart: startDay, effEnd: Math.max(targetDay, startDay + 1) };
  }
  if (startDay !== null) {
    // Start-only: open-ended through today.
    return { item, startDay, targetDay, effStart: startDay, effEnd: Math.max(todayDay, startDay + 1) };
  }
  return { item, startDay, targetDay, effStart: targetDay!, effEnd: targetDay! + 1 };
}

export function packLanes(items: TimelineItem[], opts: PackOptions): Lane[] {
  const labelPx = opts.labelPx ?? estTextWidth;
  const maxRows = opts.maxRows ?? Infinity;
  const gapDays = 6 / Math.max(opts.pxPerDay, 0.001);

  const placed = items
    .map((item) => place(item, opts.todayDay))
    .filter((p): p is Placed => p !== null)
    .sort((a, b) => a.effStart - b.effStart || (a.item.id < b.item.id ? -1 : 1));

  const byGroup = new Map<string | null, Placed[]>();
  for (const p of placed) {
    const key = p.item.group;
    const list = byGroup.get(key);
    if (list) list.push(p);
    else byGroup.set(key, [p]);
  }

  const orderedGroups: (string | null)[] = [
    ...opts.groupOrder.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()]
      .filter((g): g is string => g !== null && !opts.groupOrder.includes(g))
      .sort(),
    ...(byGroup.has(null) ? [null] : []),
  ];

  return orderedGroups.map((group) => {
    const rows: Placed[][] = [];
    const rowEnds: number[] = [];
    const overflow: Placed[] = [];
    for (const p of byGroup.get(group)!) {
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
    return { group, rows, overflow };
  });
}
