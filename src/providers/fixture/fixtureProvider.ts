import type {
  FullObject,
  ObjectSummary,
  Provider,
  StructureDef,
  TagDef,
} from '../../engine/provider';
import type { FixtureSpace } from './types';

/**
 * In-memory Provider over a FixtureSpace. Serves two roles: the "Try
 * the demo" mode in the app (no account, nothing leaves the tab) and
 * the test double for the pipeline tests — there is no vi.mock or HTTP
 * stubbing anywhere; this interface seam is the mock.
 */

/** Error shaped like the SDK's rate-limit failure, for scripted 429s. */
class FixtureRateLimitError extends Error {
  readonly code = 'cap_rate_limit_exceeded';
  readonly status = 429;
  constructor() {
    super('fixture: simulated rate limit');
  }
}

export class FixtureProvider implements Provider {
  private readonly space: FixtureSpace;
  /**
   * Test hook: object id → number of times getObject should fail with a
   * simulated 429 before succeeding. Lets pipeline tests exercise
   * backoff and progressive rendering without touching the SDK.
   */
  readonly failPlan = new Map<string, number>();
  /** Counts every getObject call, including scripted failures. */
  getObjectCalls = 0;

  constructor(space: FixtureSpace) {
    this.space = space;
  }

  spaceInfo(): Promise<{ spaceId: string; title: string }> {
    return Promise.resolve({ spaceId: this.space.spaceId, title: this.space.title });
  }

  listStructures(): Promise<StructureDef[]> {
    return Promise.resolve(this.space.structures);
  }

  listTags(): Promise<TagDef[]> {
    return Promise.resolve(this.space.tags);
  }

  async *listObjectsByStructure(structureId: string): AsyncIterable<ObjectSummary> {
    for (const o of this.space.objects) {
      if (o.structureId === structureId) {
        yield { id: o.id, structureId, title: o.title };
      }
    }
  }

  async *listObjectsByTag(tagId: string): AsyncIterable<ObjectSummary> {
    const ids = this.space.tagAssignments[tagId] ?? [];
    for (const id of ids) {
      const o = this.space.objects.find((x) => x.id === id);
      if (o) yield { id: o.id, structureId: o.structureId, title: o.title };
    }
  }

  getObject(id: string): Promise<FullObject | null> {
    this.getObjectCalls += 1;
    const failures = this.failPlan.get(id) ?? 0;
    if (failures > 0) {
      this.failPlan.set(id, failures - 1);
      return Promise.reject(new FixtureRateLimitError());
    }
    const o = this.space.objects.find((x) => x.id === id);
    return Promise.resolve(o ? structuredClone(o) : null);
  }

  deepLink(objectId: string): string {
    return `https://app.capacities.io/${this.space.spaceId}/${objectId}`;
  }

  /* ---------------- test helpers ---------------- */

  /** Remove an object mid-test — simulates deletion between list and get. */
  deleteObject(id: string): void {
    const i = this.space.objects.findIndex((x) => x.id === id);
    if (i >= 0) this.space.objects.splice(i, 1);
  }
}
