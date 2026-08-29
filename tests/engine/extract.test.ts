import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import {
  classifyStatus,
  extractAction,
  extractItem,
  extractMilestone,
} from '../../src/engine/extract';
import type { FullObject, StructureDef } from '../../src/engine/provider';
import { resolveSchema } from '../../src/engine/resolve';
import { propDef } from '../../src/providers/fixture/types';

const structures: StructureDef[] = [
  {
    id: 'st-refit',
    title: 'Refit',
    pluralName: 'Refits',
    properties: [
      propDef('p-laid', 'Laid Down', 'date'),
      propDef('p-launch', 'Launch Day', 'date'),
      propDef('p-berth', 'Berth', 'label', ['Rigging', 'Launched']),
      propDef('p-waypoints', 'Waypoints', 'entity'),
    ],
  },
];

const config = normalizeConfig({
  types: { project: 'Refit' },
  properties: {
    projectStart: 'Laid Down',
    projectTarget: 'Launch Day',
    projectStatus: 'Berth',
    projectMilestones: 'Waypoints',
  },
  statusValues: { active: ['Rigging'], done: ['Launched', 'Scuttled'] },
  grouping: { by: 'tag', values: ['hull', 'sails'] },
});

const resolved = resolveSchema(config, structures, []);

function refit(id: string, properties: FullObject['properties']): FullObject {
  return { id, structureId: 'st-refit', title: `Refit ${id}`, properties };
}

const noTags = () => [];

describe('extractItem', () => {
  it('reads dates, status, and milestone refs from resolved properties', () => {
    const item = extractItem(
      refit('a', {
        'p-laid': { type: 'date', start: '2026-03-01', end: null },
        'p-launch': { type: 'date', start: '2026-09-15T00:00:00.000Z', end: null },
        'p-berth': { type: 'label', names: ['Rigging'] },
        'p-waypoints': { type: 'entity', ids: ['w1', 'w2'] },
      }),
      'project',
      config,
      resolved,
      noTags,
    );
    expect(item.start).toBe('2026-03-01');
    expect(item.target).toBe('2026-09-15');
    expect(item.status).toBe('active');
    expect(item.statusLabel).toBe('Rigging');
    expect(item.milestoneIds).toEqual(['w1', 'w2']);
    expect(item.flags.targetBeforeStart).toBe(false);
  });

  it('flags target-before-start instead of swapping (§11)', () => {
    const item = extractItem(
      refit('b', {
        'p-laid': { type: 'date', start: '2026-06-01', end: null },
        'p-launch': { type: 'date', start: '2026-05-01', end: null },
      }),
      'project',
      config,
      resolved,
      noTags,
    );
    expect(item.flags.targetBeforeStart).toBe(true);
    expect(item.start).toBe('2026-06-01');
    expect(item.target).toBe('2026-05-01');
  });

  it('keeps undated and unknown-status items visible', () => {
    const item = extractItem(
      refit('c', { 'p-berth': { type: 'label', names: ['Careened'] } }),
      'project',
      config,
      resolved,
      noTags,
    );
    expect(item.start).toBeNull();
    expect(item.target).toBeNull();
    expect(item.status).toBe('unknown');
    expect(item.statusLabel).toBe('Careened');
  });

  it('assigns tag groups from injected membership, in configured order', () => {
    const item = extractItem(
      refit('d', {}),
      'project',
      config,
      resolved,
      () => ['sails', 'hull'],
    );
    expect(item.group).toBe('hull'); // first *configured* value wins
    expect(item.tags).toEqual(['hull', 'sails']);
  });

  it('survives a property holding a surprise shape', () => {
    const item = extractItem(
      refit('e', {
        'p-launch': { type: 'text', value: 'someday soon' },
        'p-berth': { type: 'date', start: '2026-01-01', end: null },
      }),
      'project',
      config,
      resolved,
      noTags,
    );
    expect(item.target).toBeNull();
    expect(item.status).toBe('unknown');
  });
});

describe('classifyStatus', () => {
  it('matches case-insensitively and prefers done over active', () => {
    expect(classifyStatus(['LAUNCHED'], config).status).toBe('done');
    expect(classifyStatus(['rigging'], config).status).toBe('active');
    expect(classifyStatus([], config).status).toBe('unknown');
  });
});

describe('extractAction', () => {
  const actionStructures: StructureDef[] = [
    ...structures,
    {
      id: 'st-chore',
      title: 'Deck Chore',
      pluralName: 'Deck Chores',
      properties: [
        propDef('p-slated', 'Slated For', 'date'),
        propDef('p-state', 'State', 'label', ['On the List', 'Squared Away']),
      ],
    },
  ];
  const actionConfig = normalizeConfig({
    types: { project: 'Refit', action: 'Deck Chore' },
    properties: {
      projectStart: 'Laid Down',
      projectTarget: 'Launch Day',
      projectStatus: 'Berth',
      actionDate: 'Slated For',
      actionStatus: 'State',
    },
    statusValues: { active: ['On the List'], done: ['Squared Away'] },
  });
  const actionResolved = resolveSchema(actionConfig, actionStructures, []);

  it('reads the mapped date and done label', () => {
    const action = extractAction(
      {
        id: 'ch1',
        structureId: 'st-chore',
        title: 'Wax the hull',
        properties: {
          'p-slated': { type: 'date', start: '2026-09-01', end: null },
          'p-state': { type: 'label', names: ['Squared Away'] },
        },
      },
      actionConfig,
      actionResolved,
    );
    expect(action.target).toBe('2026-09-01');
    expect(action.start).toBeNull(); // a lone date is the deadline
    expect(action.done).toBe(true);
  });

  it('keeps a ranged date as a span', () => {
    const action = extractAction(
      {
        id: 'ch2',
        structureId: 'st-chore',
        title: 'Careen over the tides',
        properties: {
          'p-slated': { type: 'date', start: '2026-09-01', end: '2026-09-04' },
        },
      },
      actionConfig,
      actionResolved,
    );
    expect(action.start).toBe('2026-09-01');
    expect(action.target).toBe('2026-09-04');
    expect(action.done).toBe(false);
  });

  it('falls back to any date and label when the action schema is unmapped', () => {
    const bare = resolveSchema(
      normalizeConfig({ types: { project: 'Refit', action: 'Deck Chore' } }),
      actionStructures,
      [],
    );
    const action = extractAction(
      {
        id: 'ch3',
        structureId: 'st-chore',
        title: 'Unmapped chore',
        properties: {
          whatever: { type: 'date', start: '2026-10-10', end: null },
          state: { type: 'label', names: ['Completed'] }, // default done set
        },
      },
      normalizeConfig({ types: { project: 'Refit', action: 'Deck Chore' } }),
      bare,
    );
    expect(action.target).toBe('2026-10-10');
    expect(action.done).toBe(true);
  });
});

describe('extractMilestone', () => {
  it('takes the first date property and reads done-ness from labels', () => {
    const m = extractMilestone(
      {
        id: 'w1',
        structureId: 'st-waypoint',
        title: 'Mast stepped',
        properties: {
          anything: { type: 'label', names: ['Launched'] },
          when: { type: 'date', start: '2026-07-01', end: null },
        },
      },
      config,
    );
    expect(m.date).toBe('2026-07-01');
    expect(m.done).toBe(true);
    expect(m.title).toBe('Mast stepped');
  });
});
