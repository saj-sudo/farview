import { useEffect, useState } from 'preact/hooks';

/**
 * Light, Dark, or follow the system. The choice is kept in this browser
 * and set as data-theme on <html>; without one, the CSS follows the
 * system setting. public/theme.js does the same at load, before the
 * first paint, so keep the two in step.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'farview.theme';
export const THEME_COLORS = { light: '#ffffff', dark: '#1b1a1e' } as const;

export function parseTheme(value: string | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The value for data-theme, or null to let the system decide. */
export function themeAttribute(choice: ThemeChoice): 'light' | 'dark' | null {
  return choice === 'system' ? null : choice;
}

export function readTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

/** Set data-theme, and the browser bar colour so it matches the page. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  const attr = themeAttribute(choice);
  if (attr) root.dataset['theme'] = attr;
  else delete root.dataset['theme'];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset['system'] ??= meta.content;
    meta.content = attr ? THEME_COLORS[attr] : (meta.dataset['system'] ?? meta.content);
  }
}

const listeners = new Set<(choice: ThemeChoice) => void>();

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies until the page closes.
  }
  applyTheme(choice);
  for (const listener of listeners) listener(choice);
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  useEffect(() => {
    listeners.add(setChoice);
    return () => {
      listeners.delete(setChoice);
    };
  }, []);
  return [choice, setTheme];
}
