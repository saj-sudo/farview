import type { FullObject } from '../engine/provider';

/**
 * The object cache (spec §5.4): list endpoints return no properties, so
 * every dated bar costs one GET — and caching those objects is what
 * makes a warm visit paint instantly. Records carry their fetch time;
 * FRESHNESS IS DECIDED BY THE CALLER against the configured TTL, so the
 * cache itself needs no clock and tests can fake time freely.
 *
 * Cache invalidation is imprecise by construction: list results carry no
 * lastUpdated, so TTL staleness is accepted, refresh is cheap and
 * visible, and nothing pretends to be live.
 *
 * If a future API version adds properties or timestamps to list
 * results, this file and most of the pipeline can be deleted.
 */

export interface CachedRecord {
  id: string;
  /** Unix milliseconds at fetch time. */
  fetchedAt: number;
  object: FullObject;
}

export interface ObjectCache {
  get(ids: string[]): Promise<Map<string, CachedRecord>>;
  /** Idempotent upsert — two tabs writing the same objects is harmless (§11). */
  put(records: CachedRecord[]): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory cache: the demo's cache, the test cache, and the idb fallback. */
export function memoryCache(): ObjectCache {
  const map = new Map<string, CachedRecord>();
  return {
    get(ids) {
      const out = new Map<string, CachedRecord>();
      for (const id of ids) {
        const rec = map.get(id);
        if (rec) out.set(id, structuredClone(rec));
      }
      return Promise.resolve(out);
    },
    put(records) {
      for (const rec of records) map.set(rec.id, structuredClone(rec));
      return Promise.resolve();
    },
    clear() {
      map.clear();
      return Promise.resolve();
    },
  };
}

const DB_NAME = 'farview';
const STORE = 'objects';

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * IndexedDB-backed cache, keyed by object id. Returns null when
 * IndexedDB is unavailable or refuses to open (private windows, blocked
 * site data) — callers fall back to memoryCache() silently; the app
 * just refetches more often.
 */
export async function openIdbCache(): Promise<ObjectCache | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });

    return {
      async get(ids) {
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const out = new Map<string, CachedRecord>();
        await Promise.all(
          ids.map(async (id) => {
            const rec = (await requestToPromise(store.get(id))) as
              | CachedRecord
              | undefined;
            if (rec) out.set(id, rec);
          }),
        );
        return out;
      },
      async put(records) {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const rec of records) store.put(rec);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
        });
      },
      async clear() {
        const tx = db.transaction(STORE, 'readwrite');
        await requestToPromise(tx.objectStore(STORE).clear());
      },
    };
  } catch {
    return null;
  }
}

/** Fresh = fetched within the TTL. The one freshness rule, in one place. */
export function isFresh(rec: CachedRecord, nowMs: number, ttlMinutes: number): boolean {
  return nowMs - rec.fetchedAt < ttlMinutes * 60_000;
}
