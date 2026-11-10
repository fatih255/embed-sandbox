import { describe, expect, it } from 'vitest';
import { DEFAULTS, MAX_DELAY_MS, MAX_TEXT_LENGTH, mergeOverrides, parseConfig, readScriptConfig } from '../../src/config';

describe('parseConfig', () => {
  it('returns the defaults for an empty config', () => {
    expect(parseConfig({})).toEqual({ config: DEFAULTS, warnings: [] });
  });

  it('reads valid values', () => {
    const { config, warnings } = parseConfig({
      title: '  Hello  ',
      message: 'Body',
      button: 'Go',
      success: 'Done',
      position: 'bottom-left',
      accent: '#ABCDEF',
      delay: '1500',
      auto: 'false',
    });
    expect(warnings).toEqual([]);
    expect(config).toEqual({
      title: 'Hello',
      message: 'Body',
      button: 'Go',
      success: 'Done',
      position: 'bottom-left',
      accent: '#abcdef',
      delay: 1500,
      auto: false,
    });
  });

  it('accepts three-digit hex colors', () => {
    expect(parseConfig({ accent: '#0a0' }).config.accent).toBe('#0a0');
  });

  it('ignores blank values', () => {
    const { config, warnings } = parseConfig({ title: '   ', accent: '' });
    expect(config.title).toBe(DEFAULTS.title);
    expect(config.accent).toBe(DEFAULTS.accent);
    expect(warnings).toEqual([]);
  });

  it.each([
    ['accent', 'red'],
    ['accent', 'url(javascript:alert(1))'],
    ['accent', '#12345'],
    ['position', 'top-center'],
    ['delay', '-5'],
    ['delay', '1.5'],
    ['delay', '10s'],
    ['auto', 'yes'],
  ] as const)('falls back to the default for %s="%s" and warns', (key, value) => {
    const { config, warnings } = parseConfig({ [key]: value });
    expect(config[key]).toBe(DEFAULTS[key]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`data-${key}`);
  });

  it('caps the delay', () => {
    const { config, warnings } = parseConfig({ delay: '999999' });
    expect(config.delay).toBe(MAX_DELAY_MS);
    expect(warnings).toHaveLength(1);
  });

  it('cuts text that is too long', () => {
    const { config, warnings } = parseConfig({ title: 'x'.repeat(MAX_TEXT_LENGTH + 50) });
    expect(config.title).toHaveLength(MAX_TEXT_LENGTH);
    expect(warnings[0]).toContain('data-title');
  });

  it('treats auto as case-insensitive', () => {
    expect(parseConfig({ auto: 'FALSE' }).config.auto).toBe(false);
    expect(parseConfig({ auto: 'True' }).config.auto).toBe(true);
  });

  it("doesn't pick up inherited properties", () => {
    const raw = Object.create({ title: 'from the prototype' });
    expect(parseConfig(raw).config.title).toBe(DEFAULTS.title);
  });
});

describe('readScriptConfig', () => {
  it('reads only known data attributes from the script tag', () => {
    const script = document.createElement('script');
    script.setAttribute('data-title', 'From the tag');
    script.setAttribute('data-delay', '200');
    script.setAttribute('data-unknown', 'ignored');
    expect(readScriptConfig(script)).toEqual({ title: 'From the tag', delay: '200' });
  });

  it('returns an empty config without a script', () => {
    expect(readScriptConfig(null)).toEqual({});
  });
});

describe('mergeOverrides', () => {
  it('validates overrides passed to init()', () => {
    const base = { ...DEFAULTS, title: 'Base' };
    const { config, warnings } = mergeOverrides(base, { delay: 300, accent: 'nope' });
    expect(config.title).toBe('Base');
    expect(config.delay).toBe(300);
    expect(config.accent).toBe(DEFAULTS.accent);
    expect(warnings).toHaveLength(1);
  });

  it('returns the base config when there are no overrides', () => {
    expect(mergeOverrides(DEFAULTS, undefined).config).toBe(DEFAULTS);
  });
});
