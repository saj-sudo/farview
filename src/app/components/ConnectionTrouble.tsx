import { useState } from 'preact/hooks';

/**
 * Shown in place of "Reading the space…" when the first load from
 * Capacities failed, or is taking far too long. Settings (and its
 * Disconnect button) only renders once the space has loaded, so without
 * this card a failed load leaves no way out.
 */
export function ConnectionTrouble({
  stalled,
  reconnectFirst,
  canReconnect,
  onRetry,
  onReconnect,
  onDisconnect,
}: {
  /** True while the load is still running, just slowly. */
  stalled: boolean;
  /** Lead with Reconnect: the error looks like refused or lost access. */
  reconnectFirst: boolean;
  /** False when this build has no OAuth client id. */
  canReconnect: boolean;
  onRetry: () => void;
  onReconnect: () => Promise<void>;
  onDisconnect: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const reconnect = (): void => {
    setBusy(true);
    setFailed(false);
    onReconnect().catch(() => {
      setBusy(false);
      setFailed(true);
    });
  };

  const retry = (
    <button
      type="button"
      class={reconnectFirst ? '' : 'primary'}
      onClick={onRetry}
      disabled={busy}
    >
      Try again
    </button>
  );
  const again = canReconnect && (
    <button
      type="button"
      class={reconnectFirst ? 'primary' : ''}
      onClick={reconnect}
      disabled={busy}
    >
      {busy ? 'Opening Capacities…' : 'Reconnect to Capacities'}
    </button>
  );

  return (
    <section class="connection-trouble" aria-live="polite">
      <h2>
        {stalled
          ? 'This is taking longer than usual'
          : reconnectFirst
            ? 'Capacities wants you to connect again'
            : 'Capacities did not answer'}
      </h2>
      <p>
        {stalled
          ? 'Still waiting on your space. A slow connection can do this, and so can a sign-in that has gone stale.'
          : reconnectFirst
            ? 'Capacities turned the request down. Connecting again usually fixes this.'
            : 'This can be a dropped connection or a sign-in that has gone stale.'}
      </p>
      <div class="connection-trouble-actions">
        {reconnectFirst ? (
          <>
            {again}
            {retry}
          </>
        ) : (
          <>
            {retry}
            {again}
          </>
        )}
        <button type="button" class="subtle" onClick={onDisconnect} disabled={busy}>
          Disconnect this browser
        </button>
      </div>
      {failed && (
        <p class="fineprint">Could not open the Capacities sign-in. Check your connection and try again.</p>
      )}
      <p class="fineprint">
        Still stuck after reconnecting? In Capacities, open Settings, then Capacities API, then
        Connections, remove this app, and connect again.
      </p>
    </section>
  );
}
