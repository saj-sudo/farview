import { describe, expect, it } from 'vitest';

const urlOf = (u: string | URL | Request): string =>
  u instanceof Request ? u.url : String(u);
import {
  beginAuthorization,
  completeAuthorization,
  OAuthCallbackError,
  READ_SCOPE,
  WRITE_SCOPE,
  type KV,
} from '../../src/auth/oauth';
import { challengeS256, generateVerifier } from '../../src/auth/pkce';

function memoryKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

const metadataResponse = {
  ok: true,
  json: () =>
    Promise.resolve({
      authorization_endpoint: 'https://api.capacities.io/oauth/authorize',
      token_endpoint: 'https://api.capacities.io/oauth/token',
    }),
} as Response;

describe('PKCE primitives', () => {
  it('matches the RFC 7636 appendix B S256 vector', async () => {
    const challenge = await challengeS256(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    );
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generates 43-char base64url verifiers', () => {
    const v = generateVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateVerifier()).not.toBe(v);
  });
});

describe('scopes', () => {
  // The trust story: read-only is the DEFAULT. Editing exists, but only
  // as an explicit opt-in that requests the write scope separately. If a
  // change ever makes write the default, this failure is the alarm.
  it('keeps the default scope read-only', () => {
    expect(READ_SCOPE).toBe('api:read offline_access');
    expect(READ_SCOPE).not.toContain('write');
  });

  it('reserves the write scope for the explicit editing opt-in', () => {
    expect(WRITE_SCOPE).toBe('api:read api:write offline_access');
  });

  it('requests the write scope only when editing is asked for', async () => {
    const plain = new URL(
      await beginAuthorization({
        clientId: 'c',
        redirectUri: 'https://farview.dev/callback',
        storage: memoryKV(),
        fetchFn: () => Promise.resolve(metadataResponse),
      }),
    );
    expect(plain.searchParams.get('scope')).toBe(READ_SCOPE);

    const editing = new URL(
      await beginAuthorization({
        clientId: 'c',
        redirectUri: 'https://farview.dev/callback',
        storage: memoryKV(),
        editing: true,
        fetchFn: () => Promise.resolve(metadataResponse),
      }),
    );
    expect(editing.searchParams.get('scope')).toBe(WRITE_SCOPE);
  });

  it('carries the editing opt-in through the callback', async () => {
    const storage = memoryKV();
    await beginAuthorization({
      clientId: 'c',
      redirectUri: 'https://farview.dev/callback',
      storage,
      editing: true,
      fetchFn: () => Promise.resolve(metadataResponse),
    });
    const pending = JSON.parse(storage.map.get('farview.oauth.pending')!) as {
      state: string;
    };
    const fetchFn = ((url: string | URL | Request) => {
      if (urlOf(url).includes('.well-known')) return Promise.resolve(metadataResponse);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response);
    }) as typeof fetch;
    const result = await completeAuthorization({
      params: new URLSearchParams({ code: 'abc', state: pending.state }),
      clientId: 'c',
      redirectUri: 'https://farview.dev/callback',
      storage,
      fetchFn,
    });
    expect(result.editing).toBe(true);
  });
});

describe('beginAuthorization', () => {
  it('builds the §7.2 authorize URL, resource param included', async () => {
    const storage = memoryKV();
    const url = new URL(
      await beginAuthorization({
        clientId: 'client-123',
        redirectUri: 'https://farview.dev/callback',
        storage,
        fetchFn: () => Promise.resolve(metadataResponse),
      }),
    );
    expect(url.origin + url.pathname).toBe('https://api.capacities.io/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('scope')).toBe('api:read offline_access');
    expect(url.searchParams.get('resource')).toBe('https://api.capacities.io');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const pending = JSON.parse(storage.map.get('farview.oauth.pending')!) as {
      verifier: string;
      state: string;
    };
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(await challengeS256(pending.verifier)).toBe(
      url.searchParams.get('code_challenge'),
    );
  });
});

describe('completeAuthorization', () => {
  function pendingStorage(state: string): KV {
    const kv = memoryKV();
    kv.set(
      'farview.oauth.pending',
      JSON.stringify({ verifier: 'the-verifier', state }),
    );
    return kv;
  }

  it('exchanges the code with no Authorization header', async () => {
    let tokenRequest: { url: string; init: RequestInit } | null = null;
    const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
      const u = urlOf(url);
      if (u.includes('.well-known')) return Promise.resolve(metadataResponse);
      tokenRequest = { url: u, init: init! };
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
          }),
      } as Response);
    }) as typeof fetch;

    const tokens = await completeAuthorization({
      params: new URLSearchParams({ code: 'abc', state: 's1' }),
      clientId: 'client-123',
      redirectUri: 'https://farview.dev/callback',
      storage: pendingStorage('s1'),
      fetchFn,
    });

    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now() / 1000);

    const { url, init } = tokenRequest!;
    expect(url).toBe('https://api.capacities.io/oauth/token');
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain(
      'authorization',
    );
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(body.get('client_id')).toBe('client-123');
  });

  it('rejects a state mismatch', async () => {
    await expect(
      completeAuthorization({
        params: new URLSearchParams({ code: 'abc', state: 'evil' }),
        clientId: 'c',
        redirectUri: 'https://farview.dev/callback',
        storage: pendingStorage('good'),
        fetchFn: () => Promise.resolve(metadataResponse),
      }),
    ).rejects.toBeInstanceOf(OAuthCallbackError);
  });

  it('surfaces provider errors readably', async () => {
    await expect(
      completeAuthorization({
        params: new URLSearchParams({
          error: 'access_denied',
          error_description: 'The user said no.',
        }),
        clientId: 'c',
        redirectUri: 'https://farview.dev/callback',
        storage: memoryKV(),
        fetchFn: () => Promise.resolve(metadataResponse),
      }),
    ).rejects.toThrow('The user said no.');
  });

  it('falls back to documented endpoints when discovery is down', async () => {
    let tokenUrl = '';
    const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
      const u = urlOf(url);
      if (u.includes('.well-known')) return Promise.reject(new Error('offline'));
      tokenUrl = u;
      void init;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response);
    }) as typeof fetch;

    await completeAuthorization({
      params: new URLSearchParams({ code: 'abc', state: 's1' }),
      clientId: 'c',
      redirectUri: 'https://farview.dev/callback',
      storage: pendingStorage('s1'),
      fetchFn,
    });
    expect(tokenUrl).toBe('https://api.capacities.io/oauth/token');
  });
});
