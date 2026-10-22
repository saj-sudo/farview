import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

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

/**
 * The timeline has finished loading. The axis paints first, and the status line
 * reads "0 items placed" before the load starts, so anything that counts bars or
 * pillar chips must wait for a real count in the status line.
 */
async function timelineSettled(page: Page): Promise<void> {
  await page.locator('svg.tl-svg').waitFor();
  await page.locator('.refresh-bar .fineprint', { hasText: /^[1-9]\d* items placed/ }).waitFor();
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

interface AxeViolation {
  id: string;
  help: string;
  nodes: { target: string[] }[];
}

/** WCAG A and AA plus axe's best practices, on whatever the page shows now. */
async function violationsOn(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: AxeViolation[] }> } }).axe;
    const result = await axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    });
    return result.violations;
  });
  return found.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
}

describe.each(['light', 'dark'] as const)('accessibility in %s', (colorScheme) => {
  it.each(VIEWPORTS)('has no axe violations on any page at $name size', async (viewport) => {
    const page = await browser.newPage({ viewport, colorScheme });
    const problems: string[] = [];
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    problems.push(...(await violationsOn(page)).map((v) => `landing: ${v}`));
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
    await page.waitForTimeout(500);
    for (const view of [...VIEWS, '#/item?id=x-mainstay']) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, view);
      await page.waitForTimeout(500);
      problems.push(...(await violationsOn(page)).map((v) => `${view}: ${v}`));
    }
    if (viewport.width < 500) {
      await page.evaluate(() => {
        location.hash = '#/timeline';
      });
      await page.getByRole('button', { name: 'Timeline', exact: true }).click();
      await page.locator('svg.tl-svg').waitFor();
      problems.push(...(await violationsOn(page)).map((v) => `phone timeline: ${v}`));
    }
    await page.close();
    expect(problems).toEqual([]);
  });
});

it('moves the theme choice with the arrow keys and keeps one option in the tab order', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  const radio = (name: string) => page.getByRole('radio', { name, exact: true });
  await radio('Auto').focus();
  await page.keyboard.press('ArrowRight');
  expect(await radio('Light').getAttribute('aria-checked')).toBe('true');
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('light');
  await page.keyboard.press('End');
  expect(await radio('Dark').getAttribute('aria-checked')).toBe('true');
  await page.keyboard.press('ArrowRight');
  expect(await radio('Auto').getAttribute('aria-checked')).toBe('true');
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBeUndefined();
  const tabbable = await page.locator('.theme-choice:visible [role=radio][tabindex="0"]').count();
  expect(tabbable).toBe(1);
  await page.close();
});

it('focuses on one pillar, remembers it and brings the others back', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  const problems = await watch(page);
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await timelineSettled(page);
  const group = page.getByRole('group', { name: 'Focus on a pillar' });
  const chips = group.getByRole('button');
  expect(await chips.count()).toBeGreaterThan(2);
  const headers = page.locator('.tl-lane-header');
  const before = await headers.count();

  const first = chips.nth(1);
  const name = (await first.innerText()).replace(/\d+$/, '').trim();
  await first.click();
  expect(await first.getAttribute('aria-pressed')).toBe('true');
  const during = await headers.count();
  expect(during).toBeLessThan(before);

  await page.reload({ waitUntil: 'networkidle' });
  await timelineSettled(page);
  expect(await headers.count()).toBe(during);
  expect(await group.getByRole('button', { name: new RegExp(`^${name}`) }).getAttribute('aria-pressed')).toBe('true');

  await group.getByRole('button', { name: /^All/ }).click();
  expect(await headers.count()).toBe(before);
  await page.close();
  expect(problems).toEqual([]);
});

it('drags a Someday item onto the timeline and gives it dates', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  const problems = await watch(page);
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await timelineSettled(page);
  const tray = page.locator('details.someday');
  await tray.locator('summary').click();
  const item = tray.locator('.someday-item.draggable').first();
  const title = (await item.innerText()).trim();
  const bars = page.locator('g.tl-item');
  await bars.first().waitFor(); // the bars arrive as the items load
  const before = await bars.count();

  const from = (await item.boundingBox())!;
  const chart = (await page.locator('.tl-wrap').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(chart.x + chart.width / 2, chart.y + 60, { steps: 8 });
  expect(await page.locator('.tl-wrap.drop-target').count()).toBe(1);
  expect(await page.locator('.tray-ghost').innerText()).toContain(title);
  await page.mouse.up();

  await page.waitForTimeout(400);
  expect(await bars.count()).toBe(before + 1);
  await page.close();
  expect(problems).toEqual([]);
});

it('drops nothing when a Someday item is released away from the timeline', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await timelineSettled(page);
  const tray = page.locator('details.someday');
  await tray.locator('summary').click();
  const item = tray.locator('.someday-item.draggable').first();
  const bars = page.locator('g.tl-item');
  await bars.first().waitFor(); // the bars arrive as the items load
  const before = await bars.count();
  const from = (await item.boundingBox())!;
  await page.mouse.move(from.x + 5, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await bars.count()).toBe(before);
  expect(await page.locator('.tray-ghost').count()).toBe(0);
  await page.close();
});

const STANDARD = 'Demo: a first setup in a new space';

describe.each(['light', 'dark'] as const)('first setup in %s', (colorScheme) => {
  it.each(VIEWPORTS)('offers what the space contains, with no axe violations at $name size', async (viewport) => {
    const page = await browser.newPage({ viewport, colorScheme });
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: STANDARD, exact: true }).click();
    await page.getByRole('heading', { name: 'Start with what is in your space' }).waitFor();
    expect(await violationsOn(page)).toEqual([]);
    await page.close();
  });
});

it('opens the timeline with one tick on a standard setup', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  const problems = await watch(page);
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: STANDARD, exact: true }).click();
  const projects = page.getByRole('checkbox', { name: /Your projects are “Project”/ });
  expect(await projects.isChecked()).toBe(true); // a name it knows starts ticked
  await page.getByRole('button', { name: 'Use these and open the timeline', exact: true }).click();
  await timelineSettled(page);
  await page.locator('g.tl-item').nth(3).waitFor();
  await page.close();
  expect(problems).toEqual([]);
});

it('shows the form when the offer is set aside', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: STANDARD, exact: true }).click();
  await page.getByRole('button', { name: 'Set it up by hand', exact: true }).click();
  await page.getByRole('heading', { name: 'Map your space' }).waitFor();
  // The required part is open; goals, actions, grouping and display are folded away.
  await page.getByRole('heading', { name: 'Projects (required)' }).waitFor();
  const more = page.locator('details.more-options');
  expect(await more.count()).toBe(1);
  expect(await more.getAttribute('open')).toBeNull();
  expect(await page.getByRole('heading', { name: 'Grouping and color' }).isVisible()).toBe(false);
  await more.locator('summary').click();
  expect(await page.getByRole('heading', { name: 'Grouping and color' }).isVisible()).toBe(true);
  await page.close();
});

it('shows how many projects are active each month, and follows the zoom', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  const problems = await watch(page);
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await timelineSettled(page);
  const strip = page.locator('svg.load-svg');
  expect(await strip.getAttribute('aria-label')).toMatch(/^Projects active each month, from \d+ to \d+/);
  expect(await strip.locator('title').count()).toBeGreaterThan(2);
  // A decade is too wide for months to say anything, so the strip steps aside.
  await page.getByRole('button', { name: 'Decade', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await page.locator('svg.load-svg').count()).toBe(0);
  await page.close();
  expect(problems).toEqual([]);
});

describe.each(['light', 'dark'] as const)('saving the timeline as SVG in %s', (colorScheme) => {
  it('downloads a standalone file with its styles and lane names', async () => {
    const page = await browser.newPage({ viewport: VIEWPORTS[1]!, colorScheme, acceptDownloads: true });
    const problems = await watch(page);
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
    await timelineSettled(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save as SVG', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^farview-timeline-\d{4}-\d{2}-\d{2}\.svg$/);
    const path = await download.path();
    const text = readFileSync(path, 'utf8');
    // Standalone: no colour variable or stylesheet reference left to resolve.
    expect(text).not.toContain('var(');
    expect(text).not.toContain('<style');
    expect(text).toContain('viewBox=');
    expect(text).toContain('Winter the Engine'); // a bar's label
    expect(text).toContain('harbormaster'); // a lane name, drawn into the file
    expect(text).toContain('paint-order'); // the halo that keeps outside labels readable
    await page.close();
    expect(problems).toEqual([]);
    // Parse it on a blank page, as a viewer would. The app's own page has a
    // strict policy that applies to documents it parses, and a saved file has none.
    const viewer = await browser.newPage();
    const parsed = await viewer.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      return doc.querySelector('parsererror') === null && doc.documentElement.tagName === 'svg';
    }, text);
    await viewer.close();
    expect(parsed).toBe(true);
  });
});
