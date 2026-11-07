import { completeAuthorization, OAuthCallbackError } from '../auth/oauth';
import { saveCredential } from '../auth/tokens';

/**
 * The /callback page: finish the code exchange and hand off to /app/.
 * Kept tiny: it renders one status line and never sees space content.
 */

const statusEl = document.querySelector('.callback-status p')!;

function fail(message: string): void {
  statusEl.textContent = message;
  const back = document.createElement('p');
  const link = document.createElement('a');
  link.href = '/app/';
  link.textContent = 'Back to Farview';
  back.append(link);
  statusEl.after(back);
}

const clientId = import.meta.env.VITE_CAPACITIES_CLIENT_ID as string | undefined;

if (!clientId) {
  fail('OAuth is not configured for this deployment.');
} else {
  completeAuthorization({
    params: new URLSearchParams(location.search),
    clientId,
    redirectUri: `${location.origin}/callback`,
    storage: {
      // localStorage, not sessionStorage: see PENDING_TTL_MS in auth/oauth.ts.
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
      remove: (k) => localStorage.removeItem(k),
    },
  })
    .then(({ editing, ...tokens }) => {
      saveCredential({ kind: 'oauth', wantsWrite: editing, ...tokens });
      location.replace('/app/');
    })
    .catch((err: unknown) => {
      fail(
        err instanceof OAuthCallbackError
          ? err.message
          : 'Connecting failed. Please try again.',
      );
    });
}
