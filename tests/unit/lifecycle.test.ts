import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { DEFAULTS, type EmbedConfig } from '../../src/config';
import { createEmbed, GLOBAL_KEY, HOST_TAG, install, type EmbedApi } from '../../src/runtime';
import { isValidEmail } from '../../src/Widget';

const hosts = () => document.querySelectorAll(HOST_TAG);
const shadow = () => {
  const host = document.querySelector(HOST_TAG);
  if (!host?.shadowRoot) throw new Error('widget is not mounted');
  return host.shadowRoot;
};

/** Records document listeners so a test can check that every add was matched by a remove. */
function trackDocumentListeners() {
  const active = new Set<EventListenerOrEventListenerObject>();
  const add = vi.spyOn(document, 'addEventListener').mockImplementation(function (this: Document, type, listener, options) {
    if (listener) active.add(listener);
    return EventTarget.prototype.addEventListener.call(this, type, listener, options);
  });
  const remove = vi.spyOn(document, 'removeEventListener').mockImplementation(function (this: Document, type, listener, options) {
    if (listener) active.delete(listener);
    return EventTarget.prototype.removeEventListener.call(this, type, listener, options);
  });
  return { active, added: () => add.mock.calls.length, restore: () => (add.mockRestore(), remove.mockRestore()) };
}

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => state });
}

let embed: EmbedApi | undefined;
const create = (config: Partial<EmbedConfig> = {}) => (embed = createEmbed(window, { ...DEFAULTS, ...config }));

beforeEach(() => {
  setReadyState('complete');
});

afterEach(() => {
  embed?.destroy();
  embed = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as { readyState?: unknown }).readyState;
  delete (window as unknown as Record<symbol, unknown>)[GLOBAL_KEY];
  delete window.EmbedSandbox;
  document.body.innerHTML = '';
});

describe('init', () => {
  it('mounts one host element with the styles inside its shadow root', () => {
    create();
    expect(embed!.init()).toBe(true);
    expect(embed!.status()).toBe('mounted');
    expect(hosts()).toHaveLength(1);
    const root = shadow();
    expect(root.querySelector('style')?.textContent).toContain(':host');
    expect(root.querySelector('.title')?.textContent).toBe(DEFAULTS.title);
    // Nothing is added to the host document's <head>.
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('is idempotent', () => {
    create();
    expect(embed!.init()).toBe(true);
    expect(embed!.init()).toBe(false);
    expect(embed!.init({ title: 'Other' })).toBe(false);
    expect(hosts()).toHaveLength(1);
    expect(shadow().querySelector('.title')?.textContent).toBe(DEFAULTS.title);
  });

  it('applies validated overrides', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    create();
    embed!.init({ title: 'Override', position: 'bottom-left', accent: 'not-a-color' });
    const card = shadow().querySelector<HTMLElement>('.card')!;
    expect(shadow().querySelector('.title')?.textContent).toBe('Override');
    expect(card.classList.contains('bottom-left')).toBe(true);
    expect(card.style.getPropertyValue('--es-accent')).toBe(DEFAULTS.accent);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('waits for DOMContentLoaded when the document is still loading', () => {
    setReadyState('loading');
    create();
    embed!.init();
    expect(embed!.status()).toBe('waiting');
    expect(hosts()).toHaveLength(0);

    setReadyState('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(embed!.status()).toBe('mounted');
    expect(hosts()).toHaveLength(1);
  });

  it('waits for the configured delay', () => {
    vi.useFakeTimers();
    create({ delay: 1000 });
    embed!.init();
    expect(embed!.status()).toBe('waiting');
    vi.advanceTimersByTime(999);
    expect(hosts()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(hosts()).toHaveLength(1);
  });
});

describe('destroy', () => {
  it('removes the host element and every document listener', () => {
    const listeners = trackDocumentListeners();
    create();
    embed!.init();
    expect(listeners.active.size).toBeGreaterThan(0);

    expect(embed!.destroy()).toBe(true);
    expect(hosts()).toHaveLength(0);
    expect(listeners.active.size).toBe(0);
    expect(embed!.status()).toBe('idle');
    expect(embed!.destroy()).toBe(false);
  });

  it('cancels a pending delay timer', () => {
    vi.useFakeTimers();
    create({ delay: 5000 });
    embed!.init();
    expect(vi.getTimerCount()).toBe(1);
    embed!.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(hosts()).toHaveLength(0);
  });

  it('removes the DOMContentLoaded listener if destroyed before the page is ready', () => {
    setReadyState('loading');
    const listeners = trackDocumentListeners();
    create();
    embed!.init();
    expect(listeners.active.size).toBe(1);
    embed!.destroy();
    expect(listeners.active.size).toBe(0);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(hosts()).toHaveLength(0);
  });

  it('can mount again after destroy', () => {
    create();
    embed!.init();
    embed!.destroy();
    expect(embed!.init()).toBe(true);
    expect(hosts()).toHaveLength(1);
  });

  it('runs when the close button is clicked', () => {
    const listeners = trackDocumentListeners();
    create();
    embed!.init();
    act(() => shadow().querySelector<HTMLButtonElement>('.close')!.click());
    expect(hosts()).toHaveLength(0);
    expect(listeners.active.size).toBe(0);
  });

  it('runs when Escape is pressed', () => {
    create();
    embed!.init();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(hosts()).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(hosts()).toHaveLength(0);
  });
});

describe('install', () => {
  const script = (attrs: Record<string, string>) => {
    const el = document.createElement('script');
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(`data-${key}`, value);
    return el;
  };

  it('reads the script tag, exposes window.EmbedSandbox and mounts', () => {
    embed = install(window, script({ title: 'From the tag' }));
    expect(window.EmbedSandbox).toBe(embed);
    expect(shadow().querySelector('.title')?.textContent).toBe('From the tag');
  });

  it('ignores a second copy of the script', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    embed = install(window, script({ title: 'First' }));
    const second = install(window, script({ title: 'Second' }));
    expect(second).toBe(embed);
    expect(hosts()).toHaveLength(1);
    expect(shadow().querySelector('.title')?.textContent).toBe('First');
  });

  it('restores window.EmbedSandbox if the host page deleted it', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    embed = install(window, script({}));
    delete window.EmbedSandbox;
    install(window, script({}));
    expect(window.EmbedSandbox).toBe(embed);
  });

  it('does not mount when data-auto="false"', () => {
    embed = install(window, script({ auto: 'false' }));
    expect(embed.status()).toBe('idle');
    expect(hosts()).toHaveLength(0);
    embed.init();
    expect(hosts()).toHaveLength(1);
  });

  it('exposes a frozen API', () => {
    embed = install(window, script({ auto: 'false' }));
    expect(Object.isFrozen(embed)).toBe(true);
  });
});

describe('email form', () => {
  const type = (value: string) => {
    const input = shadow().querySelector<HTMLInputElement>('.email')!;
    act(() => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const submit = () => act(() => shadow().querySelector<HTMLButtonElement>('.submit')!.click());

  it('shows an error for an invalid address and keeps the form', () => {
    create();
    act(() => void embed!.init());
    type('not-an-email');
    submit();
    expect(shadow().querySelector('[role="alert"]')?.textContent).toContain('Enter an email address');
    expect(shadow().querySelector('.email')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the thank-you state for a valid address', () => {
    create({ success: 'Got it.' });
    act(() => void embed!.init());
    type('dev@example.com');
    submit();
    expect(shadow().querySelector('.card')?.getAttribute('data-state')).toBe('done');
    expect(shadow().querySelector('[role="status"]')?.textContent).toBe('Got it.');
    expect(shadow().querySelector('form')).toBeNull();
  });

  it.each([
    ['dev@example.com', true],
    ['  dev@example.com  ', true],
    ['a.b+tag@sub.example.co', true],
    ['dev@example', false],
    ['dev example@x.com', false],
    ['@example.com', false],
    ['', false],
    [`${'a'.repeat(250)}@x.com`, false],
  ])('isValidEmail(%j) is %s', (value, expected) => {
    expect(isValidEmail(value)).toBe(expected);
  });
});
