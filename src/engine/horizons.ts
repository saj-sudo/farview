import { diffDays } from './dates';
import type { ResolvedSchema } from './resolve';
import type { FarviewConfig, LocalDate, TimelineItem } from './types';

/**
 * Horizon derivation (spec §8.2) — the design that makes Farview work
 * on a space with zero custom setup. Horizons are derived from date
 * distance by default:
 *
 *   daysOut = targetDate - today
 *   bucket  = first bucket where daysOut <= maxDays (null = catch-all)
 *
 * Overdue items (negative daysOut) land in the first bucket — they are
 * the nearest work there is. Undated items go to a visible Someday
 * tray, never dropped: silently losing an item from a view is worse
 * than showing a gap. A space with an explicit horizon property can
 * switch to `property` mode and use its own labels instead.
 */

export const SOMEDAY_LABEL = 'Someday';

/** The bucket label for one item, or Someday when it has no usable date. */
export function bucketFor(
  item: TimelineItem,
  today: LocalDate,
  config: FarviewConfig,
): string {
  if (config.horizons.mode === 'property') {
    return item.horizonLabel ?? derivedBucket(item, today, config) ?? SOMEDAY_LABEL;
  }
  return derivedBucket(item, today, config) ?? SOMEDAY_LABEL;
}

function derivedBucket(
  item: TimelineItem,
  today: LocalDate,
  config: FarviewConfig,
): string | null {
  const date = item.target ?? item.start;
  if (date === null) return null;
  const daysOut = diffDays(date, today);
  for (const bucket of config.horizons.buckets) {
    if (bucket.maxDays === null || daysOut <= bucket.maxDays) return bucket.label;
  }
  // No catch-all configured: the last bucket absorbs the far future.
  const last = config.horizons.buckets[config.horizons.buckets.length - 1];
  return last?.label ?? null;
}

export interface HorizonColumn {
  label: string;
  /** Items directly in the column, date-ascending, undated last. */
  items: TimelineItem[];
  /** Goal-grouped subsets when a goal type is mapped; flat otherwise. */
  goalGroups: { goal: TimelineItem; items: TimelineItem[] }[];
}

/**
 * Column labels in distance order. Derived mode: the configured buckets.
 * Property mode: the horizon property's own labelSet order, with any
 * labels seen on items but missing from the set appended. Someday is
 * always last — the order is the sequence, no numbering needed (§9.2).
 */
export function columnLabels(
  config: FarviewConfig,
  resolved: ResolvedSchema,
  items: TimelineItem[],
): string[] {
  if (config.horizons.mode === 'property') {
    const fromSet = resolved.properties.goalHorizon?.property.labelNames ?? [];
    const seen = new Set(fromSet);
    const extra = items
      .map((i) => i.horizonLabel)
      .filter((l): l is string => l !== null && !seen.has(l));
    return [...fromSet, ...new Set(extra), SOMEDAY_LABEL];
  }
  return [...config.horizons.buckets.map((b) => b.label), SOMEDAY_LABEL];
}

function byDate(a: TimelineItem, b: TimelineItem): number {
  const da = a.target ?? a.start;
  const db = b.target ?? b.start;
  if (da === null && db === null) return a.title.localeCompare(b.title);
  if (da === null) return 1;
  if (db === null) return -1;
  return da < db ? -1 : da > db ? 1 : a.title.localeCompare(b.title);
}

/**
 * Build the Horizons view's columns from one dataset. Goals are nested
 * as group headers within their own bucket when a goal type is mapped;
 * projects attach to a goal by shared group value (entity backlinks
 * would multiply the §5.4 fetch cost, so grouping is the join key).
 */
export function buildHorizonColumns(
  items: TimelineItem[],
  today: LocalDate,
  config: FarviewConfig,
  resolved: ResolvedSchema,
): HorizonColumn[] {
  const labels = columnLabels(config, resolved, items);
  const columns = new Map<string, HorizonColumn>(
    labels.map((label) => [label, { label, items: [], goalGroups: [] }]),
  );

  const goalsMapped = resolved.types.goal !== undefined;
  const goals = goalsMapped ? items.filter((i) => i.kind === 'goal') : [];
  const rest = goalsMapped ? items.filter((i) => i.kind !== 'goal') : items;

  for (const item of rest) {
    const label = bucketFor(item, today, config);
    const column = columns.get(label) ?? columns.get(SOMEDAY_LABEL)!;
    column.items.push(item);
  }
  for (const column of columns.values()) column.items.sort(byDate);

  // Nest projects under goals that share a group, within the goal's column.
  for (const goal of goals.sort(byDate)) {
    const label = bucketFor(goal, today, config);
    const column = columns.get(label) ?? columns.get(SOMEDAY_LABEL)!;
    const matching =
      goal.group === null
        ? []
        : column.items.filter((i) => i.group === goal.group);
    column.goalGroups.push({ goal, items: matching });
    column.items = column.items.filter((i) => !matching.includes(i));
  }

  return labels.map((label) => columns.get(label)!);
}
