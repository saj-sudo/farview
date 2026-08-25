import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ResolvedSchema } from '../engine/resolve';
import type { FarviewConfig, TimelineItem } from '../engine/types';
import type { MilestoneItem } from '../engine/types';
import { memoryCache, openIdbCache, type ObjectCache } from '../pipeline/cache';
import { loadMilestones, loadTimelineData } from '../pipeline/load';
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
  clearCache: () => Promise<void>;
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
      clearCache: async () => {
        await cacheRef.current?.clear();
      },
    }),
    [itemMap, loading, progress, lastRefreshed, remaining, warnings, config, resolved, session],
  );
}
