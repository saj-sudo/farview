import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import type { Provider } from '../../src/engine/provider';
import { resolveSchema } from '../../src/engine/resolve';
import type { LocalDate, TimelineItem } from '../../src/engine/types';
import { memoryCache } from '../../src/pipeline/cache';
import { loadMilestones, loadTimelineData, type LoadHooks } from '../../src/pipeline/load';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import {
  buildStrangersSpace,
  strangersDemoConfig,
} from '../../src/providers/fixture/strangersSpace';

// End-to-end over the stranger's space: every assertion here holds
// against a schema the code has never heard of — the premise's guard.

const TODAY = '2026-08-25' as LocalDate;
const noSleep = { sleep: () => Promise.resolve() };

async function setup(configOverride: object = {}) {
  const provider = new FixtureProvider(buildStrangersSpace(TODAY));
  const config = normalizeConfig({ ...(strangersDemoConfig() as object), ...configOverride });
  const resolved = resolveSchema(
    config,
    await provider.listStructures(),
    await provider.listTags(),
  );
  expect(resolved.warnings).toEqual([]);
  return { provider, config, resolved };
}

function collector() {
  const items: TimelineItem[] = [];
  const batches: number[] = [];
  const warnings: string[] = [];
  let lastProgress = { done: 0, total: 0 };
  const hooks: LoadHooks = {
    onItems: (batch) => {
      items.push(...batch);
      batches.push(batch.length);
    },
    onProgress: (p) => {
      lastProgress = p;
    },
    onWarning: (w) => warnings.push(w),
  };
  return { items, batches, warnings, hooks, progress: () => lastProgress };
}

describe('loadTimelineData on the stranger\'s space', () => {
  it('enumerates, enriches, and emits every project and goal', async () => {
    const { provider, config, resolved } = await setup();
    const c = collector();
    const result = await loadTimelineData(
      { provider, cache: memoryCache(), config, resolved, backoff: noSleep },
      c.hooks,
    );

    // 13 Refits + 3 Voyages; Waypoints and Crew are never enumerated.
    expect(result.total).toBe(16);
    expect(c.items).toHaveLength(16);
    expect(c.progress()).toEqual({ done: 16, total: 16 });
    expect(result.remaining).toBe(0);

    const byId = new Map(c.items.map((i) => [i.id, i]));
    const mainstay = byId.get('x-mainstay')!;
    expect(mainstay.kind).toBe('project');
    expect(mainstay.group).toBe('hull'); // via tag membership listing
    expect(mainstay.start).toBe('2026-06-26');
    expect(mainstay.milestoneIds).toEqual(['w-mast', 'w-rig', 'w-seatrial']);

    const voyage = byId.get('v-circumnavigate')!;
    expect(voyage.kind).toBe('goal');
    expect(voyage.horizonLabel).toBe('Beyond the Chart');

    // The reversed-dates refit is flagged, not swapped; the unknown berth
    // stays visible; the undated one flows through to Someday handling.
    expect(byId.get('x-mooring-chart')!.flags.targetBeforeStart).toBe(true);
    expect(byId.get('x-careen')!.status).toBe('unknown');
    expect(byId.get('x-celestial')!.target).toBeNull();

    // Duplicate titles arrive as two distinct items (§11: key by id).
    expect(byId.get('x-tender-a')!.title).toBe(byId.get('x-tender-b')!.title);
  });

  it('applies the fetch ceiling and reports the remainder for load-more', async () => {
    const { provider, config, resolved } = await setup({
      display: { fetchCeiling: 10 },
    });
    const cache = memoryCache();
    const first = collector();
    const r1 = await loadTimelineData(
      { provider, cache, config, resolved, backoff: noSleep },
      first.hooks,
    );
    expect(r1.attempted).toBe(10);
    expect(r1.remaining).toBe(6);
    expect(first.items).toHaveLength(10);

    const second = collector();
    const r2 = await loadTimelineData(
      { provider, cache, config, resolved, backoff: noSleep },
      second.hooks,
      { offset: 10 },
    );
    expect(r2.remaining).toBe(0);
    expect(second.items).toHaveLength(6);
    const all = new Set([...first.items, ...second.items].map((i) => i.id));
    expect(all.size).toBe(16);
  });

  it('serves cache-fresh objects without refetching, until TTL or force', async () => {
    const { provider, config, resolved } = await setup();
    const cache = memoryCache();
    let nowMs = 1_000_000;
    const deps = {
      provider,
      cache,
      config,
      resolved,
      now: () => nowMs,
      backoff: noSleep,
    };

    await loadTimelineData(deps, collector().hooks);
    const callsAfterCold = provider.getObjectCalls;
    expect(callsAfterCold).toBe(16);

    // Warm: everything fresh, zero GETs — and items still arrive.
    nowMs += 10 * 60_000;
    const warm = collector();
    await loadTimelineData(deps, warm.hooks);
    expect(provider.getObjectCalls).toBe(callsAfterCold);
    expect(warm.items).toHaveLength(16);
    expect(warm.batches[0]).toBe(16); // one instant batch from cache

    // TTL expiry (default 60 min): everything refetches.
    nowMs += 55 * 60_000;
    await loadTimelineData(deps, collector().hooks);
    expect(provider.getObjectCalls).toBe(callsAfterCold + 16);

    // Manual force ignores freshness outright.
    await loadTimelineData(deps, collector().hooks, { force: true });
    expect(provider.getObjectCalls).toBe(callsAfterCold + 32);
  });

  it('rides out scripted 429s — progressive render continues', async () => {
    const { provider, config, resolved } = await setup();
    provider.failPlan.set('x-mainstay', 2);
    provider.failPlan.set('v-atoll', 1);
    const c = collector();
    const result = await loadTimelineData(
      { provider, cache: memoryCache(), config, resolved, backoff: noSleep },
      c.hooks,
    );
    expect(result.failed).toBe(0);
    expect(c.items).toHaveLength(16);
    expect(c.warnings).toEqual([]);
  });

  it('prunes deleted objects silently and warns about hard failures', async () => {
    const { provider, config, resolved } = await setup();
    const flaky: Provider = {
      ...providerDelegate(provider),
      getObject: (id) =>
        id === 'x-celestial'
          ? Promise.resolve(null) // deleted between list and get
          : id === 'x-careen'
            ? Promise.reject(new Error('backend hiccup'))
            : provider.getObject(id),
    };
    const c = collector();
    const result = await loadTimelineData(
      { provider: flaky, cache: memoryCache(), config, resolved, backoff: noSleep },
      c.hooks,
    );
    expect(c.items).toHaveLength(14);
    expect(result.failed).toBe(1);
    expect(c.warnings).toHaveLength(1);
    expect(c.warnings[0]).toContain('could not be loaded');
    expect(c.progress()).toEqual({ done: 16, total: 16 });
  });
});

describe('loadMilestones', () => {
  it('fetches lazily, cache-first, in date order', async () => {
    const { provider, config, resolved } = await setup();
    const cache = memoryCache();
    const deps = { provider, cache, config, resolved, backoff: noSleep };
    const first = await loadMilestones(deps, ['w-rig', 'w-mast', 'w-seatrial']);
    expect(first.map((m) => m.id)).toEqual(['w-mast', 'w-rig', 'w-seatrial']);
    expect(first[0]!.done).toBe(true); // 'Passed' is in the demo's done set
    expect(first[1]!.done).toBe(false);
    const calls = provider.getObjectCalls;
    await loadMilestones(deps, ['w-rig', 'w-mast']);
    expect(provider.getObjectCalls).toBe(calls); // cache-fresh, no refetch
  });
});

function providerDelegate(provider: FixtureProvider): Provider {
  return {
    spaceInfo: () => provider.spaceInfo(),
    listStructures: () => provider.listStructures(),
    listTags: () => provider.listTags(),
    listObjectsByStructure: (id) => provider.listObjectsByStructure(id),
    listObjectsByTag: (id) => provider.listObjectsByTag(id),
    getObject: (id) => provider.getObject(id),
    deepLink: (id) => provider.deepLink(id),
  };
}
