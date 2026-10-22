import type { TimelineItem } from '../../engine/types';

/**
 * The Someday tray (§8.2): undated items live here, in view. Silently
 * losing a user's item from a view is worse than showing a gap.
 */
export function SomedayTray(props: {
  items: TimelineItem[];
  onSelect: (item: TimelineItem) => void;
  /** With editing on, an item can be dragged out of the tray onto the timeline. */
  canDrag?: (item: TimelineItem) => boolean;
  onDragStart?: (item: TimelineItem, e: PointerEvent) => void;
}) {
  const draggable = (item: TimelineItem): boolean =>
    props.onDragStart !== undefined && (props.canDrag?.(item) ?? true);
  const anyDraggable = props.items.some(draggable);
  if (props.items.length === 0) return null;
  return (
    <details class="someday" open={false}>
      <summary>
        Someday · {props.items.length} undated item
        {props.items.length === 1 ? '' : 's'}
      </summary>
      {anyDraggable && (
        <p class="someday-hint">Drag an item onto the timeline to give it dates.</p>
      )}
      <ul>
        {props.items.map((item) => (
          <li key={item.id}>
            <button
              class={`someday-item ${draggable(item) ? 'draggable' : ''}`}
              onClick={() => props.onSelect(item)}
              {...(draggable(item) ? { onPointerDown: (e: PointerEvent) => props.onDragStart!(item, e) } : {})}
            >
              {item.title}
            </button>
            {item.group !== null && <span class="chip">{item.group}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
