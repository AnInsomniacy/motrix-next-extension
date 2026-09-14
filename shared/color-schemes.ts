export interface ColorSchemeDefinition {
  /** Unique identifier stored in config (kebab-case). */
  id: string;
  /** i18n key for the scheme name. */
  labelKey: string;
  /** Seed hex fed to MCU `themeFromSourceColor`. */
  seed: string;
  variant?: 'source' | 'content';
}

export const CUSTOM_COLOR_SCHEME_ID = 'custom';
export const DEFAULT_CUSTOM_COLOR_SCHEME = '#737373';

/** Same opaque HEX contract as Rayburst's custom theme setting. */
export function normalizeCustomColorScheme(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CUSTOM_COLOR_SCHEME;
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return DEFAULT_CUSTOM_COLOR_SCHEME;
  const hex = match[1]!;
  return `#${(hex.length === 3 ? [...hex].map((char) => char + char).join('') : hex).toUpperCase()}`;
}

export function resolveColorScheme(id: string, customColor: string): ColorSchemeDefinition {
  return id === CUSTOM_COLOR_SCHEME_ID
    ? { id, labelKey: 'options_color_scheme_custom', seed: normalizeCustomColorScheme(customColor) }
    : (COLOR_SCHEMES.find((scheme) => scheme.id === id) ?? COLOR_SCHEMES[0]!);
}

/** Material palette seeds; Electric Purple is the default. */
export const COLOR_SCHEMES: ColorSchemeDefinition[] = [
  { id: 'electric', labelKey: 'options_color_scheme_electric', seed: '#7B3ED1' },
  { id: 'space', labelKey: 'options_color_scheme_space', seed: '#4A6CF7' },
  { id: 'mint', labelKey: 'options_color_scheme_mint', seed: '#10B981' },
  { id: 'rose', labelKey: 'options_color_scheme_rose', seed: '#F43F5E' },
  { id: 'aurora', labelKey: 'options_color_scheme_aurora', seed: '#8B5CF6' },
  { id: 'coral', labelKey: 'options_color_scheme_coral', seed: '#F97316' },
  { id: 'glacier', labelKey: 'options_color_scheme_glacier', seed: '#06B6D4' },
  { id: 'evergreen', labelKey: 'options_color_scheme_evergreen', seed: '#15803D' },
  {
    id: 'graphite',
    labelKey: 'options_color_scheme_graphite',
    seed: '#737373',
    variant: 'content',
  },
  { id: 'sakura', labelKey: 'options_color_scheme_sakura', seed: '#EC4899' },
];
