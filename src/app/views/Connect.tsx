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
  const [tokenWrite, setTokenWrite] = useState(false);

  const demo = (flavor: DemoFlavor) => () => {
    startDemo(flavor);
    props.onDemo(flavor);
  };

  const submitToken = (): void => {
    const trimmed = token.trim();
    if (!trimmed) return;
    connectWithToken(trimmed, tokenWrite);
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
        <span class="lock">Read-only by default.</span>
        <span>
          A plain connect asks for read access and nothing else — it cannot
          create, change, or delete anything, and the consent screen will
          show it. Editing (adding goals, adjusting dates) is a separate,
          explicit opt-in below.
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
          <p class="fineprint">
            Want to add goals and drag dates from the timeline?{' '}
            <button class="subtle" onClick={() => void connect({ editing: true })}>
              Connect with editing
            </button>{' '}
            — this asks for write access too, and the consent screen will say
            so. You can switch back to read-only from Settings any time.
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
          read access is enough for viewing — then paste it here. The token
          stays in this browser’s storage; treat it like a password, and
          revoke it in the same settings screen whenever you like.
        </p>
        <label class="field checkbox">
          <input
            type="checkbox"
            checked={tokenWrite}
            onChange={() => setTokenWrite((v) => !v)}
          />
          <span class="fineprint">
            My token has write access — enable editing (adding goals,
            adjusting dates).
          </span>
        </label>
        <div class="token-row">
          <input
            type="password"
            placeholder="cap-api-…"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitToken();
            }}
          />
          <button onClick={submitToken} disabled={token.trim() === ''}>
            Connect
          </button>
        </div>
      </details>
    </main>
  );
}
