import { describe, expect, it } from 'vitest';
import {
  ConfigImportError,
  defaultConfig,
  exportConfig,
  importConfig,
  normalizeConfig,
} from '../../src/engine/config';

describe('defaults', () => {
  it('matches spec §6: project-only, derived horizons, timeline first', () => {
    const c = defaultConfig();
    expect(c.types.goal).toBeNull();
    expect(c.types.project).toBe('Project');
    expect(c.types.milestone).toBeNull();
    expect(c.horizons.mode).toBe('derived');
    expect(c.horizons.buckets.map((b) => b.label)).toEqual([
      'Now',
      'Quarter',
      'Year',
      'Long',
    ]);
    expect(c.horizons.buckets[3]!.maxDays).toBeNull();
    expect(c.display.defaultView).toBe('timeline');
    expect(c.display.showCompleted).toBe(false);
    expect(c.display.fetchCeiling).toBe(300);
    expect(c.display.cacheTtlMinutes).toBe(60);
    expect(c.display.timezone).toBeNull();
  });
});

describe('normalizeConfig', () => {
  it('turns any garbage into a complete valid config', () => {
    for (const junk of [null, undefined, 42, 'hello', [], { types: 'nope' }]) {
      expect(normalizeConfig(junk)).toEqual(defaultConfig());
    }
  });

  it('keeps valid fields and drops unknown ones', () => {
    const c = normalizeConfig({
      types: { project: 'Refit', goal: 'Voyage', bogus: 'x' },
      grouping: { by: 'tag', values: ['hull', 'sails'] },
      display: { fetchCeiling: 100 },
      surprise: true,
    });
    expect(c.types.project).toBe('Refit');
    expect(c.types.goal).toBe('Voyage');
    expect(c.grouping.by).toBe('tag');
    expect(c.grouping.values).toEqual(['hull', 'sails']);
    expect(c.display.fetchCeiling).toBe(100);
    expect('surprise' in c).toBe(false);
  });

  it('clamps numbers into sane ranges', () => {
    const c = normalizeConfig({
      display: { fetchCeiling: -5, cacheTtlMinutes: 1e9 },
    });
    expect(c.display.fetchCeiling).toBe(10);
    expect(c.display.cacheTtlMinutes).toBe(7 * 24 * 60);
  });

  it('sorts horizon buckets ascending with the catch-all last', () => {
    const c = normalizeConfig({
      horizons: {
        buckets: [
          { label: 'Long', maxDays: null },
          { label: 'Soon', maxDays: 14 },
          { label: 'Year', maxDays: 365 },
        ],
      },
    });
    expect(c.horizons.buckets.map((b) => b.label)).toEqual(['Soon', 'Year', 'Long']);
  });

  it('treats empty strings as unmapped', () => {
    const c = normalizeConfig({ types: { project: '  ' } });
    expect(c.types.project).toBeNull();
  });
});

describe('export / import', () => {
  it('round-trips a config', () => {
    const c = defaultConfig();
    c.types.project = 'Undertaking';
    expect(importConfig(exportConfig(c))).toEqual(c);
  });

  it('rejects non-JSON readably', () => {
    expect(() => importConfig('not json')).toThrow(ConfigImportError);
  });
});
