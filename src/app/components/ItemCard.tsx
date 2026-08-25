import { useState } from 'preact/hooks';
import { diffDays, formatLocalDate, isLocalDate } from '../../engine/dates';
import type { DateChange } from '../../engine/editor';
import type { LocalDate, MilestoneItem, TimelineItem } from '../../engine/types';

/**
 * The detail card: everything Farview knows about one item, and a deep
 * link into the real object — Farview is a lens, never an editor. All
 * copy is matter-of-fact; a passed target is a fact, not a verdict.
 */

export interface ItemCardProps {
  item: TimelineItem;
  today: LocalDate;
  deepLink: string;
  milestones: MilestoneItem[] | null;
  milestonesEnabled: boolean;
  onLoadMilestones: (item: TimelineItem) => void;
  onClose: () => void;
  /** Present only when the user connected with editing. */
  onDateChange?: ((item: TimelineItem, change: DateChange) => Promise<boolean>) | null;
  /** Whether each date can be edited (mapped + writable property). */
  editableDates?: { start: boolean; target: boolean };
}

function elapsedSentence(item: TimelineItem, today: LocalDate): string | null {
  if (item.start === null || item.target === null) return null;
  const span = diffDays(item.target, item.start);
  if (span <= 0) return null;
  const elapsed = Math.min(span, Math.max(0, diffDays(today, item.start)));
  if (span >= 120) {
    const months = (n: number) => Math.round(n / 30.44);
    return `${months(elapsed)} of ${months(span)} months elapsed`;
  }
  return `${elapsed} of ${span} days elapsed`;
}

export function ItemCard(props: ItemCardProps) {
  const { item, today } = props;
  const [wantMilestones, setWantMilestones] = useState(false);

  const targetPassed =
    item.status !== 'done' && item.target !== null && item.target < today
      ? diffDays(today, item.target)
      : null;

  const showMilestones = (): void => {
    setWantMilestones(true);
    props.onLoadMilestones(item);
  };

  return (
    <div class="tl-card" role="dialog" aria-label={item.title}>
      <div class="tl-card-head">
        <h3>{item.title}</h3>
        <button class="subtle" onClick={props.onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p class="tl-card-meta">
        {item.kind === 'goal' && <span class="chip">Goal</span>}
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
              : 'No dates yet'}
      </p>
      {elapsedSentence(item, today) !== null && (
        <p class="fineprint">{elapsedSentence(item, today)}</p>
      )}
      {targetPassed !== null && (
        <p class="fineprint">
          Target passed {targetPassed === 1 ? 'a day' : `${targetPassed} days`} ago.
        </p>
      )}
      {item.flags.targetBeforeStart && (
        <p class="fineprint">
          The target date is before the start date — worth checking in
          Capacities.
        </p>
      )}

      {props.onDateChange && (
        <div class="tl-card-edit">
          {item.kind !== 'goal' && props.editableDates?.start && (
            <label class="field">
              <span>Start</span>
              <input
                type="date"
                value={item.start ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  void props.onDateChange!(item, { start: isLocalDate(v) ? (v as LocalDate) : null });
                }}
              />
            </label>
          )}
          {props.editableDates?.target && (
            <label class="field">
              <span>Target</span>
              <input
                type="date"
                value={item.target ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  void props.onDateChange!(item, { target: isLocalDate(v) ? (v as LocalDate) : null });
                }}
              />
            </label>
          )}
        </div>
      )}

      {props.milestonesEnabled && item.milestoneIds.length > 0 && (
        <div class="tl-card-milestones">
          {!wantMilestones ? (
            <button class="subtle" onClick={showMilestones}>
              Show {item.milestoneIds.length} milestone
              {item.milestoneIds.length === 1 ? '' : 's'}
            </button>
          ) : props.milestones === null ? (
            <p class="loading">…</p>
          ) : (
            <ul>
              {props.milestones.map((m) => (
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
          )}
        </div>
      )}

      <p class="tl-card-open">
        <a href={props.deepLink} target="_blank" rel="noreferrer">
          Open in Capacities ↗
        </a>
      </p>
    </div>
  );
}
