import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import {
  bucketFor,
  buildHorizonColumns,
  columnLabels,
  SOMEDAY_LABEL,
} from '../../src/engine/horizons';
import { addDays } from '../../src/engine/dates';
import { resolveSchema, type ResolvedSchema } from '../../src/engine/resolve';
import type { LocalDate, TimelineItem } from '../../src/engine/types';

const TODAY = '2026-08-25' as LocalDate;
const config = normalizeConfig({});
const emptyResolved: ResolvedSchema = resolveSchema(config, [], []);

function item(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: overrides.id ?? 'x',
    title: overrides.title ?? 'Item',
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

describe('derived bucketing (§8.2)', () => {
  it('places by days-out with inclusive boundaries', () => {
    // Default buckets: Now ≤30, Quarter ≤90, Year ≤365, Long = catch-all.
    expect(bucketFor(item({ target: addDays(TODAY, 30) }), TODAY, config)).toBe('Now');
    expect(bucketFor(item({ target: addDays(TODAY, 31) }), TODAY, config)).toBe('Quarter');
    expect(bucketFor(item({ target: addDays(TODAY, 90) }), TODAY, config)).toBe('Quarter');
    expect(bucketFor(item({ target: addDays(TODAY, 91) }), TODAY, config)).toBe('Year');
    expect(bucketFor(item({ target: addDays(TODAY, 365) }), TODAY, config)).toBe('Year');
    expect(bucketFor(item({ target: addDays(TODAY, 366) }), TODAY, config)).toBe('Long');
    expect(bucketFor(item({ target: addDays(TODAY, 4000) }), TODAY, config)).toBe('Long');
  });

  it('sends overdue items to the first bucket, not a guilt column', () => {
    expect(bucketFor(item({ target: addDays(TODAY, -12) }), TODAY, config)).toBe('Now');
  });

  it('falls back to the start date when there is no target', () => {
    expect(bucketFor(item({ start: addDays(TODAY, 50) }), TODAY, config)).toBe('Quarter');
  });

  it('sends undated items to Someday, never dropping them', () => {
    expect(bucketFor(item({}), TODAY, config)).toBe(SOMEDAY_LABEL);
  });

  it('uses the last bucket when no catch-all is configured', () => {
    const capped = normalizeConfig({
      horizons: { buckets: [{ label: 'Soon', maxDays: 30 }] },
    });
    expect(bucketFor(item({ target: addDays(TODAY, 400) }), TODAY, capped)).toBe('Soon');
  });
});

describe('property mode', () => {
  const propConfig = normalizeConfig({ horizons: { mode: 'property' } });

  it('uses the item\'s own horizon label', () => {
    expect(
      bucketFor(item({ horizonLabel: 'Beyond the Chart' }), TODAY, propConfig),
    ).toBe('Beyond the Chart');
  });

  it('derives when the label is missing rather than dropping the item', () => {
    expect(
      bucketFor(item({ target: addDays(TODAY, 10) }), TODAY, propConfig),
    ).toBe('Now');
  });
});

describe('columns', () => {
  it('orders columns by distance with Someday last', () => {
    expect(columnLabels(config, emptyResolved, [])).toEqual([
      'Now',
      'Quarter',
      'Year',
      'Long',
      SOMEDAY_LABEL,
    ]);
  });

  it('sorts items date-ascending within a column', () => {
    const near = item({ id: 'near', target: addDays(TODAY, 3) });
    const nearer = item({ id: 'nearer', target: addDays(TODAY, 1) });
    const cols = buildHorizonColumns([near, nearer], TODAY, config, emptyResolved);
    expect(cols[0]!.items.map((i) => i.id)).toEqual(['nearer', 'near']);
  });

  it('nests projects under a goal sharing its group, when goals are mapped', () => {
    const goalResolved: ResolvedSchema = {
      ...emptyResolved,
      types: {
        ...emptyResolved.types,
        goal: {
          role: 'goal',
          structure: { id: 'st-g', title: 'Goal', pluralName: 'Goals', properties: [] },
        },
      },
    };
    const goal = item({
      id: 'g',
      kind: 'goal',
      group: 'hull',
      target: addDays(TODAY, 20),
    });
    const inGroup = item({ id: 'p1', group: 'hull', target: addDays(TODAY, 10) });
    const outside = item({ id: 'p2', group: 'sails', target: addDays(TODAY, 10) });
    const cols = buildHorizonColumns(
      [goal, inGroup, outside],
      TODAY,
      config,
      goalResolved,
    );
    const now = cols[0]!;
    expect(now.goalGroups).toHaveLength(1);
    expect(now.goalGroups[0]!.goal.id).toBe('g');
    expect(now.goalGroups[0]!.items.map((i) => i.id)).toEqual(['p1']);
    expect(now.items.map((i) => i.id)).toEqual(['p2']);
  });
});
