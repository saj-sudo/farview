import { useEffect, useMemo, useState } from 'preact/hooks';
import { resolveSchema, type ResolvedSchema } from '../engine/resolve';
import type { SpaceInfo, StructureDef, TagDef } from '../engine/provider';
import type { FarviewConfig, LocalDate } from '../engine/types';
import { loadStoredConfig, saveStoredConfig } from './configStore';
import { useEditActions, type EditActions } from './edits';
import { Icon } from './components/Icon';
import { HASH_FOR, useView, type View } from './router';
import {
  createSession,
  disconnect,
  endDemo,
  isAuthLoss,
  todayLocal,
  type Session,
} from './session';
import { useTimelineData, type TimelineData } from './useTimelineData';
import { Connect } from './views/Connect';
import { Horizons } from './views/Horizons';
import { ItemDetail } from './views/ItemDetail';
import { Settings } from './views/Settings';
import { Timeline } from './views/Timeline';

/**
 * The app shell: sidebar + content, session bootstrap, auth-loss
 * handling. One dataset — loaded once through the pipeline — feeds both
 * the Timeline and Horizons views.
 */

export interface Boot {
  space: SpaceInfo;
  structures: StructureDef[];
  tags: TagDef[];
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
  const [config, setConfig] = useState<FarviewConfig | null>(
    () => session.demoConfig ?? loadStoredConfig(),
  );
  const view = useView(config?.display.defaultView ?? 'timeline');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [space, structures, tags] = await Promise.all([
          session.provider.spaceInfo(),
          session.provider.listStructures(),
          session.provider.listTags(),
        ]);
        if (!cancelled) setBoot({ space, structures, tags });
      } catch (err) {
        if (cancelled) return;
        if (isAuthLoss(err)) {
          disconnect();
          location.reload();
          return;
        }
        setLoadError('Could not reach Capacities right now.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const resolved: ResolvedSchema | null = useMemo(
    () => (boot && config ? resolveSchema(config, boot.structures, boot.tags) : null),
    [boot, config],
  );

  const data = useTimelineData(session, config, resolved);
  const edit = useEditActions(session, resolved, data);

  const updateConfig = (next: FarviewConfig): void => {
    setConfig(next);
    if (session.kind === 'live') saveStoredConfig(next);
  };

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
        </div>
      </aside>
      <div class="content">
        {session.kind === 'demo' && (
          <p class="demo-banner">
            A synthetic space — the Saltmarsh Boatyard. Nothing here is real,
            and nothing leaves this tab.
          </p>
        )}
        <main class="app-main">
          {loadError && (
            <p class="notice">{loadError} Cached content may still be shown.</p>
          )}
          {!boot ? (
            <p class="loading">Reading the space…</p>
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
        <a href={HASH_FOR.settings}>Open Settings</a> to remap.
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
  onConfig: (config: FarviewConfig) => void;
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
        <Timeline
          session={props.session}
          config={props.config}
          resolved={props.resolved}
          today={props.today}
          data={props.data}
          edit={props.edit}
          loadMilestones={props.data.loadMilestones}
        />
      );
    case 'horizons':
      return (
        <Horizons
          session={props.session}
          config={props.config}
          resolved={props.resolved}
          today={props.today}
          data={props.data}
          edit={props.edit}
          loadMilestones={props.data.loadMilestones}
        />
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
