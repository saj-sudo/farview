import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import {
  buildCreateProperties,
  buildDatePatch,
  EditNotPossibleError,
} from '../../src/engine/editor';
import { resolveSchema } from '../../src/engine/resolve';
import type { LocalDate } from '../../src/engine/types';
import {
  createFixtureEditor,
  FixtureProvider,
} from '../../src/providers/fixture/fixtureProvider';
import {
  buildStrangersSpace,
  strangersDemoConfig,
} from '../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;

async function setup() {
  const provider = new FixtureProvider(buildStrangersSpace(TODAY));
  const config = normalizeConfig(strangersDemoConfig());
  const resolved = resolveSchema(
    config,
    await provider.listStructures(),
    await provider.listTags(),
  );
  return { provider, config, resolved };
}

describe('buildDatePatch', () => {
  it('patches only the properties the change names, at day resolution', async () => {
    const { resolved } = await setup();
    const patch = buildDatePatch(resolved, 'project', { target: '2026-12-01' as LocalDate });
    expect(Object.keys(patch)).toEqual(['p-launch']); // start untouched
    expect(patch['p-launch']).toEqual({
      type: 'date',
      date: { dateResolution: 'day', start: '2026-12-01' },
    });
  });

  it('clears a date with null and routes goals to their own property', async () => {
    const { resolved } = await setup();
    const patch = buildDatePatch(resolved, 'goal', { target: null });
    expect(patch['p-landfall']!.date.start).toBeNull();
  });

  it('refuses readably when the property is not mapped', async () => {
    const { resolved } = await setup();
    expect(() => buildDatePatch(resolved, 'goal', { start: TODAY })).toThrow(
      EditNotPossibleError,
    );
    expect(() => buildDatePatch(resolved, 'project', {})).toThrow(EditNotPossibleError);
  });
});

describe('buildCreateProperties', () => {
  it('builds title, dates, and a resolved horizon label option id', async () => {
    const { resolved } = await setup();
    const { structureId, properties } = buildCreateProperties(resolved, {
      kind: 'goal',
      title: 'Sail the Inland Sea',
      start: null,
      target: '2027-06-01' as LocalDate,
      horizonLabel: 'beyond the chart', // case-insensitive against the labelSet
    });
    expect(structureId).toBe('st-voyage');
    expect(properties['p-voyage-title']).toEqual({
      type: 'title',
      title: { value: 'Sail the Inland Sea' },
    });
    expect(properties['p-landfall']).toEqual({
      type: 'date',
      date: { dateResolution: 'day', start: '2027-06-01' },
    });
    const label = properties['p-reach'] as { label: { id: string }[] };
    expect(label.label[0]!.id).toBe('p-reach-opt-3'); // the stable option id
  });

  it('refuses when the kind has no mapped type', async () => {
    const { provider } = await setup();
    const noGoals = resolveSchema(
      normalizeConfig({ types: { project: 'Refit', goal: null } }),
      await provider.listStructures(),
      await provider.listTags(),
    );
    expect(() =>
      buildCreateProperties(noGoals, {
        kind: 'goal',
        title: 'x',
        start: null,
        target: null,
      }),
    ).toThrow(EditNotPossibleError);
  });
});

describe('fixture editor end-to-end', () => {
  it('creates a goal that then lists, enriches, and extracts', async () => {
    const { provider, resolved } = await setup();
    const editor = createFixtureEditor(provider, resolved);
    const created = await editor.createItem({
      kind: 'goal',
      title: 'Sail the Inland Sea',
      start: null,
      target: '2027-06-01' as LocalDate,
      horizonLabel: 'This Year',
    });
    expect(created.title).toBe('Sail the Inland Sea');

    const listed: string[] = [];
    for await (const s of provider.listObjectsByStructure('st-voyage')) {
      listed.push(s.id);
    }
    expect(listed).toContain(created.id);

    const fetched = (await provider.getObject(created.id))!;
    expect(fetched.properties['p-landfall']).toEqual({
      type: 'date',
      start: '2027-06-01',
      end: null,
    });
    expect(fetched.properties['p-reach']).toEqual({
      type: 'label',
      names: ['This Year'],
    });
  });

  it('updates dates in place and returns the fresh object', async () => {
    const { provider, resolved } = await setup();
    const editor = createFixtureEditor(provider, resolved);
    const updated = await editor.updateDates('x-mainstay', 'project', {
      start: '2026-07-01' as LocalDate,
      target: '2026-12-15' as LocalDate,
    });
    expect(updated.properties['p-laid']).toEqual({
      type: 'date',
      start: '2026-07-01',
      end: null,
    });
    // Untouched properties survive the patch.
    expect(updated.properties['p-berth']).toEqual({ type: 'label', names: ['Rigging'] });
    expect(updated.properties['p-waypoints']).toEqual({
      type: 'entity',
      ids: ['w-mast', 'w-rig', 'w-seatrial'],
    });
  });

  it('simulates a failed write for revert tests', async () => {
    const { provider, resolved } = await setup();
    const editor = createFixtureEditor(provider, resolved);
    provider.failNextWrite = true;
    await expect(
      editor.updateDates('x-mainstay', 'project', { target: TODAY }),
    ).rejects.toThrow('simulated write failure');
    // The object is untouched after the failure.
    const obj = (await provider.getObject('x-mainstay'))!;
    expect(obj.properties['p-launch']).toEqual({
      type: 'date',
      start: '2026-11-23',
      end: null,
    });
  });
});
