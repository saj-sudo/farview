import { describe, expect, it } from 'vitest';
import { dayNumber } from '../../../src/engine/dates';
import {
  clampView,
  clampZoom,
  createScale,
  defaultView,
  pan,
  presetFor,
  zoomTo,
  ZOOM_PRESETS,
} from '../../../src/engine/timeline/scale';
import type { LocalDate } from '../../../src/engine/types';

const TODAY_DAY = dayNumber('2026-08-25' as LocalDate);

describe('scale', () => {
  it('round-trips pixels and days', () => {
    const scale = createScale({ centerDay: TODAY_DAY, daysVisible: 365 }, 1000);
    for (const day of [TODAY_DAY, TODAY_DAY - 100.5, TODAY_DAY + 42]) {
      expect(scale.dayAt(scale.xOf(day))).toBeCloseTo(day, 6);
    }
    expect(scale.pxPerDay).toBeCloseTo(1000 / 365);
  });

  it('opens on ~6 months back, 12 forward — now-line a third in', () => {
    const view = defaultView(TODAY_DAY);
    const scale = createScale(view, 900);
    expect(scale.startDay).toBeCloseTo(TODAY_DAY - 183);
    expect(scale.endDay).toBeCloseTo(TODAY_DAY + 365);
    expect(scale.xOf(TODAY_DAY) / 900).toBeCloseTo(183 / 548, 2);
  });

  it('pans by pixel delta, dragging the past into view', () => {
    const view = { centerDay: TODAY_DAY, daysVisible: 100 };
    const panned = pan(view, 250, 1000); // drag right 250px = 25 days back
    expect(panned.centerDay).toBeCloseTo(TODAY_DAY - 25);
  });

  it('keeps the anchor day pinned through a zoom', () => {
    const view = { centerDay: TODAY_DAY, daysVisible: 365 };
    const width = 1000;
    const anchor = TODAY_DAY + 60;
    const before = createScale(view, width).xOf(anchor);
    for (const preset of ZOOM_PRESETS) {
      const zoomed = zoomTo(view, preset.days, anchor);
      expect(createScale(zoomed, width).xOf(anchor)).toBeCloseTo(before, 6);
      expect(zoomed.daysVisible).toBe(preset.days);
    }
  });

  it('clamps free zoom and wandering pans', () => {
    expect(clampZoom(1)).toBe(28);
    expect(clampZoom(1e9)).toBe(36530);
    const view = { centerDay: TODAY_DAY + 99999, daysVisible: 365 };
    const clamped = clampView(view, { minDay: TODAY_DAY - 10, maxDay: TODAY_DAY + 10 });
    expect(clamped.centerDay).toBe(TODAY_DAY + 10 + 365);
  });

  it('names the nearest preset for the chip UI', () => {
    expect(presetFor(91)).toBe('quarter');
    expect(presetFor(400)).toBe('year');
    expect(presetFor(1000)).toBe('threeYears');
    expect(presetFor(3000)).toBe('decade');
    expect(presetFor(20000)).toBe('decade');
  });
});
