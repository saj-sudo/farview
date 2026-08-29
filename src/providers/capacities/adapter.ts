import {
  CapacitiesApiError,
  CapacitiesClient,
  type GetObjectResponse,
} from '@capacities/api';
import {
  buildCreateProperties,
  buildDatePatch,
  type Editor,
} from '../../engine/editor';
import type {
  CollectionDef,
  FullObject,
  ObjectSummary,
  PropertyValue,
  Provider,
  SpaceInfo,
  StructureDef,
  TagDef,
} from '../../engine/provider';
import type { ResolvedSchema } from '../../engine/resolve';
import { APP_BASE, COLLECTION_STRUCTURE_ID, TAG_STRUCTURE_ID } from './constants';
import { withBackoff } from './rateLimit';

/**
 * The one place the engine's Provider interface meets the Capacities
 * SDK. Read-only throughout — the Provider interface has no write
 * method, matching the api:read-only OAuth scope (spec §0b). All calls
 * go through rate-limit backoff.
 *
 * List endpoints return `{id, structureId, title}` summaries only, so
 * dates cost one GET per object (spec §5.4). If a future API version
 * adds properties or timestamps to list results, most of src/pipeline
 * can be deleted — revisit this when the API changes.
 */
export class CapacitiesAdapter implements Provider {
  private readonly client: CapacitiesClient;
  private cachedSpaceId: string | null = null;

  constructor(client: CapacitiesClient) {
    this.client = client;
  }

  async spaceInfo(): Promise<SpaceInfo> {
    const space = await withBackoff(() => this.client.space.get());
    this.cachedSpaceId = space.id;
    return { spaceId: space.id, title: space.title };
  }

  async listStructures(): Promise<StructureDef[]> {
    const res = await withBackoff(() => this.client.space.structures());
    return res.structures.map((s) => ({
      id: s.id,
      title: s.title,
      pluralName: s.pluralName,
      properties: s.propertyDefinitions.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        writable: p.writable,
        labelNames: (p.labelSet ?? []).map((l) => l.name),
        labelSet: (p.labelSet ?? []).map((l) => ({ id: l.id, name: l.name })),
      })),
    }));
  }

  async listTags(): Promise<TagDef[]> {
    const tags: TagDef[] = [];
    for await (const summary of this.listObjectsByStructure(TAG_STRUCTURE_ID)) {
      tags.push({ id: summary.id, name: summary.title });
    }
    return tags;
  }

  async *listObjectsByStructure(structureId: string): AsyncIterable<ObjectSummary> {
    let cursor: string | undefined;
    do {
      const page = await withBackoff(() =>
        this.client.objects.structure({
          structureId,
          pageSize: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      yield* page.results;
      cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    } while (cursor);
  }

  async listCollections(): Promise<CollectionDef[]> {
    const collections: CollectionDef[] = [];
    for await (const summary of this.listObjectsByStructure(COLLECTION_STRUCTURE_ID)) {
      collections.push({ id: summary.id, name: summary.title });
    }
    return collections;
  }

  async *listObjectsByCollection(collectionId: string): AsyncIterable<ObjectSummary> {
    let cursor: string | undefined;
    do {
      const page = await withBackoff(() =>
        this.client.objects.collection({
          collectionId,
          pageSize: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      yield* page.results;
      cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    } while (cursor);
  }

  async *listObjectsByTag(tagId: string): AsyncIterable<ObjectSummary> {
    let cursor: string | undefined;
    do {
      const page = await withBackoff(() =>
        this.client.objects.tag({
          tagId,
          pageSize: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      yield* page.results;
      cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    } while (cursor);
  }

  async getObject(id: string): Promise<FullObject | null> {
    let res: GetObjectResponse;
    try {
      res = await withBackoff(() => this.client.object.get({ id }));
    } catch (err) {
      if (err instanceof CapacitiesApiError && err.code === 'cap_not_found') {
        return null; // deleted objects are pruned, never an error (§11)
      }
      throw err;
    }
    return toFullObject(res);
  }

  deepLink(objectId: string): string {
    return this.cachedSpaceId
      ? `${APP_BASE}/${this.cachedSpaceId}/${objectId}`
      : `${APP_BASE}`;
  }
}

/**
 * The write side of the seam, created ONLY when the user connected with
 * editing (spec change: read-only by default, writes behind explicit
 * opt-in). Each call is one POST/PATCH carrying every changed property
 * at once — the rate limit is ~30 req/min, so writes stay single-shot.
 * A missing scope surfaces as CapacitiesApiError 'cap_scope_insufficient'
 * and the UI downgrades rather than retrying.
 */
export function createCapacitiesEditor(
  client: CapacitiesClient,
  resolved: ResolvedSchema,
): Editor {
  return {
    async createItem(spec) {
      const { structureId, properties } = buildCreateProperties(resolved, spec);
      const res = await withBackoff(() =>
        client.object.create({
          structureId,
          properties: properties as Parameters<
            typeof client.object.create
          >[0]['properties'],
        }),
      );
      return toFullObject(res);
    },
    async updateDates(id, kind, change) {
      const properties = buildDatePatch(resolved, kind, change);
      const res = await withBackoff(() =>
        client.object.update({
          id,
          properties: properties as Parameters<
            typeof client.object.update
          >[0]['properties'],
        }),
      );
      return toFullObject(res);
    },
    async setEntityProperty(id, propertyId, ids) {
      const properties = {
        [propertyId]: { type: 'entity', entity: ids.map((ref) => ({ id: ref })) },
      };
      const res = await withBackoff(() =>
        client.object.update({
          id,
          properties: properties as Parameters<
            typeof client.object.update
          >[0]['properties'],
        }),
      );
      return toFullObject(res);
    },
  };
}

/* ------------------------------------------------------------------ */

function toFullObject(res: GetObjectResponse): FullObject {
  return {
    id: res.id,
    structureId: res.structureId,
    title: titleOf(res),
    properties: simplifyProperties(res.properties),
  };
}

/** Full objects carry no top-level title; it hides in the properties map. */
function titleOf(res: GetObjectResponse): string {
  for (const value of Object.values(res.properties)) {
    if (value.type === 'title') return value.title.value ?? '';
  }
  return '';
}

function simplifyProperties(
  properties: GetObjectResponse['properties'],
): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  for (const [propId, value] of Object.entries(properties)) {
    switch (value.type) {
      case 'date':
        out[propId] = {
          type: 'date',
          start: value.date.start,
          end: value.date.end,
        };
        break;
      case 'label':
        out[propId] = { type: 'label', names: value.label.map((l) => l.name) };
        break;
      case 'text':
        out[propId] = { type: 'text', value: value.text.value };
        break;
      case 'title':
        out[propId] = { type: 'text', value: value.title.value };
        break;
      case 'number':
        out[propId] = { type: 'number', value: value.number.value };
        break;
      case 'entity':
        // Milestones are entity references to separate objects (§8.1).
        out[propId] = { type: 'entity', ids: value.entity.map((e) => e.id) };
        break;
      default:
        out[propId] = { type: 'other' };
    }
  }
  return out;
}
