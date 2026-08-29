import type { JSX } from 'preact';
import { diffDays, formatLocalDate, MONTH_FULL, monthOf, yearOf } from '../../engine/dates';
import type { LocalDate, TimelineItem } from '../../engine/types';

/**
 * The narrow-viewport timeline (spec §9.3): a vertical list ordered by
 * date with a Today divider — not a squeezed horizontal axis. Same
 * data, same cards, phone-sized reading.
 */

export function AgendaList(props: {
  items: TimelineItem[];
  today: LocalDate;
  onSelect: (item: TimelineItem) => void;
}) {
  const dated = props.items
    .filter((i) => i.target !== null || i.start !== null)
    .sort((a, b) => {
      const da = (a.target ?? a.start)!;
      const db = (b.target ?? b.start)!;
      return da < db ? -1 : da > db ? 1 : a.title.localeCompare(b.title);
    });

  let lastMonth = '';
  let todayShown = false;
  const rows: JSX.Element[] = [];

  for (const item of dated) {
    const date = (item.target ?? item.start)!;
    if (!todayShown && date >= props.today) {
      rows.push(
        <li key="today-divider" class="agenda-today" aria-label="Today">
          <span>— Today · {formatLocalDate(props.today)} —</span>
        </li>,
      );
      todayShown = true;
    }
    const month = `${MONTH_FULL[monthOf(date) - 1]!} ${yearOf(date)}`;
    if (month !== lastMonth) {
      rows.push(
        <li key={`m-${month}`} class="agenda-month">
          {month}
        </li>,
      );
      lastMonth = month;
    }
    const elapsed =
      item.start !== null && item.target !== null && diffDays(item.target, item.start) > 0
        ? Math.min(
            1,
            Math.max(0, diffDays(props.today, item.start) / diffDays(item.target, item.start)),
          )
        : null;
    rows.push(
      <li key={item.id}>
        <button class="agenda-item" onClick={() => props.onSelect(item)}>
          <span class="agenda-title">{item.title}</span>
          <span class="fineprint">
            {item.target !== null ? formatLocalDate(item.target) : `from ${formatLocalDate(item.start!)}`}
            {item.group !== null ? ` · ${item.group}` : ''}
            {item.subGroup !== null ? ` › ${item.subGroup}` : ''}
          </span>
          {elapsed !== null && item.status !== 'done' && (
            <span class="agenda-meter" aria-hidden="true">
              <span style={{ width: `${Math.round(elapsed * 100)}%` }} />
            </span>
          )}
        </button>
      </li>,
    );
  }
  if (!todayShown && dated.length > 0) {
    rows.push(
      <li key="today-divider" class="agenda-today">
        <span>— Today · {formatLocalDate(props.today)} —</span>
      </li>,
    );
  }

  return <ul class="agenda">{rows}</ul>;
}
