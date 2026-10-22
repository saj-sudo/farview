/**
 * Which suggestion the person skipped, kept in this browser so the same one
 * is not offered again. A different suggestion (the space changed) is offered.
 */

export const SUGGESTION_SKIPPED_KEY = 'farview.suggestionSkipped';

export function readSkipped(): string | null {
  try {
    return localStorage.getItem(SUGGESTION_SKIPPED_KEY);
  } catch {
    return null;
  }
}

export function saveSkipped(key: string): void {
  try {
    localStorage.setItem(SUGGESTION_SKIPPED_KEY, key);
  } catch {
    // Storage blocked: skipped until the page closes.
  }
}
