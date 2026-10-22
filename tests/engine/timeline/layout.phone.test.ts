import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/engine/config';
import { dayNumber } from '../../../src/engine/dates';
import { resolveSchema } from '../../../src/engine/resolve';
import { BAR_H, layoutTimeline, TOP_PAD, TOUCH_BAR_H, TOUCH_TOP_PAD } from '../../../src/engine/timeline/layout';
import { windowAroundToday } from '../../../src/engine/timeline/scale';
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

describe('the remembered phone view', () => {
  it('is the list unless the timeline was chosen', () => {
    expect(parsePhoneView('timeline')).toBe('timeline');
    expect(parsePhoneView('list')).toBe('list');
    expect(parsePhoneView(null)).toBe('list');
    expect(parsePhoneView('garbage')).toBe('list');
  });
});
