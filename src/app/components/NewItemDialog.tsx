import { useState } from 'preact/hooks';
import type { NewItemSpec } from '../../engine/editor';
import { isLocalDate } from '../../engine/dates';
import type { ResolvedSchema } from '../../engine/resolve';
import type { FarviewConfig, LocalDate } from '../../engine/types';

/**
 * The create dialog: a goal (or project) born on the timeline. Only
 * mapped kinds are offered; the horizon label select appears for goals
 * when the space uses an explicit horizon property.
 */

export function NewItemDialog(props: {
  resolved: ResolvedSchema;
  config: FarviewConfig;
  defaultKind: 'goal' | 'project';
  defaultTarget: LocalDate | null;
  onCreate: (spec: NewItemSpec) => Promise<boolean>;
  onClose: () => void;
}) {
  const kinds: ('goal' | 'project')[] = [
    ...(props.resolved.types.goal ? (['goal'] as const) : []),
    ...(props.resolved.types.project ? (['project'] as const) : []),
  ];
  const [kind, setKind] = useState<'goal' | 'project'>(
    kinds.includes(props.defaultKind) ? props.defaultKind : kinds[0]!,
  );
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(props.defaultTarget ?? '');
  const [start, setStart] = useState('');
  const [horizonLabel, setHorizonLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const horizonProperty =
    props.config.horizons.mode === 'property'
      ? props.resolved.properties.goalHorizon?.property
      : undefined;

  const typeName = (k: 'goal' | 'project'): string =>
    props.resolved.types[k]!.structure.title;

  const submit = async (): Promise<void> => {
    if (title.trim() === '' || saving) return;
    setSaving(true);
    const ok = await props.onCreate({
      kind,
      title: title.trim(),
      start: kind === 'project' && isLocalDate(start) ? (start as LocalDate) : null,
      target: isLocalDate(String(target)) ? (target as LocalDate) : null,
      horizonLabel: kind === 'goal' && horizonLabel !== '' ? horizonLabel : null,
    });
    setSaving(false);
    if (ok) props.onClose();
  };

  return (
    <div class="dialog-backdrop" onClick={props.onClose}>
      <div
        class="dialog"
        role="dialog"
        aria-label="New item"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') props.onClose();
        }}
      >
        <h3>New {typeName(kind)}</h3>
        {kinds.length > 1 && (
          <div class="tag-grid">
            {kinds.map((k) => (
              <label key={k} class={`tag-chip ${kind === k ? 'on' : ''}`}>
                <input
                  type="radio"
                  name="new-kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                {typeName(k)}
              </label>
            ))}
          </div>
        )}
        <label class="field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autofocus
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </label>
        <div class="field-row">
          {kind === 'project' && (
            <label class="field">
              <span>Start</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart((e.target as HTMLInputElement).value)}
              />
            </label>
          )}
          <label class="field">
            <span>Target</span>
            <input
              type="date"
              value={String(target)}
              onChange={(e) => setTarget((e.target as HTMLInputElement).value)}
            />
            <small>Leave empty for the Someday tray.</small>
          </label>
        </div>
        {kind === 'goal' && horizonProperty && horizonProperty.labelNames.length > 0 && (
          <label class="field">
            <span>{horizonProperty.name}</span>
            <select
              value={horizonLabel}
              onChange={(e) => setHorizonLabel((e.target as HTMLSelectElement).value)}
            >
              <option value="">(none)</option>
              {horizonProperty.labelNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div class="settings-actions">
          <button class="primary" onClick={() => void submit()} disabled={title.trim() === '' || saving}>
            {saving ? 'Creating…' : 'Create in Capacities'}
          </button>
          <button class="subtle" onClick={props.onClose}>
            Cancel
          </button>
        </div>
        <p class="fineprint">
          This writes one new object to your space — nothing else is touched.
        </p>
      </div>
    </div>
  );
}
