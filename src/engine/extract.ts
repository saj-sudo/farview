import { localDateFromIso } from './dates';
import type { FullObject, PropertyValue } from './provider';
import type { ResolvedSchema } from './resolve';
import type {
  ActionItem,
  FarviewConfig,
  ItemStatus,
  MilestoneItem,
  TimelineItem,
} from './types';

/**
 * FullObject → TimelineItem: the one place raw API property payloads
 * become the engine's normalized shape. Everything here is defensive —
 * a stranger's space can put anything in any property — and nothing is
 * ever silently dropped for being odd: unknown statuses stay visible,
 * reversed dates are flagged rather than swapped (§11), undated items
 * flow through to the Someday tray (§8.2).
 */

function dateProp(obj: FullObject, propId: string | undefined): string | null {
  if (!propId) return null;
  const value = obj.properties[propId];
  if (value?.type !== 'date') return null;
  return value.start ?? value.end;
}

function labelProp(obj: FullObject, propId: string | undefined): string[] {
  if (!propId) return [];
  const value = obj.properties[propId];
  return value?.type === 'label' ? value.names : [];
}

function entityProp(obj: FullObject, propId: string | undefined): string[] {
  if (!propId) return [];
  const value = obj.properties[propId];
  return value?.type === 'entity' ? value.ids : [];
}

/**
 * Classify a status label against the configured value sets. Matching is
 * case-insensitive. A label in neither set — or no label at all — is
 * 'unknown' and treated as visible: hiding a user's item because their
 * space has a status the config never heard of would be silent data loss.
 */
export function classifyStatus(
  labels: string[],
  config: FarviewConfig,
): { status: ItemStatus; statusLabel: string | null } {
  const statusLabel = labels[0] ?? null;
  const norm = (s: string) => s.trim().toLowerCase();
  const set = (values: string[]) => new Set(values.map(norm));
  const done = set(config.statusValues.done);
  const active = set(config.statusValues.active);
  for (const label of labels) {
    if (done.has(norm(label))) return { status: 'done', statusLabel: label };
  }
  for (const label of labels) {
    if (active.has(norm(label))) return { status: 'active', statusLabel: label };
  }
  return { status: 'unknown', statusLabel };
}

/**
 * Assign the item's lane/color group per the grouping config.
 * Tag membership is injected because full objects do not reliably carry
 * tags — the pipeline builds a membership map from the per-tag list
 * endpoints instead (one cheap summary listing per configured tag).
 */
export function assignGroup(
  obj: FullObject,
  config: FarviewConfig,
  resolved: ResolvedSchema,
  tagsOf: (id: string) => string[],
): { group: string | null; tags: string[] } {
  switch (config.grouping.by) {
    case 'tag': {
      const tags = tagsOf(obj.id);
      const configured = config.grouping.values.filter((v) => tags.includes(v));
      return { group: configured[0] ?? null, tags: configured };
    }
    case 'property': {
      const propId = resolved.groupingProperty?.property.id;
      const labels = labelProp(obj, propId);
      return { group: labels[0] ?? null, tags: [] };
    }
    case 'type': {
      const structure = [
        resolved.types.project,
        resolved.types.goal,
        resolved.types.milestone,
      ].find((t) => t?.structure.id === obj.structureId);
      return { group: structure?.structure.title ?? null, tags: [] };
    }
    case 'none':
      return { group: null, tags: [] };
  }
}

export function extractItem(
  obj: FullObject,
  kind: 'project' | 'goal',
  config: FarviewConfig,
  resolved: ResolvedSchema,
  tagsOf: (id: string) => string[],
): TimelineItem {
  const p = resolved.properties;
  const isGoal = kind === 'goal';

  const startRaw = isGoal ? null : dateProp(obj, p.projectStart?.property.id);
  const targetRaw = isGoal
    ? dateProp(obj, p.goalTarget?.property.id)
    : dateProp(obj, p.projectTarget?.property.id);

  const start = startRaw ? localDateFromIso(startRaw) : null;
  const target = targetRaw ? localDateFromIso(targetRaw) : null;

  const statusLabels = isGoal ? [] : labelProp(obj, p.projectStatus?.property.id);
  const { status, statusLabel } = classifyStatus(statusLabels, config);

  const { group, tags } = assignGroup(obj, config, resolved, tagsOf);

  const horizonLabels = isGoal ? labelProp(obj, p.goalHorizon?.property.id) : [];

  return {
    id: obj.id,
    title: obj.title,
    kind,
    start,
    target,
    status,
    statusLabel,
    group,
    tags,
    flags: {
      targetBeforeStart: start !== null && target !== null && target < start,
    },
    milestoneIds: isGoal
      ? entityProp(obj, p.goalMilestones?.property.id)
      : entityProp(obj, p.projectMilestones?.property.id),
    goalId: isGoal ? null : (entityProp(obj, p.projectGoal?.property.id)[0] ?? null),
    actionIds: isGoal
      ? entityProp(obj, p.goalActions?.property.id)
      : entityProp(obj, p.projectActions?.property.id),
    derived: null, // rollup spans are computed later, from loaded children
    horizonLabel: horizonLabels[0] ?? null,
  };
}

/**
 * An action object → the hierarchy's leaf: a real (possibly ranged)
 * date and a done flag. Mapped properties first; when the action type's
 * schema is unmapped, fall back to the first date property and any
 * label matching the configured done values — same forgiving posture
 * as milestones.
 */
export function extractAction(
  obj: FullObject,
  config: FarviewConfig,
  resolved: ResolvedSchema,
): ActionItem {
  const dateId = resolved.properties.actionDate?.property.id;
  const statusId = resolved.properties.actionStatus?.property.id;

  let start: string | null = null;
  let end: string | null = null;
  if (dateId && obj.properties[dateId]?.type === 'date') {
    const v = obj.properties[dateId] as { start: string | null; end: string | null };
    start = v.start;
    end = v.end;
  } else {
    for (const value of Object.values(obj.properties)) {
      if (value.type === 'date') {
        start = value.start;
        end = value.end;
        break;
      }
    }
  }

  let labels: string[];
  if (statusId && obj.properties[statusId]?.type === 'label') {
    labels = (obj.properties[statusId] as { names: string[] }).names;
  } else {
    labels = Object.values(obj.properties)
      .filter((v): v is { type: 'label'; names: string[] } => v.type === 'label')
      .flatMap((v) => v.names);
  }
  const { status } = classifyStatus(labels, config);

  const startDate = start ? localDateFromIso(start) : null;
  const endDate = end ? localDateFromIso(end) : null;
  return {
    id: obj.id,
    title: obj.title,
    start: endDate !== null ? startDate : null, // a lone date is the target
    target: endDate ?? startDate,
    done: status === 'done',
  };
}

/**
 * A milestone object → its date and done-ness. The milestone type's own
 * schema is unknown territory: take the first date property found, and
 * read done-ness from any label matching the configured done values.
 */
export function extractMilestone(
  obj: FullObject,
  config: FarviewConfig,
): MilestoneItem {
  let date: string | null = null;
  const labels: string[] = [];
  for (const value of Object.values(obj.properties) as PropertyValue[]) {
    if (value.type === 'date' && date === null) date = value.start ?? value.end;
    if (value.type === 'label') labels.push(...value.names);
  }
  const { status } = classifyStatus(labels, config);
  return {
    id: obj.id,
    title: obj.title,
    date: date ? localDateFromIso(date) : null,
    done: status === 'done',
  };
}
