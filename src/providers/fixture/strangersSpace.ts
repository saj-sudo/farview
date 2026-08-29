import { addDays } from '../../engine/dates';
import type { FullObject, PropertyValue } from '../../engine/provider';
import type { LocalDate } from '../../engine/types';
import { propDef, type FixtureSpace } from './types';

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
        propDef('p-refit-title', 'Name', 'title'),
        propDef('p-laid', 'Laid Down', 'date'),
        propDef('p-launch', 'Launch Day', 'date'),
        propDef('p-berth', 'Berth', 'label', [
          'Drafting', 'In the Shed', 'Rigging', 'Launched', 'Scuttled',
        ]),
        propDef('p-waypoints', 'Waypoints', 'entity'),
        propDef('p-voyage', 'Voyage', 'entity'),
        propDef('p-chores', 'Chores', 'entity'),
        propDef('p-notes', 'Yard Notes', 'text'),
      ],
    },
    {
      id: 'st-voyage',
      title: 'Voyage',
      pluralName: 'Voyages',
      properties: [
        propDef('p-voyage-title', 'Name', 'title'),
        propDef('p-landfall', 'Landfall', 'date'),
        propDef('p-reach', 'Reach', 'label', [
          'This Tide', 'This Season', 'This Year', 'Beyond the Chart',
        ]),
        propDef('p-chores-v', 'Chores', 'entity'),
        propDef('p-marks', 'Marks', 'entity'),
      ],
    },
    {
      // The action level: leaf work items, one sitting to one day each.
      id: 'st-chore',
      title: 'Deck Chore',
      pluralName: 'Deck Chores',
      properties: [
        propDef('p-chore-title', 'Name', 'title'),
        propDef('p-slated', 'Slated For', 'date'),
        propDef('p-state', 'State', 'label', ['On the List', 'Squared Away']),
      ],
    },
    {
      id: 'st-waypoint',
      title: 'Waypoint',
      pluralName: 'Waypoints',
      properties: [
        propDef('p-charted', 'Charted For', 'date'),
        propDef('p-passage', 'Passage', 'label', ['Passed', 'Ahead']),
      ],
    },
    {
      // Noise type: real spaces have types Farview will never map, and the
      // onboarding list must show them calmly rather than choke.
      id: 'st-crew',
      title: 'Crew',
      pluralName: 'Crew',
      properties: [propDef('p-watch', 'Watch', 'label', ['Port', 'Starboard'])],
    },
  ];

  // Two levels of tags, the way a space that keeps its taxonomy in
  // collections has it: broad pillars, and finer areas within them.
  const tags: FixtureSpace['tags'] = [
    { id: 'tag-hull', name: 'hull' },
    { id: 'tag-sails', name: 'sails' },
    { id: 'tag-galley', name: 'galley' },
    { id: 'tag-harbor', name: 'harbormaster' },
    { id: 'tag-restoration', name: 'restoration' },
    { id: 'tag-outfitting', name: 'outfitting' },
    { id: 'tag-provisioning', name: 'provisioning' },
    { id: 'tag-paperwork', name: 'paperwork' },
  ];

  const collections: FixtureSpace['collections'] = [
    {
      id: 'col-pillars',
      name: 'Yard Pillars',
      memberIds: ['tag-hull', 'tag-sails', 'tag-galley', 'tag-harbor'],
    },
    {
      id: 'col-areas',
      name: 'Work Areas',
      memberIds: [
        'tag-restoration',
        'tag-outfitting',
        'tag-provisioning',
        'tag-paperwork',
      ],
    },
  ];

  const refit = (
    id: string,
    title: string,
    properties: Record<string, PropertyValue>,
  ): FullObject => ({ id, structureId: 'st-refit', title, properties });

  const objects: FullObject[] = [
    // Spanning now: the flagship demo bar, with waypoints straddling today,
    // a goal link, and its own chores — the full hierarchy in one item.
    refit('x-mainstay', 'Rebuild the Mainstay', {
      'p-laid': date(addDays(today, -60)),
      'p-launch': date(addDays(today, 90)),
      'p-berth': label('Rigging'),
      'p-waypoints': entity('w-mast', 'w-rig', 'w-seatrial'),
      'p-voyage': entity('v-atoll'),
      'p-chores': entity('ch-partners', 'ch-brightwork', 'ch-halyard'),
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
      'p-voyage': entity('v-circumnavigate'),
    }),
    refit('x-new-sails', 'Cut the New Suit of Sails', {
      'p-laid': date(addDays(today, -10)),
      'p-launch': date(addDays(today, 45)),
      'p-berth': label('Drafting'),
      'p-voyage': entity('v-atoll'),
      'p-chores': entity('ch-loft', 'ch-stormjib'),
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
        'p-chores-v': entity('ch-wax', 'ch-spinnaker'),
        'p-marks': entity('w-mast'),
      },
    },
    {
      // Undated, but its chores are dated: the derived dashed bar's case.
      id: 'v-inland',
      structureId: 'st-voyage',
      title: 'Chart the Inland Waterways',
      properties: {
        'p-reach': label('This Season'),
        'p-chores-v': entity('ch-channel', 'ch-locks'),
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

    /* ---- Deck Chores: the action level, one sitting each ---- */
    ...([
      ['ch-partners', 'Fair the mast partners', 10, 'On the List'],
      ['ch-brightwork', 'Oil the deck brightwork', -5, 'Squared Away'],
      ['ch-halyard', 'Splice the halyard ends', 30, 'On the List'],
      ['ch-loft', 'Loft the mainsail pattern', 12, 'On the List'],
      ['ch-stormjib', 'Seam the storm jib', 25, 'On the List'],
      ['ch-wax', 'Wax the hull to the waterline', 7, 'On the List'],
      ['ch-spinnaker', 'Rig the spinnaker pole', 14, 'Squared Away'],
      ['ch-channel', 'Sound the northern channel', 40, 'On the List'],
      ['ch-locks', 'Order paper charts for the locks', 95, 'On the List'],
    ] as const).map(
      ([id, title, offset, state]): FullObject => ({
        id,
        structureId: 'st-chore',
        title,
        properties: {
          'p-slated': date(addDays(today, offset)),
          'p-state': label(state),
        },
      }),
    ),

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
    // The second level cuts across the first: a hull refit can be
    // restoration or outfitting work, and both lanes should show it.
    'tag-restoration': ['x-mainstay', 'x-replank', 'x-old-punt'],
    'tag-outfitting': ['x-new-sails', 'x-rigging-loft', 'x-tender-b', 'v-atoll'],
    'tag-provisioning': ['x-galley-stove', 'x-winter-engine'],
    'tag-paperwork': ['x-mooring-chart', 'x-licence'],
    // x-careen carries no tag at all: the ungrouped lane must exist.
  };

  return {
    spaceId: 'fixture-saltmarsh',
    title: 'Saltmarsh Boatyard',
    structures,
    tags,
    objects,
    tagAssignments,
    collections,
  };
}

/** The demo's post-onboarding config, mapping the invented schema. */
export function strangersDemoConfig(): unknown {
  return {
    types: {
      project: 'Refit',
      goal: 'Voyage',
      milestone: 'Waypoint',
      action: 'Deck Chore',
    },
    properties: {
      projectStart: 'Laid Down',
      projectTarget: 'Launch Day',
      projectStatus: 'Berth',
      projectMilestones: 'Waypoints',
      projectGoal: 'Voyage',
      projectActions: 'Chores',
      goalTarget: 'Landfall',
      goalHorizon: 'Reach',
      goalActions: 'Chores',
      goalMilestones: 'Marks',
      actionDate: 'Slated For',
      actionStatus: 'State',
    },
    statusValues: {
      active: ['Drafting', 'In the Shed', 'Rigging', 'On the List'],
      // 'Passed' and 'Squared Away' are the milestone/action done-labels;
      // status values are shared across all levels by design.
      done: ['Launched', 'Scuttled', 'Passed', 'Squared Away'],
    },
    grouping: {
      by: 'tag',
      // The space's own taxonomy, read live from its collections —
      // no ticking tags one by one.
      collection: 'Yard Pillars',
      values: [],
      sub: { by: 'tag', collection: 'Work Areas', values: [] },
    },
  };
}
