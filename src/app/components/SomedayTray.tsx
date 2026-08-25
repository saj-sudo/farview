import type { TimelineItem } from '../../engine/types';

/**
 * The Someday tray (§8.2): undated items live here, visibly — silently
 * losing a user's item from a view is worse than showing a gap.
 */
export function SomedayTray(props: {
  items: TimelineItem[];
  onSelect: (item: TimelineItem) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <details class="someday" open={false}>
      <summary>
        Someday · {props.items.length} undated item
        {props.items.length === 1 ? '' : 's'}
      </summary>
      <ul>
        {props.items.map((item) => (
          <li key={item.id}>
            <button class="someday-item" onClick={() => props.onSelect(item)}>
              {item.title}
            </button>
            {item.group !== null && <span class="chip">{item.group}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
