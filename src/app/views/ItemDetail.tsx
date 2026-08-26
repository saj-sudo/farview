import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dayNumber, diffDays, formatLocalDate } from '../../engine/dates';
import type { ResolvedSchema } from '../../engine/resolve';
import { deriveSpan, factSentence, rollupFacts } from '../../engine/rollup';
import { layoutTimeline } from '../../engine/timeline/layout';
import type { ViewState } from '../../engine/timeline/scale';
import { isLocalDate } from '../../engine/dates';
import type {
  ActionItem,
  FarviewConfig,
  LocalDate,
  MilestoneItem,
  TimelineItem,
} from '../../engine/types';
import type { EditActions } from '../edits';
import { NewItemDialog } from '../components/NewItemDialog';
import { TimelineSvg } from '../components/TimelineSvg';
import { HASH_FOR, itemHash, useHashItemId } from '../router';
import type { Session } from '../session';
import type { TimelineData } from '../useTimelineData';

/**
 * The drill-in page — the Life-OS moment: click into a goal or project
 * and get its own timeline. The item's bar sits on top; its projects
 * and actions fill the lanes below; facts (never percents) sum up the
 * children; and with editing on, new children are born already linked.
 */

const ACTIONS_LANE = 'Actions';
const PROJECTS_LANE = 'Projects';

function actionAsItem(action: ActionItem, lane: string): TimelineItem {
  return {
    id: action.id,
    title: action.title,
    kind: 'project',
    start: action.start,
    target: action.target,
    status: action.done ? 'done' : 'active',
    statusLabel: null,
    group: lane,
    tags: [],
    flags: { targetBeforeStart: false },
    milestoneIds: [],
    goalId: null,
    actionIds: [],
    derived: null,
    horizonLabel: null,
  };
}

/** Window fitted to the family's dates, today included when nearby. */
function fitView(items: TimelineItem[], todayDay: number): ViewState {
  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    for (const d of [item.start, item.target, item.derived?.start, item.derived?.target]) {
      if (!d) continue;
      const n = dayNumber(d);
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  if (!Number.isFinite(min)) {
    min = todayDay - 30;
    max = todayDay + 60;
  }
  // Pull today into frame when it's within a window-width of the family.
  if (todayDay > min - (max - min) && todayDay < max + (max - min)) {
    min = Math.min(min, todayDay);
    max = Math.max(max, todayDay);
  }
  const span = Math.max(max - min, 30);
  const pad = span * 0.12;
  return { centerDay: (min + max) / 2, daysVisible: span + pad * 2 };
}

export function ItemDetail(props: {
  session: Session;
  config: FarviewConfig;
  resolved: ResolvedSchema;
  today: LocalDate;
  data: TimelineData;
  edit: EditActions | null;
}) {
  const id = useHashItemId();
  const [missing, setMissing] = useState(false);
  const [actions, setActions] = useState<ActionItem[] | null>(null);
  const [milestones, setMilestones] = useState<MilestoneItem[] | null>(null);
  const [creating, setCreating] = useState<'project' | 'action' | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(860);

  const item = id ? (props.data.items.find((i) => i.id === id) ?? null) : null;

  // Cold deep-link: the item may not be in the loaded set yet.
  useEffect(() => {
    if (!id || item) return;
    let cancelled = false;
    void props.data.loadSingle(id).then((loaded) => {
      if (!cancelled && loaded === null) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, item === null]);

  // Children: actions and milestone marks load lazily, per item.
  useEffect(() => {
    setActions(null);
    setMilestones(null);
    if (!item) return;
    let cancelled = false;
    if (item.actionIds.length > 0) {
      void props.data.loadActionItems(item.actionIds).then((loaded) => {
        if (!cancelled) setActions(loaded);
      });
    } else {
      setActions([]);
    }
    if (item.milestoneIds.length > 0) {
      void props.data.loadMilestones(item.milestoneIds).then((loaded) => {
        if (!cancelled) setMilestones(loaded);
      });
    } else {
      setMilestones([]);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.actionIds.join(','), item?.milestoneIds.join(',')]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 100) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [item?.id]);

  if (!id) {
    return (
      <p class="empty-note">
        No item to show — pick one from the <a href={HASH_FOR.timeline}>timeline</a>.
      </p>
    );
  }
  if (missing) {
    return (
      <p class="empty-note">
        That item is not in this space any more.{' '}
        <a href={HASH_FOR.timeline}>Back to the timeline</a>.
      </p>
    );
  }
  if (!item) return <p class="loading">Reading the item…</p>;

  /* ---------------- family assembly ---------------- */

  const childProjects =
    item.kind === 'goal'
      ? props.data.items.filter((i) => i.kind === 'project' && i.goalId === item.id)
      : [];
  const parentGoal =
    item.kind === 'project' && item.goalId !== null
      ? (props.data.items.find((i) => i.id === item.goalId) ?? null)
      : null;

  const familyItems: TimelineItem[] = [
    item,
    ...childProjects.map((p) => ({ ...p, group: PROJECTS_LANE })),
    ...(actions ?? []).map((a) => actionAsItem(a, ACTIONS_LANE)),
  ];
  // The item's own span can be derived live from what's on screen.
  const selfDerived =
    item.start === null && item.target === null
      ? (item.derived ??
        deriveSpan([...childProjects, ...(actions ?? [])]))
      : null;
  if (selfDerived) familyItems[0] = { ...item, derived: selfDerived };

  const todayDay = dayNumber(props.today);
  const view = fitView(familyItems, todayDay);
  const layout = layoutTimeline(
    familyItems.filter((i) => i.start !== null || i.target !== null || i.derived !== null),
    {
      view,
      width,
      today: props.today,
      groupOrder: [PROJECTS_LANE, ACTIONS_LANE],
    },
  );

  const facts = factSentence(rollupFacts(childProjects, actions ?? []));
  const undatedChildren = [
    ...childProjects.filter((p) => p.start === null && p.target === null),
    ...(actions ?? []).filter((a) => a.start === null && a.target === null),
  ];

  const elapsed = (): string | null => {
    if (item.start === null || item.target === null) return null;
    const span = diffDays(item.target, item.start);
    if (span <= 0) return null;
    const done = Math.min(span, Math.max(0, diffDays(props.today, item.start)));
    return span >= 120
      ? `${Math.round(done / 30.44)} of ${Math.round(span / 30.44)} months elapsed`
      : `${done} of ${span} days elapsed`;
  };

  const canAddAction =
    props.edit !== null &&
    props.resolved.types.action !== undefined &&
    (item.kind === 'goal'
      ? props.resolved.properties.goalActions !== undefined
      : props.resolved.properties.projectActions !== undefined);
  const canAddProject =
    props.edit !== null &&
    item.kind === 'goal' &&
    props.resolved.types.project !== undefined &&
    props.resolved.properties.projectGoal !== undefined;

  const editableDates =
    item.kind === 'goal'
      ? { start: false, target: props.resolved.properties.goalTarget?.property.writable === true }
      : {
          start: props.resolved.properties.projectStart?.property.writable === true,
          target: props.resolved.properties.projectTarget?.property.writable === true,
        };

  return (
    <section class="detail-view">
      <p class="detail-crumbs">
        <a href={HASH_FOR.timeline}>← Timeline</a>
        {parentGoal && (
          <>
            {' · part of '}
            <a href={itemHash(parentGoal.id)}>⚑ {parentGoal.title}</a>
          </>
        )}
      </p>

      <div class="view-head detail-head">
        <div>
          <h2>{item.title}</h2>
          <p class="tl-card-meta">
            <span class="chip">
              {props.resolved.types[item.kind]?.structure.title ?? item.kind}
            </span>
            {item.group !== null && <span class="chip">{item.group}</span>}
            {item.statusLabel !== null && <span class="chip">{item.statusLabel}</span>}
          </p>
          <p class="tl-card-dates">
            {item.start !== null && item.target !== null
              ? `${formatLocalDate(item.start)} → ${formatLocalDate(item.target)}`
              : item.target !== null
                ? `Target: ${formatLocalDate(item.target)}`
                : item.start !== null
                  ? `Started ${formatLocalDate(item.start)} — no target date`
                  : selfDerived
                    ? `No dates of its own — its children span ${
                        selfDerived.start ? formatLocalDate(selfDerived.start) : '…'
                      } → ${selfDerived.target ? formatLocalDate(selfDerived.target) : '…'}`
                    : 'No dates yet'}
          </p>
          {elapsed() && <p class="fineprint">{elapsed()}</p>}
          {facts && <p class="fineprint detail-facts">{facts}</p>}
          <p class="tl-card-open">
            <a
              href={props.session.provider.deepLink(item.id)}
              target="_blank"
              rel="noreferrer"
            >
              Open in Capacities ↗
            </a>
          </p>
        </div>
        <div class="detail-actions">
          {props.edit && (editableDates.start || editableDates.target) && (
            <div class="tl-card-edit">
              {item.kind !== 'goal' && editableDates.start && (
                <label class="field">
                  <span>Start</span>
                  <input
                    type="date"
                    value={item.start ?? ''}
                    onChange={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      void props.edit!.updateDates(item, {
                        start: isLocalDate(v) ? (v as LocalDate) : null,
                      });
                    }}
                  />
                </label>
              )}
              {editableDates.target && (
                <label class="field">
                  <span>Target</span>
                  <input
                    type="date"
                    value={item.target ?? ''}
                    onChange={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      void props.edit!.updateDates(item, {
                        target: isLocalDate(v) ? (v as LocalDate) : null,
                      });
                    }}
                  />
                </label>
              )}
            </div>
          )}
          <div class="settings-actions">
            {canAddProject && (
              <button onClick={() => setCreating('project')}>+ Project</button>
            )}
            {canAddAction && (
              <button onClick={() => setCreating('action')}>+ Action</button>
            )}
          </div>
        </div>
      </div>

      {props.edit?.notice && (
        <p class="notice">
          {props.edit.notice}{' '}
          <button class="subtle" onClick={props.edit.dismissNotice}>
            dismiss
          </button>
        </p>
      )}

      {/* The mini-timeline: this item and everything under it. */}
      <div class="tl-wrap detail-chart" ref={wrapRef}>
        <div class="tl-lane-headers" aria-hidden="true">
          {layout.lanes.map((lane) => (
            <div key={lane.label} class="tl-lane-header" style={{ top: `${lane.y + 4}px` }}>
              <span class="tl-lane-dot" style={{ background: lane.color }} />
              {lane.label === 'Goals' || lane.label === 'Projects'
                ? lane.label
                : lane.label}
              <span class="tl-lane-count">{lane.count}</span>
            </div>
          ))}
        </div>
        <TimelineSvg
          layout={layout}
          today={props.today}
          milestones={new Map(milestones ? [[item.id, milestones]] : [])}
          selectedId={item.id}
          onSelect={(clicked) => {
            if (!clicked || clicked.id === item.id) return;
            if (childProjects.some((p) => p.id === clicked.id)) {
              location.hash = itemHash(clicked.id);
            }
          }}
        />
      </div>
      {actions === null && item.actionIds.length > 0 && (
        <p class="loading">Placing its actions…</p>
      )}

      {/* Children lists: navigable, facts visible, nothing hidden. */}
      {childProjects.length > 0 && (
        <div class="detail-list">
          <h3>Projects</h3>
          <ul>
            {childProjects.map((p) => (
              <li key={p.id}>
                <a href={itemHash(p.id)} class="detail-child">
                  <span class={p.status === 'done' ? 'done' : ''}>{p.title}</span>
                  <span class="fineprint">
                    {p.target !== null
                      ? formatLocalDate(p.target)
                      : p.start !== null
                        ? `from ${formatLocalDate(p.start)}`
                        : 'undated'}
                    {p.status === 'done' ? ' · ✓' : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(actions?.length ?? 0) > 0 && (
        <div class="detail-list">
          <h3>Actions</h3>
          <ul>
            {actions!.map((a) => (
              <li key={a.id} class={a.done ? 'done' : ''}>
                <span class="tl-ms-dot" aria-hidden="true">
                  {a.done ? '◆' : '◇'}
                </span>
                {a.title}
                <span class="fineprint">
                  {a.target !== null ? ` · ${formatLocalDate(a.target)}` : ' · undated'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(milestones?.length ?? 0) > 0 && (
        <div class="detail-list">
          <h3>Milestones</h3>
          <ul>
            {milestones!.map((m) => (
              <li key={m.id} class={m.done ? 'done' : ''}>
                <span class="tl-ms-dot" aria-hidden="true">
                  {m.done ? '◆' : '◇'}
                </span>
                {m.title}
                {m.date !== null && (
                  <span class="fineprint"> · {formatLocalDate(m.date)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {undatedChildren.length > 0 && (
        <p class="fineprint">
          {undatedChildren.length} undated{' '}
          {undatedChildren.length === 1 ? 'child waits' : 'children wait'} off the
          line — dates in Capacities (or here) place them.
        </p>
      )}
      {childProjects.length === 0 &&
        (actions?.length ?? 0) === 0 &&
        (milestones?.length ?? 0) === 0 &&
        actions !== null && (
          <p class="empty-note">
            Nothing linked here yet
            {canAddAction || canAddProject
              ? ' — the buttons above create children already connected.'
              : '.'}
          </p>
        )}

      {creating && props.edit && (
        <NewItemDialog
          resolved={props.resolved}
          config={props.config}
          defaultKind={creating}
          allowedKinds={[creating]}
          defaultTarget={item.target}
          parentTitle={item.title}
          onCreate={(spec) => props.edit!.createItem(spec, item)}
          onClose={() => setCreating(null)}
        />
      )}
    </section>
  );
}
