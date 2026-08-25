import { challengeS256, generateState, generateVerifier } from './pkce';

/**
 * Browser-side OAuth 2.1 authorization-code flow against Capacities
 * (spec §7.2). Endpoints come from server metadata rather than being
 * hardcoded; the documented paths are only the fallback when discovery
 * is unreachable. There is no client secret — this is a public client —
 * and the token exchange sends no Authorization header.
 *
 * Scopes: read-only is the DEFAULT and the trust story — a plain
 * connect grants `api:read` and nothing else. Editing is an explicit,
 * separate opt-in that requests `api:write` too, and the consent
 * screen shows the difference. No code path may silently widen a
 * read-only connection. `offline_access` only adds the refresh token
 * so users are not asked to reauthorize daily.
 */

export const API_BASE = 'https://api.capacities.io';
export const READ_SCOPE = 'api:read offline_access';
export const WRITE_SCOPE = 'api:read api:write offline_access';

export interface ServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds, per the SDK's OAuthTokens contract. */
  expiresAt?: number;
}

/** Minimal storage seam so tests need no DOM. */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const PENDING_KEY = 'farview.oauth.pending';

type Fetch = typeof globalThis.fetch;

export async function fetchServerMetadata(
  fetchFn: Fetch = globalThis.fetch,
): Promise<ServerMetadata> {
  try {
    const res = await fetchFn(`${API_BASE}/.well-known/oauth-authorization-server`);
    if (res.ok) {
      const meta = (await res.json()) as Partial<ServerMetadata>;
      if (meta.authorization_endpoint && meta.token_endpoint) {
        return {
          authorization_endpoint: meta.authorization_endpoint,
          token_endpoint: meta.token_endpoint,
        };
      }
    }
  } catch {
    // fall through to documented defaults
  }
  return {
    authorization_endpoint: `${API_BASE}/oauth/authorize`,
    token_endpoint: `${API_BASE}/oauth/token`,
  };
}

/**
 * Build the authorize URL and stash the verifier+state for the callback
 * page. The caller navigates to the returned URL; the user logs in and
 * picks which space to authorize on Capacities' side.
 */
export async function beginAuthorization(opts: {
  clientId: string;
  redirectUri: string;
  storage: KV;
  /** Explicit opt-in only; defaults to the read-only scope. */
  editing?: boolean;
  fetchFn?: Fetch;
}): Promise<string> {
  const metadata = await fetchServerMetadata(opts.fetchFn);
  const verifier = generateVerifier();
  const state = generateState();
  const editing = opts.editing === true;
  opts.storage.set(PENDING_KEY, JSON.stringify({ verifier, state, editing }));

  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('scope', editing ? WRITE_SCOPE : READ_SCOPE);
  url.searchParams.set('resource', API_BASE);
  url.searchParams.set('code_challenge', await challengeS256(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
}

export class OAuthCallbackError extends Error {}

/**
 * Handle the redirect back from Capacities: verify state, exchange the
 * code for tokens. Send no Authorization header — public client.
 */
export async function completeAuthorization(opts: {
  params: URLSearchParams;
  clientId: string;
  redirectUri: string;
  storage: KV;
  fetchFn?: Fetch;
}): Promise<StoredTokens & { editing: boolean }> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const err = opts.params.get('error');
  if (err) {
    throw new OAuthCallbackError(
      opts.params.get('error_description') ?? `Authorization failed (${err}).`,
    );
  }
  const code = opts.params.get('code');
  const state = opts.params.get('state');
  if (!code || !state) {
    throw new OAuthCallbackError('The redirect is missing its code or state.');
  }

  const pendingRaw = opts.storage.get(PENDING_KEY);
  opts.storage.remove(PENDING_KEY);
  const pending = pendingRaw
    ? (JSON.parse(pendingRaw) as { verifier: string; state: string; editing?: boolean })
    : null;
  if (!pending || pending.state !== state) {
    throw new OAuthCallbackError(
      'This sign-in attempt does not match the one this browser started. ' +
        'Please connect again.',
    );
  }

  const metadata = await fetchServerMetadata(fetchFn);
  const res = await fetchFn(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      code_verifier: pending.verifier,
    }),
  });
  if (!res.ok) {
    throw new OAuthCallbackError(
      `The token exchange failed (${res.status}). Please connect again.`,
    );
  }
  const body = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!body.access_token || !body.refresh_token) {
    throw new OAuthCallbackError(
      'Capacities returned no refresh token. Check that offline_access is granted.',
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    editing: pending.editing === true,
    ...(body.expires_in
      ? { expiresAt: Math.floor(Date.now() / 1000) + body.expires_in }
      : {}),
  };
}
