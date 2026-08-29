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
 * `action` is the optional leaf level (Capacities' built-in Tasks or
 * any custom type); `milestone` stays a separate concept — achievement
 * markers, not work items.
 */
export type TypeRole = 'goal' | 'project' | 'milestone' | 'action';

/** Roles a mapped property can play. */
export type PropertyRole =
  | 'projectStart'
  | 'projectTarget'
  | 'projectStatus'
  | 'projectMilestones'
  | 'projectGoal'
  | 'projectActions'
  | 'goalTarget'
  | 'goalHorizon'
  | 'goalActions'
  | 'goalMilestones'
  | 'actionDate'
  | 'actionStatus';

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
    action: string | null;
  };
  properties: {
    projectStart: string | null;
    projectTarget: string | null;
    projectStatus: string | null;
    projectMilestones: string | null;
    projectGoal: string | null;
    projectActions: string | null;
    goalTarget: string | null;
    goalHorizon: string | null;
    goalActions: string | null;
    goalMilestones: string | null;
    actionDate: string | null;
    actionStatus: string | null;
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
    /**
     * A tag collection whose members supply `values` live — how spaces
     * that keep their taxonomy in a collection ("Life Pillars") map it
     * without ticking every tag by hand. Takes precedence over values.
     */
    collection: string | null;
    /**
     * The second level: sub-lanes within each primary lane. Pillars
     * over areas, in the vocabulary of the systems this borrows from.
     */
    sub: {
      by: 'tag' | 'none';
      values: string[];
      collection: string | null;
    };
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
  /** Second-level group (the sub-lane within `group`); null = none. */
  subGroup: string | null;
  /** Configured grouping tags this item carries (tag grouping only). */
  tags: string[];
  flags: {
    /** Target precedes start: rendered as a point and flagged, never swapped (§11). */
    targetBeforeStart: boolean;
  };
  /** Milestone object ids from the mapped entity property (lazy-fetched, §8.1). */
  milestoneIds: string[];
  /** This project's goal, from the mapped projectGoal entity (first id wins). */
  goalId: string | null;
  /** Linked action ids (projectActions / goalActions), lazy-fetched. */
  actionIds: string[];
  /**
   * Rollup span derived from dated children when the item itself is
   * undated — a fact stated as such, drawn dashed, never a real date.
   */
  derived: { start: LocalDate | null; target: LocalDate | null } | null;
  /** The explicit horizon label when horizons.mode === 'property'. */
  horizonLabel: string | null;
}

/** An action resolved from its own object — the leaf level of the hierarchy. */
export interface ActionItem {
  id: string;
  title: string;
  start: LocalDate | null;
  target: LocalDate | null;
  done: boolean;
}

/** A milestone resolved from its own object (lazy, opt-in — §8.1). */
export interface MilestoneItem {
  id: string;
  title: string;
  date: LocalDate | null;
  done: boolean;
}
