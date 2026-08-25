import { addDays } from '../../engine/dates';
import type { LocalDate } from '../../engine/types';
import { propDef, type FixtureSpace } from './types';

/**
 * The minimal fixture (spec §12): one custom type, one date property,
 * nothing else. Proves that a space with almost no structure still
 * renders a timeline — this is closer to most real spaces than any
 * fully-mapped demo.
 */
export function buildMinimalSpace(today: LocalDate): FixtureSpace {
  return {
    spaceId: 'fixture-minimal',
    title: 'A Quiet Space',
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
    objects: [
      {
        id: 'u-past',
        structureId: 'st-undertaking',
        title: 'The one already behind us',
        properties: {
          'p-bywhen': { type: 'date', start: addDays(today, -40), end: null },
        },
      },
      {
        id: 'u-future',
        structureId: 'st-undertaking',
        title: 'The one still ahead',
        properties: {
          'p-bywhen': { type: 'date', start: addDays(today, 40), end: null },
        },
      },
      {
        id: 'u-someday',
        structureId: 'st-undertaking',
        title: 'The one with no date yet',
        properties: {},
      },
    ],
    tagAssignments: {},
  };
}
