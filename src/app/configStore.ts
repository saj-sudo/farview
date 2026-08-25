import { normalizeConfig } from '../engine/config';
import type { FarviewConfig } from '../engine/types';

/**
 * Config persistence (spec §10): browser storage only, by design — there
 * is no state object in the user's space because Farview cannot write.
 * Clearing browser data costs a two-minute remap; export/import in
 * Settings makes that avoidable.
 */

const CONFIG_KEY = 'farview.config';

/** null = never configured → onboarding. */
export function loadStoredConfig(): FarviewConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredConfig(config: FarviewConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Private windows can refuse writes; the session still works until reload.
  }
}

export function clearStoredConfig(): void {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // nothing to do
  }
}
