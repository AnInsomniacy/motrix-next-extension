/**
 * @fileoverview MCU-based dynamic color scheme composable.
 *
 * Port of desktop Motrix Next `useColorScheme.ts`:
 * 1. Takes a seed hex + isDark flag
 * 2. Feeds seed to MCU `themeFromSourceColor` → full M3 palette
 * 3. Injects ~30 CSS custom properties onto `:root`
 * 4. Returns reactive Naive UI `GlobalThemeOverrides`
 *
 * The static Amber Gold values in globals.css serve as fallback
 * visible during the brief window before JS hydration completes.
 *
 * @see /motrix-next/src/composables/useColorScheme.ts
 */
import { computed, watchEffect, type Ref } from 'vue';
import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';
import type { GlobalThemeOverrides } from 'naive-ui';

// ── MCU Property → CSS Variable Mapping ─────────────────────────────
// Ref: desktop useColorScheme.ts L26-43

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

// ── M3 Surface Container Tones ──────────────────────────────────────
// Ref: desktop useColorScheme.ts L49-66

const SURFACE_TONES = {
  light: {
    surfaceDim: 84,
    surfaceContainerLowest: 98,
    surfaceContainerLow: 94,
    surfaceContainer: 91,
    surfaceContainerHigh: 88,
    surfaceContainerHighest: 85,
  },
  dark: {
    surfaceDim: 6,
    surfaceContainerLowest: 4,
    surfaceContainerLow: 10,
    surfaceContainer: 12,
    surfaceContainerHigh: 17,
    surfaceContainerHighest: 22,
  },
} as const;

const SURFACE_CSS_MAP: Record<string, string> = {
  surfaceDim: '--color-surface-dim',
  surfaceContainerLowest: '--color-surface-container-lowest',
  surfaceContainerLow: '--color-surface-container-low',
  surfaceContainer: '--color-surface-container',
  surfaceContainerHigh: '--color-surface-container-high',
  surfaceContainerHighest: '--color-surface-container-highest',
};

// ── Public API ──────────────────────────────────────────────────────

/**
 * Composable that generates M3 tonal palettes from a seed color and
 * injects them as CSS custom properties + Naive UI theme overrides.
 *
 * @param seedHex - Reactive ref to the seed hex (e.g. '#E0A422')
 * @param isDark  - Reactive ref to the current dark mode state
 */
export function useColorScheme(seedHex: Ref<string>, isDark: Ref<boolean>) {
  /** Full MCU theme — cached by Vue's computed until seed changes. */
  const m3Theme = computed(() => themeFromSourceColor(argbFromHex(seedHex.value)));

  /** Active M3 scheme (light or dark) based on current theme mode. */
  const activeScheme = computed(() =>
    isDark.value ? m3Theme.value.schemes.dark : m3Theme.value.schemes.light,
  );

  /** Surface container ARGB values from neutral tonal palette. */
  const surfaceContainers = computed(() => {
    const neutral = m3Theme.value.palettes.neutral;
    const tones = isDark.value ? SURFACE_TONES.dark : SURFACE_TONES.light;
    return Object.fromEntries(
      Object.entries(tones).map(([key, tone]) => [key, neutral.tone(tone)]),
    ) as Record<string, number>;
  });

  // ── CSS Variable Injection ──────────────────────────────────────
  // Ref: desktop useColorScheme.ts L111-181
  watchEffect(() => {
    const scheme = activeScheme.value;
    const root = document.documentElement.style;
    const json = scheme.toJSON() as Record<string, number>;

    // Core M3 tokens
    for (const [mcuKey, cssVar] of Object.entries(MCU_TO_CSS)) {
      const argb = json[mcuKey];
      if (argb !== undefined) {
        root.setProperty(cssVar, hexFromArgb(argb));
      }
    }

    // Surface container tokens (manually derived from neutral palette)
    const containers = surfaceContainers.value;
    for (const [key, cssVar] of Object.entries(SURFACE_CSS_MAP)) {
      root.setProperty(cssVar, hexFromArgb(containers[key]!));
    }

    // Brand aliases
    const primary = hexFromArgb(scheme.primary);
    root.setProperty('--color-brand', primary);

    // Warning follows primary for brand consistency
    root.setProperty('--color-warning', primary);

    // Success (green) — keep fixed for semantic clarity
    // Light: #386a20, Dark: #8edb6a (from Amber Gold MCU output)
    root.setProperty('--color-success', isDark.value ? '#8edb6a' : '#386a20');
    root.setProperty('--color-on-success', isDark.value ? '#0a3900' : '#ffffff');

    // Error container
    root.setProperty('--color-error-container', hexFromArgb(scheme.errorContainer));

    // Inverse (toasts / snackbars)
    root.setProperty('--color-inverse-surface', hexFromArgb(scheme.inverseSurface));
    root.setProperty('--color-on-inverse-surface', hexFromArgb(scheme.inverseOnSurface));

    // Primary tonal shades for tinted surfaces
    const palette = m3Theme.value.palettes.primary;
    root.setProperty('--color-primary-light-5', hexFromArgb(palette.tone(isDark.value ? 30 : 80)));
    root.setProperty('--color-primary-light-9', hexFromArgb(palette.tone(isDark.value ? 10 : 95)));

    // Scrollbar
    const sr = (scheme.onSurface >> 16) & 0xff;
    const sg = (scheme.onSurface >> 8) & 0xff;
    const sb = scheme.onSurface & 0xff;
    root.setProperty(
      '--color-scrollbar-thumb',
      `rgba(${sr}, ${sg}, ${sb}, ${isDark.value ? 0.22 : 0.3})`,
    );
  });

  // ── Naive UI Theme Overrides ──────────────────────────────────────
  // Ref: desktop useColorScheme.ts L184-309
  const themeOverrides = computed<GlobalThemeOverrides>(() => {
    const scheme = activeScheme.value;
    const containers = surfaceContainers.value;
    const surface = (key: string) => hexFromArgb(containers[key]!);
    const primary = hexFromArgb(scheme.primary);
    const onPrimary = hexFromArgb(scheme.onPrimary);
    const onSurface = hexFromArgb(scheme.onSurface);
    const onSurfaceVariant = hexFromArgb(scheme.onSurfaceVariant);
    const outline = hexFromArgb(scheme.outlineVariant);
    const outlineFull = hexFromArgb(scheme.outline);

    const primaryPalette = m3Theme.value.palettes.primary;
    const tertiaryPalette = m3Theme.value.palettes.tertiary;

    const primaryHover = hexFromArgb(primaryPalette.tone(isDark.value ? 70 : 50));
    const primaryPressed = hexFromArgb(primaryPalette.tone(isDark.value ? 90 : 30));
    const tertiaryHover = hexFromArgb(tertiaryPalette.tone(isDark.value ? 70 : 50));
    const tertiaryPressed = hexFromArgb(tertiaryPalette.tone(isDark.value ? 90 : 30));

    return {
      common: {
        primaryColor: primary,
        primaryColorHover: primaryHover,
        primaryColorPressed: primaryPressed,
        primaryColorSuppl: primary,
        warningColor: hexFromArgb(scheme.tertiary),
        warningColorHover: tertiaryHover,
        warningColorPressed: tertiaryPressed,
        warningColorSuppl: hexFromArgb(scheme.tertiary),
        bodyColor: 'transparent',
        cardColor: surface('surfaceContainer'),
        modalColor: surface('surfaceContainerHigh'),
        popoverColor: surface('surfaceContainerHigh'),
        borderColor: outline,
        dividerColor: outline,
        borderRadius: '6px',
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ' +
          '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ' +
          '"Helvetica Neue", Helvetica, Arial, sans-serif',
      },
      Divider: {
        color: outline,
      },
      Button: {
        border: `1px solid ${outline}`,
        borderHover: `1px solid ${outlineFull}`,
        borderFocus: `1px solid ${outlineFull}`,
      },
      Input: {
        color: surface('surfaceContainer'),
        colorFocus: surface('surfaceContainer'),
        textColor: onSurface,
        placeholderColor: onSurfaceVariant,
        border: `1px solid ${outline}`,
        borderHover: `1px solid ${outlineFull}`,
        borderFocus: `1px solid ${primary}`,
      },
      InputNumber: {
        peers: {
          Input: {
            color: surface('surfaceContainer'),
            colorFocus: surface('surfaceContainer'),
            textColor: onSurface,
            border: `1px solid ${outline}`,
            borderHover: `1px solid ${outlineFull}`,
            borderFocus: `1px solid ${primary}`,
          },
          Button: {
            textColor: onSurfaceVariant,
            textColorHover: onSurface,
          },
        },
      },
      Card: {
        color: surface('surfaceContainerLow'),
        textColor: onSurface,
        titleTextColor: onSurface,
        borderColor: outline,
      },
      Message: {
        color: surface('surfaceContainerHigh'),
        textColor: onSurface,
        closeIconColor: onSurfaceVariant,
        closeIconColorHover: onSurface,
        colorInfo: surface('surfaceContainerHigh'),
        colorSuccess: surface('surfaceContainerHigh'),
        colorWarning: surface('surfaceContainerHigh'),
        colorError: surface('surfaceContainerHigh'),
      },
      Dialog: {
        color: surface('surfaceContainerHigh'),
        textColor: onSurface,
        titleTextColor: onSurface,
      },
      Switch: {
        railColorActive: primary,
      },
      Tabs: {
        tabTextColorActiveLine: primary,
        tabTextColorActiveBar: primary,
        tabTextColorHoverLine: primary,
        tabTextColorHoverBar: primary,
        barColor: primary,
      },
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
      Form: {
        labelTextColor: onSurfaceVariant,
      },
    };
  });

  return { themeOverrides };
}
