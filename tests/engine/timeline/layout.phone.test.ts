import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/engine/config';
import { dayNumber } from '../../../src/engine/dates';
import { resolveSchema } from '../../../src/engine/resolve';
import { axisLabels, todayPill } from '../../../src/engine/timeline/edges';
import { estTextWidth } from '../../../src/engine/timeline/lanes';
import {
  BAR_H,
  LABEL_ABOVE_H,
  labelBox,
  layoutTimeline,
  occupiedPx,
  TOP_PAD,
  TOUCH_BAR_H,
  TOUCH_TOP_PAD,
  type BarGeometry,
  type TimelineLayout,
} from '../../../src/engine/timeline/layout';
import { createScale, windowAroundToday } from '../../../src/engine/timeline/scale';
import { generateTicks } from '../../../src/engine/timeline/ticks';
import type { LocalDate, TimelineItem } from '../../../src/engine/types';
import { parsePhoneView } from '../../../src/app/phoneView';
import { memoryCache } from '../../../src/pipeline/cache';
import { loadCollectionTags, loadTimelineData } from '../../../src/pipeline/load';
import { buildEmptySpace } from '../../../src/providers/fixture/emptySpace';
import { FixtureProvider } from '../../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../../src/providers/fixture/minimalSpace';
import {
  buildStrangersSpace,
  strangersDemoConfig,
} from '../../../src/providers/fixture/strangersSpace';

// The phone timeline: a quarter-wide window about 358px across, with bars a
// finger can hit. Run against every fixture space, since the layout has to
// hold for whatever schema a space has.

const TODAY = '2026-08-25' as LocalDate;
const TODAY_DAY = dayNumber(TODAY);
const PHONE_WIDTH = 358;

async function itemsOf(provider: FixtureProvider, config: ReturnType<typeof normalizeConfig>) {
  const resolved = resolveSchema(
    config,
    await provider.listStructures(),
    await provider.listTags(),
    await loadCollectionTags(provider, config),
  );
  const items: TimelineItem[] = [];
  await loadTimelineData(
    { provider, cache: memoryCache(), config, resolved, backoff: { sleep: () => Promise.resolve() } },
    { onItems: (batch) => items.push(...batch), onProgress: () => undefined, onWarning: () => undefined },
  );
  // The derived-span pass re-emits items, so keep the last copy of each.
  const latest = new Map(items.map((i) => [i.id, i]));
  return { items: [...latest.values()].filter((i) => i.start !== null || i.target !== null || i.derived !== null), resolved };
}

const spaces = {
  'the stranger\'s space': async () =>
    itemsOf(
      new FixtureProvider(buildStrangersSpace(TODAY)),
      normalizeConfig(strangersDemoConfig() as object),
    ),
  'the minimal space': async () =>
    itemsOf(
      new FixtureProvider(buildMinimalSpace(TODAY)),
      normalizeConfig({
        types: { project: 'Undertaking' },
        properties: {
          projectStart: null,
          projectTarget: 'By When',
          projectStatus: null,
          projectMilestones: null,
        },
      }),
    ),
  'the empty space': async () =>
    itemsOf(new FixtureProvider(buildEmptySpace()), normalizeConfig({ types: { project: 'Project' } })),
};

describe.each(Object.entries(spaces))('phone layout on %s', (_name, build) => {
  const view = windowAroundToday(TODAY_DAY, 91);

  const lay = async (barHeight?: number) => {
    const { items, resolved } = await build();
    return layoutTimeline(items, {
      view,
      width: PHONE_WIDTH,
      today: TODAY,
      groupOrder: resolved.groupValues,
      subGroupOrder: resolved.subGroupValues,
      ...(barHeight !== undefined ? { barHeight, topPad: TOUCH_TOP_PAD } : {}),
    });
  };

  it('keeps today inside the quarter window', async () => {
    const layout = await lay(TOUCH_BAR_H);
    expect(layout.nowX).toBeGreaterThan(0);
    expect(layout.nowX).toBeLessThan(PHONE_WIDTH);
    expect(layout.scale.pxPerDay).toBeCloseTo(PHONE_WIDTH / 91, 6);
  });

  it('draws every bar at the touch height, and none at the pointer height', async () => {
    const layout = await lay(TOUCH_BAR_H);
    for (const bar of layout.bars) expect(bar.h).toBe(TOUCH_BAR_H);
    for (const bar of (await lay()).bars) expect(bar.h).toBe(BAR_H);
  });

  it('grows every drawn row by the extra bar height and moves nothing sideways', async () => {
    const small = await lay();
    const big = await lay(TOUCH_BAR_H);
    expect(big.bars.length).toBe(small.bars.length);
    const drawnRows = new Set(big.bars.map((b) => b.y)).size;
    // Each drawn row is taller by the bar difference, and the top strip adds its own.
    expect(big.height - small.height).toBeGreaterThanOrEqual(
      (TOUCH_BAR_H - BAR_H) * drawnRows + (TOUCH_TOP_PAD - TOP_PAD),
    );
    small.bars.forEach((bar, i) => {
      expect(big.bars[i]!.x).toBeCloseTo(bar.x, 6);
      expect(big.bars[i]!.w).toBeCloseTo(bar.w, 6);
    });
  });

  it('leaves a strip above the first lane for the today label', async () => {
    const layout = await lay(TOUCH_BAR_H);
    const first = layout.lanes[0];
    if (first) expect(first.y).toBeGreaterThanOrEqual(TOUCH_TOP_PAD);
  });

  // What the phone really draws: touch bars with labels on their own line.
  const layPhone = async (width: number, days: number): Promise<TimelineLayout> => {
    const { items, resolved } = await build();
    return layoutTimeline(items, {
      view: windowAroundToday(TODAY_DAY, days),
      width,
      today: TODAY,
      groupOrder: resolved.groupValues,
      subGroupOrder: resolved.subGroupValues,
      barHeight: TOUCH_BAR_H,
      topPad: TOUCH_TOP_PAD,
      labelsAbove: true,
    });
  };
  const rowsOf = (layout: TimelineLayout): BarGeometry[][] => {
    const rows = new Map<number, BarGeometry[]>();
    for (const bar of layout.bars) rows.set(bar.y, [...(rows.get(bar.y) ?? []), bar]);
    return [...rows.values()];
  };
  const SIZES = [
    [358, 91],
    [412, 91],
    [358, 182],
    [412, 365],
  ] as const;

  it.each(SIZES)('never lets two labels in a row touch, at %ipx over %i days', async (width, days) => {
    const layout = await layPhone(width, days);
    for (const row of rowsOf(layout)) {
      const boxes = row
        .map((bar) => labelBox(bar))
        .filter((b): b is [number, number] => b !== null)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i]![0]).toBeGreaterThanOrEqual(boxes[i - 1]![1]);
      }
      // Nor a label and another item's bar: each item's whole footprint is its own.
      const spans = row.map((bar) => occupiedPx(bar)).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i += 1) {
        expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1]);
      }
    }
  });

  it.each(SIZES)('keeps every label inside the chart, at %ipx over %i days', async (width, days) => {
    const layout = await layPhone(width, days);
    for (const bar of layout.bars) {
      const { placement, text, x } = bar.label;
      expect(['inside', 'above', 'hidden']).toContain(placement);
      if (placement === 'hidden') continue;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + estTextWidth(text)).toBeLessThanOrEqual(width);
    }
  });

  it('gives a label above its bar a line of its own, clear of the row above', async () => {
    const layout = await layPhone(358, 91);
    const above = layout.bars.filter((b) => b.label.placement === 'above');
    for (const bar of above) {
      const lane = layout.lanes.find((l) => bar.y >= l.y && bar.y < l.y + l.height)!;
      expect(bar.y - LABEL_ABOVE_H).toBeGreaterThanOrEqual(lane.y + 26);
      for (const other of layout.bars) {
        if (other.y < bar.y) expect(other.y + other.h).toBeLessThanOrEqual(bar.y - LABEL_ABOVE_H);
      }
    }
  });

  it.each(SIZES)('keeps axis labels inside the chart and apart, at %ipx over %i days', (width, days) => {
    const scale = createScale(windowAroundToday(TODAY_DAY, days), width);
    const ticks = generateTicks(scale.startDay, scale.endDay, scale.pxPerDay);
    const labels = axisLabels(ticks.ticks, (day) => scale.xOf(day), width);
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label, i) => {
      expect(label.x).toBeGreaterThanOrEqual(2);
      expect(label.x + label.w).toBeLessThanOrEqual(width - 2);
      if (i > 0) expect(label.x).toBeGreaterThanOrEqual(labels[i - 1]!.x + labels[i - 1]!.w);
    });
  });

  it('keeps lane headers clear of the bars below them', async () => {
    const layout = await lay(TOUCH_BAR_H);
    for (const lane of layout.lanes) {
      const first = layout.bars.filter((b) => b.y >= lane.y && b.y < lane.y + lane.height);
      for (const bar of first) expect(bar.y).toBeGreaterThanOrEqual(lane.y + 26);
    }
  });
});

describe('windowAroundToday', () => {
  it('puts today a third of the way in', () => {
    const view = windowAroundToday(TODAY_DAY, 91);
    const start = view.centerDay - view.daysVisible / 2;
    expect(TODAY_DAY - start).toBeCloseTo(91 / 3, 6);
    expect(view.daysVisible).toBe(91);
  });
});

describe('the today pill', () => {
  it('stays inside the chart at either edge, with its text centred on it', () => {
    for (const nowX of [-20, 0, 10, 46, 179, 340, 358, 400]) {
      const pill = todayPill(nowX, 358);
      expect(pill.x).toBeGreaterThanOrEqual(2);
      expect(pill.x + pill.w).toBeLessThanOrEqual(358 - 2);
      expect(pill.textX).toBeCloseTo(pill.x + pill.w / 2, 6);
    }
    // In the open middle it centres on the line.
    expect(todayPill(179, 358).textX).toBeCloseTo(179, 6);
  });
});

describe('axis labels at the edges', () => {
  it('pulls a label in from the right edge and drops one that would overlap', () => {
    const ticks = [
      { day: 0, level: 'minor' as const, label: 'Jan' },
      { day: 1, level: 'minor' as const, label: 'Feb' },
      { day: 99, level: 'major' as const, label: '2027' },
    ];
    const labels = axisLabels(ticks, (d) => d * 3, 300);
    expect(labels.map((l) => l.label)).toEqual(['Jan', '2027']);
    expect(labels[1]!.x + labels[1]!.w).toBeLessThanOrEqual(298);
  });

  it('lets a major label push out a minor one it would collide with', () => {
    const ticks = [
      { day: 10, level: 'minor' as const, label: 'Nov' },
      { day: 12, level: 'major' as const, label: '2027' },
    ];
    expect(axisLabels(ticks, (d) => d * 3, 300).map((l) => l.label)).toEqual(['2027']);
  });
});

describe('the remembered phone view', () => {
  it('is the chart unless the list was chosen', () => {
    expect(parsePhoneView('timeline')).toBe('timeline');
    expect(parsePhoneView('list')).toBe('list');
    expect(parsePhoneView(null)).toBe('timeline');
    expect(parsePhoneView('garbage')).toBe('timeline');
  });
});
