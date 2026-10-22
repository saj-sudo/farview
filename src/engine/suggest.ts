import type { PropertyDef, StructureDef } from './provider';
import type { FarviewConfig, PropertyRole, TypeRole } from './types';

/**
 * Suggested mappings. Farview works with whatever types a space has, which
 * means a new visitor starts at a form of dropdowns. This reads the space's
 * own types and properties and says what each probably is, in the words
 * Capacities uses, so the usual case is one tick instead of a form.
 *
 * It only suggests. Nothing is applied until the person says so, and a role
 * that is already mapped to something this space has is never touched.
 * Pure: structures in, names out.
 */

export type SuggestedRole = 'project' | 'goal' | 'milestone';

export interface SuggestedType {
  role: SuggestedRole;
  /** The type's title in the space. */
  type: string;
  /** True when only the shape (not the name) pointed at it. */
  guess: boolean;
  /** Properties found on it, by role. */
  properties: Partial<Record<PropertyRole, string>>;
}

export interface Suggestion {
  types: SuggestedType[];
  /** Status values by meaning, read from the project's status property. */
  statusValues: { active: string[]; done: string[] } | null;
}

/** Lowercase letters and digits only, so "Start Date", "start_date" and "startDate" agree. */
export function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const PROJECT_TYPES = ['project', 'projects', 'initiative', 'initiatives', 'epic', 'campaign', 'workitem'];
const GOAL_TYPES = ['goal', 'goals', 'objective', 'objectives', 'okr', 'okrs', 'outcome', 'outcomes', 'ambition'];
const MILESTONE_TYPES = ['milestone', 'milestones'];

const START_PROPS = ['startdate', 'start', 'begins', 'begin', 'kickoff', 'started', 'startson', 'from'];
const TARGET_PROPS = [
  'targetcompletion',
  'targetdate',
  'target',
  'duedate',
  'due',
  'deadline',
  'enddate',
  'end',
  'completiondate',
  'completion',
  'finishby',
  'finish',
  'bywhen',
  'launchdate',
  'launch',
];
const STATUS_PROPS = ['status', 'state', 'stage', 'phase', 'progress'];
const HORIZON_PROPS = ['horizon', 'timehorizon', 'timeframe', 'timescale'];
const MILESTONE_PROPS = ['milestones', 'milestone'];
const GOAL_PROPS = ['goal', 'goals', 'objective', 'objectives', 'outcome'];

const DONE_LIKE = ['completed', 'complete', 'done', 'archived', 'cancelled', 'canceled', 'closed', 'finished', 'shipped', 'abandoned', 'dropped', 'achieved'];
const PAUSED_LIKE = ['onhold', 'paused', 'someday', 'maybe', 'backlog', 'waiting', 'blocked'];

/** The first property of `type` whose name is in `names`, trying `names` in order. */
function pick(properties: PropertyDef[], type: string, names: string[], taken: Set<string> = new Set()): PropertyDef | undefined {
  const pool = properties.filter((p) => p.type === type && !taken.has(p.id));
  for (const name of names) {
    const found = pool.find((p) => norm(p.name) === name);
    if (found) return found;
  }
  return undefined;
}

interface ProjectShape {
  start?: PropertyDef;
  target?: PropertyDef;
  status?: PropertyDef;
  /** The dates were taken by their order on the type, not recognised by name. */
  positional: boolean;
  score: number;
}

function projectShape(structure: StructureDef): ProjectShape {
  const taken = new Set<string>();
  const target = pick(structure.properties, 'date', TARGET_PROPS, taken);
  if (target) taken.add(target.id);
  const start = pick(structure.properties, 'date', START_PROPS, taken);
  if (start) taken.add(start.id);
  const status = pick(structure.properties, 'label', STATUS_PROPS);
  // Two dates and a status, but names we do not know: the first date is the
  // start and the second the end, which is how Capacities types are usually laid out.
  const dates = structure.properties.filter((p) => p.type === 'date');
  const positional = !start && !target && status !== undefined && dates.length >= 2;
  const realStart = positional ? dates[0] : start;
  const realTarget = positional ? dates[1] : target;
  const named = PROJECT_TYPES.indexOf(norm(structure.title));
  const nameScore = named === 0 || named === 1 ? 10 : named > 1 ? 6 : 0;
  return {
    ...(realStart ? { start: realStart } : {}),
    ...(realTarget ? { target: realTarget } : {}),
    ...(status ? { status } : {}),
    positional,
    score: nameScore + (realTarget ? 3 : 0) + (realStart ? 2 : 0) + (status ? 2 : 0),
  };
}

function suggestProject(structures: StructureDef[]): SuggestedType | null {
  let best: { structure: StructureDef; shape: ProjectShape } | null = null;
  for (const structure of structures) {
    const shape = projectShape(structure);
    // Farview places things by date, so a type with none is no use as projects.
    if ((!shape.target && !shape.start) || shape.score < 5) continue;
    if (!best || shape.score > best.shape.score || (shape.score === best.shape.score && structure.title < best.structure.title)) {
      best = { structure, shape };
    }
  }
  if (!best) return null;
  const { structure, shape } = best;
  const properties: Partial<Record<PropertyRole, string>> = {};
  if (shape.start) properties.projectStart = shape.start.name;
  if (shape.target) properties.projectTarget = shape.target.name;
  if (shape.status) properties.projectStatus = shape.status.name;
  return {
    role: 'project',
    type: structure.title,
    guess: shape.positional || PROJECT_TYPES.indexOf(norm(structure.title)) < 0,
    properties,
  };
}

function suggestByName(structures: StructureDef[], names: string[], taken: string[]): StructureDef | undefined {
  return structures
    .filter((s) => !taken.includes(s.title) && names.includes(norm(s.title)))
    .sort((a, b) => names.indexOf(norm(a.title)) - names.indexOf(norm(b.title)))[0];
}

function suggestGoal(structures: StructureDef[], taken: string[]): SuggestedType | null {
  const found = suggestByName(structures, GOAL_TYPES, taken);
  if (!found) return null;
  const properties: Partial<Record<PropertyRole, string>> = {};
  const target = pick(found.properties, 'date', TARGET_PROPS);
  if (target) properties.goalTarget = target.name;
  const horizon = pick(found.properties, 'label', HORIZON_PROPS);
  if (horizon) properties.goalHorizon = horizon.name;
  return { role: 'goal', type: found.title, guess: false, properties };
}

function suggestMilestone(structures: StructureDef[], taken: string[]): SuggestedType | null {
  const found = suggestByName(structures, MILESTONE_TYPES, taken);
  return found ? { role: 'milestone', type: found.title, guess: false, properties: {} } : null;
}

/** Status values that mean the work is still going, and ones that mean it is finished. */
export function statusMeaning(labelNames: string[]): { active: string[]; done: string[] } {
  const active: string[] = [];
  const done: string[] = [];
  for (const name of labelNames) {
    const key = norm(name);
    if (DONE_LIKE.includes(key)) done.push(name);
    else if (!PAUSED_LIKE.includes(key)) active.push(name);
  }
  return { active, done };
}

/** Is this role already mapped to a type the space actually has? */
function typeMapped(config: FarviewConfig, role: TypeRole, structures: StructureDef[]): boolean {
  const name = config.types[role];
  return name !== null && structures.some((s) => norm(s.title) === norm(name));
}

/**
 * What the space suggests, leaving out every role `config` already maps to
 * something this space has. `structures` are the space's own types (no
 * pages, tags or other built-ins).
 */
export function suggestMapping(structures: StructureDef[], config: FarviewConfig): Suggestion | null {
  const types: SuggestedType[] = [];
  const project = typeMapped(config, 'project', structures) ? null : suggestProject(structures);
  if (project) types.push(project);
  const goal = typeMapped(config, 'goal', structures) ? null : suggestGoal(structures, [project?.type].filter(isString));
  if (goal) types.push(goal);
  const milestone = typeMapped(config, 'milestone', structures)
    ? null
    : suggestMilestone(structures, [project?.type, goal?.type].filter(isString));
  if (milestone) types.push(milestone);
  if (types.length === 0) return null;

  // Links between the levels are only worth suggesting when both ends were found.
  const projectStructure = project ? structures.find((s) => s.title === project.type) : undefined;
  if (project && projectStructure) {
    if (milestone) {
      const link = pick(projectStructure.properties, 'entity', MILESTONE_PROPS);
      if (link) project.properties.projectMilestones = link.name;
    }
    if (goal) {
      const link = pick(projectStructure.properties, 'entity', GOAL_PROPS);
      if (link) project.properties.projectGoal = link.name;
    }
  }

  const statusName = project?.properties.projectStatus;
  const statusProperty = statusName ? projectStructure?.properties.find((p) => p.name === statusName) : undefined;
  return { types, statusValues: statusProperty ? statusMeaning(statusProperty.labelNames) : null };
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}

/** The config with the suggestion filled in. Never replaces a role that already resolves. */
export function applySuggestion(config: FarviewConfig, suggestion: Suggestion, structures: StructureDef[]): FarviewConfig {
  const next = structuredClone(config);
  for (const t of suggestion.types) {
    if (typeMapped(next, t.role, structures)) continue;
    next.types[t.role] = t.type;
    for (const [role, name] of Object.entries(t.properties) as [PropertyRole, string][]) {
      next.properties[role] = name;
    }
  }
  if (suggestion.statusValues && suggestion.types.some((t) => t.role === 'project')) {
    next.statusValues = { active: [...suggestion.statusValues.active], done: [...suggestion.statusValues.done] };
  }
  return next;
}

/** A stable fingerprint, so a skipped suggestion stays skipped until the space offers something different. */
export function suggestionKey(suggestion: Suggestion): string {
  return JSON.stringify([suggestion.types.map((t) => [t.role, t.type, t.properties]), suggestion.statusValues]);
}

/** Only the parts of a suggestion the person ticked. */
export function pickSuggestion(suggestion: Suggestion, roles: ReadonlySet<SuggestedRole>): Suggestion {
  return {
    types: suggestion.types.filter((t) => roles.has(t.role)),
    statusValues: roles.has('project') ? suggestion.statusValues : null,
  };
}
