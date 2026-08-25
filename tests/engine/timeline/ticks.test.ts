import { describe, expect, it } from 'vitest';
import { dayNumber } from '../../../src/engine/dates';
import { generateTicks, unitFor } from '../../../src/engine/timeline/ticks';
import type { LocalDate } from '../../../src/engine/types';

const day = (d: string) => dayNumber(d as LocalDate);

describe('unit selection by density', () => {
  it('condenses as pixels per day shrink', () => {
    expect(unitFor(10)).toBe('week');
    expect(unitFor(6)).toBe('week');
    expect(unitFor(3)).toBe('month');
    expect(unitFor(1.2)).toBe('month');
    expect(unitFor(0.6)).toBe('quarter');
    expect(unitFor(0.35)).toBe('quarter');
    expect(unitFor(0.2)).toBe('multiyear');
  });
});

describe('quarter-zoom (week unit)', () => {
  // 91 days over 1000px ≈ 11 px/day.
  const set = generateTicks(day('2026-07-01'), day('2026-09-30'), 11);

  it('labels month starts, with the year on the first and on January', () => {
    const majors = set.ticks.filter((t) => t.level === 'major');
    expect(majors.map((t) => t.label)).toEqual(['July 2026', 'August', 'September']);
  });

  it('marks Mondays as unlabeled minors', () => {
    const minors = set.ticks.filter((t) => t.level === 'minor');
    expect(minors.length).toBeGreaterThan(10);
    expect(minors.every((t) => t.label === null)).toBe(true);
  });

  it('produces weekend stripes and alternating month bands', () => {
    expect(set.weekendBands.length).toBeGreaterThan(10);
    expect(set.bands.map((b) => b.alt)).toEqual([false, true, false]);
  });
});

describe('year-zoom (month unit)', () => {
  const set = generateTicks(day('2026-01-15'), day('2026-12-15'), 2.7);

  it('majors carry quarter+year, minors the other months', () => {
    const majors = set.ticks.filter((t) => t.level === 'major');
    expect(majors.map((t) => t.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026']);
    const minorLabels = set.ticks.filter((t) => t.level === 'minor').map((t) => t.label);
    expect(minorLabels).toContain('Feb');
    expect(minorLabels).not.toContain('Jan');
  });
});

describe('three-year zoom (quarter unit)', () => {
  const set = generateTicks(day('2025-06-01'), day('2028-06-01'), 0.9);

  it('majors on year starts across New Year, minors on quarters', () => {
    const majors = set.ticks.filter((t) => t.level === 'major');
    // 2025 is the floor boundary before the window start: its band must
    // begin off-screen so the shading has no gap at the left edge.
    expect(majors.map((t) => t.label)).toEqual(['2025', '2026', '2027', '2028']);
    const minors = set.ticks.filter((t) => t.level === 'minor');
    expect(minors.map((t) => t.label)).toContain('Q3');
    expect(minors.every((t) => t.label !== 'Q1')).toBe(true); // Q1 = the year major
  });

  it('bands alternate by year parity', () => {
    for (const band of set.bands) {
      expect(typeof band.alt).toBe('boolean');
    }
    const alts = set.bands.map((b) => b.alt);
    for (let i = 1; i < alts.length; i += 1) expect(alts[i]).toBe(!alts[i - 1]);
  });
});

describe('decade zoom (multiyear unit)', () => {
  const set = generateTicks(day('2024-01-01'), day('2034-01-01'), 0.25);

  it('year bands carry the big numerals; half-decades are the majors', () => {
    expect(set.bands.map((b) => b.label)).toEqual([
      '2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031', '2032', '2033', '2034',
    ]);
    const majors = set.ticks.filter((t) => t.level === 'major');
    expect(majors.map((t) => t.label)).toEqual(['2025', '2030']);
    const minors = set.ticks.filter((t) => t.level === 'minor');
    expect(minors.every((t) => t.label === null)).toBe(true);
  });

  it('every band spans a full year and they tile the window', () => {
    for (let i = 1; i < set.bands.length; i += 1) {
      expect(set.bands[i]!.startDay).toBe(set.bands[i - 1]!.endDay);
    }
  });
});
