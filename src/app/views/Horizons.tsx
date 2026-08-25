import { useState } from 'preact/hooks';
import { formatLocalDate } from '../../engine/dates';
import { buildHorizonColumns, SOMEDAY_LABEL } from '../../engine/horizons';
import type { ResolvedSchema } from '../../engine/resolve';
import type { FarviewConfig, LocalDate, MilestoneItem, TimelineItem } from '../../engine/types';
import { ItemCard } from '../components/ItemCard';
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
  loadMilestones: (ids: string[]) => Promise<MilestoneItem[]>;
}) {
  const [selected, setSelected] = useState<TimelineItem | null>(null);
  const [milestones, setMilestones] = useState<Map<string, MilestoneItem[]>>(new Map());

  const visible = props.data.items.filter(
    (i) => props.config.display.showCompleted || i.status !== 'done',
  );
  const columns = buildHorizonColumns(visible, props.today, props.config, props.resolved);
  const total = visible.length;

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

      {selected && (
        <div class="tl-card-holder narrow">
          <ItemCard
            item={selected}
            today={props.today}
            deepLink={props.session.provider.deepLink(selected.id)}
            milestones={milestones.get(selected.id) ?? null}
            milestonesEnabled={props.resolved.properties.projectMilestones !== undefined}
            onLoadMilestones={requestMilestones}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </section>
  );
}
