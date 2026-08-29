import { describe, expect, it } from 'vitest';
import {
  deriveSpan,
  factSentence,
  isDerivedOnly,
  rollupFacts,
} from '../../src/engine/rollup';
import type { ActionItem, LocalDate, TimelineItem } from '../../src/engine/types';

const d = (s: string) => s as LocalDate;

function item(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: overrides.id ?? 'x',
    title: 'Item',
    kind: 'project',
    start: null,
    target: null,
    status: 'active',
    statusLabel: null,
    group: null,
    subGroup: null,
    tags: [],
    flags: { targetBeforeStart: false },
    milestoneIds: [],
    goalId: null,
    actionIds: [],
    derived: null,
    horizonLabel: null,
    ...overrides,
  };
}

function action(overrides: Partial<ActionItem>): ActionItem {
  return { id: 'a', title: 'A', start: null, target: null, done: false, ...overrides };
}

describe('deriveSpan', () => {
  it('takes the envelope of every child date', () => {
    expect(
      deriveSpan([
        { start: d('2026-03-01'), target: d('2026-04-01') },
        { start: null, target: d('2026-09-15') },
        { start: d('2026-01-20'), target: null },
      ]),
    ).toEqual({ start: d('2026-01-20'), target: d('2026-09-15') });
  });

  it('returns null when no child is dated', () => {
    expect(deriveSpan([{ start: null, target: null }])).toBeNull();
    expect(deriveSpan([])).toBeNull();
  });
});

describe('rollup facts', () => {
  it('counts, never percents', () => {
    const facts = rollupFacts(
      [item({ status: 'done' }), item({}), item({})],
      [action({ done: true }), action({})],
    );
    expect(facts).toEqual({
      projectsDone: 1,
      projectsTotal: 3,
      actionsDone: 1,
      actionsTotal: 2,
    });
    expect(factSentence(facts)).toBe('1 of 3 projects completed · 1 of 2 actions done');
  });

  it('says nothing when there are no children', () => {
    expect(factSentence(rollupFacts([], []))).toBeNull();
  });
});

describe('isDerivedOnly', () => {
  it('is true only for undated items carrying a derived span', () => {
    expect(
      isDerivedOnly(item({ derived: { start: d('2026-01-01'), target: d('2026-02-01') } })),
    ).toBe(true);
    expect(
      isDerivedOnly(
        item({
          target: d('2026-03-01'),
          derived: { start: d('2026-01-01'), target: d('2026-02-01') },
        }),
      ),
    ).toBe(false);
    expect(isDerivedOnly(item({}))).toBe(false);
  });
});
