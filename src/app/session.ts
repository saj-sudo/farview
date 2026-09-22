import {
  CapacitiesApiError,
  CapacitiesClient,
  CapacitiesErrorCode,
  CapacitiesOAuthError,
} from '@capacities/api';
import { beginAuthorization } from '../auth/oauth';
import { clearCredential, loadCredential, saveCredential } from '../auth/tokens';
import { normalizeConfig } from '../engine/config';
import { todayInZone } from '../engine/dates';
import type { Editor } from '../engine/editor';
import type { Provider } from '../engine/provider';
import type { ResolvedSchema } from '../engine/resolve';
import type { FarviewConfig, LocalDate } from '../engine/types';
import {
  CapacitiesAdapter,
  createCapacitiesEditor,
} from '../providers/capacities/adapter';
import { buildEmptySpace } from '../providers/fixture/emptySpace';
import {
  createFixtureEditor,
  FixtureProvider,
} from '../providers/fixture/fixtureProvider';
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
  /**
   * True only when the user explicitly connected with editing. Actual
   * capability is confirmed lazily — a 403 cap_scope_insufficient
   * downgrades the UI rather than erroring.
   */
  editingRequested: boolean;
  /** The write seam; null unless editing was requested. */
  makeEditor: (resolved: ResolvedSchema) => Editor | null;
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
    const provider = new FixtureProvider(space);
    // The strangers demo showcases editing (in memory, nothing leaves the
    // tab); the other flavors stay read-only so that mode is visible too.
    const editingRequested = demo === 'strangers';
    return {
      kind: 'demo',
      provider,
      demoConfig,
      editingRequested,
      makeEditor: (resolved) =>
        editingRequested ? createFixtureEditor(provider, resolved) : null,
    };
  }

  const credential = loadCredential();
  let client: CapacitiesClient | null = null;
  const wantsWrite = credential?.wantsWrite === true;
  if (credential?.kind === 'token') {
    client = new CapacitiesClient({ apiToken: credential.apiToken });
  } else if (credential?.kind === 'oauth' && CLIENT_ID) {
    const { kind, wantsWrite: ww, ...tokens } = credential;
    void kind;
    client = new CapacitiesClient({
      oauth: {
        tokens,
        clientId: CLIENT_ID,
        onTokenRefreshed: (next) =>
          saveCredential({ kind: 'oauth', wantsWrite: ww === true, ...next }),
      },
    });
  }
  if (client) {
    const c = client;
    return {
      kind: 'live',
      provider: new CapacitiesAdapter(c),
      demoConfig: null,
      editingRequested: wantsWrite,
      makeEditor: (resolved: ResolvedSchema) =>
        wantsWrite ? createCapacitiesEditor(c, resolved) : null,
    };
  }
  return null;
}

/** Kick off the OAuth redirect. Editing is an explicit opt-in (§0b'). */
export async function connect(opts: { editing?: boolean } = {}): Promise<void> {
  if (!CLIENT_ID) return;
  const url = await beginAuthorization({
    clientId: CLIENT_ID,
    redirectUri: `${location.origin}/callback`,
    editing: opts.editing === true,
    storage: {
      get: (k) => sessionStorage.getItem(k),
      set: (k, v) => sessionStorage.setItem(k, v),
      remove: (k) => sessionStorage.removeItem(k),
    },
  });
  location.assign(url);
}

/** Store a personal API token and let the caller rebuild the session. */
export function connectWithToken(apiToken: string, wantsWrite: boolean): void {
  saveCredential({ kind: 'token', apiToken, wantsWrite });
}

/**
 * Flip editing on a personal-token credential in place (the token's real
 * permissions were chosen in Capacities; this only gates the UI).
 * Returns false for OAuth credentials — those change scope by
 * reconnecting, so the consent screen always reflects the grant.
 */
export function setTokenEditing(on: boolean): boolean {
  const credential = loadCredential();
  if (credential?.kind !== 'token') return false;
  saveCredential({ ...credential, wantsWrite: on });
  return true;
}

/** A 403 that means "this connection was never granted write access". */
export function isScopeInsufficiency(err: unknown): boolean {
  return err instanceof CapacitiesApiError && err.code === CapacitiesErrorCode.ScopeInsufficient;
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
      (err.code === CapacitiesErrorCode.NotAuthenticated || err.status === 401))
  );
}
