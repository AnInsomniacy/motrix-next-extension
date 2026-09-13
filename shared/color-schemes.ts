export interface ColorSchemeDefinition {
  /** Unique identifier stored in config (kebab-case). */
  id: string;
  /** i18n key for the scheme name. */
  labelKey: string;
  /** Seed hex fed to MCU `themeFromSourceColor`. */
  seed: string;
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
  { id: 'graphite', labelKey: 'options_color_scheme_graphite', seed: '#6B7280' },
  { id: 'sakura', labelKey: 'options_color_scheme_sakura', seed: '#EC4899' },
];
