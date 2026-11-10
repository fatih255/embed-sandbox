export type Position = 'bottom-right' | 'bottom-left';

export interface EmbedConfig {
  title: string;
  message: string;
  button: string;
  success: string;
  position: Position;
  /** Hex color used for the button and focus ring. */
  accent: string;
  /** Milliseconds to wait after the page is ready before showing the card. */
  delay: number;
  /** When false, nothing mounts until the host calls EmbedSandbox.init(). */
  auto: boolean;
}

export const DEFAULTS: Readonly<EmbedConfig> = Object.freeze({
  title: 'Get the monthly changelog',
  message: 'One short email when something ships. This is a demo, so nothing is sent.',
  button: 'Subscribe',
  success: "Thanks, you're on the list.",
  position: 'bottom-right',
  accent: '#2563eb',
  delay: 0,
  auto: true,
});

export const MAX_TEXT_LENGTH = 200;
export const MAX_DELAY_MS = 60_000;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const POSITIONS: readonly Position[] = ['bottom-right', 'bottom-left'];
const TEXT_KEYS = ['title', 'message', 'button', 'success'] as const;

export type RawConfig = Partial<Record<keyof EmbedConfig, string | undefined>>;

export interface ParseResult {
  config: EmbedConfig;
  warnings: string[];
}

/**
 * Turns the string values from the script tag's data attributes into a typed
 * config. Unknown or invalid values fall back to defaults with a warning
 * instead of throwing: a typo in a customer's snippet shouldn't break the page.
 */
export function parseConfig(raw: RawConfig): ParseResult {
  const warnings: string[] = [];
  const config: EmbedConfig = { ...DEFAULTS };
  // Own properties only: a host page that adds Object.prototype.title shouldn't change the card.
  const read = (key: keyof EmbedConfig) =>
    Object.prototype.hasOwnProperty.call(raw, key) ? raw[key]?.trim() : undefined;

  for (const key of TEXT_KEYS) {
    const value = read(key);
    if (!value) continue;
    if (value.length > MAX_TEXT_LENGTH) {
      warnings.push(`data-${key} is longer than ${MAX_TEXT_LENGTH} characters and was cut`);
      config[key] = value.slice(0, MAX_TEXT_LENGTH);
    } else {
      config[key] = value;
    }
  }

  const position = read('position');
  if (position) {
    if ((POSITIONS as readonly string[]).includes(position)) {
      config.position = position as Position;
    } else {
      warnings.push(`data-position "${position}" is not one of ${POSITIONS.join(', ')}`);
    }
  }

  const accent = read('accent');
  if (accent) {
    if (HEX_COLOR.test(accent)) {
      config.accent = accent.toLowerCase();
    } else {
      warnings.push(`data-accent "${accent}" is not a hex color like #2563eb`);
    }
  }

  const delay = read('delay');
  if (delay) {
    const ms = /^\d+$/.test(delay) ? Number(delay) : Number.NaN;
    if (Number.isNaN(ms)) {
      warnings.push(`data-delay "${delay}" is not a whole number of milliseconds`);
    } else {
      if (ms > MAX_DELAY_MS) warnings.push(`data-delay was capped at ${MAX_DELAY_MS}`);
      config.delay = Math.min(ms, MAX_DELAY_MS);
    }
  }

  const auto = read('auto')?.toLowerCase();
  if (auto) {
    if (auto === 'false') config.auto = false;
    else if (auto !== 'true') warnings.push(`data-auto "${auto}" should be "true" or "false"`);
  }

  return { config, warnings };
}

/** Reads the data attributes this embed understands from its script tag. */
export function readScriptConfig(script: Element | null | undefined): RawConfig {
  if (!script) return {};
  const raw: RawConfig = {};
  for (const key of Object.keys(DEFAULTS) as (keyof EmbedConfig)[]) {
    const value = script.getAttribute(`data-${key}`);
    if (value !== null) raw[key] = value;
  }
  return raw;
}

/** Applies overrides passed to EmbedSandbox.init() through the same validation. */
export function mergeOverrides(base: EmbedConfig, overrides: Partial<EmbedConfig> | undefined): ParseResult {
  if (!overrides) return { config: base, warnings: [] };
  const raw: RawConfig = {};
  for (const key of Object.keys(DEFAULTS) as (keyof EmbedConfig)[]) {
    const value = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : base[key];
    raw[key] = String(value);
  }
  return parseConfig(raw);
}
