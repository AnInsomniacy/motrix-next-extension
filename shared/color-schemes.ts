/**
 * @fileoverview Preset color scheme definitions for the extension.
 *
 * Exact copy of desktop Motrix Next `constants.ts` L13-44.
 * Each seed is fed to MCU `themeFromSourceColor` to generate the full
 * M3 tonal palette at runtime. Seeds are curated for:
 * - Even HSL hue distribution (~36° apart)
 * - WCAG AA compliance when MCU-generated
 * - Aesthetic harmony across light and dark M3 surfaces
 */

/** Color scheme definition for the preset palette picker. */
export interface ColorSchemeDefinition {
  /** Unique identifier stored in config (kebab-case). */
  id: string;
  /** i18n key for the scheme name. */
  labelKey: string;
  /** Seed hex fed to MCU `themeFromSourceColor`. */
  seed: string;
}

/**
 * 10 curated preset color schemes spanning warm, cool, and neutral hues.
 *
 * @see /motrix-next/src/shared/constants.ts L33-44
 */
export const COLOR_SCHEMES: ColorSchemeDefinition[] = [
  { id: 'amber', labelKey: 'options_color_scheme_amber', seed: '#E0A422' },
  { id: 'space', labelKey: 'options_color_scheme_space', seed: '#4A6CF7' },
  { id: 'mint', labelKey: 'options_color_scheme_mint', seed: '#10B981' },
  { id: 'rose', labelKey: 'options_color_scheme_rose', seed: '#F43F5E' },
  { id: 'aurora', labelKey: 'options_color_scheme_aurora', seed: '#8B5CF6' },
  { id: 'coral', labelKey: 'options_color_scheme_coral', seed: '#F97316' },
  { id: 'glacier', labelKey: 'options_color_scheme_glacier', seed: '#06B6D4' },
  { id: 'evergreen', labelKey: 'options_color_scheme_evergreen', seed: '#15803D' },
  { id: 'graphite', labelKey: 'options_color_scheme_graphite', seed: '#6B7280' },
  { id: 'sakura', labelKey: 'options_color_scheme_sakura', seed: '#EC4899' },
];

/** Default color scheme ID. */
export const DEFAULT_COLOR_SCHEME = 'amber';

/** Resolve a scheme definition by ID, falling back to amber. */
export function resolveScheme(id: string | undefined): ColorSchemeDefinition {
  return COLOR_SCHEMES.find((s) => s.id === id) ?? COLOR_SCHEMES[0]!;
}
