import { CapacitiesApiError, CapacitiesClient, CapacitiesOAuthError } from '@capacities/api';
import { beginAuthorization } from '../auth/oauth';
import { clearCredential, loadCredential, saveCredential } from '../auth/tokens';
import { normalizeConfig } from '../engine/config';
import { todayInZone } from '../engine/dates';
import type { Provider } from '../engine/provider';
import type { FarviewConfig, LocalDate } from '../engine/types';
import { CapacitiesAdapter } from '../providers/capacities/adapter';
import { buildEmptySpace } from '../providers/fixture/emptySpace';
import { FixtureProvider } from '../providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../providers/fixture/minimalSpace';
import {
  buildStrangersSpace,
  strangersDemoConfig,
} from '../providers/fixture/strangersSpace';

/**
 * Session wiring for the app shell: which Provider backs this visit.
 *
 * - "live": OAuth tokens or a personal token → the Capacities adapter.
 *   A failed refresh (revoked/expired) returns cleanly to Connect (§7.3).
 * - "demo": synthetic fixture space; nothing leaves the tab.
 * - null: not connected → the Connect screen.
 */

export type DemoFlavor = 'strangers' | 'minimal' | 'empty';

export interface Session {
  kind: 'live' | 'demo';
  provider: Provider;
  /**
   * Demo sessions carry their own config so a demo never touches the
   * visitor's stored one; the strangers demo starts post-onboarding.
   */
  demoConfig: FarviewConfig | null;
}

const DEMO_KEY = 'farview.demo';

export const CLIENT_ID: string | undefined = import.meta.env
  .VITE_CAPACITIES_CLIENT_ID as string | undefined;

export function todayLocal(timezone: string | null): LocalDate {
  return todayInZone(new Date(), timezone);
}

export function activeDemo(): DemoFlavor | null {
  try {
    const v = sessionStorage.getItem(DEMO_KEY);
    return v === 'strangers' || v === 'minimal' || v === 'empty' ? v : null;
  } catch {
    return null;
  }
}

export function startDemo(flavor: DemoFlavor): void {
  try {
    sessionStorage.setItem(DEMO_KEY, flavor);
  } catch {
    // sessionStorage unavailable: demo simply won't persist across reloads
  }
}

export function endDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // nothing to do
  }
}

export function createSession(): Session | null {
  const demo = activeDemo();
  if (demo) {
    const today = todayLocal(null);
    const space =
      demo === 'strangers'
        ? buildStrangersSpace(today)
        : demo === 'minimal'
          ? buildMinimalSpace(today)
          : buildEmptySpace();
    const demoConfig =
      demo === 'strangers'
        ? normalizeConfig(strangersDemoConfig())
        : normalizeConfig({
            types: { project: 'Undertaking' },
            properties: {
              projectStart: null,
              projectTarget: 'By When',
              projectStatus: null,
            },
          });
    return { kind: 'demo', provider: new FixtureProvider(space), demoConfig };
  }

  const credential = loadCredential();
  let client: CapacitiesClient | null = null;
  if (credential?.kind === 'token') {
    client = new CapacitiesClient({ apiToken: credential.apiToken });
  } else if (credential?.kind === 'oauth' && CLIENT_ID) {
    const { kind, ...tokens } = credential;
    void kind;
    client = new CapacitiesClient({
      oauth: {
        tokens,
        clientId: CLIENT_ID,
        onTokenRefreshed: (next) => saveCredential({ kind: 'oauth', ...next }),
      },
    });
  }
  if (client) {
    return { kind: 'live', provider: new CapacitiesAdapter(client), demoConfig: null };
  }
  return null;
}

/** Kick off the OAuth redirect. */
export async function connect(): Promise<void> {
  if (!CLIENT_ID) return;
  const url = await beginAuthorization({
    clientId: CLIENT_ID,
    redirectUri: `${location.origin}/callback`,
    storage: {
      get: (k) => sessionStorage.getItem(k),
      set: (k, v) => sessionStorage.setItem(k, v),
      remove: (k) => sessionStorage.removeItem(k),
    },
  });
  location.assign(url);
}

/** Store a personal API token and let the caller rebuild the session. */
export function connectWithToken(apiToken: string): void {
  saveCredential({ kind: 'token', apiToken });
}

export function disconnect(): void {
  clearCredential();
}

/**
 * True when an error means "the connection is gone" — revoked access,
 * an expired refresh token, or a revoked/invalid personal token.
 * Callers clear the credential and show Connect again rather than
 * error-looping (§11).
 */
export function isAuthLoss(err: unknown): boolean {
  return (
    err instanceof CapacitiesOAuthError ||
    (err instanceof CapacitiesApiError &&
      (err.code === 'cap_not_authenticated' || err.status === 401))
  );
}
