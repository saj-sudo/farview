import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { classifyStatus, extractItem, extractMilestone } from '../../src/engine/extract';
import type { FullObject, StructureDef } from '../../src/engine/provider';
import { resolveSchema } from '../../src/engine/resolve';

const structures: StructureDef[] = [
  {
    id: 'st-refit',
    title: 'Refit',
    pluralName: 'Refits',
    properties: [
      { id: 'p-laid', name: 'Laid Down', type: 'date', labelNames: [] },
      { id: 'p-launch', name: 'Launch Day', type: 'date', labelNames: [] },
      { id: 'p-berth', name: 'Berth', type: 'label', labelNames: ['Rigging', 'Launched'] },
      { id: 'p-waypoints', name: 'Waypoints', type: 'entity', labelNames: [] },
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
