/**
 * OAuth 2.1 PKCE primitives (RFC 7636), WebCrypto only. This is the one
 * part of auth the SDK does not cover: building the authorize redirect
 * and proving code possession at exchange time.
 */

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 43-char high-entropy code verifier. */
export function generateVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** S256 code challenge for a verifier. */
export async function challengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

/** Random `state` value binding the redirect to this browser session. */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
