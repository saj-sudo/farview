import type { StoredTokens } from './oauth';

/**
 * Credential persistence (spec §7.3): OAuth only. PKCE tokens, auto-refreshed
 * by the SDK. Personal API tokens are not supported; one left in storage by an
 * earlier build is removed on load, and the visitor sees Connect again.
 *
 * The credential lives in this browser only and never reaches any server the
 * maintainer controls. Browser storage is reachable by any script on the
 * page, which is why the app bundles everything, loads no third-party scripts,
 * and ships a strict CSP. The tradeoff is documented in the README rather
 * than hidden.
 */

export type StoredCredential = { kind: 'oauth'; wantsWrite?: boolean } & StoredTokens;

const TOKEN_KEY = 'farview.credential';

export function loadCredential(): StoredCredential | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // wantsWrite records what the user explicitly opted into; absence
    // (older stored credentials included) means read-only.
    const wantsWrite = parsed['wantsWrite'] === true;
    if (parsed['kind'] === 'token') {
      // A personal token saved by an earlier build: not supported any more.
      localStorage.removeItem(TOKEN_KEY);
      return null;
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
        wantsWrite,
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
