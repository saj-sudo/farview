import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Security posture guard (spec §3): everything bundled and served
// same-origin, a strict CSP on every page, no third-party scripts. The
// access token lives in browser storage, so no script Farview did not
// bundle may ever run on the page. Checks the authored entries always,
// and the built output when present.

const root = join(import.meta.dirname, '..', '..');
const sourcePages = ['index.html', 'app/index.html', 'callback/index.html'];
const distPages = existsSync(join(root, 'dist'))
  ? globSync('dist/**/*.html', { cwd: root })
  : [];

const REQUIRED_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src https://api.capacities.io",
];

describe.each([...sourcePages, ...distPages])('%s', (page) => {
  const html = readFileSync(join(root, page), 'utf8');

  it('carries the strict CSP meta tag', () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    for (const directive of REQUIRED_CSP) {
      expect(html).toContain(directive);
    }
  });

  it('has no inline script bodies', () => {
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const [, attrs = '', body = ''] = match;
      expect(body.trim(), `inline script in ${page}`).toBe('');
      expect(attrs, `script without src in ${page}`).toMatch(/\bsrc=/);
    }
  });

  it('references no external origins', () => {
    for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/gi)) {
      const url = match[1]!;
      expect(url, `external reference in ${page}`).not.toMatch(/^(https?:)?\/\//);
    }
  });
});
