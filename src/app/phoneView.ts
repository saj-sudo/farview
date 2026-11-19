/**
 * Which view a phone opens the timeline page in: the chart (the default) or
 * the list, which is easier to read one item at a time. The choice is kept
 * in this browser.
 */

export type PhoneView = 'list' | 'timeline';

export const PHONE_VIEW_KEY = 'farview.phoneView';

export function parsePhoneView(value: string | null): PhoneView {
  return value === 'list' ? 'list' : 'timeline';
}

export function readPhoneView(): PhoneView {
  try {
    return parsePhoneView(localStorage.getItem(PHONE_VIEW_KEY));
  } catch {
    return 'timeline';
  }
}

export function savePhoneView(view: PhoneView): void {
  try {
    localStorage.setItem(PHONE_VIEW_KEY, view);
  } catch {
    // Storage blocked: the choice holds until the page closes.
  }
}

/**
 * The view a visit opens on when the address names none. A phone opens on
 * Horizons, which answers "what now, what next" in one column; a wider
 * screen opens on the configured view.
 */
export function openingView<V extends string>(narrow: boolean, configured: V): V | 'horizons' {
  return narrow ? 'horizons' : configured;
}

/** A pull this long, in px, refreshes when the finger lets go. */
export const PULL_THRESHOLD_PX = 72;
export const PULL_MAX_PX = 120;

export function pullArmed(distancePx: number): boolean {
  return distancePx >= PULL_THRESHOLD_PX;
}
