import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/engine/config';
import { addDays, dayNumber } from '../../../src/engine/dates';
import { applyDateChange } from '../../../src/engine/editor';
import { resolveSchema, type ResolvedSchema } from '../../../src/engine/resolve';
import { DEFAULT_SPAN_DAYS, datesForDrop } from '../../../src/engine/timeline/drop';
import { place } from '../../../src/engine/timeline/lanes';
import type { LocalDate, TimelineItem } from '../../../src/engine/types';
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
const DROP = dayNumber('2026-10-12' as LocalDate);

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
  return { items: [...new Map(items.map((i) => [i.id, i])).values()], resolved };
}

/** The same rule Timeline.tsx uses to decide which dates a card may edit. */
function writableOf(item: TimelineItem, resolved: ResolvedSchema) {
  return item.kind === 'goal'
    ? { start: false, target: resolved.properties.goalTarget?.property.writable === true }
    : {
        start: resolved.properties.projectStart?.property.writable === true,
        target: resolved.properties.projectTarget?.property.writable === true,
      };
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

describe.each(Object.entries(spaces))('dropping Someday items on %s', (_name, build) => {
  it('puts every undated item on the axis, writing only dates the space lets us write', async () => {
    const { items, resolved } = await build();
    const undated = items.filter((i) => i.start === null && i.target === null && i.derived === null);
    for (const item of undated) {
      const writable = writableOf(item, resolved);
      const change = datesForDrop(item, DROP, writable);
      if (!writable.start && !writable.target) {
        expect(change, item.title).toBeNull();
        continue;
      }
      expect(change, item.title).not.toBeNull();
      if (!writable.start) expect(change).not.toHaveProperty('start');
      if (!writable.target) expect(change).not.toHaveProperty('target');
      const placed = place(applyDateChange(item, change!), dayNumber(TODAY));
      expect(placed, item.title).not.toBeNull();
    }
  });
});

describe('datesForDrop', () => {
  const someday = {
    id: 'x',
    kind: 'project',
    start: null,
    target: null,
    derived: null,
  } as unknown as TimelineItem;
  const dropDate = '2026-10-12' as LocalDate;

  it('starts on the drop day and runs a default span when both dates are writable', () => {
    expect(datesForDrop(someday, DROP, { start: true, target: true })).toEqual({
      start: dropDate,
      target: addDays(dropDate, DEFAULT_SPAN_DAYS),
    });
  });

  it('sets the one date the space lets us write', () => {
    expect(datesForDrop(someday, DROP, { start: false, target: true })).toEqual({ target: dropDate });
    expect(datesForDrop(someday, DROP, { start: true, target: false })).toEqual({ start: dropDate });
  });

  it('writes nothing when no date is writable', () => {
    expect(datesForDrop(someday, DROP, { start: false, target: false })).toBeNull();
  });

  it('keeps a date the item already has and fills only the missing one', () => {
    const startOnly = { ...someday, start: '2026-09-01' as LocalDate } as TimelineItem;
    expect(datesForDrop(startOnly, DROP, { start: true, target: true })).toEqual({
      target: addDays('2026-09-01' as LocalDate, DEFAULT_SPAN_DAYS),
    });
    const targetOnly = { ...someday, target: '2026-11-01' as LocalDate } as TimelineItem;
    expect(datesForDrop(targetOnly, DROP, { start: true, target: true })).toEqual({ start: dropDate });
    const dated = { ...startOnly, target: '2026-11-01' as LocalDate } as TimelineItem;
    expect(datesForDrop(dated, DROP, { start: true, target: true })).toBeNull();
  });

  it('rounds a fractional drop to a whole day', () => {
    expect(datesForDrop(someday, DROP + 0.4, { start: false, target: true })).toEqual({ target: dropDate });
  });
});
