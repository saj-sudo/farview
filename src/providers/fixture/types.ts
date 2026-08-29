import type { FullObject, PropertyDef, StructureDef, TagDef } from '../../engine/provider';

/**
 * A synthetic space definition. Fixtures are always invented (spec §12) —
 * never derived from a real export — and double as the demo dataset and
 * the test double.
 */
export interface FixtureSpace {
  spaceId: string;
  title: string;
  /** Includes basic structures (pages, tags) plus custom types. */
  structures: StructureDef[];
  tags: TagDef[];
  objects: FullObject[];
  /** tagId → object ids carrying that tag. */
  tagAssignments: Record<string, string[]>;
  /** Collections and the object (usually tag) ids they hold. */
  collections?: { id: string; name: string; memberIds: string[] }[];
}

/**
 * Property-definition helper for fixture schemas: everything is
 * writable (like real custom-type properties), and label options get
 * deterministic ids derived from the property id — the same shape the
 * real structures endpoint returns.
 */
export function propDef(
  id: string,
  name: string,
  type: string,
  labelNames: string[] = [],
): PropertyDef {
  return {
    id,
    name,
    type,
    writable: true,
    labelNames,
    labelSet: labelNames.map((n, i) => ({ id: `${id}-opt-${i}`, name: n })),
  };
}

