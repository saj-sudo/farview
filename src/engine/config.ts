import type {
  FarviewConfig,
  GroupingMode,
  HorizonBucket,
  HorizonMode,
  ViewName,
} from './types';

/**
 * Config lives in browser storage only — Farview never writes to the
 * user's space (spec §0b), so there is no state object to sync. Losing
 * it costs a two-minute remap; export/import exists so it is avoidable.
 *
 * `normalizeConfig` accepts anything — an older version, a hand-edited
 * export, partial garbage — and returns a complete valid config:
 * unknown fields dropped, missing fields defaulted, numbers clamped.
 * Validation is hand-rolled rather than schema-library-driven on
 * purpose: dependency discipline is a security requirement (spec §3).
 *
 * The defaults contain names only where spec §6 sets them ("Project" is
 * the spec's own default mapping); everything else resolves per space.
 */

export function defaultConfig(): FarviewConfig {
  return {
    version: 1,
    types: {
      goal: null,
      project: 'Project',
      milestone: null,
      action: null,
    },
    properties: {
      projectStart: 'Start Date',
      projectTarget: 'Target Completion',
      projectStatus: 'Status',
      projectMilestones: null,
      projectGoal: null,
      projectActions: null,
      goalTarget: null,
      goalHorizon: null,
      goalActions: null,
      goalMilestones: null,
      actionDate: null,
      actionStatus: null,
    },
    statusValues: {
      active: ['Active', 'Planned'],
      done: ['Completed', 'Archived'],
    },
    grouping: {
      by: 'none',
      property: null,
      values: [],
    },
    horizons: {
      mode: 'derived',
      buckets: [
        { label: 'Now', maxDays: 30 },
        { label: 'Quarter', maxDays: 90 },
        { label: 'Year', maxDays: 365 },
        { label: 'Long', maxDays: null },
      ],
    },
    display: {
      defaultView: 'timeline',
      showCompleted: false,
      fetchCeiling: 300,
      cacheTtlMinutes: 60,
      timezone: null,
    },
  };
}

/* ---------------- tolerant coercion helpers ---------------- */

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function strOrNull(v: unknown, fallback: string | null): string | null {
  if (v === null) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  return fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function strArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function buckets(v: unknown, fallback: HorizonBucket[]): HorizonBucket[] {
  if (!Array.isArray(v)) return fallback;
  const out: HorizonBucket[] = [];
  for (const item of v) {
    const r = rec(item);
    const label = strOrNull(r['label'], null);
    if (label === null) continue;
    const rawMax = r['maxDays'];
    const maxDays =
      rawMax === null
        ? null
        : typeof rawMax === 'number' && Number.isFinite(rawMax)
          ? Math.max(0, Math.round(rawMax))
          : null;
    out.push({ label, maxDays });
  }
  if (out.length === 0) return fallback;
  // Sort ascending with the catch-all (null) last, so "first bucket that
  // fits" bucketing works even on a hand-edited config.
  out.sort((a, b) =>
    (a.maxDays ?? Infinity) - (b.maxDays ?? Infinity),
  );
  return out;
}

/** Accept any input and return a complete, valid config. */
export function normalizeConfig(input: unknown): FarviewConfig {
  const d = defaultConfig();
  const raw = rec(input);
  const types = rec(raw['types']);
  const props = rec(raw['properties']);
  const status = rec(raw['statusValues']);
  const grouping = rec(raw['grouping']);
  const horizons = rec(raw['horizons']);
  const display = rec(raw['display']);

  // Only version 1 exists; future migrations hook in here.
  return {
    version: 1,
    types: {
      goal: strOrNull(types['goal'], d.types.goal),
      project: strOrNull(types['project'], d.types.project),
      milestone: strOrNull(types['milestone'], d.types.milestone),
      action: strOrNull(types['action'], d.types.action),
    },
    properties: {
      projectStart: strOrNull(props['projectStart'], d.properties.projectStart),
      projectTarget: strOrNull(props['projectTarget'], d.properties.projectTarget),
      projectStatus: strOrNull(props['projectStatus'], d.properties.projectStatus),
      projectMilestones: strOrNull(
        props['projectMilestones'],
        d.properties.projectMilestones,
      ),
      projectGoal: strOrNull(props['projectGoal'], d.properties.projectGoal),
      projectActions: strOrNull(props['projectActions'], d.properties.projectActions),
      goalTarget: strOrNull(props['goalTarget'], d.properties.goalTarget),
      goalHorizon: strOrNull(props['goalHorizon'], d.properties.goalHorizon),
      goalActions: strOrNull(props['goalActions'], d.properties.goalActions),
      goalMilestones: strOrNull(props['goalMilestones'], d.properties.goalMilestones),
      actionDate: strOrNull(props['actionDate'], d.properties.actionDate),
      actionStatus: strOrNull(props['actionStatus'], d.properties.actionStatus),
    },
    statusValues: {
      active: strArray(status['active'], d.statusValues.active),
      done: strArray(status['done'], d.statusValues.done),
    },
    grouping: {
      by: oneOf<GroupingMode>(
        grouping['by'],
        ['tag', 'property', 'type', 'none'],
        d.grouping.by,
      ),
      property: strOrNull(grouping['property'], d.grouping.property),
      values: strArray(grouping['values'], d.grouping.values),
    },
    horizons: {
      mode: oneOf<HorizonMode>(horizons['mode'], ['derived', 'property'], d.horizons.mode),
      buckets: buckets(horizons['buckets'], d.horizons.buckets),
    },
    display: {
      defaultView: oneOf<ViewName>(
        display['defaultView'],
        ['timeline', 'horizons'],
        d.display.defaultView,
      ),
      showCompleted: bool(display['showCompleted'], d.display.showCompleted),
      fetchCeiling: num(display['fetchCeiling'], d.display.fetchCeiling, 10, 5000),
      cacheTtlMinutes: num(
        display['cacheTtlMinutes'],
        d.display.cacheTtlMinutes,
        1,
        7 * 24 * 60,
      ),
      timezone: strOrNull(display['timezone'], d.display.timezone),
    },
  };
}

/** Pretty JSON for the export box; imports go back through normalizeConfig. */
export function exportConfig(config: FarviewConfig): string {
  return JSON.stringify(config, null, 2);
}

export class ConfigImportError extends Error {}

export function importConfig(text: string): FarviewConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConfigImportError(
      'That did not parse as an exported Farview configuration.',
    );
  }
  return normalizeConfig(parsed);
}
