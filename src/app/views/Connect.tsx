import { useEffect } from 'preact/hooks';
import { loadCredential } from '../../auth/tokens';
import {
  CLIENT_ID,
  connect,
  startDemo,
  type DemoFlavor,
} from '../session';

/**
 * The connect screen. Calm, honest, no dead ends: OAuth is the primary
 * flow, and the only way to connect a real space; the demo needs nothing
 * at all. The
 * read-only promise sits beside the connect button because that is
 * where the trust decision happens (spec §0b).
 */
export function Connect(props: {
  onDemo: (flavor: DemoFlavor) => void;
  onConnected: () => void;
}) {
  // On phones the redirect back from Capacities often finishes in another
  // tab. When that tab saves the credential, pick it up here too.
  const { onConnected } = props;
  useEffect(() => {
    const check = (): void => {
      if (loadCredential()) onConnected();
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('storage', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onConnected]);

  const demo = (flavor: DemoFlavor) => () => {
    startDemo(flavor);
    props.onDemo(flavor);
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
          Sign-in isn't set up on this build. You can try the demo.
        </p>
      )}

      <div class="demo-buttons">
        {/* Without a client id the demo is the one thing to do here. */}
        <button class={CLIENT_ID ? '' : 'primary'} onClick={demo('strangers')}>
          Try the demo
        </button>
      </div>
      <details class="more-demos">
        <summary>More demos</summary>
        <div class="demo-buttons">
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
      </details>
      <p class="fineprint">The demo runs on a synthetic space, entirely in this tab.</p>

    </main>
  );
}
