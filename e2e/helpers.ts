import { expect, type Page } from '@playwright/test';

export const TITLE = 'Get the monthly changelog';

export async function waitForWidget(page: Page) {
  await page.waitForFunction(() => window.EmbedSandbox?.status() === 'mounted');
  await expect(page.locator('embed-sandbox .card')).toBeVisible();
}

export function hostCount(page: Page) {
  return page.evaluate(() => document.querySelectorAll('embed-sandbox').length);
}

const PROPS = [
  'display', 'position', 'box-sizing', 'z-index', 'visibility', 'opacity', 'transform',
  'width', 'height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-top-color', 'border-top-left-radius', 'border-bottom-right-radius',
  'background-color', 'box-shadow', 'color',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-transform', 'text-align', 'outline-style', 'cursor', 'fill', 'stroke',
];

export interface ElementSnapshot {
  path: string;
  box: { width: number; height: number; right: number; bottom: number };
  style: Record<string, string>;
}

/**
 * Computed styles and boxes for every element inside the widget's shadow root.
 * Boxes are measured from the viewport's bottom-right corner, where the card is pinned.
 */
export function snapshotWidget(page: Page): Promise<ElementSnapshot[]> {
  return page.evaluate((props) => {
    const host = document.querySelector('embed-sandbox');
    if (!host?.shadowRoot) throw new Error('widget is not mounted');
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const elements = Array.from(host.shadowRoot.querySelectorAll('*')).filter((el) => el.localName !== 'style');
    return elements.map((el, index) => {
      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);
      const style: Record<string, string> = {};
      for (const prop of props) style[prop] = computed.getPropertyValue(prop);
      return {
        path: `${index}:${el.localName}.${el.getAttribute('class') ?? ''}`,
        box: {
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          right: Math.round((vw - rect.right) * 100) / 100,
          bottom: Math.round((vh - rect.bottom) * 100) / 100,
        },
        style,
      };
    });
  }, PROPS);
}

/**
 * Installed with page.addInitScript before any page script runs. Wraps
 * addEventListener and the timer functions, and tags each call as coming from
 * embed.js or not by looking at the stack trace.
 */
export function installLeakTracker() {
  type Listener = { target: EventTarget; type: string; fn: unknown; capture: boolean; embed: boolean };
  const fromEmbed = () => /\/embed\.js/.test(new Error().stack ?? '');
  const capture = (options: unknown) =>
    typeof options === 'boolean' ? options : !!(options && (options as AddEventListenerOptions).capture);

  const listeners: Listener[] = [];
  const find = (target: EventTarget, type: string, fn: unknown, cap: boolean) =>
    listeners.findIndex((l) => l.target === target && l.type === type && l.fn === fn && l.capture === cap);

  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, fn: unknown, options?: unknown) {
    const cap = capture(options);
    const once = typeof options === 'object' && options !== null && (options as AddEventListenerOptions).once;
    if (fn && !once && find(this, type, fn, cap) === -1) {
      listeners.push({ target: this, type, fn, capture: cap, embed: fromEmbed() });
    }
    return add.call(this, type, fn as EventListener, options as AddEventListenerOptions);
  } as typeof add;
  EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, fn: unknown, options?: unknown) {
    const index = find(this, type, fn, capture(options));
    if (index !== -1) listeners.splice(index, 1);
    return remove.call(this, type, fn as EventListener, options as EventListenerOptions);
  } as typeof remove;

  const pending = new Map<string, boolean>();
  const wrapTimer = (kind: string, set: (...args: any[]) => number, clear: (id: number) => void, repeats: boolean) => {
    const w = window as any;
    w[set.name] = function (callback: unknown, ...rest: unknown[]) {
      const embed = fromEmbed();
      let id = 0;
      const wrapped = typeof callback === 'function'
        ? function (this: unknown, ...args: unknown[]) {
            if (!repeats) pending.delete(`${kind}:${id}`);
            return (callback as (...a: unknown[]) => unknown).apply(this, args);
          }
        : callback;
      id = set.call(window, wrapped, ...rest);
      pending.set(`${kind}:${id}`, embed);
      return id;
    };
    w[clear.name] = function (id: number) {
      pending.delete(`${kind}:${id}`);
      return clear.call(window, id);
    };
  };
  wrapTimer('timeout', window.setTimeout, window.clearTimeout, false);
  wrapTimer('interval', window.setInterval, window.clearInterval, true);
  wrapTimer('frame', window.requestAnimationFrame, window.cancelAnimationFrame, false);

  (window as any).__leaks = () => {
    const attached = (l: Listener) =>
      l.target === window || l.target === document || (l.target instanceof Node && l.target.isConnected);
    const live = listeners.filter(attached);
    return {
      embedListeners: live.filter((l) => l.embed).map((l) => l.type),
      hostListeners: live.filter((l) => !l.embed).length,
      embedTimers: [...pending.values()].filter(Boolean).length,
      hostTimers: [...pending.values()].filter((embed) => !embed).length,
    };
  };
}

export type LeakReport = { embedListeners: string[]; hostListeners: number; embedTimers: number; hostTimers: number };

export function leaks(page: Page): Promise<LeakReport> {
  return page.evaluate(() => (window as any).__leaks());
}
