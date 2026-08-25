import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import type { StructureDef, TagDef } from '../../src/engine/provider';
import { hasProjectType, resolveSchema } from '../../src/engine/resolve';

// A schema deliberately unlike the defaults: the no-hardcoded-schema
// rule (spec §4) means all of this must resolve purely by config names.

const structures: StructureDef[] = [
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
];

const tags: TagDef[] = [
  { id: 'tag-hull', name: 'hull' },
  { id: 'tag-sails', name: 'sails' },
];

const config = normalizeConfig({
  types: { project: 'Refit', goal: 'Voyage' },
  properties: {
    projectStart: 'Laid Down',
    projectTarget: 'Launch Day',
    projectStatus: 'Berth',
    projectMilestones: 'Waypoints',
    goalTarget: 'Landfall',
    goalHorizon: 'Reach',
  },
  grouping: { by: 'tag', values: ['hull', 'sails'] },
});

describe('resolveSchema', () => {
  it('maps names to ids, case-insensitively', () => {
    const shouted = normalizeConfig({
      ...config,
      types: { ...config.types, project: '  REFIT ' },
    });
    const r = resolveSchema(shouted, structures, tags);
    expect(r.types.project?.structure.id).toBe('st-refit');
    expect(r.properties.projectTarget?.property.id).toBe('p-launch');
    expect(r.properties.goalHorizon?.property.labelNames).toContain('Beyond the Chart');
    expect(r.tagIds['hull']).toBe('tag-hull');
    expect(r.warnings).toEqual([]);
    expect(hasProjectType(r)).toBe(true);
  });

  it('names a missing type AND lists what the space contains', () => {
    const wrong = normalizeConfig({ ...config, types: { project: 'Sprint' } });
    const r = resolveSchema(wrong, structures, tags);
    expect(hasProjectType(r)).toBe(false);
    const warning = r.warnings.find((w) => w.includes('Sprint'))!;
    expect(warning).toContain('"Refit"');
    expect(warning).toContain('"Voyage"');
  });

  it('names a missing property AND lists the type\'s own properties', () => {
    const wrong = normalizeConfig({
      ...config,
      properties: { ...config.properties, projectTarget: 'Due Date' },
    });
    const r = resolveSchema(wrong, structures, tags);
    const warning = r.warnings.find((w) => w.includes('Due Date'))!;
    expect(warning).toContain('"Refit"');
    expect(warning).toContain('"Launch Day"');
  });

  it('names a missing tag AND lists the space\'s tags', () => {
    const wrong = normalizeConfig({
      ...config,
      grouping: { by: 'tag', values: ['keel'] },
    });
    const r = resolveSchema(wrong, structures, tags);
    const warning = r.warnings.find((w) => w.includes('keel'))!;
    expect(warning).toContain('"hull"');
  });

  it('skips unmapped levels silently — project-only is the default', () => {
    const projectOnly = normalizeConfig({
      types: { project: 'Refit', goal: null, milestone: null },
      properties: {
        projectStart: 'Laid Down',
        projectTarget: 'Launch Day',
        projectStatus: 'Berth',
        goalTarget: null,
        goalHorizon: null,
        projectMilestones: null,
      },
    });
    const r = resolveSchema(projectOnly, structures, tags);
    expect(r.warnings).toEqual([]);
    expect(r.types.goal).toBeUndefined();
  });

  it('resolves a grouping property on the project type', () => {
    const byProp = normalizeConfig({
      ...config,
      grouping: { by: 'property', property: 'Berth', values: [] },
    });
    const r = resolveSchema(byProp, structures, tags);
    expect(r.groupingProperty?.property.id).toBe('p-berth');
  });
});
