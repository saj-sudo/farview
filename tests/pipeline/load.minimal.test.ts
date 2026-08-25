import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { resolveSchema } from '../../src/engine/resolve';
import type { LocalDate } from '../../src/engine/types';
import { memoryCache } from '../../src/pipeline/cache';
import { loadTimelineData } from '../../src/pipeline/load';
import { buildEmptySpace } from '../../src/providers/fixture/emptySpace';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';

// The minimal and empty spaces (spec §12): one custom type with one date
// property must render; a space with nothing must not break anything.

const TODAY = '2026-08-25' as LocalDate;

const config = normalizeConfig({
  types: { project: 'Undertaking' },
  properties: {
    projectStart: null,
    projectTarget: 'By When',
    projectStatus: null,
    projectMilestones: null,
  },
});

describe('minimal space', () => {
  it('renders from one type and one date property', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const resolved = resolveSchema(
      config,
      await provider.listStructures(),
      await provider.listTags(),
    );
    expect(resolved.warnings).toEqual([]);

    const items: string[] = [];
    const result = await loadTimelineData(
      { provider, cache: memoryCache(), config, resolved },
      {
        onItems: (batch) => items.push(...batch.map((i) => i.id)),
        onProgress: () => {},
        onWarning: () => {},
      },
    );
    expect(result.total).toBe(3);
    expect(new Set(items)).toEqual(new Set(['u-past', 'u-future', 'u-someday']));
  });
});

describe('empty space', () => {
  it('loads zero items without throwing — the empty state\'s data shape', async () => {
    const provider = new FixtureProvider(buildEmptySpace());
    const resolved = resolveSchema(
      config,
      await provider.listStructures(),
      await provider.listTags(),
    );
    const items: unknown[] = [];
    const warnings: string[] = [];
    const result = await loadTimelineData(
      { provider, cache: memoryCache(), config, resolved },
      {
        onItems: (batch) => items.push(...batch),
        onProgress: () => {},
        onWarning: (w) => warnings.push(w),
      },
    );
    expect(result.total).toBe(0);
    expect(result.remaining).toBe(0);
    expect(items).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
