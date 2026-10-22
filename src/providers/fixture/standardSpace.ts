import { addDays } from '../../engine/dates';
import type { PropertyValue } from '../../engine/provider';
import type { LocalDate } from '../../engine/types';
import { propDef, type FixtureSpace } from './types';

/**
 * A space set up the way Capacities' own Project type is: a "Project" type
 * with Start Date, Target Completion, Status and Priority. Invented content.
 * It exists so the first-run suggestion has something ordinary to recognise,
 * which is what most spaces look like.
 */

const date = (value: LocalDate): PropertyValue => ({ type: 'date', start: value, end: null });
const label = (...names: string[]): PropertyValue => ({ type: 'label', names });

export function buildStandardSpace(today: LocalDate): FixtureSpace {
  const project = (
    id: string,
    title: string,
    status: string,
    start: number | null,
    target: number | null,
    priority: string,
  ) => {
    const properties: Record<string, PropertyValue> = {
      'p-status': label(status),
      'p-priority': label(priority),
    };
    if (start !== null) properties['p-start'] = date(addDays(today, start));
    if (target !== null) properties['p-target'] = date(addDays(today, target));
    return { id, structureId: 'st-project', title, properties };
  };

  return {
    spaceId: 'fixture-standard',
    title: 'Corner Studio',
    structures: [
      { id: 'RootPage', title: 'Page', pluralName: 'Pages', properties: [] },
      { id: 'RootTag', title: 'Tag', pluralName: 'Tags', properties: [] },
      {
        id: 'st-project',
        title: 'Project',
        pluralName: 'Projects',
        properties: [
          propDef('p-title', 'title', 'title'),
          propDef('p-start', 'Start Date', 'date'),
          propDef('p-target', 'Target Completion', 'date'),
          propDef('p-status', 'Status', 'label', ['Planned', 'Active', 'On Hold', 'Completed', 'Archived']),
          propDef('p-priority', 'Priority', 'label', ['High', 'Medium', 'Low']),
        ],
      },
    ],
    tags: [],
    objects: [
      project('s-room', 'Clear the spare room', 'Completed', -120, -75, 'High'),
      project('s-paint', 'Paint the studio walls', 'Completed', -70, -35, 'Medium'),
      project('s-desk', 'Build a standing desk', 'Active', -30, 25, 'High'),
      project('s-door', 'Soundproof the door', 'Active', -10, 40, 'Medium'),
      project('s-demo', 'Record the first demo', 'Planned', 20, 75, 'High'),
      project('s-solder', 'Learn to solder', 'On Hold', -45, 60, 'Low'),
      project('s-shelves', 'Put up the record shelves', 'Planned', 50, 110, 'Low'),
      project('s-open', 'Open studio afternoon', 'Planned', null, 150, 'Medium'),
      project('s-loft', 'Insulate the loft', 'Planned', null, null, 'Low'),
    ],
    tagAssignments: {},
  };
}
