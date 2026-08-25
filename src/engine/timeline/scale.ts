/**
 * The timeline's coordinate system. The continuous axis unit is the
 * integer dayNumber (days since 1970) — timezone enters exactly once,
 * when the caller derives "today", and everything here is arithmetic.
 * View state is center-anchored so preset zooms stay where the user is
 * looking, and fractional days are allowed for smooth panning.
 */

export interface ViewState {
  centerDay: number;
  daysVisible: number;
}

export interface Scale {
  startDay: number;
  endDay: number;
  pxPerDay: number;
  xOf(day: number): number;
  dayAt(x: number): number;
}

export type ZoomPresetId = 'quarter' | 'year' | 'threeYears' | 'decade';

/**
 * Zoom presets (spec §9.1 plus the Decade view): how many days the
 * window holds. The decade preset is first-class — years become the
 * unit, and the view reads as the shape of a decade, not a squeezed
 * year.
 */
export const ZOOM_PRESETS: { id: ZoomPresetId; label: string; days: number }[] = [
  { id: 'quarter', label: 'Quarter', days: 91 },
  { id: 'year', label: 'Year', days: 365 },
  { id: 'threeYears', label: '3 years', days: 1096 },
  { id: 'decade', label: 'Decade', days: 3653 },
];

export function createScale(view: ViewState, widthPx: number): Scale {
  const startDay = view.centerDay - view.daysVisible / 2;
  const pxPerDay = widthPx / view.daysVisible;
  return {
    startDay,
    endDay: startDay + view.daysVisible,
    pxPerDay,
    xOf: (day) => (day - startDay) * pxPerDay,
    dayAt: (x) => startDay + x / pxPerDay,
  };
}

/**
 * The default window (spec §9.1): roughly six months back and twelve
 * forward, so the now-line sits about a third of the way in and there
 * is visible history behind it.
 */
export function defaultView(todayDay: number): ViewState {
  const back = 183;
  const forward = 365;
  return {
    centerDay: todayDay - back + (back + forward) / 2,
    daysVisible: back + forward,
  };
}

/** Pan by a pixel delta (positive dx = drag right = look further back). */
export function pan(view: ViewState, dxPx: number, widthPx: number): ViewState {
  const pxPerDay = widthPx / view.daysVisible;
  return { ...view, centerDay: view.centerDay - dxPx / pxPerDay };
}

/**
 * Zoom to a new window size, keeping `anchorDay` at the same on-screen
 * position — the cursor for wheel zoom, the now-line for preset taps.
 */
export function zoomTo(
  view: ViewState,
  daysVisible: number,
  anchorDay: number,
): ViewState {
  const oldStart = view.centerDay - view.daysVisible / 2;
  const frac = (anchorDay - oldStart) / view.daysVisible;
  const newStart = anchorDay - frac * daysVisible;
  return { centerDay: newStart + daysVisible / 2, daysVisible };
}

/** The smallest and largest windows continuous zoom may reach. */
export const MIN_DAYS_VISIBLE = 28;
export const MAX_DAYS_VISIBLE = 36530; // a century — beyond Decade, but bounded

export function clampZoom(daysVisible: number): number {
  return Math.min(MAX_DAYS_VISIBLE, Math.max(MIN_DAYS_VISIBLE, daysVisible));
}

/**
 * Keep the window from panning into the void: the center may drift at
 * most one window-width past the data extent (today included, so an
 * empty-ish space still pans sensibly around now).
 */
export function clampView(
  view: ViewState,
  extent: { minDay: number; maxDay: number },
): ViewState {
  const lo = extent.minDay - view.daysVisible;
  const hi = extent.maxDay + view.daysVisible;
  return { ...view, centerDay: Math.min(hi, Math.max(lo, view.centerDay)) };
}

/** The preset whose window is nearest the current one (for the chip UI). */
export function presetFor(daysVisible: number): ZoomPresetId {
  let best = ZOOM_PRESETS[0]!;
  for (const preset of ZOOM_PRESETS) {
    if (
      Math.abs(Math.log(daysVisible / preset.days)) <
      Math.abs(Math.log(daysVisible / best.days))
    ) {
      best = preset;
    }
  }
  return best.id;
}
