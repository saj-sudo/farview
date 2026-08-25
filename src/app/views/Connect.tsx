import { useState } from 'preact/hooks';
import {
  CLIENT_ID,
  connect,
  connectWithToken,
  startDemo,
  type DemoFlavor,
} from '../session';

/**
 * The connect screen. Calm, honest, no dead ends: OAuth is the primary
 * flow when configured; a personal API token is the advanced path for
 * self-hosters and early testing; the demo needs nothing at all. The
 * read-only promise sits beside the connect button because that is
 * where the trust decision happens (spec §0b).
 */
export function Connect(props: {
  onDemo: (flavor: DemoFlavor) => void;
  onConnected: () => void;
}) {
  const [token, setToken] = useState('');

  const demo = (flavor: DemoFlavor) => () => {
    startDemo(flavor);
    props.onDemo(flavor);
  };

  const useToken = (): void => {
    const trimmed = token.trim();
    if (!trimmed) return;
    connectWithToken(trimmed);
    props.onConnected();
  };

  return (
    <main class="connect">
      <h1>Farview</h1>
      <p class="tagline">See your goals across time, in Capacities.</p>
      <p>
        Your projects and goals on one timeline — a line for today, bars
        stretching toward their target dates, horizons from this month out to
        the far end of the decade. Farview reads your space from this browser
        only: there is no server, no account, and no tracking.
      </p>

      <p class="readonly-note">
        <span class="lock">Read-only.</span>
        <span>
          Farview asks for read access and nothing else. It literally cannot
          create, change, or delete anything in your space — the consent
          screen will show it.
        </span>
      </p>

      {CLIENT_ID ? (
        <>
          <button class="primary" onClick={() => void connect()}>
            Connect to Capacities
          </button>
          <p class="fineprint">
            You choose which space to share on the Capacities side. You can
            revoke access at any time in Capacities under Settings&nbsp;→
            Capacities API&nbsp;→ Connections — nothing here can stop you.
          </p>
        </>
      ) : (
        <p class="notice">
          This build has no OAuth client configured, so the one-click connect
          is not available yet. The demo below needs nothing; a personal API
          token (advanced, further down) connects your real space.
        </p>
      )}

      <div class="demo-buttons">
        <button onClick={demo('strangers')}>Try the demo</button>
        <button class="subtle" onClick={demo('minimal')}>
          Demo: a nearly empty space
        </button>
        <button class="subtle" onClick={demo('empty')}>
          Demo: an empty space
        </button>
      </div>
      <p class="fineprint">The demo runs on a synthetic space, entirely in this tab.</p>

      <details class="advanced">
        <summary>Advanced: connect with a personal API token</summary>
        <p class="fineprint">
          In the Capacities app: Settings → Capacities API → create a token —
          read access is all Farview needs — then paste it here. The token
          stays in this browser’s storage; treat it like a password, and
          revoke it in the same settings screen whenever you like.
        </p>
        <div class="token-row">
          <input
            type="password"
            placeholder="cap-api-…"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') useToken();
            }}
          />
          <button onClick={useToken} disabled={token.trim() === ''}>
            Connect
          </button>
        </div>
      </details>
    </main>
  );
}
