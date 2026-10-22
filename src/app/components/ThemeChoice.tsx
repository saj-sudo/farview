import { useTheme, type ThemeChoice as Choice } from '../theme';

const OPTIONS: { value: Choice; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** A small three-way switch. Auto follows the phone or computer setting. */
export function ThemeChoice() {
  const [choice, setTheme] = useTheme();
  return (
    <div class="theme-choice" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={choice === option.value}
          class={choice === option.value ? 'on' : ''}
          onClick={() => setTheme(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
