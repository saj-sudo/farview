import { useEffect, useState } from 'preact/hooks';

/**
 * Hash routing inside /app: real paths belong to the MPA entries, views
 * switch on the fragment so no host rewrite rules are ever needed.
 */

export type View = 'timeline' | 'horizons' | 'settings' | 'item';

const ROUTES: Record<string, View> = {
  '#/timeline': 'timeline',
  '#/horizons': 'horizons',
  '#/settings': 'settings',
  '#/item': 'item',
};

export const HASH_FOR: Record<View, string> = {
  timeline: '#/timeline',
  horizons: '#/horizons',
  settings: '#/settings',
  item: '#/item',
};

/** The detail route for one item: `#/item?id=<objectId>`. */
export function itemHash(id: string): string {
  return `#/item?id=${encodeURIComponent(id)}`;
}

export function itemParam(): string | null {
  const query = location.hash.split('?')[1];
  if (!query) return null;
  return new URLSearchParams(query).get('id');
}

/** Re-renders when the hash's query changes, not just the view. */
export function useHashItemId(): string | null {
  const [id, setId] = useState<string | null>(() => itemParam());
  useEffect(() => {
    const onChange = (): void => setId(itemParam());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return id;
}

function hashPath(): string {
  return location.hash.split('?')[0] ?? '';
}

export function currentView(fallback: View): View {
  return ROUTES[hashPath()] ?? fallback;
}

/** `#/timeline?focus=<objectId>` deep-links to one item's card. */
export function focusParam(): string | null {
  const query = location.hash.split('?')[1];
  if (!query) return null;
  return new URLSearchParams(query).get('focus');
}

export function useView(fallback: View): View {
  const [view, setView] = useState<View>(() => currentView(fallback));
  useEffect(() => {
    const onChange = (): void => setView(currentView(fallback));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [fallback]);
  return view;
}
