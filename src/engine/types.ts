/**
 * Core types for the Farview engine.
 *
 * Everything in src/engine is pure: no Capacities SDK, no DOM, no clocks.
 * The current date is always injected by the caller.
 *
 * The one schema rule that governs this whole module (spec §4): no user
 * object-type IDs, property IDs, or tag names may appear in code. Configs
 * carry human-readable names; resolution to IDs happens per run against
 * what the space actually contains.
 */

/** A calendar date in the user's local timezone, formatted YYYY-MM-DD. */
export type LocalDate = string & { readonly __localDate?: never };

/**
 * Roles a mapped object type can play (spec §8). Only `project` — the
 * middle of the hierarchy — is required; most spaces have no Goal type
 * at all, and project-only is the default experience, not a fallback.
 */
export type TypeRole = 'goal' | 'project' | 'milestone';

/** Roles a mapped property can play. */
export type PropertyRole =
  | 'projectStart'
  | 'projectTarget'
  | 'projectStatus'
  | 'projectMilestones'
  | 'goalTarget'
  | 'goalHorizon';

export type GroupingMode = 'tag' | 'property' | 'type' | 'none';
export type HorizonMode = 'derived' | 'property';
export type ViewName = 'timeline' | 'horizons';

export interface HorizonBucket {
  label: string;
  /** Upper bound in days from today; null = catch-all (spec §8.2). */
  maxDays: number | null;
}

export interface FarviewConfig {
  version: 1;
  /** Type role → the user's own type name. null = that level is skipped. */
  types: {
    goal: string | null;
    project: string | null;
    milestone: string | null;
  };
  properties: {
    projectStart: string | null;
    projectTarget: string | null;
    projectStatus: string | null;
    projectMilestones: string | null;
    goalTarget: string | null;
    goalHorizon: string | null;
  };
  statusValues: {
    active: string[];
    done: string[];
  };
  grouping: {
    by: GroupingMode;
    /** Property name when grouping by property. */
    property: string | null;
    /** Tag names (grouping by tag) or label values (by property), in lane order. */
    values: string[];
  };
  horizons: {
    mode: HorizonMode;
    buckets: HorizonBucket[];
  };
  display: {
    defaultView: ViewName;
    showCompleted: boolean;
    fetchCeiling: number;
    cacheTtlMinutes: number;
    /** IANA zone override; null = the browser's zone (spec §11). */
    timezone: string | null;
  };
}

export type ItemStatus = 'active' | 'done' | 'unknown';

/**
 * One dated (or deliberately undated) thing on the timeline — the
 * engine's normalized view of a project or goal.
 */
export interface TimelineItem {
  id: string;
  title: string;
  kind: 'project' | 'goal';
  start: LocalDate | null;
  target: LocalDate | null;
  status: ItemStatus;
  /** The space's own status label, verbatim, when one exists. */
  statusLabel: string | null;
  /** Resolved lane/color group; null = ungrouped. */
  group: string | null;
  /** Configured grouping tags this item carries (tag grouping only). */
  tags: string[];
  flags: {
    /** Target precedes start: rendered as a point and flagged, never swapped (§11). */
    targetBeforeStart: boolean;
  };
  /** Milestone object ids from the mapped entity property (lazy-fetched, §8.1). */
  milestoneIds: string[];
  /** The explicit horizon label when horizons.mode === 'property'. */
  horizonLabel: string | null;
}

/** A milestone resolved from its own object (lazy, opt-in — §8.1). */
export interface MilestoneItem {
  id: string;
  title: string;
  date: LocalDate | null;
  done: boolean;
}
