import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Cloudflare turns preview URLs off by default when workers_dev is off, so
// a config that disables the workers.dev address must turn previews on
// itself, or every branch build has nowhere to be served.

const root = join(import.meta.dirname, '..', '..');
const text = readFileSync(join(root, 'wrangler.jsonc'), 'utf8');
const config = JSON.parse(
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n'),
) as {
  workers_dev?: boolean;
  preview_urls?: boolean;
  previews?: unknown;
  assets?: { directory?: string };
};

describe('wrangler.jsonc', () => {
  it('keeps branch preview URLs on when the workers.dev address is off', () => {
    if (config.workers_dev === false) expect(config.preview_urls).toBe(true);
    else expect(config.preview_urls).not.toBe(false);
  });

  it('has the previews block that branch builds need', () => {
    expect(config.previews).toBeDefined();
  });

  it('serves the build output as static assets', () => {
    expect(config.assets?.directory).toBe('./dist');
  });
});
