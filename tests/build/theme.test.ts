import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTheme, themeAttribute, THEME_COLORS, THEME_KEY } from '../../src/app/theme';

// The theme has two dark blocks, one for the system setting and one for a
// person's own Dark choice. CSS can't share declarations between them, so
// this test fails when they drift. It also checks the early script that
// applies a saved choice before the first paint.

const root = join(import.meta.dirname, '..', '..');
const css = readFileSync(join(root, 'src/app/styles.css'), 'utf8');

/** The custom properties declared in the block that opens with `selector`. */
function tokensIn(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `${selector} is missing`).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[match[1]!] = match[2]!.trim();
  return tokens;
}

describe('the two dark blocks', () => {
  const forced = tokensIn(":root[data-theme='dark'] {");
  const system = tokensIn(":root:not([data-theme='light']) {");

  it('list the same tokens with the same values', () => {
    expect(Object.keys(forced).length).toBeGreaterThan(20);
    expect(system).toEqual(forced);
  });

  it('redefine every token the light theme sets', () => {
    const light = tokensIn(':root {');
    const colourTokens = Object.keys(light).filter((name) =>
      /^--(bg|surface|wash|line|ink|charcoal|on-|focus|shadow|dots|blend|band|veil|g\d)/.test(name),
    );
    for (const name of colourTokens) expect(forced, name).toHaveProperty(name);
  });
});

describe('theme choice', () => {
  it('treats anything but light or dark as the system setting', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('sepia')).toBe('system');
    expect(parseTheme(null)).toBe('system');
  });

  it('sets data-theme only for a real choice', () => {
    expect(themeAttribute('system')).toBeNull();
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
  });

  it('matches the colours the pages declare for the browser bar', () => {
    const html = readFileSync(join(root, 'app/index.html'), 'utf8');
    expect(html).toContain(`content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)"`);
  });
});

describe('theme.js', () => {
  const script = readFileSync(join(root, 'public/theme.js'), 'utf8');

  it('reads the same storage key and colours as the app', () => {
    expect(script).toContain(`'${THEME_KEY}'`);
    expect(script).toContain(THEME_COLORS.light);
    expect(script).toContain(THEME_COLORS.dark);
  });

  it.each(['index.html', 'app/index.html', 'callback/index.html'])(
    'is loaded by %s before the stylesheet',
    (page) => {
      const html = readFileSync(join(root, page), 'utf8');
      const script = html.indexOf('<script src="/theme.js"></script>');
      expect(script).toBeGreaterThan(-1);
      expect(script).toBeLessThan(html.indexOf('rel="stylesheet"'));
    },
  );

  it('is part of the build output when there is one', () => {
    if (!existsSync(join(root, 'dist'))) return;
    expect(existsSync(join(root, 'dist', 'theme.js'))).toBe(true);
  });
});
