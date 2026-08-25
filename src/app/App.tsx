import { useEffect, useMemo, useState } from 'preact/hooks';
import { resolveSchema } from '../engine/resolve';
import type { SpaceInfo, StructureDef, TagDef } from '../engine/provider';
import type { FarviewConfig } from '../engine/types';
import { isBasicStructure } from '../providers/capacities/constants';
import { loadStoredConfig, saveStoredConfig } from './configStore';
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
import { Connect } from './views/Connect';

/**
 * The app shell: sidebar + content, session bootstrap, auth-loss
 * handling. Views render from one shared boot payload (space info,
 * structures, tags) so every screen works from the same facts.
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
  const [, setTick] = useState(0);
  const rebuild = (): void => setTick((t) => t + 1);

  const session = useMemo(createSession, []);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<FarviewConfig | null>(
    () => session?.demoConfig ?? loadStoredConfig(),
  );
  const view = useView(config?.display.defaultView ?? 'timeline');

  useEffect(() => {
    if (!session) return;
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

  const resolved = useMemo(
    () =>
      boot && config ? resolveSchema(config, boot.structures, boot.tags) : null,
    [boot, config],
  );

  if (!session) {
    return <Connect onDemo={rebuild} onConnected={rebuild} />;
  }

  const updateConfig = (next: FarviewConfig): void => {
    setConfig(next);
    if (session.kind === 'live') saveStoredConfig(next);
  };

  const leaveDemo = (): void => {
    endDemo();
    location.reload();
  };

  const today = todayLocal(config?.display.timezone ?? null);

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
            A synthetic space — the Saltmarsh Boatyard and friends. Nothing
            here is real, and nothing leaves this tab.
          </p>
        )}
        <main class="app-main">
          {loadError && <p class="notice">{loadError} Cached content may still be shown.</p>}
          {!boot ? (
            <p class="loading">Reading the space…</p>
          ) : (
            <ViewBody
              session={session}
              boot={boot}
              config={config}
              resolved={resolved}
              today={today}
              view={view}
              onConfig={updateConfig}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ViewBody(props: {
  session: Session;
  boot: Boot;
  config: FarviewConfig | null;
  resolved: ReturnType<typeof resolveSchema> | null;
  today: string;
  view: View;
  onConfig: (config: FarviewConfig) => void;
}) {
  // Placeholder bodies — the real views land in the next build steps.
  const customTypes = props.boot.structures.filter((s) => !isBasicStructure(s.id));
  return (
    <section>
      <div class="view-head">
        <div>
          <h2>{props.view === 'timeline' ? 'Timeline' : props.view === 'horizons' ? 'Horizons' : 'Settings'}</h2>
          <p class="fineprint">
            Connected to “{props.boot.space.title}”. This space contains{' '}
            {customTypes.length === 0
              ? 'no custom object types'
              : customTypes.map((s) => s.title).join(', ')}
            {props.boot.tags.length > 0
              ? `; tags: ${props.boot.tags.map((t) => t.name).join(', ')}.`
              : '.'}
          </p>
        </div>
      </div>
      {props.resolved && props.resolved.warnings.length > 0 && (
        <div class="notice">
          {props.resolved.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
    </section>
  );
}
