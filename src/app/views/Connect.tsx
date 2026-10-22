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
        Your projects and goals on one timeline, with a line for today and a
        bar for each project running toward its target date. Farview reads
        your space from this browser. There is no server and no account.
      </p>

      <p class="readonly-note">
        <span class="lock">Read-only by default.</span>
        <span>
          A plain connection asks for read access only, so Farview can't
          create, change or delete anything, and the consent screen shows
          that. Editing (adding goals, moving dates) is a separate choice
          below.
        </span>
      </p>

      {CLIENT_ID ? (
        <>
          <button class="primary" onClick={() => void connect()}>
            Connect to Capacities
          </button>
          <p class="fineprint">
            You pick which space to share on the Capacities side. You can
            revoke access any time in Capacities under Settings&nbsp;→
            Capacities API&nbsp;→ Connections.
          </p>
          <p class="fineprint">
            Want to add goals and drag dates from the timeline?{' '}
            <button class="subtle" onClick={() => void connect({ editing: true })}>
              Connect with editing
            </button>
            . This asks for write access too, and the consent screen will say
            so. You can switch back to read-only from Settings any time.
          </p>
        </>
      ) : (
        <p class="notice">
          One-click connect isn't set up on this build yet. You can try the
          demo, or connect your own space with a personal API token under
          Advanced, further down.
        </p>
      )}

      <div class="demo-buttons">
        {/* Without a client id the demo is the one thing to do here. */}
        <button class={CLIENT_ID ? '' : 'primary'} onClick={demo('strangers')}>
          Try the demo
        </button>
        <button class="subtle" onClick={demo('standard')}>
          Demo: a first setup in a new space
        </button>
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
          In the Capacities desktop app, open Settings → Capacities API → API
          Tokens and create a token for the space you want to use. Read access
          is enough for viewing. Paste it here. The token stays in this
          browser’s storage, so treat it like a password. You can revoke it in
          the same screen whenever you like.
        </p>
        <label class="field checkbox">
          <input
            type="checkbox"
            checked={tokenWrite}
            onChange={() => setTokenWrite((v) => !v)}
          />
          <span class="fineprint">
            My token has write access. Turn on editing (adding goals, moving
            dates).
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
