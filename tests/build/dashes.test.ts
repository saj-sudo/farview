import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// House style: no em or en dashes anywhere in the repo's text. Use a full
// stop, colon, comma or brackets instead, and "to" for ranges. Written
// with escapes so this file passes its own check.

const root = join(import.meta.dirname, '..', '..');
const BANNED = /[–—]/;
const SKIP = /(^|\/)package-lock\.json$|\.(png|jpe?g|gif|webp|ico|woff2?)$/;

const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f !== '' && !SKIP.test(f));

describe('no em or en dashes', () => {
  it('finds tracked text files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('has none in READMEs, docs, HTML or source files', () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(join(root, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (BANNED.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
