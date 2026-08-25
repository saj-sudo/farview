import { describe, expect, it } from 'vitest';
import type { CapacitiesClient } from '@capacities/api';
import { CapacitiesAdapter } from '../../src/providers/capacities/adapter';

/**
 * Pagination termination (spec §12) and property simplification, against
 * a stubbed SDK client — the one test that exercises the cursor loop the
 * FixtureProvider abstracts away.
 */

function page(ids: string[], nextCursor: string | null) {
  return {
    results: ids.map((id) => ({ id, structureId: 'st-x', title: id })),
    hasMore: nextCursor !== null,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

function stubClient(overrides: Record<string, unknown>): CapacitiesClient {
  return overrides as unknown as CapacitiesClient;
}

describe('cursor pagination', () => {
  it('drains multi-page structure listings and terminates', async () => {
    const calls: (string | undefined)[] = [];
    const pages = [
      page(Array.from({ length: 100 }, (_, i) => `a${i}`), 'c1'),
      page(Array.from({ length: 100 }, (_, i) => `b${i}`), 'c2'),
      page(Array.from({ length: 50 }, (_, i) => `c${i}`), null),
    ];
    const client = stubClient({
      objects: {
        structure: (args: { cursor?: string }) => {
          calls.push(args.cursor);
          return Promise.resolve(pages[calls.length - 1]);
        },
      },
    });
    const adapter = new CapacitiesAdapter(client);
    const seen: string[] = [];
    for await (const s of adapter.listObjectsByStructure('st-x')) seen.push(s.id);
    expect(seen).toHaveLength(250);
    expect(calls).toEqual([undefined, 'c1', 'c2']);
  });

  it('stops on hasMore=false even when a stale cursor is present', async () => {
    let calls = 0;
    const client = stubClient({
      objects: {
        tag: () => {
          calls += 1;
          return Promise.resolve({
            results: [{ id: 'only', structureId: 'st-x', title: 'only' }],
            hasMore: false,
            nextCursor: 'stale-cursor',
          });
        },
      },
    });
    const adapter = new CapacitiesAdapter(client);
    const seen: string[] = [];
    for await (const s of adapter.listObjectsByTag('t-1')) seen.push(s.id);
    expect(seen).toEqual(['only']);
    expect(calls).toBe(1);
  });
});

describe('getObject simplification', () => {
  it('digs the title out of properties and simplifies entity refs', async () => {
    const client = stubClient({
      object: {
        get: () =>
          Promise.resolve({
            id: 'o1',
            structureId: 'st-x',
            properties: {
              'p-title': { type: 'title', title: { value: 'The Thing' } },
              'p-date': { type: 'date', date: { start: '2026-01-05', end: null } },
              'p-label': { type: 'label', label: [{ id: 'l1', name: 'Ready' }] },
              'p-links': { type: 'entity', entity: [{ id: 'm1' }, { id: 'm2' }] },
              'p-weird': { type: 'somethingNew', somethingNew: {} },
            },
          }),
      },
    });
    const adapter = new CapacitiesAdapter(client);
    const obj = (await adapter.getObject('o1'))!;
    expect(obj.title).toBe('The Thing');
    expect(obj.properties['p-date']).toEqual({
      type: 'date',
      start: '2026-01-05',
      end: null,
    });
    expect(obj.properties['p-label']).toEqual({ type: 'label', names: ['Ready'] });
    expect(obj.properties['p-links']).toEqual({ type: 'entity', ids: ['m1', 'm2'] });
    expect(obj.properties['p-weird']).toEqual({ type: 'other' });
  });
});
