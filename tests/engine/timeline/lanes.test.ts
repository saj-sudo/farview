import { describe, expect, it } from 'vitest';
import { dayNumber } from '../../../src/engine/dates';
import { estTextWidth, packLanes, place } from '../../../src/engine/timeline/lanes';
import type { LocalDate, TimelineItem } from '../../../src/engine/types';

const TODAY = '2026-08-25' as LocalDate;
const TODAY_DAY = dayNumber(TODAY);

function item(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: overrides.id ?? 'x',
    title: overrides.title ?? 'Item',
    kind: 'project',
    start: null,
    target: null,
    status: 'active',
    statusLabel: null,
    group: null,
    subGroup: null,
    tags: [],
    flags: { targetBeforeStart: false },
    milestoneIds: [],
    goalId: null,
    actionIds: [],
    derived: null,
    horizonLabel: null,
    ...overrides,
  };
}

describe('place', () => {
  it('spans start→target, points at reversed targets, opens to today', () => {
    const bar = place(item({ start: '2026-01-01', target: '2026-03-01' }), TODAY_DAY)!;
    expect(bar.effEnd - bar.effStart).toBe(59);

    const reversed = place(
      item({
        start: '2026-06-01',
        target: '2026-05-01',
        flags: { targetBeforeStart: true },
      }),
      TODAY_DAY,
    )!;
    expect(reversed.effStart).toBe(dayNumber('2026-05-01' as LocalDate));

    const open = place(item({ start: '2026-08-01' }), TODAY_DAY)!;
    expect(open.effEnd).toBe(TODAY_DAY);

    expect(place(item({}), TODAY_DAY)).toBeNull(); // Someday: not on the axis
  });
});

describe('packLanes', () => {
  const overlapping = [
    item({ id: 'a', group: 'hull', start: '2026-01-01', target: '2026-06-01' }),
    item({ id: 'b', group: 'hull', start: '2026-03-01', target: '2026-09-01' }),
    item({ id: 'c', group: 'hull', start: '2026-07-01', target: '2026-10-01' }),
    item({ id: 'd', group: 'sails', start: '2026-02-01', target: '2026-04-01' }),
  ];
  const opts = { todayDay: TODAY_DAY, pxPerDay: 2, groupOrder: ['hull', 'sails'] };

  it('packs overlapping bars into separate rows, never overlapping', () => {
    const lanes = packLanes(overlapping, opts);
    expect(lanes.map((l) => l.group)).toEqual(['hull', 'sails']);
    const hull = lanes[0]!;
    expect(hull.rows.length).toBe(2); // a+c share a row; b needs its own
    for (const lane of lanes) {
      for (const row of lane.rows) {
        for (let i = 1; i < row.length; i += 1) {
          expect(row[i]!.effStart).toBeGreaterThanOrEqual(row[i - 1]!.effEnd);
        }
      }
    }
  });

  it('reserves label width so outside labels cannot collide', () => {
    // Two short adjacent bars at low density: the first one's label sticks
    // out well past its bar, so the second must go to another row.
    const short = [
      item({ id: 'a', title: 'A very considerable label indeed', start: '2026-01-01', target: '2026-01-08' }),
      item({ id: 'b', title: 'B', start: '2026-01-20', target: '2026-01-27' }),
    ];
    const lanes = packLanes(short, { todayDay: TODAY_DAY, pxPerDay: 1, groupOrder: [] });
    expect(lanes[0]!.rows.length).toBe(2);
    // At high density the same bars fit one row: the label fits inside.
    const dense = packLanes(short, { todayDay: TODAY_DAY, pxPerDay: 40, groupOrder: [] });
    expect(dense[0]!.rows.length).toBe(1);
  });

  it('is deterministic and orders lanes: configured, then alpha, null last', () => {
    const items = [
      item({ id: 'n', group: null, target: '2026-09-01' }),
      item({ id: 'z', group: 'zebra', target: '2026-09-01' }),
      item({ id: 'a', group: 'aft', target: '2026-09-01' }),
      item({ id: 'h', group: 'hull', target: '2026-09-01' }),
    ];
    const lanes = packLanes(items, { todayDay: TODAY_DAY, pxPerDay: 2, groupOrder: ['hull'] });
    expect(lanes.map((l) => l.group)).toEqual(['hull', 'aft', 'zebra', null]);
    const again = packLanes([...items].reverse(), {
      todayDay: TODAY_DAY,
      pxPerDay: 2,
      groupOrder: ['hull'],
    });
    expect(again.map((l) => l.group)).toEqual(['hull', 'aft', 'zebra', null]);
  });

  it('nests sub-lanes under their pillar, in configured then alpha order', () => {
    // A two-level taxonomy: pillar tags on the first level, area tags on
    // the second. Each (pillar, area) pair earns its own lane, and the
    // pillar's name prints once — on the first lane of its run.
    const items = [
      item({ id: 'a', group: 'Health', subGroup: 'Home', target: '2026-09-01' }),
      item({ id: 'b', group: 'Health', subGroup: 'Aesthetic', target: '2026-09-01' }),
      item({ id: 'c', group: 'Health', subGroup: null, target: '2026-09-01' }),
      item({ id: 'd', group: 'Work', subGroup: 'Home', target: '2026-09-01' }),
      item({ id: 'e', group: null, subGroup: null, target: '2026-09-01' }),
    ];
    const lanes = packLanes(items, {
      todayDay: TODAY_DAY,
      pxPerDay: 2,
      groupOrder: ['Work', 'Health'],
      subGroupOrder: ['Home'],
    });
    expect(lanes.map((l) => [l.group, l.subGroup])).toEqual([
      ['Work', 'Home'],
      ['Health', 'Home'], // configured sub-order wins over alphabetical
      ['Health', 'Aesthetic'],
      ['Health', null], // an untagged area sits last within its pillar
      [null, null], // ungrouped last of all
    ]);
    expect(lanes.map((l) => l.firstOfGroup)).toEqual([true, true, false, false, true]);
  });

  it('keeps one item per (pillar, area) pair rather than flattening', () => {
    // The same area name under two pillars must not merge into one lane.
    const lanes = packLanes(
      [
        item({ id: 'a', group: 'Mind', subGroup: 'Learn', start: '2026-01-01', target: '2026-06-01' }),
        item({ id: 'b', group: 'Money', subGroup: 'Learn', start: '2026-01-01', target: '2026-06-01' }),
      ],
      { todayDay: TODAY_DAY, pxPerDay: 2, groupOrder: [], subGroupOrder: [] },
    );
    expect(lanes.length).toBe(2);
    expect(lanes.every((l) => l.rows.length === 1)).toBe(true);
  });

  it('caps rows and counts the overflow instead of dropping it', () => {
    const pile = Array.from({ length: 8 }, (_, i) =>
      item({ id: `p${i}`, start: '2026-01-01', target: '2026-12-01' }),
    );
    const lanes = packLanes(pile, {
      todayDay: TODAY_DAY,
      pxPerDay: 0.3,
      groupOrder: [],
      maxRows: 3,
    });
    expect(lanes[0]!.rows.length).toBe(3);
    expect(lanes[0]!.overflow.length).toBe(5);
  });

  it('estimates label width by character count', () => {
    expect(estTextWidth('abcde')).toBeCloseTo(5 * 6.4 + 8);
  });
});
