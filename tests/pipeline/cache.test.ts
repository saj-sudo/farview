import { describe, expect, it } from 'vitest';
import { isFresh, memoryCache, type CachedRecord } from '../../src/pipeline/cache';
import type { FullObject } from '../../src/engine/provider';

function obj(id: string): FullObject {
  return { id, structureId: 'st', title: id, properties: {} };
}

function rec(id: string, fetchedAt: number): CachedRecord {
  return { id, fetchedAt, object: obj(id) };
}

describe('memoryCache', () => {
  it('stores, retrieves, and clears by id', async () => {
    const cache = memoryCache();
    await cache.put([rec('a', 100), rec('b', 100)]);
    const got = await cache.get(['a', 'b', 'missing']);
    expect(got.size).toBe(2);
    expect(got.get('a')!.object.title).toBe('a');
    await cache.clear();
    expect((await cache.get(['a'])).size).toBe(0);
  });

  it('upserts idempotently — two tabs writing is harmless (§11)', async () => {
    const cache = memoryCache();
    await cache.put([rec('a', 100)]);
    await cache.put([rec('a', 200)]);
    expect((await cache.get(['a'])).get('a')!.fetchedAt).toBe(200);
  });

  it('hands out copies, not shared references', async () => {
    const cache = memoryCache();
    await cache.put([rec('a', 100)]);
    const first = (await cache.get(['a'])).get('a')!;
    first.object.title = 'mutated';
    expect((await cache.get(['a'])).get('a')!.object.title).toBe('a');
  });
});

describe('isFresh', () => {
  it('applies the TTL against the injected clock', () => {
    const record = rec('a', 1_000_000);
    const ttlMinutes = 60;
    expect(isFresh(record, 1_000_000 + 59 * 60_000, ttlMinutes)).toBe(true);
    expect(isFresh(record, 1_000_000 + 60 * 60_000, ttlMinutes)).toBe(false);
  });
});
