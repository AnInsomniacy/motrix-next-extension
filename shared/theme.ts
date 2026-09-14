/**
 * The extension's entire theme system in one module:
 *
 *   - preset color schemes (MCU seeds, aligned with the desktop app)
 *   - brand accents and neutral surfaces → CSS custom properties
 *   - pre-mount bootstrap (no first-frame flash)
 *   - `useAppTheme()` — the single Vue composable all UI roots consume
 *
 * The static Electric Purple values in globals.css act as fallback for the brief
 * window before the bootstrap runs.
 */
import { computed, onScopeDispose, ref, watchEffect } from 'vue';
import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  CorePalette,
  Scheme,
  TonalPalette,
  type Theme,
} from '@material/material-color-utilities';
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui';
import { parseUiPrefs, type ThemePreference, type UiPrefs } from '@/lib/schema';

// ─── Color Schemes ──────────────────────────────────────

import {
  CUSTOM_COLOR_SCHEME_ID,
  resolveColorScheme,
  type ColorSchemeDefinition,
} from './color-schemes';
export { COLOR_SCHEMES } from './color-schemes';

/** Resolve a theme preference to the effective light/dark class. */
function resolveThemeClass(preference: ThemePreference, systemIsDark: boolean): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemIsDark ? 'dark' : 'light';
}

const SEMANTIC_COLORS = [
  { name: 'info', value: argbFromHex('#0061A4'), blend: true },
  { name: 'success', value: argbFromHex('#386A20'), blend: true },
  { name: 'warning', value: argbFromHex('#7C5800'), blend: true },
  { name: 'error', value: argbFromHex('#BA1A1A'), blend: true },
];

/** Rayburst's low-saturation policy keeps custom greys neutral. MCU owns palette generation. */
function usesContentPalette(scheme: ColorSchemeDefinition): boolean {
  if (scheme.variant === 'content') return true;
  if (scheme.id !== CUSTOM_COLOR_SCHEME_ID) return false;
  const channels = [1, 3, 5].map(
    (start) => parseInt(scheme.seed.slice(start, start + 2), 16) / 255,
  );
  const high = Math.max(...channels);
  const low = Math.min(...channels);
  const delta = high - low;
  if (!delta) return true;
  const saturation = delta / (high + low > 1 ? 2 - high - low : high + low);
  return saturation <= 0.12;
}

function createMaterialTheme(scheme: ColorSchemeDefinition): Theme {
  const source = argbFromHex(scheme.seed);
  const theme = themeFromSourceColor(
    source,
    SEMANTIC_COLORS.map((color) => ({ ...color })),
  );
  if (!usesContentPalette(scheme)) return theme;
  const palette = CorePalette.contentOf(source);
  return {
    ...theme,
    schemes: { light: Scheme.lightContent(source), dark: Scheme.darkContent(source) },
    palettes: {
      primary: palette.a1,
      secondary: palette.a2,
      tertiary: palette.a3,
      neutral: palette.n1,
      neutralVariant: palette.n2,
      error: palette.error,
    },
  };
}

function semanticRole(theme: Theme, name: string, dark: boolean) {
  const group = theme.customColors.find((color) => color.color.name === name);
  if (!group) throw new Error(`Missing semantic color: ${name}`);
  const palette = CorePalette.of(group.value).a1;
  return {
    ...(dark ? group.dark : group.light),
    hover: palette.tone(dark ? 70 : 50),
    pressed: palette.tone(dark ? 90 : 30),
  };
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
    '--color-surface-dim': 94,
    '--color-surface-container-lowest': 100,
    '--color-surface-container-low': 97,
    '--color-surface-container': 100,
    '--color-surface-container-high': 98,
    '--color-surface-container-highest': 94,
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

interface ThemeVarsInput {
  readonly scheme: ColorSchemeDefinition;
  readonly isDark: boolean;
}

/** Generate every themed CSS custom property for a seed + mode. */
export function createThemeVars({
  scheme: definition,
  isDark,
}: ThemeVarsInput): Record<string, string> {
  const m3Theme = createMaterialTheme(definition);
  const scheme = isDark ? m3Theme.schemes.dark : m3Theme.schemes.light;
  const json = scheme.toJSON() as Record<string, number>;
  const vars: Record<string, string> = {};

  for (const [mcuKey, cssVar] of Object.entries(MCU_TO_CSS)) {
    const argb = json[mcuKey];
    if (argb !== undefined) vars[cssVar] = hexFromArgb(argb);
  }

  const neutral = TonalPalette.fromHueAndChroma(0, 0);
  for (const [cssVar, tone] of Object.entries(SURFACE_TONES[isDark ? 'dark' : 'light'])) {
    vars[cssVar] = hexFromArgb(neutral.tone(tone));
  }

  vars['--color-surface'] = hexFromArgb(neutral.tone(isDark ? 10 : 100));
  vars['--color-on-surface'] = hexFromArgb(neutral.tone(isDark ? 92 : 12));
  vars['--color-on-surface-variant'] = hexFromArgb(neutral.tone(isDark ? 72 : 43));
  vars['--color-outline'] = hexFromArgb(neutral.tone(isDark ? 42 : 72));
  vars['--color-outline-variant'] = hexFromArgb(neutral.tone(isDark ? 24 : 92));
  vars['--color-hover'] = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
  const brand = scheme.primary;
  vars['--color-selected'] =
    `rgba(${(brand >> 16) & 255}, ${(brand >> 8) & 255}, ${brand & 255}, ${isDark ? 0.13 : 0.07})`;
  const primary = hexFromArgb(scheme.primary);
  vars['--color-brand'] = primary;
  for (const { name } of SEMANTIC_COLORS) {
    const role = semanticRole(m3Theme, name, isDark);
    vars[`--color-${name}`] = hexFromArgb(role.color);
    vars[`--color-on-${name}`] = hexFromArgb(role.onColor);
    vars[`--color-${name}-container`] = hexFromArgb(role.colorContainer);
    vars[`--color-on-${name}-container`] = hexFromArgb(role.onColorContainer);
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
  document.documentElement.classList.toggle('dark', themeClass === 'dark');
  document.documentElement.style.colorScheme = themeClass;
  const vars = createThemeVars({
    scheme: resolveColorScheme(prefs.colorScheme, prefs.customColorScheme),
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
 * doesn't flash the static default palette.
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
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", ' +
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ' +
  '"Helvetica Neue", Helvetica, Arial, sans-serif';

export function buildThemeOverrides(
  definition: ColorSchemeDefinition,
  isDark: boolean,
): GlobalThemeOverrides {
  const m3Theme = createMaterialTheme(definition);
  const scheme = isDark ? m3Theme.schemes.dark : m3Theme.schemes.light;
  const neutral = TonalPalette.fromHueAndChroma(0, 0);
  const tones = SURFACE_TONES[isDark ? 'dark' : 'light'];
  const surface = (key: keyof typeof tones) => hexFromArgb(neutral.tone(tones[key]));

  const primary = hexFromArgb(scheme.primary);
  const onPrimary = hexFromArgb(scheme.onPrimary);
  const onSurface = hexFromArgb(neutral.tone(isDark ? 92 : 12));
  const onSurfaceVariant = hexFromArgb(neutral.tone(isDark ? 72 : 43));
  const outline = hexFromArgb(neutral.tone(isDark ? 42 : 72));
  const outlineFull = hexFromArgb(neutral.tone(isDark ? 62 : 52));
  const divider = hexFromArgb(neutral.tone(isDark ? 24 : 92));
  const background = hexFromArgb(neutral.tone(isDark ? 10 : 100));
  const raised = hexFromArgb(neutral.tone(isDark ? 17 : 100));

  const primaryPalette = m3Theme.palettes.primary;
  const primaryHover = hexFromArgb(primaryPalette.tone(isDark ? 70 : 50));
  const primaryPressed = hexFromArgb(primaryPalette.tone(isDark ? 90 : 30));
  const semanticOverrides = Object.fromEntries(
    SEMANTIC_COLORS.flatMap(({ name }) => {
      const role = semanticRole(m3Theme, name, isDark);
      return [
        [`${name}Color`, hexFromArgb(role.color)],
        [`${name}ColorHover`, hexFromArgb(role.hover)],
        [`${name}ColorPressed`, hexFromArgb(role.pressed)],
        [`${name}ColorSuppl`, hexFromArgb(role.color)],
      ];
    }),
  );

  return {
    common: {
      primaryColor: primary,
      primaryColorHover: primaryHover,
      primaryColorPressed: primaryPressed,
      primaryColorSuppl: primary,
      ...semanticOverrides,
      bodyColor: background,
      textColorBase: onSurface,
      textColor1: onSurface,
      textColor2: onSurface,
      textColor3: onSurfaceVariant,
      placeholderColor: onSurfaceVariant,
      inputColor: background,
      tableColor: background,
      actionColor: surface('--color-surface-container-low'),
      fontSize: '14px',
      fontSizeSmall: '13px',
      fontSizeMedium: '14px',
      fontWeightStrong: '500',
      heightTiny: '28px',
      heightSmall: '32px',
      heightMedium: '36px',
      cardColor: background,
      modalColor: raised,
      popoverColor: raised,
      borderColor: outline,
      dividerColor: divider,
      borderRadius: '6px',
      fontFamily: FONT_FAMILY,
    },
    Divider: { color: divider },
    Button: {
      border: `1px solid ${outline}`,
      borderHover: `1px solid ${outlineFull}`,
      borderFocus: `1px solid ${outlineFull}`,
    },
    Input: {
      color: background,
      colorFocus: background,
      textColor: onSurface,
      placeholderColor: onSurfaceVariant,
      border: `1px solid ${outline}`,
      borderHover: `1px solid ${outlineFull}`,
      borderFocus: `1px solid ${primary}`,
    },
    InputNumber: {
      peers: {
        Input: {
          color: background,
          colorFocus: background,
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
          color: background,
          border: `1px solid ${outline}`,
          borderHover: `1px solid ${outlineFull}`,
          borderFocus: `1px solid ${primary}`,
          borderActive: `1px solid ${primary}`,
        },
      },
    },
    Form: { labelTextColor: onSurface, labelFontWeight: '400' },
    Tabs: { tabFontSizeSmall: '13px', tabFontWeightActive: '500', panePaddingSmall: '12px 0 0' },
    DataTable: {
      tdColor: background,
      thColor: surface('--color-surface-container-low'),
      borderColor: divider,
    },
  };
}

// ─── Composable ─────────────────────────────────────────

/**
 * The single theme composable. Owns theme mode + color scheme state,
 * watches the system dark preference, keeps the DOM (class + CSS vars) in
 * sync, and produces Naive UI provider props.
 */
export function useAppTheme() {
  const prefs = ref(parseUiPrefs(bootstrappedPrefs));
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(mql.matches);
  const onMediaChange = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches;
  };
  mql.addEventListener('change', onMediaChange);
  onScopeDispose(() => mql.removeEventListener('change', onMediaChange));

  const isDark = computed(() => resolveThemeClass(prefs.value.theme, systemDark.value) === 'dark');
  const scheme = computed(() =>
    resolveColorScheme(prefs.value.colorScheme, prefs.value.customColorScheme),
  );
  watchEffect(() => applyThemeToDocument(prefs.value, systemDark.value));

  return {
    naiveTheme: computed(() => (isDark.value ? darkTheme : null)),
    themeOverrides: computed(() => buildThemeOverrides(scheme.value, isDark.value)),
    configure: (value: UiPrefs) => {
      prefs.value = value;
    },
  };
}
