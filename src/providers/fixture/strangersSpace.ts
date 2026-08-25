import { addDays } from '../../engine/dates';
import type { FullObject, PropertyValue } from '../../engine/provider';
import type { LocalDate } from '../../engine/types';
import type { FixtureSpace } from './types';

/**
 * The "stranger's space" (spec §12): a synthetic space whose type names,
 * property names, tag names, and status values are entirely invented and
 * deliberately unlike both the reference config in spec §15 and the
 * defaults in config.ts. It is the primary regression guard for the
 * no-hardcoded-schema rule, and the demo dataset.
 *
 * Welcome to the Saltmarsh Boatyard. A Refit is a project, a Voyage is a
 * goal, a Waypoint is a milestone, and a launch day slipping is nobody's
 * moral failing. Every date is planted relative to `today`, and most
 * carry a comment naming the behavior they exist to exercise.
 *
 * Everything here is fiction. No real space data, even redacted, may
 * ever be added.
 */

const date = (start: LocalDate): PropertyValue => ({ type: 'date', start, end: null });
const label = (...names: string[]): PropertyValue => ({ type: 'label', names });
const entity = (...ids: string[]): PropertyValue => ({ type: 'entity', ids });

export function buildStrangersSpace(today: LocalDate): FixtureSpace {
  const structures: FixtureSpace['structures'] = [
    { id: 'RootPage', title: 'Page', pluralName: 'Pages', properties: [] },
    { id: 'RootTag', title: 'Tag', pluralName: 'Tags', properties: [] },
    {
      id: 'st-refit',
      title: 'Refit',
      pluralName: 'Refits',
      properties: [
        { id: 'p-laid', name: 'Laid Down', type: 'date', labelNames: [] },
        { id: 'p-launch', name: 'Launch Day', type: 'date', labelNames: [] },
        {
          id: 'p-berth',
          name: 'Berth',
          type: 'label',
          labelNames: ['Drafting', 'In the Shed', 'Rigging', 'Launched', 'Scuttled'],
        },
        { id: 'p-waypoints', name: 'Waypoints', type: 'entity', labelNames: [] },
        { id: 'p-notes', name: 'Yard Notes', type: 'text', labelNames: [] },
      ],
    },
    {
      id: 'st-voyage',
      title: 'Voyage',
      pluralName: 'Voyages',
      properties: [
        { id: 'p-landfall', name: 'Landfall', type: 'date', labelNames: [] },
        {
          id: 'p-reach',
          name: 'Reach',
          type: 'label',
          labelNames: ['This Tide', 'This Season', 'This Year', 'Beyond the Chart'],
        },
      ],
    },
    {
      id: 'st-waypoint',
      title: 'Waypoint',
      pluralName: 'Waypoints',
      properties: [
        { id: 'p-charted', name: 'Charted For', type: 'date', labelNames: [] },
        { id: 'p-passage', name: 'Passage', type: 'label', labelNames: ['Passed', 'Ahead'] },
      ],
    },
    {
      // Noise type: real spaces have types Farview will never map, and the
      // onboarding list must show them calmly rather than choke.
      id: 'st-crew',
      title: 'Crew',
      pluralName: 'Crew',
      properties: [
        { id: 'p-watch', name: 'Watch', type: 'label', labelNames: ['Port', 'Starboard'] },
      ],
    },
  ];

  const tags: FixtureSpace['tags'] = [
    { id: 'tag-hull', name: 'hull' },
    { id: 'tag-sails', name: 'sails' },
    { id: 'tag-galley', name: 'galley' },
    { id: 'tag-harbor', name: 'harbormaster' },
  ];

  const refit = (
    id: string,
    title: string,
    properties: Record<string, PropertyValue>,
  ): FullObject => ({ id, structureId: 'st-refit', title, properties });

  const objects: FullObject[] = [
    // Spanning now: the flagship demo bar, with waypoints straddling today.
    refit('x-mainstay', 'Rebuild the Mainstay', {
      'p-laid': date(addDays(today, -60)),
      'p-launch': date(addDays(today, 90)),
      'p-berth': label('Rigging'),
      'p-waypoints': entity('w-mast', 'w-rig', 'w-seatrial'),
    }),
    // Overdue and still active: weight-shift marker, "Now" bucket, no red.
    refit('x-tender-a', 'Repaint the Tender', {
      'p-laid': date(addDays(today, -20)),
      'p-launch': date(addDays(today, -12)),
      'p-berth': label('Rigging'),
    }),
    // Duplicate title with a different id: nothing may key on title (§11).
    refit('x-tender-b', 'Repaint the Tender', {
      'p-laid': date(addDays(today, 10)),
      'p-launch': date(addDays(today, 55)),
      'p-berth': label('Drafting'),
    }),
    // Done recently: hidden by default, one toggle to show.
    refit('x-galley-stove', 'Refit the Galley Stove', {
      'p-laid': date(addDays(today, -90)),
      'p-launch': date(addDays(today, 3)),
      'p-berth': label('Launched'),
    }),
    // Target before start: rendered as a point and flagged, never swapped.
    refit('x-mooring-chart', 'Redraw the Mooring Chart', {
      'p-laid': date(addDays(today, 20)),
      'p-launch': date(addDays(today, 5)),
      'p-berth': label('Drafting'),
    }),
    // Multi-year: must clamp to the viewport with continuation chevrons.
    refit('x-replank', 'Re-plank the Hull', {
      'p-laid': date(addDays(today, -400)),
      'p-launch': date(addDays(today, 700)),
      'p-berth': label('In the Shed'),
    }),
    refit('x-new-sails', 'Cut the New Suit of Sails', {
      'p-laid': date(addDays(today, -10)),
      'p-launch': date(addDays(today, 45)),
      'p-berth': label('Drafting'),
    }),
    refit('x-winter-engine', 'Winter the Engine', {
      'p-laid': date(addDays(today, 100)),
      'p-launch': date(addDays(today, 160)),
      'p-berth': label('Drafting'),
    }),
    // Start-only: an open-ended bar fading at today, "no target" on the card.
    refit('x-rigging-loft', 'Sort the Rigging Loft', {
      'p-laid': date(addDays(today, -30)),
      'p-berth': label('Rigging'),
    }),
    // Target-only: a deadline point, not a span.
    refit('x-licence', 'Renew the Mooring Licence', {
      'p-launch': date(addDays(today, 75)),
      'p-berth': label('Drafting'),
    }),
    // Fully undated: lives in the Someday tray, never dropped.
    refit('x-celestial', 'Learn Celestial Navigation', {
      'p-berth': label('Drafting'),
    }),
    // A status the demo config never heard of: unknown → still visible.
    refit('x-careen', 'Careen the Skiff', {
      'p-laid': date(addDays(today, -5)),
      'p-launch': date(addDays(today, 25)),
      'p-berth': label('Careened'),
    }),
    // Long done: stays out of view until completed items are shown.
    refit('x-old-punt', 'Rebuild the Old Punt', {
      'p-laid': date(addDays(today, -200)),
      'p-launch': date(addDays(today, -100)),
      'p-berth': label('Scuttled'),
    }),

    /* ---- Voyages: the goal level ---- */
    {
      id: 'v-spring-tide',
      structureId: 'st-voyage',
      title: 'Race the Spring Tide',
      properties: {
        'p-landfall': date(addDays(today, 21)),
        'p-reach': label('This Tide'),
      },
    },
    {
      id: 'v-atoll',
      structureId: 'st-voyage',
      title: 'Reach the Coral Atoll',
      properties: {
        'p-landfall': date(addDays(today, 240)),
        'p-reach': label('This Year'),
      },
    },
    {
      // The decade arc: what the Decade zoom exists to show.
      id: 'v-circumnavigate',
      structureId: 'st-voyage',
      title: 'Circumnavigate',
      properties: {
        'p-landfall': date(addDays(today, 2600)),
        'p-reach': label('Beyond the Chart'),
      },
    },

    /* ---- Waypoints: milestones, fetched lazily (§8.1) ---- */
    {
      id: 'w-mast',
      structureId: 'st-waypoint',
      title: 'Step the Mast',
      properties: {
        'p-charted': date(addDays(today, -10)),
        'p-passage': label('Passed'),
      },
    },
    {
      id: 'w-rig',
      structureId: 'st-waypoint',
      title: 'Tune the Standing Rigging',
      properties: {
        'p-charted': date(addDays(today, 15)),
        'p-passage': label('Ahead'),
      },
    },
    {
      id: 'w-seatrial',
      structureId: 'st-waypoint',
      title: 'Sea Trial',
      properties: {
        'p-charted': date(addDays(today, 80)),
        'p-passage': label('Ahead'),
      },
    },

    /* ---- Crew: noise the mapper must calmly ignore ---- */
    {
      id: 'c-elva',
      structureId: 'st-crew',
      title: 'Elva Marsh',
      properties: { 'p-watch': label('Port') },
    },
    {
      id: 'c-tobin',
      structureId: 'st-crew',
      title: 'Tobin Reed',
      properties: { 'p-watch': label('Starboard') },
    },
  ];

  const tagAssignments: FixtureSpace['tagAssignments'] = {
    'tag-hull': ['x-mainstay', 'x-tender-a', 'x-replank', 'v-circumnavigate', 'v-spring-tide'],
    'tag-sails': ['x-new-sails', 'x-rigging-loft', 'x-celestial', 'v-atoll'],
    'tag-galley': ['x-galley-stove', 'x-winter-engine', 'x-tender-b'],
    'tag-harbor': ['x-mooring-chart', 'x-licence', 'x-old-punt'],
    // x-careen carries no tag at all: the ungrouped lane must exist.
  };

  return {
    spaceId: 'fixture-saltmarsh',
    title: 'Saltmarsh Boatyard',
    structures,
    tags,
    objects,
    tagAssignments,
  };
}

/** The demo's post-onboarding config, mapping the invented schema. */
export function strangersDemoConfig(): unknown {
  return {
    types: { project: 'Refit', goal: 'Voyage', milestone: 'Waypoint' },
    properties: {
      projectStart: 'Laid Down',
      projectTarget: 'Launch Day',
      projectStatus: 'Berth',
      projectMilestones: 'Waypoints',
      goalTarget: 'Landfall',
      goalHorizon: 'Reach',
    },
    statusValues: {
      active: ['Drafting', 'In the Shed', 'Rigging'],
      // 'Passed' is the Waypoint done-label; status values are shared
      // between the project and milestone levels by design.
      done: ['Launched', 'Scuttled', 'Passed'],
    },
    grouping: {
      by: 'tag',
      values: ['hull', 'sails', 'galley', 'harbormaster'],
    },
  };
}
