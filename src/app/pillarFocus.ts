/**
 * The pillar the timeline is focused on, kept in this browser so the page
 * opens the way it was left. No value means every pillar.
 */

export const PILLAR_FOCUS_KEY = 'farview.pillarFocus';

export function parsePillarFocus(value: string | null): string | null {
  return value !== null && value.trim() !== '' ? value : null;
}

export function readPillarFocus(): string | null {
  try {
    return parsePillarFocus(localStorage.getItem(PILLAR_FOCUS_KEY));
  } catch {
    return null;
  }
}

export function savePillarFocus(pillar: string | null): void {
  try {
    if (pillar === null) localStorage.removeItem(PILLAR_FOCUS_KEY);
    else localStorage.setItem(PILLAR_FOCUS_KEY, pillar);
  } catch {
    // Storage blocked: the choice holds until the page closes.
  }
}
