import { h, render } from 'preact';
import { mergeOverrides, parseConfig, readScriptConfig, type EmbedConfig } from './config';
import { Widget } from './Widget';
import styles from './styles.css?inline';

/**
 * The runtime's boundaries, written down:
 *
 * - It changes the host page in exactly one place: a single <embed-sandbox>
 *   element appended to <body>. Everything visible lives in that element's
 *   shadow root.
 * - It owns two globals: window.EmbedSandbox (the public API) and a
 *   Symbol.for() key used to detect a second copy of the script.
 * - Every listener and timer it starts goes through `listen` / `later`, which
 *   record a cleanup. destroy() runs all of them, so closing the card leaves
 *   the page the way it was before init().
 */

export type Phase = 'idle' | 'waiting' | 'mounted';

export interface EmbedApi {
  readonly version: string;
  /** Mounts the card. Returns false if it's already mounted or waiting to mount. */
  init(overrides?: Partial<EmbedConfig>): boolean;
  /** Removes the card, its listeners and timers. Returns false if there was nothing to remove. */
  destroy(): boolean;
  status(): Phase;
}

declare global {
  interface Window {
    EmbedSandbox?: EmbedApi;
  }
}

declare const __VERSION__: string;

export const HOST_TAG = 'embed-sandbox';
export const GLOBAL_KEY: unique symbol = Symbol.for('embed-sandbox.runtime') as never;
const LOG_PREFIX = '[embed-sandbox]';

type Cleanup = () => void;

export function createEmbed(win: Window, baseConfig: EmbedConfig): EmbedApi {
  const doc = win.document;
  let phase: Phase = 'idle';
  let cleanups: Cleanup[] = [];

  const listen = <K extends keyof DocumentEventMap>(
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
  ): Cleanup => {
    doc.addEventListener(type, handler);
    const remove = () => doc.removeEventListener(type, handler);
    cleanups.push(remove);
    return remove;
  };

  const later = (ms: number, fn: () => void) => {
    const id = win.setTimeout(fn, ms);
    cleanups.push(() => win.clearTimeout(id));
  };

  const mount = (config: EmbedConfig) => {
    const host = doc.createElement(HOST_TAG);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = styles;
    const root = doc.createElement('div');
    root.className = 'root';
    shadow.appendChild(style);
    shadow.appendChild(root);
    (doc.body ?? doc.documentElement).appendChild(host);

    render(h(Widget, { config, onClose: destroy }), root);
    cleanups.push(() => {
      render(null, root);
      host.remove();
    });

    listen('keydown', (event) => {
      if (event.key === 'Escape') destroy();
    });
    phase = 'mounted';
  };

  function init(overrides?: Partial<EmbedConfig>): boolean {
    if (phase !== 'idle') return false;
    const { config, warnings } = mergeOverrides(baseConfig, overrides);
    for (const warning of warnings) console.warn(`${LOG_PREFIX} ${warning}`);
    phase = 'waiting';

    const whenReady = () => {
      if (config.delay > 0) later(config.delay, () => mount(config));
      else mount(config);
    };

    // A script in <head> without defer runs before <body> exists.
    if (doc.readyState === 'loading') {
      const stop = listen('DOMContentLoaded', () => {
        stop();
        whenReady();
      });
    } else {
      whenReady();
    }
    return true;
  }

  function destroy(): boolean {
    if (phase === 'idle') return false;
    const pending = cleanups;
    cleanups = [];
    phase = 'idle';
    while (pending.length > 0) {
      const cleanup = pending.pop()!;
      try {
        cleanup();
      } catch (error) {
        console.error(LOG_PREFIX, 'cleanup failed', error);
      }
    }
    return true;
  }

  return Object.freeze({
    version: __VERSION__,
    init,
    destroy,
    status: () => phase,
  });
}

/**
 * Entry point for the script tag. A second copy of the script (pasted twice,
 * or added by a tag manager and by hand) finds the first runtime and stops.
 */
export function install(win: Window, script: Element | null): EmbedApi {
  const registry = win as unknown as Record<typeof GLOBAL_KEY, EmbedApi | undefined>;
  const existing = registry[GLOBAL_KEY];
  if (existing) {
    console.info(`${LOG_PREFIX} already loaded, ignoring this copy of the script`);
    if (!win.EmbedSandbox) win.EmbedSandbox = existing;
    return existing;
  }

  const { config, warnings } = parseConfig(readScriptConfig(script));
  for (const warning of warnings) console.warn(`${LOG_PREFIX} ${warning}`);

  const api = createEmbed(win, config);
  Object.defineProperty(win, GLOBAL_KEY, { value: api, configurable: true });
  win.EmbedSandbox = api;
  if (config.auto) api.init();
  return api;
}
