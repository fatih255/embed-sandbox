import { expect, test, type Browser, type Page } from '@playwright/test';
import { snapshotWidget, TITLE, waitForWidget } from './helpers';

async function openBoth(browser: Browser) {
  const normal = await browser.newPage();
  const hostile = await browser.newPage();
  await Promise.all([normal.goto('/normal.html'), hostile.goto('/hostile.html')]);
  await Promise.all([waitForWidget(normal), waitForWidget(hostile)]);
  return { normal, hostile };
}

async function submitEmail(page: Page, email: string) {
  await page.locator('embed-sandbox .email').fill(email);
  await page.locator('embed-sandbox .submit').click();
}

test('the hostile page really is hostile', async ({ page }) => {
  await page.goto('/hostile.html');
  await waitForWidget(page);
  const host = await page.evaluate(() => {
    const li = document.querySelector('li')!;
    const style = getComputedStyle(li);
    const hostEl = document.querySelector('embed-sandbox')!;
    return {
      fontSize: style.fontSize,
      textTransform: style.textTransform,
      // all: unset drops the UA's bold headings.
      h1Weight: getComputedStyle(document.querySelector('h1')!).fontWeight,
      inheritedAccent: getComputedStyle(document.body).getPropertyValue('--es-accent').trim(),
      arrayFirst: typeof (Array.prototype as any).first,
      globalH: typeof (window as any).h,
      amd: !!(window as any).define?.amd,
      hostPreactHook: typeof (window as any).preact?.options?.vnode,
      hostAppClass: document.querySelector('#host-app p')?.className,
      // The tag-name rule would hide the widget if the shadow root didn't override it.
      hostElDisplayRuleMatches: hostEl.matches('embed-sandbox'),
    };
  });
  expect(host).toEqual({
    fontSize: '30px',
    textTransform: 'uppercase',
    h1Weight: '400',
    inheritedAccent: '#ff00ff',
    arrayFirst: 'function',
    globalH: 'function',
    amd: true,
    hostPreactHook: 'function',
    hostAppClass: 'hijacked',
    hostElDisplayRuleMatches: true,
  });
});

test('the widget renders the same on the normal and hostile pages', async ({ browser }) => {
  const { normal, hostile } = await openBoth(browser);

  const a = await snapshotWidget(normal);
  const b = await snapshotWidget(hostile);
  expect(a.length).toBeGreaterThan(8);
  expect(b).toEqual(a);

  // Sanity check that the snapshot holds the values the stylesheet sets.
  const card = a.find((el) => el.path.includes('section.card'))!;
  expect(card.box).toMatchObject({ width: 340, right: 24, bottom: 24 });
  expect(card.style['font-size']).toBe('14px');
  expect(card.style['text-transform']).toBe('none');
  const submit = a.find((el) => el.path.includes('button.submit'))!;
  expect(submit.style['background-color']).toBe('rgb(37, 99, 235)');

  await expect(hostile.locator('embed-sandbox .title')).toHaveText(TITLE);
});

test('the error and thank-you states also render the same', async ({ browser }) => {
  const { normal, hostile } = await openBoth(browser);

  await submitEmail(normal, 'nope');
  await submitEmail(hostile, 'nope');
  await expect(hostile.locator('embed-sandbox .error')).toBeVisible();
  expect(await snapshotWidget(hostile)).toEqual(await snapshotWidget(normal));

  await submitEmail(normal, 'dev@example.com');
  await submitEmail(hostile, 'dev@example.com');
  await expect(hostile.locator('embed-sandbox [role="status"]')).toHaveText("Thanks, you're on the list.");
  expect(await snapshotWidget(hostile)).toEqual(await snapshotWidget(normal));
});

test('no host page errors and no widget markup outside the shadow root', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/hostile.html');
  await waitForWidget(page);
  expect(errors).toEqual([]);
  const lightDom = await page.evaluate(() => ({
    styleTags: document.querySelectorAll('head style, body style').length,
    cards: document.querySelectorAll('.card').length,
    hostChildren: document.querySelector('embed-sandbox')!.children.length,
  }));
  // The page's own <style> only; the widget's lives in the shadow root.
  expect(lightDom).toEqual({ styleTags: 1, cards: 0, hostChildren: 0 });
});
