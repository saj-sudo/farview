import type { JSX } from 'preact';

/**
 * Tiny inline icon set (16px, stroke = currentColor) so the sidebar can
 * carry glyphs without any external asset — the CSP stays 'self'-only.
 */

const PATHS: Record<string, JSX.Element> = {
  timeline: (
    <>
      <path d="M8 1.5v13" />
      <rect x="1.5" y="3.2" width="8.2" height="2.6" rx="1.3" />
      <rect x="4.6" y="6.9" width="9.9" height="2.6" rx="1.3" />
      <rect x="1.5" y="10.6" width="6" height="2.6" rx="1.3" />
    </>
  ),
  horizons: (
    <>
      <rect x="1.6" y="2" width="3.4" height="12" rx="1" />
      <rect x="6.3" y="2" width="3.4" height="8.5" rx="1" />
      <rect x="11" y="2" width="3.4" height="5.5" rx="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4" />
    </>
  ),
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      class="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
