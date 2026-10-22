import { useRef } from 'preact/hooks';
import { useTheme, type ThemeChoice as Choice } from '../theme';

const OPTIONS: { value: Choice; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * A small three-way switch. Auto follows the phone or computer setting.
 * It is a radio group: Tab lands on the selected option, and the arrow
 * keys (plus Home and End) move the selection.
 */
export function ThemeChoice() {
  const [choice, setTheme] = useTheme();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number): void => {
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % OPTIONS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + OPTIONS.length) % OPTIONS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = OPTIONS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    setTheme(OPTIONS[next]!.value);
    buttons.current[next]?.focus();
  };

  return (
    <div class="theme-choice" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((option, index) => (
        <button
          key={option.value}
          ref={(el) => {
            buttons.current[index] = el;
          }}
          type="button"
          role="radio"
          aria-checked={choice === option.value}
          tabIndex={choice === option.value ? 0 : -1}
          class={choice === option.value ? 'on' : ''}
          onClick={() => setTheme(option.value)}
          onKeyDown={(e) => onKeyDown(e, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
