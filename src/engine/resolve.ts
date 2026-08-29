import type { PropertyDef, StructureDef, TagDef } from './provider';
import type { FarviewConfig, PropertyRole, TypeRole } from './types';

/**
 * The single choke point where the user's config (human-readable names)
 * is resolved against what the space actually contains (spec §4). No IDs
 * exist anywhere upstream of this module.
 *
 * A missing mapping degrades: the affected level or feature contributes
 * nothing, the settings UI shows the message, and every message names
 * what was missing AND lists what exists. The one load-bearing mapping
 * is the project type — without it there is nothing to draw, so callers
 * route to settings when `types.project` fails to resolve.
 */

export interface ResolvedType {
  role: TypeRole;
  structure: StructureDef;
}

export interface ResolvedProperty {
  role: PropertyRole | 'grouping';
  structureId: string;
  property: PropertyDef;
}

export interface ResolvedSchema {
  /** Role → structure, for roles whose configured name resolved. */
  types: Partial<Record<TypeRole, ResolvedType>>;
  properties: Partial<Record<PropertyRole, ResolvedProperty>>;
  /** Tag name → tag id for every tag name the config references. */
  tagIds: Record<string, string>;
  /** Grouping property (on the project type) when grouping by property. */
  groupingProperty: ResolvedProperty | null;
  /** Lane values for the primary level, after any collection expansion. */
  groupValues: string[];
  /** Sub-lane values for the second level (pillars over areas). */
  subGroupValues: string[];
  /** Readable messages for every mapping that failed to resolve. */
  warnings: string[];
}

const PROPERTY_HOME: Record<PropertyRole, TypeRole> = {
  projectStart: 'project',
  projectTarget: 'project',
  projectStatus: 'project',
  projectMilestones: 'project',
  projectGoal: 'project',
  projectActions: 'project',
  goalTarget: 'goal',
  goalHorizon: 'goal',
  goalActions: 'goal',
  goalMilestones: 'goal',
  actionDate: 'action',
  actionStatus: 'action',
};

function listNames(items: { name?: string; title?: string }[]): string {
  const names = items.map((s) => `"${s.title ?? s.name}"`);
  return names.length > 0 ? names.join(', ') : '(none)';
}

function findByName<T extends { name: string } | { title: string }>(
  items: T[],
  wanted: string,
): T | undefined {
  const norm = wanted.trim().toLowerCase();
  return items.find((item) => {
    const name = 'title' in item ? item.title : item.name;
    return name.trim().toLowerCase() === norm;
  });
}

/**
 * The tag names a grouping level actually uses: a named collection's
 * members when one is mapped (the space's own taxonomy, read live),
 * otherwise the explicitly listed tags.
 */
export function levelTagNames(
  level: { values: string[]; collection: string | null },
  collectionTags: CollectionTags,
): string[] {
  if (level.collection !== null) {
    const members = collectionTags[level.collection.trim().toLowerCase()];
    if (members) return [...new Set(members)];
  }
  return [...new Set(level.values)];
}

/** Every tag name the config references, deduplicated. */
export function referencedTagNames(
  config: FarviewConfig,
  collectionTags: CollectionTags = {},
): string[] {
  const names: string[] = [];
  if (config.grouping.by === 'tag') {
    names.push(...levelTagNames(config.grouping, collectionTags));
  }
  if (config.grouping.sub.by === 'tag') {
    names.push(...levelTagNames(config.grouping.sub, collectionTags));
  }
  return [...new Set(names)];
}

/**
 * Collection name (lowercased) → the tag names it holds. Loaded from
 * the space at boot for the collections the config names, so a level
 * mapped to "Life Pillars" follows that collection as it changes.
 */
export type CollectionTags = Record<string, string[]>;

export function resolveSchema(
  config: FarviewConfig,
  structures: StructureDef[],
  tags: TagDef[],
  collectionTags: CollectionTags = {},
): ResolvedSchema {
  const warnings: string[] = [];
  const types: ResolvedSchema['types'] = {};
  const properties: ResolvedSchema['properties'] = {};
  const tagIds: Record<string, string> = {};

  for (const [role, name] of Object.entries(config.types) as [
    TypeRole,
    string | null,
  ][]) {
    if (name === null) continue; // that level is deliberately skipped
    const structure = findByName(structures, name);
    if (structure) {
      types[role] = { role, structure };
    } else {
      warnings.push(
        `Object type "${name}" (configured as ${role}) is not in this space. ` +
          `The space contains: ${listNames(structures)}.`,
      );
    }
  }

  for (const [role, name] of Object.entries(config.properties) as [
    PropertyRole,
    string | null,
  ][]) {
    if (name === null) continue;
    const homeRole = PROPERTY_HOME[role];
    const home = types[homeRole];
    if (!home) continue; // an unmapped or unresolved type already covers it
    const property = findByName(home.structure.properties, name);
    if (property) {
      properties[role] = { role, structureId: home.structure.id, property };
    } else {
      warnings.push(
        `Property "${name}" (configured as ${role}) is not on the ` +
          `"${home.structure.title}" type. Its properties are: ` +
          `${listNames(home.structure.properties)}.`,
      );
    }
  }

  const groupValues =
    config.grouping.by === 'tag'
      ? levelTagNames(config.grouping, collectionTags)
      : config.grouping.values;
  const subGroupValues =
    config.grouping.sub.by === 'tag'
      ? levelTagNames(config.grouping.sub, collectionTags)
      : [];

  for (const name of referencedTagNames(config, collectionTags)) {
    const tag = findByName(tags, name);
    if (tag) {
      tagIds[name] = tag.id;
    } else {
      warnings.push(
        `Tag "${name}" is not in this space. Its tags are: ${listNames(tags)}.`,
      );
    }
  }
  for (const level of [config.grouping, config.grouping.sub]) {
    if (
      level.collection !== null &&
      collectionTags[level.collection.trim().toLowerCase()] === undefined
    ) {
      warnings.push(
        `Collection "${level.collection}" was not found in this space, so that ` +
          `grouping level has no lanes yet.`,
      );
    }
  }

  let groupingProperty: ResolvedProperty | null = null;
  if (config.grouping.by === 'property' && config.grouping.property !== null) {
    const home = types['project'];
    if (home) {
      const property = findByName(home.structure.properties, config.grouping.property);
      if (property) {
        groupingProperty = {
          role: 'grouping',
          structureId: home.structure.id,
          property,
        };
      } else {
        warnings.push(
          `Grouping property "${config.grouping.property}" is not on the ` +
            `"${home.structure.title}" type. Its properties are: ` +
            `${listNames(home.structure.properties)}.`,
        );
      }
    }
  }

  return {
    types,
    properties,
    tagIds,
    groupingProperty,
    groupValues,
    subGroupValues,
    warnings,
  };
}

/** True when the one required mapping — the project type — is usable. */
export function hasProjectType(resolved: ResolvedSchema): boolean {
  return resolved.types.project !== undefined;
}
