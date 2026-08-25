import { buildCreateProperties, buildDatePatch, type Editor } from '../../engine/editor';
import type {
  FullObject,
  ObjectSummary,
  PropertyValue,
  Provider,
  StructureDef,
  TagDef,
} from '../../engine/provider';
import type { ResolvedSchema } from '../../engine/resolve';
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

  /* ---------------- editor support ---------------- */

  /** Test hook: the next write rejects (exercises optimistic revert). */
  failNextWrite = false;
  private createdCount = 0;

  insertObject(obj: FullObject): void {
    this.space.objects.push(structuredClone(obj));
  }

  nextCreatedId(): string {
    this.createdCount += 1;
    return `created-${this.createdCount}`;
  }

  patchObject(id: string, mutate: (obj: FullObject) => void): FullObject {
    const obj = this.space.objects.find((x) => x.id === id);
    if (!obj) throw new Error(`fixture: no object ${id}`);
    mutate(obj);
    return structuredClone(obj);
  }

  private takeWriteFailure(): boolean {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return true;
    }
    return false;
  }

  writeFails(): Promise<never> | null {
    return this.takeWriteFailure()
      ? Promise.reject(new Error('fixture: simulated write failure'))
      : null;
  }
}

/**
 * In-memory Editor over a FixtureProvider — powers editing in the demo
 * and the tests. It consumes the SAME payloads the real adapter sends
 * (via buildCreateProperties/buildDatePatch), converted back to the
 * simplified property shapes, so the pure builders get end-to-end
 * coverage without HTTP.
 */
export function createFixtureEditor(
  provider: FixtureProvider,
  resolved: ResolvedSchema,
): Editor {
  const simplify = (payload: unknown): PropertyValue => {
    const p = payload as
      | { type: 'date'; date: { start: string | null } }
      | { type: 'label'; label: { id: string; name: string }[] }
      | { type: 'title'; title: { value: string } };
    if (p.type === 'date') return { type: 'date', start: p.date.start, end: null };
    if (p.type === 'label') return { type: 'label', names: p.label.map((l) => l.name) };
    return { type: 'text', value: p.title.value };
  };

  return {
    createItem(spec) {
      const failure = provider.writeFails();
      if (failure) return failure;
      const { structureId, properties } = buildCreateProperties(resolved, spec);
      const obj: FullObject = {
        id: provider.nextCreatedId(),
        structureId,
        title: spec.title,
        properties: Object.fromEntries(
          Object.entries(properties)
            .map(([id, payload]) => [id, simplify(payload)] as const)
            .filter(([, value]) => value.type !== 'text'), // title lives top-level here
        ),
      };
      provider.insertObject(obj);
      return Promise.resolve(structuredClone(obj));
    },
    updateDates(id, kind, change) {
      const failure = provider.writeFails();
      if (failure) return failure;
      const patch = buildDatePatch(resolved, kind, change);
      const updated = provider.patchObject(id, (obj) => {
        for (const [propId, payload] of Object.entries(patch)) {
          obj.properties[propId] = simplify(payload);
        }
      });
      return Promise.resolve(updated);
    },
  };
}
