import { useState } from 'preact/hooks';
import {
  pickSuggestion,
  type SuggestedRole,
  type SuggestedType,
  type Suggestion,
} from '../../engine/suggest';

/**
 * What Farview found in the space, ready to tick. The words are the ones
 * Capacities uses (object types, properties, status), and each line says what
 * the thing is used for. A guess says it is a guess and starts unticked.
 */

const quote = (name: string): string => `“${name}”`;

const list = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function describe(found: SuggestedType, status: Suggestion['statusValues']): { title: string; detail: string } {
  const p = found.properties;
  if (found.role === 'project') {
    const parts: string[] = [];
    if (p.projectStart) parts.push(`starts from ${quote(p.projectStart)}`);
    if (p.projectTarget) parts.push(`target from ${quote(p.projectTarget)}`);
    if (p.projectStatus) parts.push(`status from ${quote(p.projectStatus)}`);
    const first = parts.length ? `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : '';
    const flight = status && status.active.length ? ` ${list(status.active)} count as active.` : '';
    const finished = status && status.done.length ? ` ${list(status.done)} count as done.` : '';
    return {
      title: found.guess
        ? `${quote(found.type)} might be your projects`
        : `Your projects are ${quote(found.type)}`,
      detail: `Each one is a bar on the timeline. ${first}${flight}${finished}`.trim(),
    };
  }
  if (found.role === 'goal') {
    const dated = p.goalTarget ? ` Placed by ${quote(p.goalTarget)}.` : '';
    return { title: `Your goals are ${quote(found.type)}`, detail: `Shown as flags on the top lane.${dated}` };
  }
  return {
    title: `Your milestones are ${quote(found.type)}`,
    detail: 'Drawn as ticks on a project’s bar when you open it.',
  };
}

export function MappingSuggestions(props: {
  suggestion: Suggestion;
  spaceTitle: string;
  /** The first screen, before anything is saved. */
  firstRun: boolean;
  onUse: (picked: Suggestion) => void;
  onSkip: () => void;
}) {
  const { suggestion } = props;
  const [roles, setRoles] = useState<Set<SuggestedRole>>(
    () => new Set(suggestion.types.filter((t) => !t.guess).map((t) => t.role)),
  );

  const toggle = (role: SuggestedRole, on: boolean): void => {
    const next = new Set(roles);
    if (on) next.add(role);
    else next.delete(role);
    setRoles(next);
  };

  return (
    <section class="setup-card suggestions" aria-labelledby="suggest-title">
      <h2 id="suggest-title">{props.firstRun ? 'Start with what is in your space' : 'Found in your space'}</h2>
      <p>
        Farview read the object types and properties in {quote(props.spaceTitle)}. Tick what looks right
        {props.firstRun ? ' and the timeline opens with it' : ''}. Everything can be changed in Settings.
      </p>
      <ul class="suggest-list">
        {suggestion.types.map((found) => {
          const text = describe(found, found.role === 'project' ? suggestion.statusValues : null);
          return (
            <li key={found.role}>
              <label>
                <input
                  type="checkbox"
                  checked={roles.has(found.role)}
                  onChange={(e) => toggle(found.role, (e.target as HTMLInputElement).checked)}
                />
                <span>
                  <strong>{text.title}</strong>
                  <small>{text.detail}</small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div class="suggest-actions">
        <button
          class="primary"
          disabled={roles.size === 0}
          onClick={() => props.onUse(pickSuggestion(suggestion, roles))}
        >
          {props.firstRun ? 'Use these and open the timeline' : 'Use these'}
        </button>
        <button class="subtle" onClick={props.onSkip}>
          {props.firstRun ? 'Set it up by hand' : 'Not now'}
        </button>
      </div>
    </section>
  );
}
