import { describe, expect, it } from 'vitest';
import { DEMO_LINK_HASH, isDemoLink } from '../../src/app/session';

describe('the landing page demo link', () => {
  it('starts the demo only from its own fragment', () => {
    expect(DEMO_LINK_HASH).toBe('#demo');
    expect(isDemoLink('#demo')).toBe(true);
    expect(isDemoLink('')).toBe(false);
    expect(isDemoLink('#/timeline')).toBe(false);
    expect(isDemoLink('#demo2')).toBe(false);
  });
});
