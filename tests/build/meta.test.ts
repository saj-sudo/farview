import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Installability and link previews. The CSP's default-src 'none' also
// blocks the web manifest unless manifest-src allows it, so any page that
// links the manifest must say so. Checks the authored entries always, and
// the built output when present.

const root = join(import.meta.dirname, '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const built = (page: string): string[] =>
  existsSync(join(root, 'dist', page)) ? [`dist/${page}`] : [];

const installPages = ['index.html', 'app/index.html', ...built('index.html'), ...built('app/index.html')];
const landingPages = ['index.html', ...built('index.html')];

interface ManifestIcon {
  src: string;
  sizes: string;
  purpose?: string;
}

describe.each(installPages)('%s', (page) => {
  const html = read(page);

  it('links the manifest and lets the CSP load it', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain("manifest-src 'self'");
  });

  it('has a home-screen icon and a theme colour', () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="theme-color"');
  });
});

describe.each(landingPages)('%s link preview', (page) => {
  const html = read(page);

  it.each(['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt'])(
    'carries %s',
    (property) => {
      expect(html).toMatch(new RegExp(`<meta property="${property}" content="[^"]+"`));
    },
  );

  it('points og:image at an absolute URL, which link scrapers need', () => {
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/[^"]+\/og\.png"/);
  });

  it('asks for the large preview card', () => {
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });
});

describe('manifest.webmanifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    start_url: string;
    display: string;
    icons: ManifestIcon[];
  };

  it('opens the app, not the landing page', () => {
    expect(manifest.start_url).toBe('/app/');
    expect(manifest.display).toBe('standalone');
  });

  it('lists 192 and 512 icons plus a maskable one, and every file exists', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect(existsSync(join(root, 'public', icon.src)), icon.src).toBe(true);
    }
  });

  it('ships the files the pages point at', () => {
    for (const file of ['apple-touch-icon.png', 'og.png']) {
      expect(existsSync(join(root, 'public', file)), file).toBe(true);
    }
  });
});
