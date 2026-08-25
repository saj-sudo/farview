import type { ResolvedSchema } from './resolve';
import type { FullObject } from './provider';
import type { LocalDate } from './types';

/**
 * The write seam — deliberately narrow. Farview is read-only by
 * default; an Editor exists only when the user explicitly connected
 * with editing, and every method here corresponds to a direct user
 * gesture (a drag, a save button, a create dialog). There are no
 * background writes, and nothing here deletes.
 */

export type ItemKind = 'project' | 'goal';

/** undefined = leave unchanged; null = clear the date. */
export interface DateChange {
  start?: LocalDate | null;
  target?: LocalDate | null;
}

export interface NewItemSpec {
  kind: ItemKind;
  title: string;
  start: LocalDate | null;
  target: LocalDate | null;
  /** Horizon label name (goals, property mode) — matched against the labelSet. */
  horizonLabel?: string | null;
}

export interface Editor {
  /** Create a goal or project; resolves to the server's view of it. */
  createItem(spec: NewItemSpec): Promise<FullObject>;
  /** Patch only the changed date properties; resolves to the fresh object. */
  updateDates(id: string, kind: ItemKind, change: DateChange): Promise<FullObject>;
}

export class EditNotPossibleError extends Error {}

/**
 * Which resolved property carries each date, per kind. Shared by both
 * Editor implementations so payloads and fixtures cannot drift apart.
 */
export function datePropertyIds(
  resolved: ResolvedSchema,
  kind: ItemKind,
): { start: string | null; target: string | null } {
  if (kind === 'goal') {
    return {
      start: null, // goals carry a single target date (§8)
      target: resolved.properties.goalTarget?.property.id ?? null,
    };
  }
  return {
    start: resolved.properties.projectStart?.property.id ?? null,
    target: resolved.properties.projectTarget?.property.id ?? null,
  };
}

/** The API's day-resolution date payload; null start clears the date. */
export function dayPayload(date: LocalDate | null): {
  type: 'date';
  date: { dateResolution: 'day'; start: string | null };
} {
  return { type: 'date', date: { dateResolution: 'day', start: date } };
}

/**
 * Build the properties record for a date patch: only the properties the
 * change actually names, so an untouched date is never rewritten.
 * Throws readably when a change targets an unmapped property — the UI
 * should not have offered the affordance, but a stranger's config can
 * always surprise.
 */
export function buildDatePatch(
  resolved: ResolvedSchema,
  kind: ItemKind,
  change: DateChange,
): Record<string, ReturnType<typeof dayPayload>> {
  const ids = datePropertyIds(resolved, kind);
  const out: Record<string, ReturnType<typeof dayPayload>> = {};
  if (change.start !== undefined) {
    if (ids.start === null) {
      throw new EditNotPossibleError(
        `No start-date property is mapped for ${kind}s, so the start cannot be changed here.`,
      );
    }
    out[ids.start] = dayPayload(change.start);
  }
  if (change.target !== undefined) {
    if (ids.target === null) {
      throw new EditNotPossibleError(
        `No target-date property is mapped for ${kind}s, so the target cannot be changed here.`,
      );
    }
    out[ids.target] = dayPayload(change.target);
  }
  if (Object.keys(out).length === 0) {
    throw new EditNotPossibleError('Nothing to change.');
  }
  return out;
}

/**
 * Build the properties record for a new item: title (via the type's
 * title-typed property), any provided dates, and — for goals in
 * property mode — the horizon label resolved to its stable option id.
 */
export function buildCreateProperties(
  resolved: ResolvedSchema,
  spec: NewItemSpec,
): { structureId: string; properties: Record<string, unknown> } {
  const type = resolved.types[spec.kind];
  if (!type) {
    throw new EditNotPossibleError(`No ${spec.kind} type is mapped in this space.`);
  }
  const properties: Record<string, unknown> = {};

  const titleDef = type.structure.properties.find((p) => p.type === 'title');
  if (titleDef) {
    properties[titleDef.id] = { type: 'title', title: { value: spec.title } };
  }

  const ids = datePropertyIds(resolved, spec.kind);
  if (spec.start !== null && ids.start !== null) {
    properties[ids.start] = dayPayload(spec.start);
  }
  if (spec.target !== null && ids.target !== null) {
    properties[ids.target] = dayPayload(spec.target);
  }

  if (spec.kind === 'goal' && spec.horizonLabel) {
    const horizon = resolved.properties.goalHorizon?.property;
    const optionId = horizon?.labelSet.find(
      (o) => o.name.toLowerCase() === spec.horizonLabel!.toLowerCase(),
    )?.id;
    if (horizon && optionId) {
      properties[horizon.id] = {
        type: 'label',
        label: [{ id: optionId, name: spec.horizonLabel }],
      };
    }
  }

  return { structureId: type.structure.id, properties };
}
