import { useState } from 'preact/hooks';
import { addDays, formatLocalDate } from '../../engine/dates';
import { buildHorizonColumns, SOMEDAY_LABEL } from '../../engine/horizons';
import type { ResolvedSchema } from '../../engine/resolve';
import type { FarviewConfig, LocalDate, MilestoneItem, TimelineItem } from '../../engine/types';
import type { EditActions } from '../edits';
import { ItemCard } from '../components/ItemCard';
import { NewItemDialog } from '../components/NewItemDialog';
import { RefreshBar } from '../components/RefreshBar';
import type { Session } from '../session';
import type { TimelineData } from '../useTimelineData';

/**
 * The Horizons view (spec §9.2): columns per bucket, ordered by
 * distance — Now, Quarter, Year, Long, Someday. The order IS the
 * sequence, so nothing is numbered. Cards group under goals when a
 * goal type is mapped; flat otherwise. Same dataset as the timeline.
 */

export function Horizons(props: {
  session: Session;
  config: FarviewConfig;
  resolved: ResolvedSchema;
  today: LocalDate;
  data: TimelineData;
  edit: EditActions | null;
  loadMilestones: (ids: string[]) => Promise<MilestoneItem[]>;
}) {
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const [milestones, setMilestones] = useState<Map<string, MilestoneItem[]>>(new Map());
  const [creatingTarget, setCreatingTarget] = useState<LocalDate | null | 'closed'>('closed');

  const visible = props.data.items.filter(
    (i) => props.config.display.showCompleted || i.status !== 'done',
  );
  const columns = buildHorizonColumns(visible, props.today, props.config, props.resolved);
  const total = visible.length;

  const liveSelected = selected
    ? (props.data.items.find((i) => i.id === selected.id) ?? selected)
    : null;

  const canCreate =
    props.edit !== null &&
    (props.resolved.types.goal !== undefined || props.resolved.types.project !== undefined);

  // A column's "+" pre-fills a target that lands inside that bucket.
  const targetForColumn = (label: string): LocalDate | null => {
    if (label === SOMEDAY_LABEL) return null;
    if (props.config.horizons.mode === 'derived') {
      const bucket = props.config.horizons.buckets.find((b) => b.label === label);
      return addDays(props.today, bucket?.maxDays ?? 548);
    }
    return addDays(props.today, 30);
  };

  const requestMilestones = (item: TimelineItem): void => {
    if (milestones.has(item.id)) return;
    void props.loadMilestones(item.milestoneIds).then((loaded) => {
      setMilestones((prev) => new Map(prev).set(item.id, loaded));
    });
  };

  const card = (item: TimelineItem) => (
    <button
      key={item.id}
      class={`hz-card ${item.status === 'done' ? 'is-done' : ''}`}
      onClick={() => setSelected(item)}
    >
      <span class="hz-title">{item.title}</span>
      <span class="fineprint">
        {item.target !== null
          ? formatLocalDate(item.target)
          : item.start !== null
            ? `from ${formatLocalDate(item.start)}`
            : 'undated'}
        {item.group !== null ? ` · ${item.group}` : ''}
      </span>
    </button>
  );

  return (
    <section class="horizons-view">
      <RefreshBar data={props.data} itemNoun="items" />
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
      {total === 0 && !props.data.loading ? (
        <div class="setup-card">
          <h3>Nothing to sort into horizons yet</h3>
          <p>
            Once mapped objects exist, they land in these columns by how far
            out their dates sit — and undated ones wait in Someday.
          </p>
        </div>
      ) : null}
      <div class="hz-columns">
        {columns.map((column) => (
          <div
            key={column.label}
            class={`hz-column ${column.label === SOMEDAY_LABEL ? 'someday-col' : ''}`}
          >
            <h3>
              {column.label}
              <span class="tl-lane-count">
                {column.items.length +
                  column.goalGroups.reduce((n, g) => n + g.items.length + 1, 0)}
              </span>
              {canCreate && (
                <button
                  class="subtle hz-add"
                  aria-label={`New item in ${column.label}`}
                  onClick={() => setCreatingTarget(targetForColumn(column.label))}
                >
                  +
                </button>
              )}
            </h3>
            {column.goalGroups.map((group) => (
              <div key={group.goal.id} class="hz-goal-group">
                <button class="hz-goal" onClick={() => setSelected(group.goal)}>
                  <span class="hz-flag" aria-hidden="true">⚑</span>
                  {group.goal.title}
                </button>
                {group.items.map(card)}
              </div>
            ))}
            {column.items.map(card)}
            {column.items.length === 0 && column.goalGroups.length === 0 && (
              <p class="empty-note hz-empty">nothing here</p>
            )}
          </div>
        ))}
      </div>

      {liveSelected && (
        <div class="tl-card-holder narrow">
          <ItemCard
            item={liveSelected}
            today={props.today}
            deepLink={props.session.provider.deepLink(liveSelected.id)}
            milestones={milestones.get(liveSelected.id) ?? null}
            milestonesEnabled={props.resolved.properties.projectMilestones !== undefined}
            onLoadMilestones={requestMilestones}
            onClose={() => setSelected(null)}
            onDateChange={props.edit ? props.edit.updateDates : null}
            editableDates={
              liveSelected.kind === 'goal'
                ? {
                    start: false,
                    target: props.resolved.properties.goalTarget?.property.writable === true,
                  }
                : {
                    start: props.resolved.properties.projectStart?.property.writable === true,
                    target:
                      props.resolved.properties.projectTarget?.property.writable === true,
                  }
            }
          />
        </div>
      )}

      {creatingTarget !== 'closed' && props.edit && (
        <NewItemDialog
          resolved={props.resolved}
          config={props.config}
          defaultKind={props.resolved.types.goal ? 'goal' : 'project'}
          defaultTarget={creatingTarget}
          onCreate={(spec) => props.edit!.createItem(spec)}
          onClose={() => setCreatingTarget('closed')}
        />
      )}
    </section>
  );
}
