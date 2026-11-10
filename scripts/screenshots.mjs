// Takes the README screenshots from the real demo pages: npm run screenshots
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startServer } from './serve.mjs';

const PORT = 5102;
const out = new URL('../docs/screenshots/', import.meta.url);
mkdirSync(out, { recursive: true });

const server = await startServer(PORT);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const name of ['normal', 'hostile']) {
    await page.goto(`http://127.0.0.1:${PORT}/${name}.html`);
    await page.waitForFunction(() => window.EmbedSandbox?.status() === 'mounted');
    await page.locator('embed-sandbox .card').waitFor();
    await page.mouse.move(0, 0);
    const file = new URL(`${name}.png`, out);
    await page.screenshot({ path: fileURLToPath(file) });
    console.log(`wrote docs/screenshots/${name}.png`);
  }

  // Side by side at 1280px wide: each page shrunk to half width.
  const src = (name) => `data:image/png;base64,${readFileSync(new URL(`${name}.png`, out)).toString('base64')}`;
  await page.setViewportSize({ width: 1280, height: 460 });
  await page.setContent(`<!doctype html>
    <style>
      body { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; background: #e5e7eb;
             font: 600 14px/1 system-ui, sans-serif; color: #374151; }
      figure { margin: 0; } img { display: block; width: 100%; border: 1px solid #cbd5e1; }
      figcaption { margin: 0 0 8px; }
    </style>
    <figure><figcaption>normal.html</figcaption><img src="${src('normal')}"></figure>
    <figure><figcaption>hostile.html</figcaption><img src="${src('hostile')}"></figure>`);
  const combined = await page.screenshot({ fullPage: true });
  writeFileSync(new URL('side-by-side.png', out), combined);
  console.log('wrote docs/screenshots/side-by-side.png');
} finally {
  await browser.close();
  server.close();
}
