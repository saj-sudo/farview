import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/engine/config';
import { dayNumber } from '../../../src/engine/dates';
import { resolveSchema } from '../../../src/engine/resolve';
import { place } from '../../../src/engine/timeline/lanes';
import { projectsPerMonth } from '../../../src/engine/timeline/workload';
import type { LocalDate, TimelineItem } from '../../../src/engine/types';
import { memoryCache } from '../../../src/pipeline/cache';
import { loadCollectionTags, loadTimelineData } from '../../../src/pipeline/load';
import { buildEmptySpace } from '../../../src/providers/fixture/emptySpace';
import { FixtureProvider } from '../../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../../src/providers/fixture/minimalSpace';
import { buildStandardSpace } from '../../../src/providers/fixture/standardSpace';
import {
  buildStrangersSpace,
  strangersDemoConfig,
} from '../../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;
const TODAY_DAY = dayNumber(TODAY);
const day = (d: string): number => dayNumber(d as LocalDate);

async function load(provider: FixtureProvider, config: ReturnType<typeof normalizeConfig>) {
  const resolved = resolveSchema(
    config,
    await provider.listStructures(),
    await provider.listTags(),
    await loadCollectionTags(provider, config),
  );
  const items: TimelineItem[] = [];
  await loadTimelineData(
    { provider, cache: memoryCache(), config, resolved, backoff: { sleep: () => Promise.resolve() } },
    { onItems: (batch) => items.push(...batch), onProgress: () => undefined, onWarning: () => undefined },
  );
  return [...new Map(items.map((i) => [i.id, i])).values()];
}

const spaces = {
  "the stranger's space": () =>
    load(new FixtureProvider(buildStrangersSpace(TODAY)), normalizeConfig(strangersDemoConfig() as object)),
  'the standard space': () =>
    load(
      new FixtureProvider(buildStandardSpace(TODAY)),
      normalizeConfig({ types: { project: 'Project' } }),
    ),
  'the minimal space': () =>
    load(
      new FixtureProvider(buildMinimalSpace(TODAY)),
      normalizeConfig({
        types: { project: 'Undertaking' },
        properties: { projectStart: null, projectTarget: 'By When', projectStatus: null, projectMilestones: null },
      }),
    ),
  'the empty space': () =>
    load(new FixtureProvider(buildEmptySpace()), normalizeConfig({ types: { project: 'Project' } })),
};

const project = (id: string, start: string | null, target: string | null): TimelineItem =>
  ({
    id,
    title: id,
    kind: 'project',
    start,
    target,
    status: 'active',
    group: null,
    subGroup: null,
    tags: [],
    flags: { targetBeforeStart: false },
    derived: null,
  }) as unknown as TimelineItem;

describe('projectsPerMonth on hand-made projects', () => {
  const items = [
    project('a', '2026-01-10', '2026-03-05'), // Jan, Feb, Mar
    project('b', '2026-02-20', '2026-02-25'), // Feb only
    project('c', null, '2026-03-20'), // a dot in Mar
    project('d', null, null), // Someday: not counted
  ];
  const months = projectsPerMonth(items, day('2026-01-01'), day('2026-04-30'), TODAY_DAY);

  it('lists every month in the range, in order, with no gaps', () => {
    expect(months.map((m) => [m.year, m.month])).toEqual([[2026, 1], [2026, 2], [2026, 3], [2026, 4]]);
    for (let i = 1; i < months.length; i += 1) expect(months[i]!.startDay).toBe(months[i - 1]!.endDay);
  });

  it('counts a project in every month its bar touches, and skips undated ones', () => {
    expect(months.map((m) => m.count)).toEqual([1, 2, 2, 0]);
  });

  it('does not count a project in the month after its target', () => {
    const ends = [project('e', '2026-01-01', '2026-02-01')];
    expect(projectsPerMonth(ends, day('2026-01-01'), day('2026-03-01'), TODAY_DAY).map((m) => m.count)).toEqual([1, 0, 0]);
  });

  it('does not count goals', () => {
    const goal = { ...project('g', null, '2026-02-10'), kind: 'goal' } as TimelineItem;
    expect(projectsPerMonth([goal], day('2026-01-01'), day('2026-03-01'), TODAY_DAY).map((m) => m.count)).toEqual([0, 0, 0]);
  });

  it('starts at the month that holds the first day, even mid-month', () => {
    const m = projectsPerMonth(items, day('2026-02-17'), day('2026-02-18'), TODAY_DAY);
    expect(m).toHaveLength(1);
    expect(m[0]!.month).toBe(2);
  });

  it('crosses a year boundary', () => {
    const m = projectsPerMonth([], day('2026-11-15'), day('2027-02-01'), TODAY_DAY);
    expect(m.map((x) => [x.year, x.month])).toEqual([[2026, 11], [2026, 12], [2027, 1], [2027, 2]]);
  });
});

describe.each(Object.entries(spaces))('projectsPerMonth on %s', (_name, build) => {
  it('matches a count made one project at a time', async () => {
    const items = await build();
    const first = TODAY_DAY - 400;
    const last = TODAY_DAY + 700;
    const months = projectsPerMonth(items, first, last, TODAY_DAY);
    for (const m of months) {
      let expected = 0;
      for (const item of items) {
        if (item.kind !== 'project') continue;
        const p = place(item, TODAY_DAY);
        if (p && p.effStart < m.endDay && p.effEnd > m.startDay) expected += 1;
      }
      expect(m.count, `${m.year}-${m.month}`).toBe(expected);
    }
  });

  it('never counts more projects than the space has', async () => {
    const items = await build();
    const total = items.filter((i) => i.kind === 'project').length;
    for (const m of projectsPerMonth(items, TODAY_DAY - 400, TODAY_DAY + 700, TODAY_DAY)) {
      expect(m.count).toBeLessThanOrEqual(total);
    }
  });
});
