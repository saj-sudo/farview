import type { PillarChoice } from '../../engine/timeline/focus';

/**
 * One chip per pillar, plus "All". Picking a pillar shows only its lanes;
 * picking it again, or All, brings the rest back.
 */
export function PillarFocus(props: {
  pillars: PillarChoice[];
  focus: string | null;
  onFocus: (pillar: string | null) => void;
}) {
  if (props.pillars.length < 2) return null;
  return (
    <div class="pillar-focus" role="group" aria-label="Focus on a pillar">
      <button
        class={`pillar-chip ${props.focus === null ? 'active' : ''}`}
        aria-pressed={props.focus === null}
        onClick={() => props.onFocus(null)}
      >
        All
      </button>
      {props.pillars.map((pillar) => (
        <button
          key={pillar.name}
          class={`pillar-chip ${props.focus === pillar.name ? 'active' : ''}`}
          aria-pressed={props.focus === pillar.name}
          onClick={() => props.onFocus(props.focus === pillar.name ? null : pillar.name)}
        >
          {pillar.name}
          <span class="pillar-count">{pillar.count}</span>
        </button>
      ))}
    </div>
  );
}
