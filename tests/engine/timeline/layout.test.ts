import { describe, expect, it } from 'vitest';
import { dayNumber } from '../../../src/engine/dates';
import {
  AXIS_H,
  BAR_H,
  layoutTimeline,
} from '../../../src/engine/timeline/layout';
import { defaultView } from '../../../src/engine/timeline/scale';
import type { LocalDate, TimelineItem } from '../../../src/engine/types';

const TODAY = '2026-08-25' as LocalDate;
const TODAY_DAY = dayNumber(TODAY);
const WIDTH = 1000;

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
    tags: [],
    flags: { targetBeforeStart: false },
    milestoneIds: [],
    horizonLabel: null,
    ...overrides,
  };
}

function lay(items: TimelineItem[], daysVisible = 548) {
  return layoutTimeline(items, {
    view: { ...defaultView(TODAY_DAY), daysVisible },
    width: WIDTH,
    today: TODAY,
    groupOrder: [],
  });
}

describe('layoutTimeline', () => {
  it('puts the now-line where today is', () => {
    const layout = lay([]);
    expect(layout.scale.dayAt(layout.nowX)).toBeCloseTo(TODAY_DAY, 6);
    expect(layout.height).toBeGreaterThanOrEqual(AXIS_H);
  });

  it('fills bars by elapsed time, never completion', () => {
    const layout = lay([
      item({ id: 'half', start: '2026-08-15', target: '2026-09-04' }), // 10 of 20 days
      item({ id: 'fresh', start: '2026-09-01', target: '2026-10-01' }), // not started
      item({ id: 'done', start: '2026-05-01', target: '2026-09-20', status: 'done' }),
    ]);
    const by = new Map(layout.bars.map((b) => [b.item.id, b]));
    expect(by.get('half')!.elapsedFrac).toBeCloseTo(0.5);
    expect(by.get('fresh')!.elapsedFrac).toBe(0);
    expect(by.get('done')!.elapsedFrac).toBe(1);
    expect(by.get('done')!.done).toBe(true);
  });

  it('marks overdue with a flag, renders reversed dates as points', () => {
    const layout = lay([
      item({ id: 'late', start: '2026-07-01', target: '2026-08-01' }),
      item({
        id: 'reversed',
        start: '2026-09-10',
        target: '2026-09-01',
        flags: { targetBeforeStart: true },
      }),
      item({ id: 'deadline', target: '2026-10-01' }),
      item({ id: 'open', start: '2026-07-20' }),
    ]);
    const by = new Map(layout.bars.map((b) => [b.item.id, b]));
    expect(by.get('late')!.overdue).toBe(true);
    expect(by.get('reversed')!.kind).toBe('point');
    expect(by.get('deadline')!.kind).toBe('point');
    expect(by.get('deadline')!.overdue).toBe(false);
    expect(by.get('open')!.kind).toBe('openEnded');
    expect(by.get('open')!.elapsedFrac).toBe(1);
  });

  it('clamps multi-year bars to the window with continuation flags', () => {
    const layout = lay([
      item({ id: 'epic', start: '2025-01-01', target: '2028-12-01' }),
    ]);
    const epic = layout.bars.find((b) => b.item.id === 'epic')!;
    expect(epic.clampedLeft).toBe(true);
    expect(epic.clampedRight).toBe(true);
    expect(epic.x).toBe(-8);
    expect(epic.x + epic.w).toBeLessThanOrEqual(WIDTH + 8);
  });

  it('collapses to dots at decade density and hides narrow labels', () => {
    const layout = lay(
      [item({ id: 'short', start: '2026-09-01', target: '2026-09-20' })],
      3653, // decade window: ~0.27 px/day
    );
    const short = layout.bars.find((b) => b.item.id === 'short')!;
    expect(short.kind).toBe('dot');
    expect(short.label.placement).toBe('hidden');
  });

  it('places labels inside wide bars and outside narrow ones', () => {
    const layout = lay([
      item({ id: 'wide', title: 'Wide', start: '2026-03-01', target: '2027-03-01' }),
      item({ id: 'narrow', title: 'A narrow little bar', start: '2026-09-01', target: '2026-09-08' }),
    ]);
    const by = new Map(layout.bars.map((b) => [b.item.id, b]));
    expect(by.get('wide')!.label.placement).toBe('inside');
    expect(by.get('narrow')!.label.placement).toBe('right');
  });

  it('gives goals their own top lane and lanes vertical order', () => {
    const layout = lay([
      item({ id: 'g', kind: 'goal', target: '2027-01-01', group: 'hull' }),
      item({ id: 'p', group: 'hull', start: '2026-08-01', target: '2026-10-01' }),
    ]);
    expect(layout.lanes[0]!.label).toBe('Goals');
    expect(layout.lanes[1]!.label).toBe('hull');
    expect(layout.lanes[0]!.y).toBeLessThan(layout.lanes[1]!.y);
    const goalBar = layout.bars.find((b) => b.item.id === 'g')!;
    const projBar = layout.bars.find((b) => b.item.id === 'p')!;
    expect(goalBar.y).toBeLessThan(projBar.y);
    expect(projBar.h).toBe(BAR_H);
  });

  it('culls far-off-screen items but keeps row positions stable', () => {
    const inView = item({ id: 'in', start: '2026-08-01', target: '2026-10-01' });
    const farAway = item({ id: 'far', start: '2031-01-01', target: '2031-06-01' });
    const layout = lay([inView, farAway], 91); // quarter window
    expect(layout.bars.some((b) => b.item.id === 'far')).toBe(false);
    expect(layout.bars.some((b) => b.item.id === 'in')).toBe(true);
    expect(layout.lanes[0]!.count).toBe(2); // still counted in the lane
  });
});
