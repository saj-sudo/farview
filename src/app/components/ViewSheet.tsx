import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

/**
 * A phone's view controls in one row. The row names what is showing and
 * a single button opens the rest (chart or list, zoom, pillar, refresh)
 * in a sheet, so the chart starts near the top of the screen.
 */
export function ViewSheet(props: { summary: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <div class="phone-bar">
      <span class="phone-bar-summary">{props.summary}</span>
      <button class="phone-view-btn" aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        View
      </button>
      <dialog
        ref={ref}
        class="view-sheet"
        aria-label="View options"
        onClick={(e) => {
          // A tap on the backdrop lands on the dialog itself.
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div class="view-sheet-body">
          {props.children}
          <button class="primary view-sheet-done" onClick={() => ref.current?.close()}>
            Done
          </button>
        </div>
      </dialog>
    </div>
  );
}
