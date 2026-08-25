import { propDef, type FixtureSpace } from './types';

/**
 * The empty fixture (spec §12): types exist, but there is not a single
 * object. The app must show a useful empty state, not a broken chart —
 * this is many users' actual first experience.
 */
export function buildEmptySpace(): FixtureSpace {
  return {
    spaceId: 'fixture-empty',
    title: 'An Empty Slip',
    structures: [
      { id: 'RootPage', title: 'Page', pluralName: 'Pages', properties: [] },
      { id: 'RootTag', title: 'Tag', pluralName: 'Tags', properties: [] },
      {
        id: 'st-undertaking',
        title: 'Undertaking',
        pluralName: 'Undertakings',
        properties: [
          propDef('p-min-title', 'Name', 'title'),
          propDef('p-bywhen', 'By When', 'date'),
        ],
      },
    ],
    tags: [],
    objects: [],
    tagAssignments: {},
  };
}
