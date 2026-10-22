/**
 * Which view a phone opens the timeline page in: the list (the default,
 * easiest to read one item at a time) or the timeline itself. The choice is
 * kept in this browser.
 */

export type PhoneView = 'list' | 'timeline';

export const PHONE_VIEW_KEY = 'farview.phoneView';

export function parsePhoneView(value: string | null): PhoneView {
  return value === 'timeline' ? 'timeline' : 'list';
}

export function readPhoneView(): PhoneView {
  try {
    return parsePhoneView(localStorage.getItem(PHONE_VIEW_KEY));
  } catch {
    return 'list';
  }
}

export function savePhoneView(view: PhoneView): void {
  try {
    localStorage.setItem(PHONE_VIEW_KEY, view);
  } catch {
    // Storage blocked: the choice holds until the page closes.
  }
}
