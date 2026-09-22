import { extractAction, extractItem, extractMilestone } from '../engine/extract';
import type { CollectionDef, ObjectSummary, Provider } from '../engine/provider';
import type { CollectionTags, ResolvedSchema } from '../engine/resolve';
import { deriveSpan } from '../engine/rollup';
import type {
  ActionItem,
  FarviewConfig,
  MilestoneItem,
  TimelineItem,
} from '../engine/types';
import { withBackoff, type BackoffOptions } from '../providers/capacities/rateLimit';
import { isFresh, type CachedRecord, type ObjectCache } from './cache';
import { runPool } from './pool';

/**
 * The fetch pipeline (spec §5.4): enumerate cheaply from list endpoints,
 * cap the run, serve cache-fresh objects instantly, enrich the rest
 * through an adaptive pool, and emit progressively so the timeline
 * fills in while the axis is already on screen. Never block on a full
 * fetch; never fail the run for one bad object.
 *
 * If a future API version adds properties or timestamps to list
 * results, most of this file can be deleted. Note kept on purpose so it
 * gets revisited.
 */

export interface LoadHooks {
  /** Batches of ready items, in arrival order. Fresh cache arrives first. */
  onItems(items: TimelineItem[]): void;
  onProgress(progress: { done: number; total: number }): void;
  onWarning(message: string): void;
}

export interface LoadDeps {
  provider: Provider;
  cache: ObjectCache;
  config: FarviewConfig;
  resolved: ResolvedSchema;
  /** Unix ms clock, injectable for TTL tests. */
  now?: () => number;
  signal?: AbortSignal;
  /** Backoff knobs, injectable so tests never really sleep. */
  backoff?: BackoffOptions;
}

export interface LoadResult {
  /** Candidates found across all list endpoints (before the ceiling). */
  total: number;
  /** Candidates this run attempted (ceiling applied). */
  attempted: number;
  /** Candidates beyond the ceiling, available via load-more. */
  remaining: number;
  /** Unix ms when this run finished. */
  lastRefreshed: number;
  /** Items that failed to enrich this run. */
  failed: number;
}

const EMIT_BATCH = 8;

export async function loadTimelineData(
  deps: LoadDeps,
  hooks: LoadHooks,
  opts: { force?: boolean; offset?: number } = {},
): Promise<LoadResult> {
  const now = deps.now ?? Date.now;
  const { provider, cache, config, resolved } = deps;
  const offset = opts.offset ?? 0;

  /* 1 — enumerate: summaries are {id, structureId, title}, nothing more. */
  const kindOf = new Map<string, 'project' | 'goal'>();
  const summaries: ObjectSummary[] = [];
  const seen = new Set<string>();
  const roles: { kind: 'project' | 'goal'; structureId: string }[] = [];
  if (resolved.types.project) {
    roles.push({ kind: 'project', structureId: resolved.types.project.structure.id });
  }
  if (resolved.types.goal) {
    roles.push({ kind: 'goal', structureId: resolved.types.goal.structure.id });
  }
  for (const role of roles) {
    for await (const summary of provider.listObjectsByStructure(role.structureId)) {
      if (deps.signal?.aborted) return emptyResult(now());
      if (seen.has(summary.id)) continue;
      seen.add(summary.id);
      kindOf.set(summary.id, role.kind);
      summaries.push(summary);
    }
  }

  /* 2 — tag membership: list results carry no tags, so grouping by tag
     means one cheap summary listing per configured tag (not per object). */
  const membership = new Map<string, string[]>();
  const groupingTagNames = [...resolved.groupValues, ...resolved.subGroupValues];
  if (config.grouping.by === 'tag' || config.grouping.sub.by === 'tag') {
    for (const name of groupingTagNames) {
      const tagId = resolved.tagIds[name];
      if (!tagId) continue;
      for await (const summary of provider.listObjectsByTag(tagId)) {
        if (deps.signal?.aborted) return emptyResult(now());
        const tags = membership.get(summary.id);
        if (tags) tags.push(name);
        else membership.set(summary.id, [name]);
      }
    }
  }
  const tagsOf = (id: string): string[] => membership.get(id) ?? [];

  /* 3 — the ceiling: a huge space must not produce a five-minute first run. */
  const slice = summaries.slice(offset, offset + config.display.fetchCeiling);
  const total = summaries.length;
  const remaining = Math.max(0, total - offset - slice.length);

  let done = 0;
  let failed = 0;
  const progress = (): void =>
    hooks.onProgress({ done, total: slice.length });

  /* 4 — cache split: fresh records render before any network round-trip. */
  const cached = await cache.get(slice.map((s) => s.id));
  const ttl = config.display.cacheTtlMinutes;
  const freshItems: TimelineItem[] = [];
  const toFetch: ObjectSummary[] = [];
  for (const summary of slice) {
    const rec = cached.get(summary.id);
    if (!opts.force && rec && isFresh(rec, now(), ttl)) {
      freshItems.push(
        extractItem(rec.object, kindOf.get(summary.id) ?? 'project', config, resolved, tagsOf),
      );
      done += 1;
    } else {
      toFetch.push(summary);
    }
  }
  if (freshItems.length > 0) hooks.onItems(freshItems);
  progress();

  /* 5 — enrich through the adaptive pool, emitting in small batches. */
  const buffer: TimelineItem[] = [];
  const writes: CachedRecord[] = [];
  const collected: TimelineItem[] = [...freshItems];
  const flush = (): void => {
    if (buffer.length > 0) hooks.onItems(buffer.splice(0));
  };

  await runPool(
    toFetch,
    async (summary, ctx) => {
      try {
        const obj = await withBackoff(() => provider.getObject(summary.id), {
          ...deps.backoff,
          onRateLimited: () => {
            ctx.onRateLimited();
            deps.backoff?.onRateLimited?.();
          },
        });
        return obj;
      } catch (err) {
        // One bad object must not sink the run; progressive render goes on.
        failed += 1;
        void err;
        return null;
      }
    },
    (summary, obj) => {
      done += 1;
      if (obj) {
        writes.push({ id: obj.id, fetchedAt: now(), object: obj });
        const item = extractItem(
          obj,
          kindOf.get(summary.id) ?? 'project',
          config,
          resolved,
          tagsOf,
        );
        collected.push(item);
        buffer.push(item);
        if (buffer.length >= EMIT_BATCH) flush();
      }
      // null without a failure count = deleted between list and get: pruned
      // silently (§11).
      progress();
    },
    // The pool paces dispatches after a 429; share the backoff's sleep so
    // one injected clock covers both and tests never really wait.
    { signal: deps.signal, ...(deps.backoff?.sleep ? { sleep: deps.backoff.sleep } : {}) },
  );
  flush();
  if (writes.length > 0) {
    try {
      await cache.put(writes);
    } catch {
      // A cache that refuses writes only costs refetches.
    }
  }
  if (failed > 0) {
    hooks.onWarning(
      failed === 1
        ? 'One item could not be loaded this run; it will be retried on refresh.'
        : `${failed} items could not be loaded this run; they will be retried on refresh.`,
    );
  }

  /* 6 — derived spans: an undated item whose children carry dates gets
     the children's envelope, stated as derived and drawn dashed. Goals
     borrow their loaded projects for free; anything still undated gets a
     bounded child-fetch pass so the extra cost stays small. */
  if (!deps.signal?.aborted) {
    const undated = collected.filter((i) => i.start === null && i.target === null);
    const updates: TimelineItem[] = [];
    const needFetch: TimelineItem[] = [];
    for (const item of undated) {
      const fromProjects =
        item.kind === 'goal'
          ? deriveSpan(collected.filter((p) => p.goalId === item.id))
          : null;
      if (fromProjects) {
        updates.push({ ...item, derived: fromProjects });
      } else if (item.actionIds.length > 0 || item.milestoneIds.length > 0) {
        needFetch.push(item);
      }
    }
    for (const item of needFetch.slice(0, DERIVED_FETCH_CAP)) {
      const children = await loadActions(
        deps,
        [...item.actionIds, ...item.milestoneIds],
      );
      const span = deriveSpan(children);
      if (span) updates.push({ ...item, derived: span });
    }
    if (updates.length > 0) hooks.onItems(updates);
  }

  return { total, attempted: slice.length, remaining, lastRefreshed: now(), failed };
}

/** Undated parents given a child-fetch for derivation, per run. */
const DERIVED_FETCH_CAP = 25;

function emptyResult(nowMs: number): LoadResult {
  return { total: 0, attempted: 0, remaining: 0, lastRefreshed: nowMs, failed: 0 };
}

/**
 * Resolve the tag collections a config names into their member tag
 * names — the live read that lets a space map a whole grouping level
 * by naming its own collection ("Life Pillars") instead of listing
 * every tag. Only the named collections are fetched, so the cost is
 * one listing per mapped level, not per collection in the space.
 */
export async function loadCollectionTags(
  provider: Provider,
  config: FarviewConfig,
): Promise<CollectionTags> {
  const wanted = [config.grouping.collection, config.grouping.sub.collection]
    .filter((c): c is string => c !== null)
    .map((c) => c.trim().toLowerCase());
  if (wanted.length === 0) return {};

  let collections: CollectionDef[];
  try {
    collections = await withBackoff(() => provider.listCollections());
  } catch {
    return {}; // a space that will not list collections simply has no lanes
  }

  const out: CollectionTags = {};
  for (const collection of collections) {
    const key = collection.name.trim().toLowerCase();
    if (!wanted.includes(key) || out[key] !== undefined) continue;
    const names: string[] = [];
    try {
      for await (const member of provider.listObjectsByCollection(collection.id)) {
        names.push(member.title);
      }
    } catch {
      continue;
    }
    out[key] = names;
  }
  return out;
}

/**
 * Actions — the hierarchy's leaf — fetched lazily (a detail view, a
 * derived-span pass), cache-first, through a small pool. Same shape as
 * milestones: never part of the initial enumeration.
 */
export async function loadActions(
  deps: LoadDeps,
  ids: string[],
): Promise<ActionItem[]> {
  const now = deps.now ?? Date.now;
  const cached = await deps.cache.get(ids);
  const ttl = deps.config.display.cacheTtlMinutes;
  const out: ActionItem[] = [];
  const toFetch: string[] = [];
  for (const id of ids) {
    const rec = cached.get(id);
    if (rec && isFresh(rec, now(), ttl)) {
      out.push(extractAction(rec.object, deps.config, deps.resolved));
    } else {
      toFetch.push(id);
    }
  }
  const writes: CachedRecord[] = [];
  await runPool(
    toFetch,
    async (id, ctx) => {
      try {
        return await withBackoff(() => deps.provider.getObject(id), {
          ...deps.backoff,
          onRateLimited: ctx.onRateLimited,
        });
      } catch {
        return null;
      }
    },
    (id, obj) => {
      void id;
      if (obj) {
        writes.push({ id: obj.id, fetchedAt: now(), object: obj });
        out.push(extractAction(obj, deps.config, deps.resolved));
      }
    },
    {
      initialConcurrency: 2,
      ...(deps.signal ? { signal: deps.signal } : {}),
      ...(deps.backoff?.sleep ? { sleep: deps.backoff.sleep } : {}),
    },
  );
  if (writes.length > 0) {
    try {
      await deps.cache.put(writes);
    } catch {
      // refetch later
    }
  }
  return out.sort((a, b) => ((a.target ?? '9999') < (b.target ?? '9999') ? -1 : 1));
}

/**
 * One item by id, as a full TimelineItem — the detail view's cold-start
 * path when a deep link arrives before (or without) the main load.
 */
export async function loadItem(
  deps: LoadDeps,
  id: string,
  kind: 'project' | 'goal',
): Promise<TimelineItem | null> {
  const now = deps.now ?? Date.now;
  const cached = await deps.cache.get([id]);
  const rec = cached.get(id);
  if (rec && isFresh(rec, now(), deps.config.display.cacheTtlMinutes)) {
    return extractItem(rec.object, kind, deps.config, deps.resolved, () => []);
  }
  const obj = await withBackoff(() => deps.provider.getObject(id), deps.backoff ?? {});
  if (!obj) return null;
  try {
    await deps.cache.put([{ id, fetchedAt: now(), object: obj }]);
  } catch {
    // refetch later
  }
  return extractItem(obj, kind, deps.config, deps.resolved, () => []);
}

/**
 * Milestones are objects behind an entity property (§8.1) — an opt-in
 * enhancement fetched lazily when a card is expanded, never during the
 * initial load. Cache-first, small pool.
 */
export async function loadMilestones(
  deps: LoadDeps,
  ids: string[],
): Promise<MilestoneItem[]> {
  const now = deps.now ?? Date.now;
  const cached = await deps.cache.get(ids);
  const ttl = deps.config.display.cacheTtlMinutes;
  const out: MilestoneItem[] = [];
  const toFetch: string[] = [];
  for (const id of ids) {
    const rec = cached.get(id);
    if (rec && isFresh(rec, now(), ttl)) {
      out.push(extractMilestone(rec.object, deps.config));
    } else {
      toFetch.push(id);
    }
  }
  const writes: CachedRecord[] = [];
  await runPool(
    toFetch,
    async (id, ctx) => {
      try {
        return await withBackoff(() => deps.provider.getObject(id), {
          ...deps.backoff,
          onRateLimited: ctx.onRateLimited,
        });
      } catch {
        return null;
      }
    },
    (id, obj) => {
      void id;
      if (obj) {
        writes.push({ id: obj.id, fetchedAt: now(), object: obj });
        out.push(extractMilestone(obj, deps.config));
      }
    },
    {
      initialConcurrency: 2,
      signal: deps.signal,
      ...(deps.backoff?.sleep ? { sleep: deps.backoff.sleep } : {}),
    },
  );
  if (writes.length > 0) {
    try {
      await deps.cache.put(writes);
    } catch {
      // refetch later
    }
  }
  // Present in date order regardless of arrival order.
  return out.sort((a, b) => (a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1);
}
