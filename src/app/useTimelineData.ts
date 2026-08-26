import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ResolvedSchema } from '../engine/resolve';
import type { FarviewConfig, TimelineItem } from '../engine/types';
import { extractItem } from '../engine/extract';
import type { FullObject } from '../engine/provider';
import type { ActionItem, MilestoneItem } from '../engine/types';
import { memoryCache, openIdbCache, type ObjectCache } from '../pipeline/cache';
import { loadActions, loadMilestones, loadTimelineData } from '../pipeline/load';
import { disconnect, isAuthLoss, type Session } from './session';

/**
 * The one place the pipeline meets Preact. Owns the abort lifecycle,
 * accumulates progressively-arriving items (keyed by id — duplicate
 * titles are common and meaningless, §11), and exposes refresh and
 * load-more.
 */

export interface TimelineData {
  items: TimelineItem[];
  loading: boolean;
  progress: { done: number; total: number } | null;
  lastRefreshed: number | null;
  remaining: number;
  warnings: string[];
  refresh: (force: boolean) => void;
  loadMore: () => void;
  loadMilestones: (ids: string[]) => Promise<MilestoneItem[]>;
  loadActionItems: (ids: string[]) => Promise<ActionItem[]>;
  /** One object by id, kind inferred from its structure — the detail
   *  view's cold-start path for deep links. Upserts into the item set. */
  loadSingle: (id: string) => Promise<TimelineItem | null>;
  clearCache: () => Promise<void>;
  /** Replace one item locally (optimistic edits and reverts). */
  upsertItem: (item: TimelineItem) => void;
  /** Fold a server-confirmed object into items and cache (write-through). */
  applyObject: (
    obj: FullObject,
    kind: 'project' | 'goal',
    keep?: { group: string | null; tags: string[] },
  ) => TimelineItem | null;
}

export function useTimelineData(
  session: Session,
  config: FarviewConfig | null,
  resolved: ResolvedSchema | null,
): TimelineData {
  const [itemMap, setItemMap] = useState<Map<string, TimelineItem>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [runSeq, setRunSeq] = useState(0);
  const offsetRef = useRef(0);
  const forceRef = useRef(false);
  const appendRef = useRef(false);
  const cacheRef = useRef<ObjectCache | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!config || !resolved || !resolved.types.project) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    (async () => {
      if (!cacheRef.current) {
        // The demo never persists; live sessions fall back to memory when
        // IndexedDB is unavailable and simply refetch more often.
        cacheRef.current =
          session.kind === 'demo' ? memoryCache() : ((await openIdbCache()) ?? memoryCache());
      }
      if (cancelled) return;

      if (!appendRef.current) {
        setItemMap(new Map());
        offsetRef.current = 0;
      }
      setLoading(true);
      setWarnings([]);
      setProgress(null);

      try {
        const result = await loadTimelineData(
          {
            provider: session.provider,
            cache: cacheRef.current,
            config,
            resolved,
            signal: controller.signal,
          },
          {
            onItems: (batch) => {
              if (cancelled) return;
              setItemMap((prev) => {
                const next = new Map(prev);
                for (const item of batch) next.set(item.id, item);
                return next;
              });
            },
            onProgress: (p) => {
              if (!cancelled) setProgress(p);
            },
            onWarning: (message) => {
              if (!cancelled) setWarnings((prev) => [...prev, message]);
            },
          },
          { force: forceRef.current, offset: offsetRef.current },
        );
        if (cancelled) return;
        setRemaining(result.remaining);
        setLastRefreshed(result.lastRefreshed);
      } catch (err) {
        if (cancelled) return;
        if (isAuthLoss(err)) {
          disconnect();
          location.reload();
          return;
        }
        setWarnings((prev) => [
          ...prev,
          'Could not reach Capacities right now. Cached content may still be shown.',
        ]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          forceRef.current = false;
          appendRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // runSeq re-triggers deliberately for refresh/loadMore.
  }, [session, config, resolved, runSeq]);

  return useMemo(
    () => ({
      items: [...itemMap.values()],
      loading,
      progress,
      lastRefreshed,
      remaining,
      warnings,
      refresh: (force: boolean) => {
        forceRef.current = force;
        appendRef.current = false;
        offsetRef.current = 0;
        setRunSeq((s) => s + 1);
      },
      loadMore: () => {
        offsetRef.current += config?.display.fetchCeiling ?? 300;
        appendRef.current = true;
        setRunSeq((s) => s + 1);
      },
      loadMilestones: async (ids: string[]) => {
        if (!config || !resolved || !cacheRef.current) return [];
        return loadMilestones(
          { provider: session.provider, cache: cacheRef.current, config, resolved },
          ids,
        );
      },
      loadActionItems: async (ids: string[]) => {
        if (!config || !resolved || !cacheRef.current) return [];
        return loadActions(
          { provider: session.provider, cache: cacheRef.current, config, resolved },
          ids,
        );
      },
      loadSingle: async (id: string) => {
        if (!config || !resolved) return null;
        const existing = itemMap.get(id);
        if (existing) return existing;
        const obj = await session.provider.getObject(id).catch(() => null);
        if (!obj) return null;
        const kind =
          obj.structureId === resolved.types.goal?.structure.id ? 'goal' : 'project';
        const extracted = extractItem(obj, kind, config, resolved, () => []);
        setItemMap((prev) => new Map(prev).set(extracted.id, extracted));
        void cacheRef.current
          ?.put([{ id: obj.id, fetchedAt: Date.now(), object: obj }])
          .catch(() => {});
        return extracted;
      },
      upsertItem: (item: TimelineItem) => {
        setItemMap((prev) => new Map(prev).set(item.id, item));
      },
      applyObject: (obj, kind, keep) => {
        if (!config || !resolved) return null;
        // Tag membership is unknown for a fresh extraction, so an edited
        // item keeps its lane rather than jumping to Ungrouped.
        const extracted = extractItem(obj, kind, config, resolved, () => keep?.tags ?? []);
        const item = keep ? { ...extracted, group: keep.group, tags: keep.tags } : extracted;
        setItemMap((prev) => new Map(prev).set(item.id, item));
        void cacheRef.current
          ?.put([{ id: obj.id, fetchedAt: Date.now(), object: obj }])
          .catch(() => {});
        return item;
      },
      clearCache: async () => {
        await cacheRef.current?.clear();
      },
    }),
    [itemMap, loading, progress, lastRefreshed, remaining, warnings, config, resolved, session],
  );
}
