import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dayNumber } from '../../engine/dates';
import {
  defaultConfig,
  exportConfig,
  importConfig,
  normalizeConfig,
} from '../../engine/config';
import type { PropertyDef, StructureDef } from '../../engine/provider';
import { resolveSchema } from '../../engine/resolve';
import { layoutTimeline } from '../../engine/timeline/layout';
import { defaultView } from '../../engine/timeline/scale';
import type { FarviewConfig, LocalDate, TimelineItem, TypeRole } from '../../engine/types';
import { memoryCache } from '../../pipeline/cache';
import { loadTimelineData } from '../../pipeline/load';
import { isBasicStructure } from '../../providers/capacities/constants';
import type { Boot } from '../App';
import { TimelineSvg } from '../components/TimelineSvg';
import { HASH_FOR } from '../router';
import { connect, disconnect, endDemo, setTokenEditing, type Session } from '../session';
import type { TimelineData } from '../useTimelineData';

/**
 * Settings doubles as onboarding (spec §6): the form is built live from
 * the space's real types, properties, and tags — never a text field for
 * a name that a dropdown can offer — and the live preview at the bottom
 * renders the visitor's actual timeline before anything is saved. That
 * preview is what converts a skeptical visitor, and it costs nothing:
 * the data is already fetched.
 */

const EMPTY_MILESTONES: ReadonlyMap<string, never[]> = new Map();

export function Settings(props: {
  session: Session;
  boot: Boot;
  config: FarviewConfig | null;
  today: LocalDate;
  data: TimelineData;
  onConfig: (config: FarviewConfig) => void;
  onboarding: boolean;
}) {
  const { boot } = props;
  const [draft, setDraft] = useState<FarviewConfig>(
    () => props.config ?? normalizeConfig({ ...defaultConfig(), types: { project: null } }),
  );
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  const customTypes = useMemo(
    () => boot.structures.filter((s) => !isBasicStructure(s.id)),
    [boot.structures],
  );

  // Live counts per custom type, capped at 100 so a huge space costs at
  // most one page per type (§6 step 2).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const structure of customTypes) {
        let n = 0;
        try {
          for await (const s of props.session.provider.listObjectsByStructure(structure.id)) {
            void s;
            n += 1;
            if (n > 100) break;
          }
        } catch {
          continue; // counts are decoration; the form works without them
        }
        if (cancelled) return;
        setCounts((prev) => new Map(prev).set(structure.id, n));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customTypes, props.session]);

  const update = (fn: (draft: FarviewConfig) => void): void => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(normalizeConfig(next));
    setSavedNote(null);
  };

  const resolved = useMemo(
    () => resolveSchema(draft, boot.structures, boot.tags),
    [draft, boot],
  );

  const structureFor = (role: TypeRole): StructureDef | null =>
    resolved.types[role]?.structure ?? null;

  const save = (): void => {
    props.onConfig(draft);
    setSavedNote(
      props.session.kind === 'demo'
        ? 'Applied for this demo session.'
        : 'Saved. Settings live in this browser only — export below to move them.',
    );
  };

  const countLabel = (id: string): string => {
    const n = counts.get(id);
    if (n === undefined) return '…';
    return n > 100 ? '100+' : String(n);
  };

  /* ---------------- form pieces ---------------- */

  // Built-in Tasks (RootTask is an API constant, like RootPage) are a
  // natural actions source for pro users — surfaced first for that role.
  const taskType = boot.structures.find((s) => s.id === 'RootTask');

  const typeSelect = (role: TypeRole, label: string, hint: string) => (
    <label class="field">
      <span>{label}</span>
      <select
        value={draft.types[role] ?? ''}
        onChange={(e) =>
          update((d) => {
            d.types[role] = (e.target as HTMLSelectElement).value || null;
          })
        }
      >
        <option value="">None of these</option>
        {role === 'action' && taskType && (
          <option value={taskType.title}>
            {taskType.title} (built-in Tasks)
          </option>
        )}
        {customTypes.map((s) => (
          <option key={s.id} value={s.title}>
            {s.title} ({countLabel(s.id)})
          </option>
        ))}
      </select>
      <small>{hint}</small>
    </label>
  );

  const propertySelect = (
    key: keyof FarviewConfig['properties'],
    label: string,
    homeRole: TypeRole,
    propType: string,
    hint?: string,
  ) => {
    const home = structureFor(homeRole);
    if (!home) return null;
    const options = home.properties.filter((p: PropertyDef) => p.type === propType);
    return (
      <label class="field">
        <span>{label}</span>
        <select
          value={draft.properties[key] ?? ''}
          onChange={(e) =>
            update((d) => {
              d.properties[key] = (e.target as HTMLSelectElement).value || null;
            })
          }
        >
          <option value="">(not mapped)</option>
          {options.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        {hint && <small>{hint}</small>}
      </label>
    );
  };

  const statusProperty = resolved.properties.projectStatus?.property ?? null;

  const statusChecks = (set: 'active' | 'done', label: string, hint: string) =>
    statusProperty && statusProperty.labelNames.length > 0 ? (
      <div class="field">
        <span>{label}</span>
        <div class="tag-grid">
          {statusProperty.labelNames.map((name) => {
            const on = draft.statusValues[set].some(
              (v) => v.toLowerCase() === name.toLowerCase(),
            );
            return (
              <label key={name} class={`tag-chip ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    update((d) => {
                      d.statusValues[set] = on
                        ? d.statusValues[set].filter(
                            (v) => v.toLowerCase() !== name.toLowerCase(),
                          )
                        : [...d.statusValues[set], name];
                    })
                  }
                />
                {name}
              </label>
            );
          })}
        </div>
        <small>{hint}</small>
      </div>
    ) : null;

  /* ---------------- live preview ---------------- */

  return (
    <section class="settings">
      <div class="view-head">
        <div>
          <h2>{props.onboarding ? 'Welcome — map your space' : 'Settings'}</h2>
          <p class="fineprint">
            Farview works with <em>your</em> object types, not a fixed schema.
            Everything below is read live from “{boot.space.title}”. Nothing is
            written to your space — configuration lives in this browser.
          </p>
        </div>
      </div>

      <h3>Your space</h3>
      {customTypes.length === 0 ? (
        <p class="empty-note">
          No custom object types here yet — Farview needs a type with dates to
          place. Basic types (pages, tags, media) are hidden.
        </p>
      ) : (
        <div class="tag-grid">
          {customTypes.map((s) => (
            <span key={s.id} class="chip">
              {s.title} · {countLabel(s.id)}
            </span>
          ))}
        </div>
      )}

      <h3>Projects — the one required mapping</h3>
      <div class="field-row">
        {typeSelect(
          'project',
          'Which type holds your projects or work items?',
          '“None of these” is a fine answer — but Farview has nothing to draw without one.',
        )}
      </div>
      {structureFor('project') && (
        <>
          <div class="field-row">
            {propertySelect('projectStart', 'Start date', 'project', 'date')}
            {propertySelect('projectTarget', 'Target date', 'project', 'date', 'Items are placed by this date.')}
            {propertySelect('projectStatus', 'Status', 'project', 'label')}
          </div>
          <div class="field-row">
            {propertySelect(
              'projectGoal',
              'Goal link',
              'project',
              'entity',
              'The property pointing at the project’s goal.',
            )}
            {propertySelect(
              'projectActions',
              'Actions',
              'project',
              'entity',
              'Sub-items; shown on the project’s detail page.',
            )}
            {propertySelect(
              'projectMilestones',
              'Milestones',
              'project',
              'entity',
              'Achievement markers, drawn as ticks on the bar.',
            )}
          </div>
        </>
      )}
      {statusChecks('active', 'Which statuses count as active?', 'Unlisted statuses stay visible rather than vanish.')}
      {statusChecks('done', 'Which count as done?', 'Done items hide behind the “show completed” toggle.')}

      <h3>Goals — optional</h3>
      <div class="field-row">
        {typeSelect(
          'goal',
          'A type for goals, if you keep one',
          'Most spaces have none, and Farview is at home without it.',
        )}
        {structureFor('goal') && (
          <>
            {propertySelect('goalTarget', 'Goal target date', 'goal', 'date')}
            {propertySelect(
              'goalHorizon',
              'Horizon label',
              'goal',
              'label',
              'Only if your goals carry an explicit horizon.',
            )}
          </>
        )}
      </div>
      {structureFor('goal') && (
        <div class="field-row">
          {propertySelect(
            'goalActions',
            'Actions',
            'goal',
            'entity',
            'Actions hanging directly off a goal.',
          )}
          {propertySelect(
            'goalMilestones',
            'Milestones',
            'goal',
            'entity',
            'Achievement markers on the goal itself.',
          )}
        </div>
      )}

      <h3>Actions — optional</h3>
      <div class="field-row">
        {typeSelect(
          'action',
          'A type for actions or sub-items',
          'The leaf level: Capacities’ built-in Tasks or any custom type. Keep your day-to-day to-dos wherever they live — this is for planning-sized pieces.',
        )}
        {structureFor('action') && (
          <>
            {propertySelect('actionDate', 'Date', 'action', 'date')}
            {propertySelect(
              'actionStatus',
              'Status',
              'action',
              'label',
              'Done-ness comes from the “done” status values above.',
            )}
          </>
        )}
      </div>
      {resolved.properties.goalHorizon && (
        <label class="field">
          <span>Horizon columns come from</span>
          <select
            value={draft.horizons.mode}
            onChange={(e) =>
              update((d) => {
                d.horizons.mode = (e.target as HTMLSelectElement).value as
                  | 'derived'
                  | 'property';
              })
            }
          >
            <option value="derived">Date distance (Now / Quarter / Year / Long)</option>
            <option value="property">
              The “{resolved.properties.goalHorizon.property.name}” labels
            </option>
          </select>
        </label>
      )}

      <h3>Grouping and color</h3>
      <div class="field-row">
        <label class="field">
          <span>Split timeline lanes by</span>
          <select
            value={draft.grouping.by}
            onChange={(e) =>
              update((d) => {
                d.grouping.by = (e.target as HTMLSelectElement).value as
                  | 'tag'
                  | 'property'
                  | 'type'
                  | 'none';
              })
            }
          >
            <option value="none">Nothing — one lane</option>
            <option value="tag">Tags</option>
            <option value="property">A property</option>
            <option value="type">Object type</option>
          </select>
        </label>
        {draft.grouping.by === 'property' && structureFor('project') && (
          <label class="field">
            <span>Which property?</span>
            <select
              value={draft.grouping.property ?? ''}
              onChange={(e) =>
                update((d) => {
                  d.grouping.property = (e.target as HTMLSelectElement).value || null;
                })
              }
            >
              <option value="">(pick one)</option>
              {structureFor('project')!
                .properties.filter((p) => p.type === 'label')
                .map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {draft.grouping.by === 'tag' && (
        <div class="field">
          <span>Which tags become lanes? (click in lane order)</span>
          <div class="tag-grid">
            {boot.tags.map((tag) => {
              const on = draft.grouping.values.includes(tag.name);
              return (
                <label key={tag.id} class={`tag-chip ${on ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      update((d) => {
                        d.grouping.values = on
                          ? d.grouping.values.filter((v) => v !== tag.name)
                          : [...d.grouping.values, tag.name];
                      })
                    }
                  />
                  {tag.name}
                </label>
              );
            })}
            {boot.tags.length === 0 && (
              <span class="empty-note">This space has no tags yet.</span>
            )}
          </div>
        </div>
      )}

      <h3>Display</h3>
      <div class="field-row">
        <label class="field">
          <span>Open on</span>
          <select
            value={draft.display.defaultView}
            onChange={(e) =>
              update((d) => {
                d.display.defaultView = (e.target as HTMLSelectElement).value as
                  | 'timeline'
                  | 'horizons';
              })
            }
          >
            <option value="timeline">Timeline</option>
            <option value="horizons">Horizons</option>
          </select>
        </label>
        <label class="field checkbox">
          <input
            type="checkbox"
            checked={draft.display.showCompleted}
            onChange={() =>
              update((d) => {
                d.display.showCompleted = !d.display.showCompleted;
              })
            }
          />
          <span>Show completed work</span>
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Fetch at most</span>
          <input
            type="number"
            min={10}
            max={5000}
            value={draft.display.fetchCeiling}
            onChange={(e) =>
              update((d) => {
                d.display.fetchCeiling = Number((e.target as HTMLInputElement).value);
              })
            }
          />
          <small>objects per run; the rest wait behind “load more”.</small>
        </label>
        <label class="field">
          <span>Cache for</span>
          <input
            type="number"
            min={1}
            value={draft.display.cacheTtlMinutes}
            onChange={(e) =>
              update((d) => {
                d.display.cacheTtlMinutes = Number((e.target as HTMLInputElement).value);
              })
            }
          />
          <small>minutes before an object is re-fetched.</small>
        </label>
        <label class="field">
          <span>Timezone override</span>
          <input
            type="text"
            placeholder="Browser timezone"
            value={draft.display.timezone ?? ''}
            onChange={(e) =>
              update((d) => {
                d.display.timezone = (e.target as HTMLInputElement).value || null;
              })
            }
          />
          <small>IANA name, e.g. Europe/Berlin. The now-line sits on your local today.</small>
        </label>
      </div>

      {resolved.warnings.length > 0 && (
        <div class="notice">
          {resolved.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <LivePreview
        session={props.session}
        boot={boot}
        draft={draft}
        today={props.today}
      />

      <div class="settings-actions">
        <button class="primary" onClick={save} disabled={!resolved.types.project}>
          {props.onboarding ? 'Save and open the timeline' : 'Save'}
        </button>
        {!props.onboarding && <a href={HASH_FOR.timeline}>Back to the timeline</a>}
        <button class="subtle" onClick={() => setShowTransfer((s) => !s)}>
          Export / import
        </button>
      </div>
      {savedNote && <p class="notice">{savedNote}</p>}
      {!resolved.types.project && (
        <p class="fineprint">
          Saving needs a project type mapped — that is the one thing Farview
          cannot invent.
        </p>
      )}

      {showTransfer && (
        <div class="transfer">
          <h3>Export</h3>
          <p class="fineprint">
            Copy this to move your configuration to another browser or device.
          </p>
          <textarea rows={8} readOnly value={exportConfig(draft)} />
          <h3>Import</h3>
          <textarea
            rows={8}
            value={importText}
            onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
            placeholder="Paste an exported Farview configuration…"
          />
          <button
            onClick={() => {
              try {
                setDraft(importConfig(importText));
                setImportError(null);
                setSavedNote(null);
              } catch {
                setImportError('That did not parse as an exported Farview configuration.');
              }
            }}
            disabled={importText.trim() === ''}
          >
            Load into the form
          </button>
          {importError && <p class="notice">{importError}</p>}
        </div>
      )}

      <h3>Connection</h3>
      {props.session.kind === 'live' && (
        <div class="field">
          {props.session.editingRequested ? (
            <>
              <p class="fineprint">
                Editing is on: this connection can create goals and change
                dates, always through your own explicit actions — never in
                the background.
              </p>
              <div class="settings-actions">
                <button
                  onClick={() => {
                    if (setTokenEditing(false)) location.reload();
                    else void connect({ editing: false });
                  }}
                >
                  Switch back to read-only
                </button>
              </div>
            </>
          ) : (
            <>
              <p class="fineprint">
                This connection is read-only — Farview cannot change anything
                in your space. Enabling editing lets you add goals and adjust
                dates from the timeline; with OAuth this reconnects so the
                consent screen shows the wider grant.
              </p>
              <div class="settings-actions">
                <button
                  onClick={() => {
                    if (setTokenEditing(true)) location.reload();
                    else void connect({ editing: true });
                  }}
                >
                  Enable editing
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div class="settings-actions">
        {props.session.kind === 'live' ? (
          <button
            onClick={() => {
              disconnect();
              location.assign('/app/');
            }}
          >
            Disconnect from Capacities
          </button>
        ) : (
          <button
            onClick={() => {
              endDemo();
              location.assign('/app/');
            }}
          >
            Leave the demo
          </button>
        )}
        <button
          onClick={() => {
            void props.data.clearCache().then(() => setSavedNote('Cache cleared.'));
          }}
        >
          Clear the object cache
        </button>
      </div>
      <p class="fineprint">
        You can also revoke Farview’s read access any time in Capacities under
        Settings → Capacities API → Connections.
      </p>
    </section>
  );
}

/**
 * The live preview (§6 step 7): the actual timeline, rendered from the
 * actual space through the draft mapping, before anything is saved.
 * Capped small so it stays quick even mid-onboarding.
 */
function LivePreview(props: {
  session: Session;
  boot: Boot;
  draft: FarviewConfig;
  today: LocalDate;
}) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const cacheRef = useRef(memoryCache());
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);

  const resolved = useMemo(
    () => resolveSchema(props.draft, props.boot.structures, props.boot.tags),
    [props.draft, props.boot],
  );
  const projectMapped = resolved.types.project !== undefined;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 100) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [projectMapped]);

  useEffect(() => {
    if (!projectMapped) {
      setItems(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const collected = new Map<string, TimelineItem>();
    setRunning(true);
    const config = normalizeConfig({
      ...props.draft,
      display: { ...props.draft.display, fetchCeiling: 80 },
    });
    void loadTimelineData(
      {
        provider: props.session.provider,
        cache: cacheRef.current,
        config,
        resolved,
        signal: controller.signal,
      },
      {
        onItems: (batch) => {
          if (cancelled) return;
          for (const item of batch) collected.set(item.id, item);
          setItems([...collected.values()]);
        },
        onProgress: () => {},
        onWarning: () => {},
      },
    )
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRunning(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [resolved, projectMapped, props.session]);

  if (!projectMapped) return null;

  const visible = (items ?? []).filter(
    (i) =>
      (props.draft.display.showCompleted || i.status !== 'done') &&
      (i.start !== null || i.target !== null),
  );
  const layout = layoutTimeline(visible, {
    view: defaultView(dayNumber(props.today)),
    width,
    today: props.today,
    groupOrder: props.draft.grouping.values,
  });

  return (
    <div class="preview-block">
      <h3>Live preview — your real timeline, before you save</h3>
      {running && items === null ? (
        <p class="loading">Placing your items on the line…</p>
      ) : visible.length === 0 ? (
        <p class="empty-note">
          Nothing dated to place with this mapping yet — check the date
          property picks above.
        </p>
      ) : null}
      <div class="tl-wrap preview" ref={wrapRef}>
        <TimelineSvg
          layout={layout}
          today={props.today}
          milestones={EMPTY_MILESTONES}
          selectedId={null}
          onSelect={() => {}}
        />
      </div>
    </div>
  );
}
