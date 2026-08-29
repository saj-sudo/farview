import type { ActionItem, LocalDate, TimelineItem } from './types';

/**
 * Rollups, Life-OS style but guilt-free: facts about children, never a
 * percent-complete fiction. A derived span is the honest answer to "when
 * is this undated goal, really?" — the envelope of its dated children,
 * always labeled as derived and drawn dashed.
 */

export interface DatedChild {
  start: LocalDate | null;
  target: LocalDate | null;
}

/** Envelope of the children's dates; null when nothing is dated. */
export function deriveSpan(
  children: DatedChild[],
): { start: LocalDate | null; target: LocalDate | null } | null {
  let min: LocalDate | null = null;
  let max: LocalDate | null = null;
  for (const child of children) {
    for (const date of [child.start, child.target]) {
      if (date === null) continue;
      if (min === null || date < min) min = date;
      if (max === null || date > max) max = date;
    }
  }
  if (min === null || max === null) return null;
  return { start: min, target: max };
}

export interface RollupFacts {
  actionsDone: number;
  actionsTotal: number;
  projectsDone: number;
  projectsTotal: number;
}

export function rollupFacts(
  projects: TimelineItem[],
  actions: ActionItem[],
): RollupFacts {
  return {
    actionsDone: actions.filter((a) => a.done).length,
    actionsTotal: actions.length,
    projectsDone: projects.filter((p) => p.status === 'done').length,
    projectsTotal: projects.length,
  };
}

/** "1 of 2 projects completed · 2 of 6 actions done" — facts, or null. */
export function factSentence(facts: RollupFacts): string | null {
  const parts: string[] = [];
  if (facts.projectsTotal > 0) {
    parts.push(
      `${facts.projectsDone} of ${facts.projectsTotal} project${
        facts.projectsTotal === 1 ? '' : 's'
      } completed`,
    );
  }
  if (facts.actionsTotal > 0) {
    parts.push(
      `${facts.actionsDone} of ${facts.actionsTotal} action${
        facts.actionsTotal === 1 ? '' : 's'
      } done`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Is this item placed only by a derived span (no dates of its own)? */
export function isDerivedOnly(item: TimelineItem): boolean {
  return item.start === null && item.target === null && item.derived !== null;
}
