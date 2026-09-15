/**
 * The extension's entire theme system in one module:
 *
 *   - preset color schemes (MCU seeds, aligned with the desktop app)
 *   - M3 palette generation → CSS custom properties
 *   - pre-mount bootstrap (no first-frame flash)
 *   - `useAppTheme()` — the single Vue composable both UIs consume
 *
 * The static Rayburst purple values in globals.css act as fallback for the brief
 * window before the bootstrap runs.
 */
import { computed, onScopeDispose, ref, watchEffect } from 'vue';
import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  CorePalette,
  Contrast,
  customColor,
  type Theme,
} from '@material/material-color-utilities';
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui';
import { parseUiPrefs, type ThemePreference, type UiPrefs } from '@/lib/schema';

// ─── Color Schemes ──────────────────────────────────────

interface ColorSchemeDefinition {
  /** Unique identifier stored in config (kebab-case). */
  id: UiPrefs['colorScheme'];
  /** i18n key for the scheme name. */
  labelKey: string;
  /** Seed hex fed to MCU `themeFromSourceColor`. */
  seed: string;
}

/** Rayburst purple is the default; other seeds are explicit user choices. */
export const COLOR_SCHEMES: ColorSchemeDefinition[] = [
  { id: 'rayburst', labelKey: 'options_color_scheme_rayburst', seed: '#7B3ED1' },
  { id: 'amber', labelKey: 'options_color_scheme_amber', seed: '#E0A422' },
  { id: 'space', labelKey: 'options_color_scheme_space', seed: '#4A6CF7' },
  { id: 'mint', labelKey: 'options_color_scheme_mint', seed: '#10B981' },
  { id: 'rose', labelKey: 'options_color_scheme_rose', seed: '#F43F5E' },
  { id: 'coral', labelKey: 'options_color_scheme_coral', seed: '#F97316' },
  { id: 'glacier', labelKey: 'options_color_scheme_glacier', seed: '#06B6D4' },
  { id: 'evergreen', labelKey: 'options_color_scheme_evergreen', seed: '#15803D' },
  { id: 'graphite', labelKey: 'options_color_scheme_graphite', seed: '#6B7280' },
  { id: 'sakura', labelKey: 'options_color_scheme_sakura', seed: '#EC4899' },
];

function resolveScheme(id: string | undefined): ColorSchemeDefinition {
  return COLOR_SCHEMES.find((s) => s.id === id) ?? COLOR_SCHEMES[0]!;
}

/** Resolve a theme preference to the effective light/dark class. */
function resolveThemeClass(preference: ThemePreference, systemIsDark: boolean): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemIsDark ? 'dark' : 'light';
}

// ─── M3 Palette → CSS Variables ─────────────────────────

const MCU_TO_CSS: Record<string, string> = {
  primary: '--color-primary',
  onPrimary: '--color-on-primary',
  primaryContainer: '--color-primary-container',
  onPrimaryContainer: '--color-on-primary-container',
  surface: '--color-surface',
  onSurface: '--color-on-surface',
  onSurfaceVariant: '--color-on-surface-variant',
  outline: '--color-outline',
  outlineVariant: '--color-outline-variant',
  error: '--color-error',
  onError: '--color-on-error',
  errorContainer: '--color-error-container',
  tertiary: '--color-tertiary',
  onTertiary: '--color-on-tertiary',
  inverseSurface: '--color-inverse-surface',
  inverseOnSurface: '--color-on-inverse-surface',
};

const SURFACE_TONES = {
  light: {
    '--color-surface-dim': 84,
    '--color-surface-container-lowest': 98,
    '--color-surface-container-low': 94,
    '--color-surface-container': 91,
    '--color-surface-container-high': 88,
    '--color-surface-container-highest': 85,
  },
  dark: {
    '--color-surface-dim': 6,
    '--color-surface-container-lowest': 4,
    '--color-surface-container-low': 10,
    '--color-surface-container': 12,
    '--color-surface-container-high': 17,
    '--color-surface-container-highest': 22,
  },
} as const;

const SEMANTIC_SEEDS = {
  info: '#0061A4',
  success: '#386A20',
  warning: '#7C5800',
  error: '#BA1A1A',
} as const;

function semanticRoles(theme: Theme, dark: boolean) {
  return Object.fromEntries(
    Object.entries(SEMANTIC_SEEDS).map(([name, seed]) => {
      const group = customColor(theme.source, { name, value: argbFromHex(seed), blend: true });
      const role = dark ? group.dark : group.light;
      const palette = CorePalette.of(group.value).a1;
      return [
        name,
        {
          color: hexFromArgb(role.color),
          onColor: hexFromArgb(role.onColor),
          container: hexFromArgb(role.colorContainer),
          onContainer: hexFromArgb(role.onColorContainer),
          hover: hexFromArgb(palette.tone(dark ? 70 : Contrast.darker(100, 4.6))),
          pressed: hexFromArgb(palette.tone(dark ? 90 : 30)),
        },
      ];
    }),
  );
}

interface ThemeVarsInput {
  readonly seedHex: string;
  readonly isDark: boolean;
}

/** Generate every themed CSS custom property for a seed + mode. */
export function createThemeVars({ seedHex, isDark }: ThemeVarsInput): Record<string, string> {
  const m3Theme = themeFromSourceColor(argbFromHex(seedHex));
  const scheme = isDark ? m3Theme.schemes.dark : m3Theme.schemes.light;
  const json = scheme.toJSON() as Record<string, number>;
  const vars: Record<string, string> = {};

  for (const [mcuKey, cssVar] of Object.entries(MCU_TO_CSS)) {
    const argb = json[mcuKey];
    if (argb !== undefined) vars[cssVar] = hexFromArgb(argb);
  }

  const neutral = m3Theme.palettes.neutral;
  for (const [cssVar, tone] of Object.entries(SURFACE_TONES[isDark ? 'dark' : 'light'])) {
    vars[cssVar] = hexFromArgb(neutral.tone(tone));
  }

  const primary = hexFromArgb(scheme.primary);
  vars['--color-brand'] = primary;
  for (const [name, role] of Object.entries(semanticRoles(m3Theme, isDark))) {
    vars[`--color-${name}`] = role.color;
    vars[`--color-on-${name}`] = role.onColor;
    vars[`--color-${name}-container`] = role.container;
    vars[`--color-on-${name}-container`] = role.onContainer;
  }

  const palette = m3Theme.palettes.primary;
  vars['--color-primary-light-5'] = hexFromArgb(palette.tone(isDark ? 30 : 80));
  vars['--color-primary-light-9'] = hexFromArgb(palette.tone(isDark ? 10 : 95));

  const sr = (scheme.onSurface >> 16) & 0xff;
  const sg = (scheme.onSurface >> 8) & 0xff;
  const sb = scheme.onSurface & 0xff;
  vars['--color-scrollbar-thumb'] = `rgba(${sr}, ${sg}, ${sb}, ${isDark ? 0.22 : 0.3})`;

  return vars;
}

/** Apply the theme to the document: class on <html> + CSS variables. */
function applyThemeToDocument(prefs: UiPrefs, systemIsDark: boolean): void {
  const themeClass = resolveThemeClass(prefs.theme, systemIsDark);
  document.documentElement.className = themeClass;
  const vars = createThemeVars({
    seedHex: resolveScheme(prefs.colorScheme).seed,
    isDark: themeClass === 'dark',
  });
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value);
  }
}

// ─── Pre-mount Bootstrap ────────────────────────────────

let bootstrappedPrefs: UiPrefs | undefined;

/**
 * Apply the persisted theme before Vue mounts so the first rendered frame
 * doesn't flash the static purple fallback.
 */
export async function bootstrapStoredTheme(storage: {
  getItem: (key: 'local:uiPrefs') => Promise<unknown>;
}): Promise<UiPrefs> {
  const prefs = parseUiPrefs(await storage.getItem('local:uiPrefs').catch(() => null));
  applyThemeToDocument(prefs, window.matchMedia('(prefers-color-scheme: dark)').matches);
  bootstrappedPrefs = prefs;
  return prefs;
}

// ─── Naive UI Overrides ─────────────────────────────────

const FONT_FAMILY =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ' +
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ' +
  '"Helvetica Neue", Helvetica, Arial, sans-serif';

export function buildThemeOverrides(seedHex: string, isDark: boolean): GlobalThemeOverrides {
  const m3Theme = themeFromSourceColor(argbFromHex(seedHex));
  const scheme = isDark ? m3Theme.schemes.dark : m3Theme.schemes.light;
  const neutral = m3Theme.palettes.neutral;
  const tones = SURFACE_TONES[isDark ? 'dark' : 'light'];
  const surface = (key: keyof typeof tones) => hexFromArgb(neutral.tone(tones[key]));

  const primary = hexFromArgb(scheme.primary);
  const onPrimary = hexFromArgb(scheme.onPrimary);
  const onSurface = hexFromArgb(scheme.onSurface);
  const onSurfaceVariant = hexFromArgb(scheme.onSurfaceVariant);
  const outline = hexFromArgb(scheme.outlineVariant);
  const outlineFull = hexFromArgb(scheme.outline);

  const primaryPalette = m3Theme.palettes.primary;
  const primaryHover = hexFromArgb(primaryPalette.tone(isDark ? 70 : Contrast.darker(100, 4.6)));
  const primaryPressed = hexFromArgb(primaryPalette.tone(isDark ? 90 : 30));

  const roles = semanticRoles(m3Theme, isDark);
  const semanticOverrides = Object.fromEntries(
    Object.entries(roles).flatMap(([name, role]) => [
      [`${name}Color`, role.color],
      [`${name}ColorHover`, role.hover],
      [`${name}ColorPressed`, role.pressed],
      [`${name}ColorSuppl`, role.color],
    ]),
  );
  const buttonForegrounds = Object.fromEntries(
    Object.entries(roles).flatMap(([name, role]) => {
      const suffix = name[0]!.toUpperCase() + name.slice(1);
      return ['', 'Hover', 'Pressed', 'Focus'].map((state) => [
        `textColor${state}${suffix}`,
        role.onColor,
      ]);
    }),
  );
  return {
    common: {
      ...semanticOverrides,
      primaryColor: primary,
      primaryColorHover: primaryHover,
      primaryColorPressed: primaryPressed,
      primaryColorSuppl: primary,
      bodyColor: 'transparent',
      cardColor: surface('--color-surface-container'),
      modalColor: surface('--color-surface-container-high'),
      popoverColor: surface('--color-surface-container-high'),
      borderColor: outline,
      dividerColor: outline,
      borderRadius: '6px',
      fontFamily: FONT_FAMILY,
    },
    Divider: { color: outline },
    Button: {
      ...buttonForegrounds,
      textColorPrimary: onPrimary,
      textColorHoverPrimary: onPrimary,
      textColorPressedPrimary: onPrimary,
      textColorFocusPrimary: onPrimary,
      border: `1px solid ${outline}`,
      borderHover: `1px solid ${outlineFull}`,
      borderFocus: `1px solid ${outlineFull}`,
    },
    Input: {
      color: surface('--color-surface-container'),
      colorFocus: surface('--color-surface-container'),
      textColor: onSurface,
      placeholderColor: onSurfaceVariant,
      border: `1px solid ${outline}`,
      borderHover: `1px solid ${outlineFull}`,
      borderFocus: `1px solid ${primary}`,
    },
    InputNumber: {
      peers: {
        Input: {
          color: surface('--color-surface-container'),
          colorFocus: surface('--color-surface-container'),
          textColor: onSurface,
          border: `1px solid ${outline}`,
          borderHover: `1px solid ${outlineFull}`,
          borderFocus: `1px solid ${primary}`,
        },
        Button: { textColor: onSurfaceVariant, textColorHover: onSurface },
      },
    },
    Card: {
      color: surface('--color-surface-container-low'),
      textColor: onSurface,
      titleTextColor: onSurface,
      borderColor: outline,
    },
    Message: {
      color: surface('--color-surface-container-high'),
      textColor: onSurface,
      closeIconColor: onSurfaceVariant,
      closeIconColorHover: onSurface,
      colorInfo: surface('--color-surface-container-high'),
      colorSuccess: surface('--color-surface-container-high'),
      colorWarning: surface('--color-surface-container-high'),
      colorError: surface('--color-surface-container-high'),
    },
    Switch: { railColorActive: primary },
    Tag: {
      textColorCheckable: onSurfaceVariant,
      textColorHoverCheckable: primary,
      textColorChecked: onPrimary,
      colorChecked: primary,
      colorCheckedHover: primary,
    },
    Select: {
      peers: {
        InternalSelection: {
          border: `1px solid ${outline}`,
          borderHover: `1px solid ${outlineFull}`,
          borderFocus: `1px solid ${primary}`,
          borderActive: `1px solid ${primary}`,
        },
      },
    },
    Form: { labelTextColor: onSurfaceVariant },
  };
}

// ─── Composable ─────────────────────────────────────────

/**
 * The single theme composable. Owns theme mode + color scheme state,
 * watches the system dark preference, keeps the DOM (class + CSS vars) in
 * sync, and produces Naive UI provider props.
 */
export function useAppTheme() {
  const bootstrapped = bootstrappedPrefs;
  const mode = ref<ThemePreference>(bootstrapped?.theme ?? 'system');
  const colorSchemeId = ref<UiPrefs['colorScheme']>(bootstrapped?.colorScheme ?? 'rayburst');

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(mql.matches);
  const onMediaChange = (e: MediaQueryListEvent) => {
    systemDark.value = e.matches;
  };
  mql.addEventListener('change', onMediaChange);
  onScopeDispose(() => mql.removeEventListener('change', onMediaChange));

  const isDark = computed(() => resolveThemeClass(mode.value, systemDark.value) === 'dark');
  const seedHex = computed(() => resolveScheme(colorSchemeId.value).seed);

  watchEffect(() => {
    applyThemeToDocument(
      { theme: mode.value, colorScheme: colorSchemeId.value, locale: 'auto' },
      systemDark.value,
    );
  });

  const naiveTheme = computed(() => (isDark.value ? darkTheme : null));
  const themeOverrides = computed(() => buildThemeOverrides(seedHex.value, isDark.value));

  return {
    naiveTheme,
    themeOverrides,
    setMode: (value: ThemePreference) => {
      mode.value = value;
    },
    setColorScheme: (id: string) => {
      colorSchemeId.value = parseUiPrefs({ colorScheme: id }).colorScheme;
    },
  };
}
