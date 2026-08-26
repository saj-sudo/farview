import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { dayNumber } from '../../engine/dates';
import type { ResolvedSchema } from '../../engine/resolve';
import { layoutTimeline } from '../../engine/timeline/layout';
import {
  clampView,
  clampZoom,
  defaultView,
  pan,
  presetFor,
  zoomTo,
  ZOOM_PRESETS,
  type ViewState,
} from '../../engine/timeline/scale';
import type { FarviewConfig, LocalDate, MilestoneItem, TimelineItem } from '../../engine/types';
import { addDays } from '../../engine/dates';
import { applyDateChange, type DateChange } from '../../engine/editor';
import type { BarGeometry } from '../../engine/timeline/layout';
import type { EditActions } from '../edits';
import type { DragMode } from '../components/TimelineSvg';
import { focusParam } from '../router';
import type { Session } from '../session';
import type { TimelineData } from '../useTimelineData';
import { AgendaList } from '../components/AgendaList';
import { ItemCard } from '../components/ItemCard';
import { NewItemDialog } from '../components/NewItemDialog';
import { RefreshBar } from '../components/RefreshBar';
import { SomedayTray } from '../components/SomedayTray';
import { TimelineSvg } from '../components/TimelineSvg';

/**
 * The timeline view: zoom, pan, keyboard, selection — all the stateful
 * interaction over the pure layout. The chart is an SVG scene rebuilt
 * from layoutTimeline() on every view change; lane headers are a sticky
 * HTML overlay; the card is an HTML dialog anchored to its bar.
 */

const VIEW_KEY = 'farview.view';

function loadViewState(todayDay: number): ViewState {
  try {
    const raw = sessionStorage.getItem(VIEW_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ViewState>;
      if (
        typeof parsed.centerDay === 'number' &&
        typeof parsed.daysVisible === 'number'
      ) {
        return { centerDay: parsed.centerDay, daysVisible: clampZoom(parsed.daysVisible) };
      }
    }
  } catch {
    // fall through
  }
  return defaultView(todayDay);
}

export function Timeline(props: {
  session: Session;
  config: FarviewConfig;
  resolved: ResolvedSchema;
  today: LocalDate;
  data: TimelineData;
  edit: EditActions | null;
  loadMilestones: (ids: string[]) => Promise<MilestoneItem[]>;
}) {
  const todayDay = dayNumber(props.today);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [view, setView] = useState<ViewState>(() => loadViewState(todayDay));
  const [selected, setSelected] = useState<{
    item: TimelineItem;
    anchor: { x: number; y: number } | null;
  } | null>(null);
  const [milestones, setMilestones] = useState<Map<string, MilestoneItem[]>>(new Map());
  const [creating, setCreating] = useState(false);
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches,
  );
  const animRef = useRef<number | null>(null);
  const dragRef = useRef<{ x: number; moved: boolean } | null>(null);
  const itemDragRef = useRef<{
    item: TimelineItem;
    mode: DragMode;
    startX: number;
    moved: boolean;
  } | null>(null);
  const [dragChange, setDragChange] = useState<{ id: string; change: DateChange } | null>(
    null,
  );
  const suppressClickRef = useRef(false);
  const [focusedBarId, setFocusedBarId] = useState<string | null>(null);
  const nudgeRef = useRef<{
    origItem: TimelineItem;
    change: DateChange;
    timer: number;
  } | null>(null);

  const reducedMotion =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const mq = matchMedia('(max-width: 720px)');
    const onChange = (): void => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 100) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [narrow]);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // fine
    }
  }, [view]);

  const visible = useMemo(
    () =>
      props.data.items.filter(
        (i) => props.config.display.showCompleted || i.status !== 'done',
      ),
    [props.data.items, props.config.display.showCompleted],
  );
  // Items placed by a derived rollup span sit on the line (dashed), not
  // in the Someday tray.
  const someday = useMemo(
    () =>
      visible.filter((i) => i.start === null && i.target === null && i.derived === null),
    [visible],
  );
  const dated = useMemo(
    () =>
      visible.filter((i) => i.start !== null || i.target !== null || i.derived !== null),
    [visible],
  );

  const extent = useMemo(() => {
    let min = todayDay - 30;
    let max = todayDay + 30;
    for (const item of dated) {
      for (const d of [item.start, item.target]) {
        if (d === null) continue;
        const n = dayNumber(d);
        if (n < min) min = n;
        if (n > max) max = n;
      }
    }
    return { minDay: min, maxDay: max };
  }, [dated, todayDay]);

  const clamped = useMemo(() => clampView(view, extent), [view, extent]);
  const pxPerDay = width / clamped.daysVisible;

  // A live drag substitutes its ghost dates before layout, so the bar
  // (and everything packing around it) previews the drop in place.
  const layoutItems = useMemo(
    () =>
      dragChange
        ? dated.map((i) =>
            i.id === dragChange.id ? applyDateChange(i, dragChange.change) : i,
          )
        : dated,
    [dated, dragChange],
  );

  const layout = useMemo(
    () =>
      layoutTimeline(layoutItems, {
        view: clamped,
        width,
        today: props.today,
        groupOrder: props.config.grouping.values,
        ...(pxPerDay < 0.35 ? { maxRowsPerLane: 6 } : {}),
      }),
    [layoutItems, clamped, width, props.today, props.config.grouping.values, pxPerDay],
  );

  /* ---------------- zoom + pan ---------------- */

  const animateTo = (target: ViewState): void => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    if (reducedMotion) {
      setView(target);
      return;
    }
    const from = clamped;
    const t0 = performance.now();
    const DURATION = 200;
    const step = (t: number): void => {
      const k = Math.min(1, (t - t0) / DURATION);
      const ease = k * (2 - k); // easeOutQuad
      setView({
        centerDay: from.centerDay + (target.centerDay - from.centerDay) * ease,
        // log-space so the motion feels uniform across zoom levels
        daysVisible: Math.exp(
          Math.log(from.daysVisible) +
            (Math.log(target.daysVisible) - Math.log(from.daysVisible)) * ease,
        ),
      });
      if (k < 1) animRef.current = requestAnimationFrame(step);
      else animRef.current = null;
    };
    animRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
  }, []);

  const zoomPreset = (days: number): void => {
    const nowVisible =
      todayDay > clamped.centerDay - clamped.daysVisible / 2 &&
      todayDay < clamped.centerDay + clamped.daysVisible / 2;
    animateTo(zoomTo(clamped, days, nowVisible ? todayDay : clamped.centerDay));
  };

  const goToToday = (): void => {
    animateTo({ ...clamped, centerDay: todayDay - clamped.daysVisible / 2 + clamped.daysVisible / 3 });
  };

  const stepPreset = (direction: 1 | -1): void => {
    const days = [...ZOOM_PRESETS].map((p) => p.days);
    const current = clamped.daysVisible;
    const next =
      direction === 1
        ? days.filter((d) => d > current * 1.05)[0]
        : [...days].reverse().filter((d) => d < current * 0.95)[0];
    if (next !== undefined) zoomPreset(next);
  };

  /* ---------------- pointer: pan, and item drags when editing ---------------- */

  const dragChangeFor = (
    item: TimelineItem,
    mode: DragMode,
    deltaDays: number,
  ): DateChange => {
    if (mode === 'move') {
      const change: DateChange = {};
      if (item.start !== null) change.start = addDays(item.start, deltaDays);
      if (item.target !== null) change.target = addDays(item.target, deltaDays);
      return change;
    }
    if (mode === 'start') {
      let next = addDays(item.start!, deltaDays);
      if (item.target !== null && next > item.target) next = item.target;
      return { start: next };
    }
    let next = addDays(item.target!, deltaDays);
    if (item.start !== null && next < item.start) next = item.start;
    return { target: next };
  };

  const onBarDragStart = (bar: BarGeometry, mode: DragMode, e: PointerEvent): void => {
    e.stopPropagation(); // the chart must not pan underneath an item drag
    itemDragRef.current = { item: bar.item, mode, startX: e.clientX, moved: false };
  };

  const onPointerDown = (e: PointerEvent): void => {
    dragRef.current = { x: e.clientX, moved: false };
  };
  const onPointerMove = (e: PointerEvent): void => {
    const itemDrag = itemDragRef.current;
    if (itemDrag && props.edit) {
      const dx = e.clientX - itemDrag.startX;
      if (!itemDrag.moved && Math.abs(dx) > 4) {
        itemDrag.moved = true;
        suppressClickRef.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      if (itemDrag.moved) {
        const deltaDays = Math.round(dx / pxPerDay); // day-snapped
        setDragChange({
          id: itemDrag.item.id,
          change: dragChangeFor(itemDrag.item, itemDrag.mode, deltaDays),
        });
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      // Capture only once a real drag starts, so plain clicks still
      // reach the bars underneath.
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (drag.moved) {
      drag.x = e.clientX;
      setView((v) => pan(clampView(v, extent), dx, width));
    }
  };
  const onPointerUp = (): void => {
    const itemDrag = itemDragRef.current;
    if (itemDrag) {
      itemDragRef.current = null;
      const pending = dragChange;
      setDragChange(null);
      if (itemDrag.moved && pending && props.edit) {
        // The optimistic apply inside updateDates replaces the ghost.
        void props.edit.updateDates(itemDrag.item, pending.change);
      }
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) setSelected(null); // plain click on empty space
  };

  const onWheel = (e: WheelEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = wrapRef.current?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : width / 2;
      const anchorDay = clamped.centerDay - clamped.daysVisible / 2 + (x / width) * clamped.daysVisible;
      const factor = Math.exp(e.deltaY * 0.002);
      setView(zoomTo(clamped, clampZoom(clamped.daysVisible * factor), anchorDay));
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      setView((v) => pan(clampView(v, extent), -e.deltaX, width));
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const panBy = (frac: number): void =>
      setView((v) => ({ ...v, centerDay: v.centerDay + v.daysVisible * frac }));
    switch (e.key) {
      case 'ArrowLeft':
        panBy(e.shiftKey ? -0.5 : -0.1);
        e.preventDefault();
        break;
      case 'ArrowRight':
        panBy(e.shiftKey ? 0.5 : 0.1);
        e.preventDefault();
        break;
      case '+':
      case '=':
        stepPreset(-1);
        e.preventDefault();
        break;
      case '-':
        stepPreset(1);
        e.preventDefault();
        break;
      case 't':
      case '0':
        goToToday();
        e.preventDefault();
        break;
      case 'Home':
        animateTo({ ...clamped, centerDay: extent.minDay + clamped.daysVisible / 3 });
        e.preventDefault();
        break;
      case 'End':
        animateTo({ ...clamped, centerDay: extent.maxDay - clamped.daysVisible / 3 });
        e.preventDefault();
        break;
      case 'Escape':
        if (itemDragRef.current) {
          // Cancel the drag: the ghost vanishes, nothing is written.
          itemDragRef.current = null;
          setDragChange(null);
        } else {
          setSelected(null);
        }
        break;
      case '[':
      case ']':
        if (props.edit && focusedBarId) {
          const item = props.data.items.find((i) => i.id === focusedBarId);
          if (item) {
            const delta = (e.key === ']' ? 1 : -1) * (e.shiftKey ? 7 : 1);
            nudge(item, e.altKey ? 'start' : 'target', delta);
            e.preventDefault();
          }
        }
        break;
      default:
        break;
    }
  };

  /* ---------------- keyboard nudges (debounced commit) ---------------- */

  const commitNudge = (): void => {
    const pending = nudgeRef.current;
    if (!pending) return;
    nudgeRef.current = null;
    clearTimeout(pending.timer);
    if (props.edit) void props.edit.updateDates(pending.origItem, pending.change);
  };

  const nudge = (item: TimelineItem, field: 'start' | 'target', deltaDays: number): void => {
    if (nudgeRef.current && nudgeRef.current.origItem.id !== item.id) commitNudge();
    const base = nudgeRef.current ?? { origItem: item, change: {} as DateChange, timer: 0 };
    const current =
      base.change[field] !== undefined ? base.change[field] : base.origItem[field];
    if (current == null) return; // a missing date is set from the card, not nudged
    base.change = { ...base.change, [field]: addDays(current, deltaDays) };
    props.data.upsertItem(applyDateChange(base.origItem, base.change));
    clearTimeout(base.timer);
    base.timer = window.setTimeout(commitNudge, 800);
    nudgeRef.current = base;
  };

  useEffect(() => commitNudge, []); // flush a pending nudge on unmount

  /* ---------------- selection + deep links ---------------- */

  const select = (item: TimelineItem | null, anchor: { x: number; y: number } | null): void => {
    if (suppressClickRef.current) return; // the click that ends a drag is not a click
    setSelected(item ? { item, anchor } : null);
  };

  const centerOn = (item: TimelineItem): void => {
    const date = item.target ?? item.start;
    if (date !== null) {
      animateTo({ ...clamped, centerDay: dayNumber(date) });
    }
    setSelected({ item, anchor: null });
  };

  useEffect(() => {
    const id = focusParam();
    if (!id) return;
    const item = props.data.items.find((i) => i.id === id);
    if (item) centerOn(item);
    // Run when items land; centering twice is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.data.items.length]);

  const requestMilestones = (item: TimelineItem): void => {
    if (milestones.has(item.id)) return;
    void props.loadMilestones(item.milestoneIds).then((loaded) => {
      setMilestones((prev) => new Map(prev).set(item.id, loaded));
    });
  };

  /* ---------------- editing ---------------- */

  // The card always shows the LIVE item — an optimistic date change or
  // server confirmation must not leave a stale snapshot on screen.
  const liveSelected = selected
    ? (props.data.items.find((i) => i.id === selected.item.id) ?? selected.item)
    : null;

  const editableDates = (item: TimelineItem): { start: boolean; target: boolean } =>
    item.kind === 'goal'
      ? {
          start: false,
          target: props.resolved.properties.goalTarget?.property.writable === true,
        }
      : {
          start: props.resolved.properties.projectStart?.property.writable === true,
          target: props.resolved.properties.projectTarget?.property.writable === true,
        };

  const canCreate =
    props.edit !== null &&
    (props.resolved.types.goal !== undefined || props.resolved.types.project !== undefined);

  const cardFor = (item: TimelineItem) => (
    <ItemCard
      item={item}
      today={props.today}
      deepLink={props.session.provider.deepLink(item.id)}
      milestones={milestones.get(item.id) ?? null}
      milestonesEnabled={props.resolved.properties.projectMilestones !== undefined}
      onLoadMilestones={requestMilestones}
      onClose={() => setSelected(null)}
      onDateChange={props.edit ? props.edit.updateDates : null}
      editableDates={editableDates(item)}
    />
  );

  /* ---------------- empty states (§9.4) ---------------- */

  const nothingLoaded = !props.data.loading && props.data.items.length === 0;
  const allUndated = !props.data.loading && dated.length === 0 && someday.length > 0;
  const targetName =
    props.resolved.properties.projectTarget?.property.name ??
    props.config.properties.projectTarget ??
    'a target date';

  const activePreset = presetFor(clamped.daysVisible);

  if (narrow) {
    return (
      <section class="timeline-view">
        <RefreshBar data={props.data} itemNoun="items" />
        {props.edit?.notice && (
          <p class="notice">
            {props.edit.notice}{' '}
            <button class="subtle" onClick={props.edit.dismissNotice}>
              dismiss
            </button>
          </p>
        )}
        {canCreate && (
          <p>
            <button onClick={() => setCreating(true)}>+ New</button>
          </p>
        )}
        {nothingLoaded && <EmptyNote targetName={targetName} kind="none" />}
        <AgendaList items={visible} today={props.today} onSelect={centerOn} />
        <SomedayTray items={someday} onSelect={(i) => setSelected({ item: i, anchor: null })} />
        {liveSelected && <div class="tl-card-holder narrow">{cardFor(liveSelected)}</div>}
        {creating && props.edit && (
          <NewItemDialog
            resolved={props.resolved}
            config={props.config}
            defaultKind={props.resolved.types.goal ? 'goal' : 'project'}
            defaultTarget={addDays(props.today, 30)}
            onCreate={async (spec) => (await props.edit!.createItem(spec)) !== null}
            onClose={() => setCreating(false)}
          />
        )}
      </section>
    );
  }

  return (
    <section class="timeline-view">
      <div class="tl-toolbar">
        <RefreshBar data={props.data} itemNoun="items" />
        <div class="tl-zoom" role="group" aria-label="Zoom">
          {ZOOM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              class={`tl-zoom-chip ${activePreset === preset.id ? 'active' : ''}`}
              onClick={() => zoomPreset(preset.days)}
            >
              {preset.label}
            </button>
          ))}
          <button class="tl-zoom-chip today" onClick={goToToday}>
            Today
          </button>
          {canCreate && (
            <button class="tl-zoom-chip tl-new" onClick={() => setCreating(true)}>
              + New
            </button>
          )}
        </div>
      </div>

      {props.data.warnings.map((w) => (
        <p key={w} class="notice">
          {w}
        </p>
      ))}
      {props.edit?.notice && (
        <p class="notice">
          {props.edit.notice}{' '}
          <button class="subtle" onClick={props.edit.dismissNotice}>
            dismiss
          </button>
        </p>
      )}

      {nothingLoaded ? (
        <EmptyNote targetName={targetName} kind="none" />
      ) : allUndated ? (
        <EmptyNote targetName={targetName} kind="allUndated" />
      ) : null}

      <div
        class="tl-wrap"
        ref={wrapRef}
        tabIndex={0}
        role="application"
        aria-label={
          props.edit
            ? 'Timeline. Arrow keys pan, plus and minus zoom, T jumps to today, Tab walks the items. With an item focused, square brackets nudge its target date and Alt with brackets nudges the start; drag bars to move or resize.'
            : 'Timeline. Arrow keys pan, plus and minus zoom, T jumps to today, Tab walks the items.'
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <div class="tl-lane-headers" aria-hidden="true">
          {layout.lanes.map((lane) => (
            <div key={lane.label} class="tl-lane-header" style={{ top: `${lane.y + 4}px` }}>
              <span class="tl-lane-dot" style={{ background: lane.color }} />
              {lane.label}
              <span class="tl-lane-count">{lane.count}</span>
              {lane.overflowCount > 0 && (
                <span class="tl-lane-count">+{lane.overflowCount} more — zoom in</span>
              )}
            </div>
          ))}
        </div>
        <TimelineSvg
          layout={layout}
          today={props.today}
          milestones={milestones}
          selectedId={selected?.item.id ?? null}
          onSelect={select}
          editable={props.edit !== null}
          onBarDragStart={onBarDragStart}
          onFocusBar={setFocusedBarId}
        />
        {liveSelected && selected && (
          <div
            class="tl-card-holder"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') e.stopPropagation();
            }}
            style={{
              left: `${Math.max(8, Math.min(width - 340, (selected.anchor?.x ?? width / 2) - 160))}px`,
              top: `${(selected.anchor?.y ?? 80) + 10}px`,
            }}
          >
            {cardFor(liveSelected)}
          </div>
        )}
      </div>

      <SomedayTray items={someday} onSelect={centerOn} />

      {creating && props.edit && (
        <NewItemDialog
          resolved={props.resolved}
          config={props.config}
          defaultKind={props.resolved.types.goal ? 'goal' : 'project'}
          defaultTarget={addDays(props.today, 30)}
          onCreate={async (spec) => (await props.edit!.createItem(spec)) !== null}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}

function EmptyNote(props: { targetName: string; kind: 'none' | 'allUndated' }) {
  return props.kind === 'none' ? (
    <div class="setup-card">
      <h3>Nothing to place yet</h3>
      <p>
        No objects of the mapped type were found. Once something exists with a
        date in “{props.targetName}”, it will land on this line — or revisit
        Settings if the mapping looks wrong.
      </p>
    </div>
  ) : (
    <div class="setup-card">
      <h3>Everything is undated so far</h3>
      <p>
        Farview places items by their dates, and none of these have one yet —
        they are all in the Someday tray below. Add a date to “
        {props.targetName}” in Capacities and it appears on the line.
      </p>
    </div>
  );
}
