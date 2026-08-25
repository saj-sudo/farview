import type { TimelineData } from '../useTimelineData';

/**
 * The honest status line (spec §5.4): what is placed, when it was last
 * refreshed, and how to get more. A sentence, never a spinner.
 */
export function RefreshBar(props: { data: TimelineData; itemNoun?: string }) {
  const { data } = props;
  const noun = props.itemNoun ?? 'items';

  const freshness = (): string | null => {
    if (data.lastRefreshed === null) return null;
    const minutes = Math.floor((Date.now() - data.lastRefreshed) / 60_000);
    if (minutes < 1) return 'refreshed just now';
    if (minutes === 1) return 'refreshed a minute ago';
    if (minutes < 60) return `refreshed ${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    return `refreshed ${hours === 1 ? 'an hour' : `${hours} hours`} ago`;
  };

  return (
    <div class="refresh-bar">
      {data.loading && data.progress ? (
        <span class="loading">
          Placing your {noun} on the line… {data.progress.done} of {data.progress.total}
        </span>
      ) : data.loading ? (
        <span class="loading">Reading the space…</span>
      ) : (
        <span class="fineprint">
          {data.items.length} {noun} placed
          {freshness() ? ` · ${freshness()}` : ''}
        </span>
      )}
      {!data.loading && (
        <button class="subtle" onClick={() => data.refresh(true)}>
          Refresh
        </button>
      )}
      {!data.loading && data.remaining > 0 && (
        <button class="subtle" onClick={data.loadMore}>
          Load {data.remaining} more
        </button>
      )}
    </div>
  );
}
