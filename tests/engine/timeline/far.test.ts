import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../../src/engine/config';
import { addDays, dayNumber } from '../../../src/engine/dates';
import { resolveSchema } from '../../../src/engine/resolve';
import { estTextWidth } from '../../../src/engine/timeline/lanes';
import {
  FAR_ROW_H,
  farDate,
  farOccupied,
  layoutFarView,
  type FarBar,
} from '../../../src/engine/timeline/farLayout';
import {
  createFarScale,
  FAR_QUARTER_DAYS,
  FAR_RECENT_DAYS,
  FAR_YEAR_DAYS,
} from '../../../src/engine/timeline/farScale';
import type { LocalDate, TimelineItem } from '../../../src/engine/types';
import { memoryCache } from '../../../src/pipeline/cache';
import { loadCollectionTags, loadTimelineData } from '../../../src/pipeline/load';
import { buildEmptySpace } from '../../../src/providers/fixture/emptySpace';
import { FixtureProvider } from '../../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../../src/providers/fixture/minimalSpace';
import {
  buildStrangersSpace,
  strangersDemoConfig,
} from '../../../src/providers/fixture/strangersSpace';

const TODAY = '2026-11-19' as LocalDate;
const TODAY_DAY = dayNumber(TODAY);

describe('far scale', () => {
  for (const [name, width, narrow] of [['desktop', 1000, false], ['phone', 358, true]] as const) {
    const scale = createFarScale(TODAY, width, narrow);

    it(`covers 60 days back to 1 January ten years on (${name})`, () => {
      expect(scale.startDay).toBe(TODAY_DAY - FAR_RECENT_DAYS);
      expect(scale.endDay).toBe(dayNumber('2036-01-01' as LocalDate));
      expect(scale.xOf(scale.startDay)).toBeCloseTo(0, 6);
      expect(scale.xOf(scale.endDay)).toBeCloseTo(width, 6);
    });

    it(`puts the seams at today, a quarter out and a year after that (${name})`, () => {
      const [recent, quarter, year, decade] = scale.segments;
      expect(recent!.endDay).toBe(TODAY_DAY);
      expect(quarter!.endDay).toBe(TODAY_DAY + FAR_QUARTER_DAYS);
      expect(year!.endDay).toBe(TODAY_DAY + FAR_QUARTER_DAYS + FAR_YEAR_DAYS);
      expect(decade!.x1).toBeCloseTo(width, 6);
      // Near time is wide: the quarter is denser than the year, the year than the decade.
      const density = scale.segments.map((s) => (s.x1 - s.x0) / (s.endDay - s.startDay));
      expect(density[1]!).toBeGreaterThan(density[2]!);
      expect(density[2]!).toBeGreaterThan(density[3]!);
    });

    it(`is monotonic and round-trips, inside the window and past both ends (${name})`, () => {
      let last = -Infinity;
      for (let day = scale.startDay - 500; day <= scale.endDay + 500; day += 37) {
        const x = scale.xOf(day);
        expect(x).toBeGreaterThan(last);
        expect(scale.dayAt(x)).toBeCloseTo(day, 5);
        last = x;
      }
    });
  }
});

describe('far dates', () => {
  it('uses fewer words the further away a date is', () => {
    expect(farDate(addDays(TODAY, 90), TODAY)).toBe('Feb 17');
    expect(farDate(addDays(TODAY, 240), TODAY)).toBe('Jul 17, 2027');
    expect(farDate(addDays(TODAY, 700), TODAY)).toBe('Oct 2028');
    expect(farDate('2034-01-01' as LocalDate, TODAY)).toBe('2034');
  });
});

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
  const latest = new Map(items.map((i) => [i.id, i]));
  return { items: [...latest.values()], resolved };
}

const spaces = {
  "the stranger's space": async () =>
    itemsOf(new FixtureProvider(buildStrangersSpace(TODAY)), normalizeConfig(strangersDemoConfig() as object)),
  'the minimal space': async () =>
    itemsOf(
      new FixtureProvider(buildMinimalSpace(TODAY)),
      normalizeConfig({
        types: { project: 'Undertaking' },
        properties: { projectStart: null, projectTarget: 'By When', projectStatus: null, projectMilestones: null },
      }),
    ),
  'the empty space': async () =>
    itemsOf(new FixtureProvider(buildEmptySpace()), normalizeConfig({ types: { project: 'Project' } })),
};

const labelText = (b: FarBar): string => b.label.text + (b.label.meta ? ` · ${b.label.meta}` : '');
const labelBox = (b: FarBar): [number, number] => {
  const w = estTextWidth(labelText(b));
  return b.label.anchor === 'end' ? [b.label.x - w, b.label.x] : [b.label.x, b.label.x + w];
};

describe.each(Object.entries(spaces))('far view on %s', (_name, build) => {
  describe.each([358, 960, 1400])('at %ipx', (width) => {
    const lay = async () => {
      const { items, resolved } = await build();
      const layout = layoutFarView(items, {
        width,
        today: TODAY,
        groupOrder: resolved.groupValues,
        narrow: width <= 720,
      });
      const drawn = [...layout.bars, ...layout.groups.flatMap((g) => (g.goal ? [g.goal] : []))];
      return { items, layout, drawn };
    };

    it('draws every dated item once and leaves undated ones to the Someday tray', async () => {
      const { items, layout, drawn } = await lay();
      const dated = items.filter((i) => i.start !== null || i.target !== null || i.derived !== null);
      expect(drawn.map((b) => b.item.id).sort()).toEqual(dated.map((i) => i.id).sort());
      expect(layout.groups.reduce((n, g) => n + g.count, 0)).toBe(layout.bars.length);
    });

    it('labels every item, inside the chart', async () => {
      const { drawn } = await lay();
      for (const bar of drawn) {
        expect(bar.label.text.length).toBeGreaterThan(0);
        expect(bar.label.text).not.toBe('…');
        const [left, right] = labelBox(bar);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(width);
      }
    });

    it('keeps every mark inside the chart', async () => {
      const { layout, drawn } = await lay();
      for (const bar of drawn) {
        expect(bar.x).toBeGreaterThanOrEqual(0);
        expect(bar.x + bar.w).toBeLessThanOrEqual(width + 0.001);
        expect(bar.y + bar.h).toBeLessThan(layout.height);
      }
    });

    it('never lets two entries on a row touch', async () => {
      const { layout } = await lay();
      const rows = new Map<number, FarBar[]>();
      for (const bar of layout.bars) {
        const list = rows.get(bar.y) ?? [];
        list.push(bar);
        rows.set(bar.y, list);
      }
      for (const row of rows.values()) {
        const spans = row.map((b) => farOccupied(b)).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i += 1) {
          expect(spans[i]![0]).toBeGreaterThan(spans[i - 1]![1]);
        }
      }
    });

    it('states facts without guilt or a percentage', async () => {
      const { drawn } = await lay();
      for (const bar of drawn) {
        expect(labelText(bar)).not.toMatch(/overdue|late|behind|%/i);
      }
    });

    it('keeps the axis labels clear of the today label and of each other', async () => {
      const { layout } = await lay();
      const boxes = [
        [layout.today.x, layout.today.x + layout.today.w],
        ...layout.axis.map((a) => [a.x, a.x + a.w]),
      ].sort((a, b) => a[0]! - b[0]!);
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i]![0]!).toBeGreaterThanOrEqual(boxes[i - 1]![1]!);
      }
      expect(layout.today.x).toBeGreaterThanOrEqual(0);
      expect(layout.today.x + layout.today.w).toBeLessThanOrEqual(width);
    });
  });
});

describe("far view of the stranger's space", () => {
  const lay = async (width: number) => {
    const { items, resolved } = await spaces["the stranger's space"]();
    return layoutFarView(items.filter((i) => i.status !== 'done'), {
      width,
      today: TODAY,
      groupOrder: resolved.groupValues,
      narrow: width <= 720,
    });
  };
  const named = (layout: Awaited<ReturnType<typeof lay>>, title: string) =>
    layout.bars.filter((b) => b.item.title === title);

  it('puts the nearest goal first and the goalless projects last', async () => {
    const layout = await lay(1000);
    expect(layout.groups.map((g) => g.goal?.item.title ?? g.title)).toEqual([
      'Race the Spring Tide',
      'Chart the Inland Waterways',
      'Reach the Coral Atoll',
      'Circumnavigate',
      'No goal yet',
    ]);
  });

  it('hangs a goal\'s projects from its pole', async () => {
    const layout = await lay(1000);
    const atoll = layout.groups.find((g) => g.goal?.item.title === 'Reach the Coral Atoll')!;
    expect(atoll.goal!.kind).toBe('flag');
    expect(atoll.count).toBe(2);
    for (const title of ['Rebuild the Mainstay', 'Cut the New Suit of Sails']) {
      const bar = named(layout, title)[0]!;
      expect(bar.connectorX).toBe(atoll.poleX);
      expect(bar.y).toBeGreaterThan(atoll.y);
      expect(bar.y).toBeLessThan(atoll.y + atoll.height);
    }
    expect(atoll.poleBottom).toBeGreaterThan(atoll.y + FAR_ROW_H);
  });

  it('shows a goal ten years out, which the old decade zoom cut off', async () => {
    for (const width of [358, 1000]) {
      const layout = await lay(width);
      const far = layout.groups.find((g) => g.goal?.item.title === 'Circumnavigate')!.goal!;
      expect(far.x).toBeGreaterThan(width * 0.8);
      expect(far.x).toBeLessThan(width);
      expect(far.clampedRight).toBe(false);
      expect(far.label.meta).toBe('2034');
    }
  });

  it('says what the dates are in words', async () => {
    const layout = await lay(1000);
    const meta = (title: string) => named(layout, title).map((b) => b.label.meta);
    expect(meta('Rebuild the Mainstay')).toEqual(['to Feb 17']);
    expect(meta('Re-plank the Hull')).toEqual(['since Oct 2025, to Oct 2028']);
    expect(meta('Sort the Rigging Loft')).toEqual(['no end date']);
    expect(meta('Redraw the Mooring Chart')).toEqual(['Nov 24, dates reversed']);
    expect(meta('Repaint the Tender').sort()).toEqual(['Nov 29 to Jan 13', 'target passed Nov 7']);
    const inland = layout.groups.find((g) => g.goal?.item.title === 'Chart the Inland Waterways')!.goal!;
    expect(inland.kind).toBe('span');
    expect(inland.label.meta).toBe('no target date');
  });

  it('keeps an item with a status it does not know', async () => {
    const layout = await lay(1000);
    expect(named(layout, 'Careen the Skiff')).toHaveLength(1);
  });

  it('marks a passed target as a fact and a start before the window as clamped', async () => {
    const layout = await lay(1000);
    const tender = named(layout, 'Repaint the Tender').find((b) => b.passed)!;
    expect(tender.x).toBeLessThan(layout.nowX);
    expect(named(layout, 'Re-plank the Hull')[0]!.clampedLeft).toBe(true);
  });
});
