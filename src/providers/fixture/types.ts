import type { FullObject, StructureDef, TagDef } from '../../engine/provider';

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
}
