import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCredential, loadCredential, saveCredential } from '../../src/auth/tokens';

const KEY = 'farview.credential';

function stubStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

describe('stored credentials are OAuth only', () => {
  let map: Map<string, string>;
  beforeEach(() => {
    map = stubStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips an OAuth credential', () => {
    saveCredential({ kind: 'oauth', accessToken: 'a', refreshToken: 'r' });
    expect(loadCredential()).toMatchObject({ kind: 'oauth', accessToken: 'a', refreshToken: 'r' });
    clearCredential();
    expect(loadCredential()).toBeNull();
  });

  it('drops a personal API token left behind by an earlier build', () => {
    map.set(KEY, JSON.stringify({ kind: 'token', apiToken: 'cap-api-old' }));
    expect(loadCredential()).toBeNull();
    expect(map.has(KEY)).toBe(false);
  });

  it('treats corrupt storage as signed out', () => {
    map.set(KEY, '{not json');
    expect(loadCredential()).toBeNull();
  });
});
