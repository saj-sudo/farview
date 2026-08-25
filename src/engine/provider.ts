/**
 * The engine's only view of the outside world. One implementation wraps
 * the Capacities API; another serves synthetic fixtures for the demo and
 * the tests. Nothing in src/engine may import anything else that does I/O.
 *
 * The shapes here are deliberately simpler than the API's: the adapter
 * flattens property payloads into what placement and display actually
 * need. Read-only by construction — this interface has no write method,
 * and adding one would break the product's identity (spec §0b).
 */

export interface PropertyDef {
  id: string;
  name: string;
  /** API property type: 'date', 'label', 'text', 'entity', 'title', … */
  type: string;
  /** Whether the API allows writing this property (editing gates on it). */
  writable: boolean;
  /** For label properties: the value names this space actually uses. */
  labelNames: string[];
  /** For label properties: the stable option ids writes must reference. */
  labelSet: { id: string; name: string }[];
}

export interface StructureDef {
  id: string;
  title: string;
  pluralName: string;
  properties: PropertyDef[];
}

export interface TagDef {
  id: string;
  name: string;
}

export interface ObjectSummary {
  id: string;
  structureId: string;
  title: string;
}

/** Simplified property value, keyed by property id on FullObject. */
export type PropertyValue =
  | { type: 'date'; start: string | null; end: string | null }
  | { type: 'label'; names: string[] }
  | { type: 'text'; value: string | null }
  | { type: 'number'; value: number | null }
  | { type: 'entity'; ids: string[] }
  | { type: 'other' };

export interface FullObject {
  id: string;
  structureId: string;
  title: string;
  properties: Record<string, PropertyValue>;
}

export interface SpaceInfo {
  spaceId: string;
  title: string;
}

export interface Provider {
  spaceInfo(): Promise<SpaceInfo>;
  listStructures(): Promise<StructureDef[]>;
  listTags(): Promise<TagDef[]>;

  listObjectsByStructure(structureId: string): AsyncIterable<ObjectSummary>;
  listObjectsByTag(tagId: string): AsyncIterable<ObjectSummary>;

  /** Full object, or null when it no longer exists (deleted → pruned, §11). */
  getObject(id: string): Promise<FullObject | null>;

  /** URL that opens the object in the user's own app. */
  deepLink(objectId: string): string;
}
