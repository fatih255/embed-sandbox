import { expect, test } from '@playwright/test';
import { hostCount, installLeakTracker, leaks, TITLE, waitForWidget } from './helpers';

test.describe('loading', () => {
  test('a second script tag on the page is ignored', async ({ page }) => {
    await page.goto('/normal.html');
    await waitForWidget(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = '/embed.js';
          script.dataset.title = 'Second copy';
          script.onload = () => resolve();
          document.body.appendChild(script);
        }),
    );
    expect(await page.evaluate(() => document.querySelectorAll('script[src="/embed.js"]').length)).toBe(2);
    expect(await hostCount(page)).toBe(1);
    await expect(page.locator('embed-sandbox .title')).toHaveText(TITLE);
    expect(await page.evaluate(() => window.EmbedSandbox!.init())).toBe(false);
    expect(await hostCount(page)).toBe(1);
  });

  test('the hostile page loads it twice, async, after the load event', async ({ page }) => {
    await page.goto('/hostile.html');
    await waitForWidget(page);
    await page.waitForFunction(() => (window as any).__hostile.injectedAt.length === 2);
    const timing = await page.evaluate(() => (window as any).__hostile);
    expect(timing.injectedAt.every((t: number) => t > timing.loadAt)).toBe(true);
    // Give the second copy time to run, then check it changed nothing.
    await page.waitForTimeout(300);
    expect(await hostCount(page)).toBe(1);
    await expect(page.locator('embed-sandbox .title')).toHaveText(TITLE);
  });

  test('a blocking script in <head> waits for <body>', async ({ page }) => {
    await page.route('**/head-sync.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><script src="/embed.js" data-title="From head"></script></head>
               <body><p>Body arrives after the script ran.</p></body></html>`,
      }),
    );
    await page.goto('/head-sync.html');
    await waitForWidget(page);
    await expect(page.locator('embed-sandbox .title')).toHaveText('From head');
    expect(await page.evaluate(() => document.querySelector('embed-sandbox')!.parentElement!.localName)).toBe('body');
  });
});

test.describe('destroy', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installLeakTracker);
  });

  test('leaves the page exactly as it was before init', async ({ page }) => {
    await page.goto('/normal.html');
    await waitForWidget(page);

    // Start from a clean page, then measure one full init/destroy cycle.
    expect(await page.evaluate(() => window.EmbedSandbox!.destroy())).toBe(true);
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    await expect.poll(() => leaks(page)).toMatchObject({ embedListeners: [], embedTimers: 0 });

    await page.evaluate(() => window.EmbedSandbox!.init());
    await waitForWidget(page);
    await page.locator('embed-sandbox .email').fill('dev@example.com');
    const mounted = await leaks(page);
    // The tracker does see the widget's listeners while it's mounted.
    expect(mounted.embedListeners).toContain('keydown');
    expect(mounted.embedListeners.length).toBeGreaterThan(1);

    await page.evaluate(() => window.EmbedSandbox!.destroy());
    expect(await hostCount(page)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(before);
    await expect.poll(() => leaks(page)).toMatchObject({ embedListeners: [], embedTimers: 0 });
    expect(await page.evaluate(() => window.EmbedSandbox!.status())).toBe('idle');
  });

  test('clears a pending delay timer', async ({ page }) => {
    await page.goto('/normal.html');
    await waitForWidget(page);
    await page.evaluate(() => window.EmbedSandbox!.destroy());
    await expect.poll(async () => (await leaks(page)).embedTimers).toBe(0);

    await page.evaluate(() => window.EmbedSandbox!.init({ delay: 5000 }));
    expect(await page.evaluate(() => window.EmbedSandbox!.status())).toBe('waiting');
    expect((await leaks(page)).embedTimers).toBe(1);

    await page.evaluate(() => window.EmbedSandbox!.destroy());
    expect((await leaks(page)).embedTimers).toBe(0);
    expect(await hostCount(page)).toBe(0);
  });

  test('the close button and Escape both tear everything down', async ({ page }) => {
    await page.goto('/normal.html');
    await waitForWidget(page);
    await page.locator('embed-sandbox .close').click();
    expect(await hostCount(page)).toBe(0);
    await expect.poll(() => leaks(page)).toMatchObject({ embedListeners: [], embedTimers: 0 });

    await page.evaluate(() => window.EmbedSandbox!.init());
    await waitForWidget(page);
    await page.keyboard.press('Escape');
    expect(await hostCount(page)).toBe(0);
    await expect.poll(() => leaks(page)).toMatchObject({ embedListeners: [], embedTimers: 0 });
  });

  test('cleans up on the hostile page without touching its own listeners and timers', async ({ page }) => {
    await page.goto('/hostile.html');
    await waitForWidget(page);
    const mounted = await leaks(page);
    expect(mounted.embedListeners.length).toBeGreaterThan(0);

    await page.evaluate(() => window.EmbedSandbox!.destroy());
    expect(await hostCount(page)).toBe(0);
    const after = await leaks(page);
    expect(after.embedListeners).toEqual([]);
    expect(after.hostListeners).toBe(mounted.hostListeners);
    expect(after.hostListeners).toBeGreaterThan(0);
    expect(after.hostTimers).toBeGreaterThan(0);
    await expect.poll(async () => (await leaks(page)).embedTimers).toBe(0);
  });
});
