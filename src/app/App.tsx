import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  resolveSchema,
  type CollectionTags,
  type ResolvedSchema,
} from '../engine/resolve';
import type {
  CollectionDef,
  SpaceInfo,
  StructureDef,
  TagDef,
} from '../engine/provider';
import { loadCollectionTags } from '../pipeline/load';
import type { FarviewConfig, LocalDate } from '../engine/types';
import { loadStoredConfig, saveStoredConfig } from './configStore';
import { useEditActions, type EditActions } from './edits';
import { Icon } from './components/Icon';
import { ThemeChoice } from './components/ThemeChoice';
import { openingView, pullArmed } from './phoneView';
import { HASH_FOR, useView, type View } from './router';
import { usePullToRefresh } from './usePullToRefresh';
import {
  CLIENT_ID,
  connect,
  createSession,
  disconnect,
  endDemo,
  isAuthLoss,
  STALL_MS,
  suggestsReconnect,
  todayLocal,
  type Session,
} from './session';
import { ConnectionTrouble } from './components/ConnectionTrouble';
import { useTimelineData, type TimelineData } from './useTimelineData';
import { Connect } from './views/Connect';
import { Horizons } from './views/Horizons';
import { ItemDetail } from './views/ItemDetail';
import { Settings } from './views/Settings';
import { Timeline } from './views/Timeline';

const DISCLAIMER = 'Independent community tool. Not affiliated with Capacities.';

/**
 * The app shell: sidebar + content, session bootstrap, auth-loss
 * handling. One dataset (loaded once through the pipeline) feeds both
 * the Timeline and Horizons views.
 */

export interface Boot {
  space: SpaceInfo;
  structures: StructureDef[];
  tags: TagDef[];
  /** Collections in the space, offered as grouping sources in Settings. */
  collections: CollectionDef[];
  /** Collection name (lowercased) → member tag names, for mapped levels. */
  collectionTags: CollectionTags;
}

const NAV: { view: View; label: string; icon: string }[] = [
  { view: 'timeline', label: 'Timeline', icon: 'timeline' },
  { view: 'horizons', label: 'Horizons', icon: 'horizons' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];

export function App() {
  const [tick, setTick] = useState(0);
  const session = useMemo(createSession, [tick]);
  if (!session) {
    return <Connect onDemo={() => setTick((t) => t + 1)} onConnected={() => setTick((t) => t + 1)} />;
  }
  return <ConnectedApp session={session} />;
}

function ConnectedApp(props: { session: Session }) {
  const { session } = props;
  const [boot, setBoot] = useState<Boot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether the failed load looks like lost or refused access.
  const [reconnectFirst, setReconnectFirst] = useState(false);
  // The first load has run past STALL_MS without finishing.
  const [stalled, setStalled] = useState(false);
  // Bumped by Try again to run the boot load once more.
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState<FarviewConfig | null>(
    // A demo never reads the visitor's stored config; the standard demo starts unset.
    () => (session.kind === 'demo' ? session.demoConfig : loadStoredConfig()),
  );
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(max-width: 720px)');
    const onChange = (): void => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const view = useView(openingView(narrow, config?.display.defaultView ?? 'timeline'));

  // Boot reads the config that exists when it runs, and must not re-run when
  // the config changes: it would refetch the whole space (structures alone is
  // 10 requests per minute) on every save. Settings tops up the collection
  // tags a new mapping needs, so nothing here goes stale by waiting.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [space, structures, tags, collections] = await Promise.all([
          session.provider.spaceInfo(),
          session.provider.listStructures(),
          session.provider.listTags(),
          session.provider.listCollections().catch(() => [] as CollectionDef[]),
        ]);
        // Only the collections a mapped level names are expanded to tags.
        const atBoot = configRef.current;
        const collectionTags = atBoot
          ? await loadCollectionTags(session.provider, atBoot).catch(() => ({}))
          : {};
        if (!cancelled) {
          setBoot({ space, structures, tags, collections, collectionTags });
        }
      } catch (err) {
        if (cancelled) return;
        if (isAuthLoss(err)) {
          disconnect();
          location.reload();
          return;
        }
        setReconnectFirst(suggestsReconnect(err));
        setLoadError('Could not reach Capacities right now.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, attempt]);

  // Nothing in the boot chain has a timeout of its own, so a request that
  // stalls on a phone would leave "Reading the space…" up for good. After
  // STALL_MS the recovery card is offered; the load keeps running and
  // replaces the card if it finishes.
  const waiting = boot === null;
  useEffect(() => {
    setStalled(false);
    if (!waiting) return;
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [waiting, attempt]);

  const retryLoad = (): void => {
    setLoadError(null);
    setReconnectFirst(false);
    setAttempt((n) => n + 1);
  };

  const signOut = (): void => {
    disconnect();
    location.assign('/app/');
  };

  // The old credential stays until the callback saves the new one, so
  // backing out of the Capacities consent screen leaves things as they were.
  const reconnect = (): Promise<void> =>
    connect({ editing: session.editingRequested });

  const resolved: ResolvedSchema | null = useMemo(
    () =>
      boot && config
        ? resolveSchema(config, boot.structures, boot.tags, boot.collectionTags)
        : null,
    [boot, config],
  );

  const data = useTimelineData(session, config, resolved);
  const edit = useEditActions(session, resolved, data);

  const updateConfig = (next: FarviewConfig, collectionTags: CollectionTags): void => {
    // Settings loads the tags for a collection the boot pass never saw, and
    // resolves its own preview against them. Fold them in on save or the
    // timeline would resolve that level empty until the next reload.
    setBoot((prev) =>
      prev
        ? { ...prev, collectionTags: { ...prev.collectionTags, ...collectionTags } }
        : prev,
    );
    setConfig(next);
    if (session.kind === 'live') saveStoredConfig(next);
  };

  // On a phone the status line is off the page, so a pull from the top refreshes.
  const refreshRef = useRef(data.refresh);
  refreshRef.current = data.refresh;
  const pullRefresh = useMemo(() => (): void => refreshRef.current(true), []);
  const pull = usePullToRefresh(narrow && boot !== null && !data.loading, pullRefresh);

  // What a screen reader hears when a load finishes or an edit lands.
  const status = !boot
    ? ''
    : data.loading
      ? 'Reading the space'
      : `${data.items.length} items placed.${edit?.notice ? ` ${edit.notice}` : ''}`;

  const leaveDemo = (): void => {
    endDemo();
    location.assign('/app/');
  };

  const today: LocalDate = todayLocal(config?.display.timezone ?? null);

  return (
    <div class="app">
      <aside class="sidebar">
        <span class="brand">
          <span class="brand-mark" aria-hidden="true" />
          Farview
        </span>
        <nav aria-label="Views">
          {NAV.map((item) => (
            <a
              key={item.view}
              href={HASH_FOR[item.view]}
              class={view === item.view ? 'active' : ''}
              aria-current={view === item.view ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>
        <div class="sidebar-foot">
          {session.kind === 'demo' ? (
            <span class="demo-badge">
              Demo
              <button class="subtle" onClick={leaveDemo}>
                leave
              </button>
            </span>
          ) : (
            boot && <span class="space-name">{boot.space.title}</span>
          )}
          <ThemeChoice />
          <p class="disclaimer">{DISCLAIMER}</p>
        </div>
      </aside>
      <div class="content">
        {session.kind === 'demo' && (
          <aside class="demo-banner" aria-label="Demo space">
            <span class="demo-banner-long">
              This is a made-up space{boot ? `, ${boot.space.title}` : ''}. Nothing
              here is real, and nothing leaves this tab.
            </span>
            <span class="demo-banner-short">
              Made-up space{boot ? `: ${boot.space.title}` : ''}
            </span>
          </aside>
        )}
        <p class="sr-only" role="status" aria-live="polite">
          {status}
        </p>
        {pull > 0 && (
          <p class="pull-hint" aria-hidden="true">
            {pullArmed(pull) ? 'Release to refresh' : 'Pull to refresh'}
          </p>
        )}
        <main class="app-main">
          {loadError && boot && (
            <p class="notice">{loadError} Cached content may still be shown.</p>
          )}
          {!boot && (loadError || stalled) && session.kind === 'live' ? (
            <ConnectionTrouble
              stalled={!loadError}
              reconnectFirst={reconnectFirst}
              canReconnect={Boolean(CLIENT_ID)}
              onRetry={retryLoad}
              onReconnect={reconnect}
              onDisconnect={signOut}
            />
          ) : !boot ? (
            <>
              {loadError && <p class="notice">{loadError}</p>}
              <p class="loading">Reading the space…</p>
            </>
          ) : !config || !resolved ? (
            <Settings
              session={session}
              boot={boot}
              config={config}
              today={today}
              data={data}
              onConfig={updateConfig}
              onboarding={true}
            />
          ) : (
            <ViewBody
              session={session}
              boot={boot}
              config={config}
              resolved={resolved}
              today={today}
              view={view}
              data={data}
              edit={edit}
              onConfig={updateConfig}
            />
          )}
        </main>
        <footer class="app-foot">
          <p class="disclaimer">{DISCLAIMER}</p>
        </footer>
      </div>
    </div>
  );
}

/** The config references things this space no longer has (§11). */
function MappingBroken(props: { resolved: ResolvedSchema }) {
  return (
    <div class="setup-card">
      <h3>The mapping needs a fresh look</h3>
      {props.resolved.warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
      <p>
        <a href={HASH_FOR.settings}>Open Settings</a> and pick the type again.
        This happens when a type or property is renamed or deleted in
        Capacities.
      </p>
    </div>
  );
}

function ViewBody(props: {
  session: Session;
  boot: Boot;
  config: FarviewConfig;
  resolved: ResolvedSchema;
  today: LocalDate;
  view: View;
  data: TimelineData;
  edit: EditActions | null;
  onConfig: (config: FarviewConfig, collectionTags: CollectionTags) => void;
}) {
  if (props.view === 'settings') {
    return (
      <Settings
        session={props.session}
        boot={props.boot}
        config={props.config}
        today={props.today}
        data={props.data}
        onConfig={props.onConfig}
        onboarding={false}
      />
    );
  }
  // A renamed or deleted type routes to a clear message, not a blank chart.
  if (!props.resolved.types.project) {
    return <MappingBroken resolved={props.resolved} />;
  }
  switch (props.view) {
    case 'timeline':
      return (
        <>
          <h1 class="sr-only">Timeline</h1>
          <Timeline
            session={props.session}
            config={props.config}
            resolved={props.resolved}
            today={props.today}
            data={props.data}
            edit={props.edit}
            loadMilestones={props.data.loadMilestones}
          />
        </>
      );
    case 'horizons':
      return (
        <>
          <h1 class="sr-only">Horizons</h1>
          <Horizons
            session={props.session}
            config={props.config}
            resolved={props.resolved}
            today={props.today}
            data={props.data}
            edit={props.edit}
            loadMilestones={props.data.loadMilestones}
          />
        </>
      );
    case 'item':
      return (
        <ItemDetail
          session={props.session}
          config={props.config}
          resolved={props.resolved}
          today={props.today}
          data={props.data}
          edit={props.edit}
        />
      );
  }
}
