import type { TimelineItem } from '../types';

/**
 * Focus on one pillar: the timeline shows only the items in that group.
 * Pure, so the list, the timeline and the Someday tray all see the same
 * subset and a test can pin it against any space.
 */

export interface PillarChoice {
  name: string;
  /** Items in this pillar, dated or not. */
  count: number;
}

/**
 * The named pillars present in `items`: configured order first, then the
 * rest alphabetically. Items with no group are not a choice, since there is
 * nothing to name.
 */
export function pillarsOf(items: readonly TimelineItem[], groupOrder: readonly string[]): PillarChoice[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.group === null) continue;
    counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
  }
  const rank = (name: string): number => {
    const i = groupOrder.indexOf(name);
    return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
  };
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** `pillar` null means no focus. A pillar that is not in `items` also means none. */
export function focusPillar<T extends TimelineItem>(
  items: readonly T[],
  pillar: string | null,
): T[] {
  if (pillar === null || !items.some((i) => i.group === pillar)) return [...items];
  return items.filter((i) => i.group === pillar);
}
