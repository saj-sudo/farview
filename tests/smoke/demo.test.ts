import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Smoke test of the built site in a real browser: every page and every demo
// view loads with no console error, no uncaught exception and no CSP
// violation. The zod eval probe reached production once because nothing ran
// the built pages; this is that check. It looks at nothing else, so the UI
// stays covered by the type checker and the engine tests (CONTRIBUTING).
// Run `npm run build` first, then `npm run smoke`.

const root = join(import.meta.dirname, '..', '..');
const VIEWS = ['#/timeline', '#/horizons', '#/settings'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

let server: PreviewServer;
let browser: Browser;
let base: string;

beforeAll(async () => {
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    throw new Error('No build found. Run `npm run build` before `npm run smoke`.');
  }
  server = await preview({ root, logLevel: 'silent', preview: { port: 4317, strictPort: false } });
  base = (server.resolvedUrls?.local[0] ?? 'http://localhost:4317/').replace(/\/$/, '');
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done) => server?.httpServer.close(() => done()));
});

async function watch(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP blocked ${event.blockedURI} (${event.violatedDirective})`);
    });
  });
  return problems;
}

describe.each(VIEWPORTS)('on $name', (viewport) => {
  it('loads the landing page and the callback without errors', async () => {
    const page = await browser.newPage({ viewport });
    const problems = await watch(page);
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.goto(`${base}/callback/?code=smoke&state=smoke`, { waitUntil: 'networkidle' });
    await page.close();
    expect(problems).toEqual([]);
  });

  it('opens every demo view without errors', async () => {
    const page = await browser.newPage({ viewport });
    const problems = await watch(page);
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
    for (const view of VIEWS) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, view);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
    }
    await page.close();
    expect(problems).toEqual([]);
  });
});

it('opens the timeline on a phone, taps a bar and goes back to the list', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[0]!, hasTouch: true });
  const problems = await watch(page);
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.locator('svg.tl-svg').waitFor();
  await page.locator('g.tl-item').first().click({ force: true });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.waitForTimeout(300);
  await page.close();
  expect(problems).toEqual([]);
});

it('serves the manifest and its icons', async () => {
  const page = await browser.newPage();
  const manifest = await page.request.get(`${base}/manifest.webmanifest`);
  expect(manifest.status()).toBe(200);
  const { icons } = (await manifest.json()) as { icons: { src: string }[] };
  for (const icon of icons) {
    expect((await page.request.get(`${base}${icon.src}`)).status(), icon.src).toBe(200);
  }
  await page.close();
});
