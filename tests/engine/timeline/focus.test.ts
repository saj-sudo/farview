import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/engine/config';
import { dayNumber } from '../../../src/engine/dates';
import { resolveSchema } from '../../../src/engine/resolve';
import { focusPillar, pillarsOf } from '../../../src/engine/timeline/focus';
import { layoutTimeline } from '../../../src/engine/timeline/layout';
import { windowAroundToday } from '../../../src/engine/timeline/scale';
import type { LocalDate, TimelineItem } from '../../../src/engine/types';
import { parsePillarFocus } from '../../../src/app/pillarFocus';
import { memoryCache } from '../../../src/pipeline/cache';
import { loadCollectionTags, loadTimelineData } from '../../../src/pipeline/load';
import { buildEmptySpace } from '../../../src/providers/fixture/emptySpace';
import { FixtureProvider } from '../../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../../src/providers/fixture/minimalSpace';
import {
  buildStrangersSpace,
  strangersDemoConfig,
} from '../../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;

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
  const latest = new Map(items.map((i) => [i.id, i]));
  return { items: [...latest.values()], resolved };
}

const spaces = {
  "the stranger's space": () =>
    load(new FixtureProvider(buildStrangersSpace(TODAY)), normalizeConfig(strangersDemoConfig() as object)),
  'the minimal space': () =>
    load(
      new FixtureProvider(buildMinimalSpace(TODAY)),
      normalizeConfig({
        types: { project: 'Undertaking' },
        properties: {
          projectStart: null,
          projectTarget: 'By When',
          projectStatus: null,
          projectMilestones: null,
        },
      }),
    ),
  'the empty space': () =>
    load(new FixtureProvider(buildEmptySpace()), normalizeConfig({ types: { project: 'Project' } })),
};

describe.each(Object.entries(spaces))('pillar focus on %s', (_name, build) => {
  it('lists each named pillar once, with every item counted', async () => {
    const { items, resolved } = await build();
    const pillars = pillarsOf(items, resolved.groupValues);
    expect(new Set(pillars.map((p) => p.name)).size).toBe(pillars.length);
    const grouped = items.filter((i) => i.group !== null).length;
    expect(pillars.reduce((n, p) => n + p.count, 0)).toBe(grouped);
  });

  it('keeps only the chosen pillar, whatever its kind or dates', async () => {
    const { items, resolved } = await build();
    for (const { name, count } of pillarsOf(items, resolved.groupValues)) {
      const focused = focusPillar(items, name);
      expect(focused).toHaveLength(count);
      expect(focused.every((i) => i.group === name)).toBe(true);
    }
  });

  it('shows everything for no focus, and for a pillar the space does not have', async () => {
    const { items } = await build();
    expect(focusPillar(items, null)).toEqual(items);
    expect(focusPillar(items, 'No such pillar')).toEqual(items);
  });

  it('lays out only the focused pillar, with its lanes in the same order', async () => {
    const { items, resolved } = await build();
    const opts = {
      view: windowAroundToday(dayNumber(TODAY), 365),
      width: 960,
      today: TODAY,
      groupOrder: resolved.groupValues,
      subGroupOrder: resolved.subGroupValues,
    };
    const all = layoutTimeline(items, opts);
    for (const { name } of pillarsOf(items, resolved.groupValues)) {
      // Goals share one lane at the top whatever their pillar, so it has no group.
      const lanes = layoutTimeline(focusPillar(items, name), opts).lanes.filter((l) => l.group !== null);
      expect(lanes.every((l) => l.group === name)).toBe(true);
      const expected = all.lanes.filter((l) => l.group === name).map((l) => l.subGroup);
      expect(lanes.map((l) => l.subGroup)).toEqual(expected);
    }
  });
});

describe('pillarsOf', () => {
  const at = (group: string | null): TimelineItem =>
    ({ id: `${group}`, group }) as unknown as TimelineItem;

  it('puts configured pillars first, then the rest alphabetically, and skips ungrouped items', () => {
    const items = [at('Sails'), at('Zinc'), at('Hull'), at(null), at('Hull'), at('Anchors')];
    expect(pillarsOf(items, ['Hull', 'Sails'])).toEqual([
      { name: 'Hull', count: 2 },
      { name: 'Sails', count: 1 },
      { name: 'Anchors', count: 1 },
      { name: 'Zinc', count: 1 },
    ]);
  });
});

describe('parsePillarFocus', () => {
  it('reads a stored name and treats nothing or blank as no focus', () => {
    expect(parsePillarFocus('Hull')).toBe('Hull');
    expect(parsePillarFocus(null)).toBeNull();
    expect(parsePillarFocus('  ')).toBeNull();
  });
});
