/**
 * Deterministic group → hue assignment. Hues are CSS custom properties
 * so light and dark palettes both apply; assignment follows lane order,
 * so a group keeps its color across zooms and sessions as long as the
 * config's value order is stable. Ungrouped is always the quiet slate.
 */

const HUE_VARS = ['--g1', '--g2', '--g3', '--g4', '--g5'] as const;
export const UNGROUPED_VAR = '--g6';

export function assignGroupColors(
  groupsInOrder: (string | null)[],
): Map<string | null, string> {
  const out = new Map<string | null, string>();
  let i = 0;
  for (const group of groupsInOrder) {
    if (group === null) {
      out.set(null, `var(${UNGROUPED_VAR})`);
    } else if (!out.has(group)) {
      out.set(group, `var(${HUE_VARS[i % HUE_VARS.length]!})`);
      i += 1;
    }
  }
  return out;
}
