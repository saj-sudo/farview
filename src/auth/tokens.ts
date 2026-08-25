import type { StoredTokens } from './oauth';

/**
 * Credential persistence (spec §7.3). Two kinds:
 *
 *  - 'oauth'  — the primary flow: PKCE tokens, auto-refreshed by the SDK.
 *  - 'token'  — a personal API token the user created themselves in
 *    Capacities (Settings → Capacities API). Secondary by design: OAuth
 *    is what the public site leads with, but a personal token lets
 *    anyone run their own build against their own space today.
 *
 * Either way the credential lives in this browser only and never reaches
 * any server the maintainer controls — there is no server. Browser
 * storage is reachable by any script on the page, which is why the app
 * bundles everything, loads no third-party scripts, and ships a strict
 * CSP. The blast radius is smaller than for most tools because the
 * token is read-only; the tradeoff is documented in the README rather
 * than hidden.
 */

export type StoredCredential =
  | ({ kind: 'oauth' } & StoredTokens)
  | { kind: 'token'; apiToken: string };

const TOKEN_KEY = 'farview.credential';

export function loadCredential(): StoredCredential | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed['kind'] === 'token' && typeof parsed['apiToken'] === 'string') {
      return { kind: 'token', apiToken: parsed['apiToken'] };
    }
    if (
      parsed['kind'] === 'oauth' &&
      typeof parsed['accessToken'] === 'string' &&
      typeof parsed['refreshToken'] === 'string'
    ) {
      return {
        kind: 'oauth',
        accessToken: parsed['accessToken'],
        refreshToken: parsed['refreshToken'],
        ...(typeof parsed['expiresAt'] === 'number'
          ? { expiresAt: parsed['expiresAt'] }
          : {}),
      };
    }
  } catch {
    // corrupt or unavailable storage → treat as signed out
  }
  return null;
}

export function saveCredential(credential: StoredCredential): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(credential));
  } catch {
    // Private windows can refuse writes; the session still works until reload.
  }
}

export function clearCredential(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to do
  }
}
