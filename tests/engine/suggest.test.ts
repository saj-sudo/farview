import { describe, expect, it } from 'vitest';
import { defaultConfig, normalizeConfig } from '../../src/engine/config';
import type { PropertyDef, StructureDef } from '../../src/engine/provider';
import { resolveSchema } from '../../src/engine/resolve';
import { applySuggestion, statusMeaning, suggestMapping } from '../../src/engine/suggest';
import type { LocalDate } from '../../src/engine/types';
import { isBasicStructure } from '../../src/providers/capacities/constants';
import { buildEmptySpace } from '../../src/providers/fixture/emptySpace';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStandardSpace } from '../../src/providers/fixture/standardSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';
import { propDef } from '../../src/providers/fixture/types';

const TODAY = '2026-08-25' as LocalDate;

/** What a visitor starts with: nothing mapped, so every role is open. */
const BLANK = normalizeConfig({
  ...defaultConfig(),
  types: { project: null, goal: null, milestone: null, action: null },
});

const type = (title: string, properties: PropertyDef[]): StructureDef => ({
  id: `st-${title}`,
  title,
  pluralName: `${title}s`,
  properties,
});
const customOf = (structures: StructureDef[]): StructureDef[] => structures.filter((s) => !isBasicStructure(s.id));

describe('suggestMapping on a standard Capacities Project type', () => {
  const space = buildStandardSpace(TODAY);
  const suggestion = suggestMapping(customOf(space.structures), BLANK)!;

  it('recognises the Project type, its dates and its status by name', () => {
    expect(suggestion.types).toEqual([
      {
        role: 'project',
        type: 'Project',
        guess: false,
        properties: { projectStart: 'Start Date', projectTarget: 'Target Completion', projectStatus: 'Status' },
      },
    ]);
  });

  it('sorts the status values by meaning and leaves on hold in neither', () => {
    expect(suggestion.statusValues).toEqual({ active: ['Planned', 'Active'], done: ['Completed', 'Archived'] });
  });

  it('resolves cleanly once applied, and the timeline can place every dated project', () => {
    const config = applySuggestion(BLANK, suggestion, customOf(space.structures));
    const resolved = resolveSchema(config, space.structures, space.tags);
    expect(resolved.warnings).toEqual([]);
    expect(resolved.types.project?.structure.title).toBe('Project');
  });
});

describe('suggestMapping on the other fixture spaces', () => {
  it('says nothing for a type it cannot tell is projects, rather than guessing wildly', () => {
    // "Undertaking" has one unlabelled date and no status: too little to go on.
    expect(suggestMapping(customOf(buildMinimalSpace(TODAY).structures), BLANK)).toBeNull();
  });

  it('says nothing for the empty space', () => {
    expect(suggestMapping(customOf(buildEmptySpace().structures), BLANK)).toBeNull();
  });

  it("says nothing for the stranger's space, whose names follow no convention", () => {
    expect(suggestMapping(customOf(buildStrangersSpace(TODAY).structures), BLANK)).toBeNull();
  });
});

describe('suggestMapping across the levels', () => {
  const structures = [
    type('Initiative', [
      propDef('i-start', 'Kickoff', 'date'),
      propDef('i-due', 'Due Date', 'date'),
      propDef('i-stage', 'Stage', 'label', ['Idea', 'In Progress', 'Paused', 'Shipped']),
      propDef('i-ms', 'Milestones', 'entity'),
      propDef('i-goal', 'Objective', 'entity'),
    ]),
    type('Objective', [propDef('o-target', 'Target Date', 'date'), propDef('o-h', 'Time Horizon', 'label', ['Now', 'Later'])]),
    type('Milestone', [propDef('m-date', 'Date', 'date')]),
  ];
  const suggestion = suggestMapping(structures, BLANK)!;

  it('finds goals and milestones by name and links them to the project when both ends exist', () => {
    expect(suggestion.types.map((t) => [t.role, t.type])).toEqual([
      ['project', 'Initiative'],
      ['goal', 'Objective'],
      ['milestone', 'Milestone'],
    ]);
    const [project, goal] = suggestion.types;
    expect(project!.properties).toMatchObject({
      projectStart: 'Kickoff',
      projectTarget: 'Due Date',
      projectStatus: 'Stage',
      projectMilestones: 'Milestones',
      projectGoal: 'Objective',
    });
    expect(goal!.properties).toEqual({ goalTarget: 'Target Date', goalHorizon: 'Time Horizon' });
  });

  it('does not link a goal property when no goal type was found', () => {
    const onlyProject = suggestMapping([structures[0]!], BLANK)!;
    expect(onlyProject.types[0]!.properties).not.toHaveProperty('projectGoal');
    expect(onlyProject.types[0]!.properties).not.toHaveProperty('projectMilestones');
  });

  it('resolves cleanly once applied', () => {
    const config = applySuggestion(BLANK, suggestion, structures);
    expect(resolveSchema(config, structures, []).warnings).toEqual([]);
  });
});

describe('suggestMapping respects what is already mapped', () => {
  const standard = customOf(buildStandardSpace(TODAY).structures);

  it('offers nothing when the default Project mapping already resolves', () => {
    expect(suggestMapping(standard, defaultConfig())).toBeNull();
  });

  it('replaces a default that points at a type this space does not have', () => {
    const structures = [
      type('Initiative', [propDef('s', 'Start', 'date'), propDef('e', 'End', 'date'), propDef('st', 'Status', 'label', ['Active'])]),
    ];
    const suggestion = suggestMapping(structures, defaultConfig())!; // default says "Project"
    expect(suggestion.types[0]!.type).toBe('Initiative');
    const applied = applySuggestion(defaultConfig(), suggestion, structures);
    expect(applied.types.project).toBe('Initiative');
    expect(applied.properties.projectTarget).toBe('End');
  });
});

describe('suggestMapping on shapes that are only a guess', () => {
  it('takes two unnamed dates and a status as start and end, and says it is a guess', () => {
    const phase = type('Expedition', [
      propDef('a', 'Set Off', 'date'),
      propDef('b', 'Summit Day', 'date'),
      propDef('c', 'Phase', 'label', ['Scouting', 'Summited']),
    ]);
    const suggestion = suggestMapping([phase], BLANK)!;
    expect(suggestion.types[0]).toMatchObject({
      guess: true,
      properties: { projectStart: 'Set Off', projectTarget: 'Summit Day', projectStatus: 'Phase' },
    });
  });

  it('does not take a type with a single unnamed date for projects', () => {
    expect(suggestMapping([type('Meeting', [propDef('w', 'When', 'date'), propDef('k', 'Kind', 'label', ['Standup'])])], BLANK)).toBeNull();
  });
});

describe('statusMeaning', () => {
  it('sorts values by meaning, whatever the case or spacing', () => {
    expect(statusMeaning(['Not Started', 'In Progress', 'ON HOLD', 'Done', 'cancelled', 'Someday'])).toEqual({
      active: ['Not Started', 'In Progress'],
      done: ['Done', 'cancelled'],
    });
  });
});
