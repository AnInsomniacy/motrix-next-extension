/**
 * @fileoverview Naive UI GlobalThemeOverrides factory.
 *
 * Generates theme override objects that align Naive UI component
 * colors with the M3 Amber Gold design system used by the desktop
 * Motrix Next application. Mirrors the output of the desktop
 * `useColorScheme.ts` composable.
 */
import type { GlobalThemeOverrides } from 'naive-ui';

/** M3 Amber Gold tonal palette — light mode (seed #E0A422). */
const LIGHT = {
  primary: '#7c5800',
  primaryHover: '#9a6e00',
  primaryPressed: '#5e4200',
  onPrimary: '#ffffff',
  primaryContainer: '#ffdea3',
  surface: '#fefbf6',
  surfaceContainer: '#f3efe8',
  surfaceContainerHigh: '#ede9e2',
  surfaceContainerHighest: '#e7e3dd',
  onSurface: '#1d1b16',
  onSurfaceVariant: '#4d4639',
  outline: '#7f7667',
  outlineVariant: '#d1c7b7',
  error: '#ba1a1a',
  success: '#386a20',
  tertiary: '#4a6547',
  tertiaryHover: '#3d5a3a',
  tertiaryPressed: '#2d4a2a',
} as const;

/** M3 Amber Gold tonal palette — dark mode (seed #E0A422). */
const DARK = {
  primary: '#f0bf48',
  primaryHover: '#d4a63e',
  primaryPressed: '#c49a38',
  onPrimary: '#412d00',
  primaryContainer: '#5e4200',
  surface: '#141210',
  surfaceContainer: '#201e1b',
  surfaceContainerHigh: '#2b2926',
  surfaceContainerHighest: '#363331',
  onSurface: '#e8e2d9',
  onSurfaceVariant: '#d0c8b9',
  outline: '#998f80',
  outlineVariant: '#4d4639',
  error: '#ffb4ab',
  success: '#8edb6a',
  tertiary: '#a1d09a',
  tertiaryHover: '#8aba83',
  tertiaryPressed: '#78a672',
} as const;

/**
 * Create a Naive UI `GlobalThemeOverrides` object for the given theme mode.
 *
 * The returned object should be passed to `<NConfigProvider :theme-overrides="...">`.
 * All color values are hardcoded from the MCU output for seed `#E0A422`,
 * matching exactly what the desktop Motrix Next `useColorScheme.ts` generates.
 */
export function createThemeOverrides(isDark: boolean): GlobalThemeOverrides {
  const t = isDark ? DARK : LIGHT;

  return {
    common: {
      primaryColor: t.primary,
      primaryColorHover: t.primaryHover,
      primaryColorPressed: t.primaryPressed,
      primaryColorSuppl: t.primary,
      warningColor: t.tertiary,
      warningColorHover: t.tertiaryHover,
      warningColorPressed: t.tertiaryPressed,
      warningColorSuppl: t.tertiary,
      errorColor: t.error,
      bodyColor: 'transparent',
      cardColor: t.surfaceContainer,
      modalColor: t.surfaceContainerHigh,
      popoverColor: t.surfaceContainerHigh,
      borderColor: t.outlineVariant,
      dividerColor: t.outlineVariant,
      borderRadius: '6px',
      fontFamily:
        '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ' +
        '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ' +
        '"Helvetica Neue", Helvetica, Arial, sans-serif',
    },
    Divider: {
      color: t.outlineVariant,
    },
    Button: {
      border: `1px solid ${t.outlineVariant}`,
      borderHover: `1px solid ${t.outline}`,
      borderFocus: `1px solid ${t.outline}`,
    },
    Input: {
      color: t.surfaceContainer,
      colorFocus: t.surfaceContainer,
      textColor: t.onSurface,
      placeholderColor: t.onSurfaceVariant,
      border: `1px solid ${t.outlineVariant}`,
      borderHover: `1px solid ${t.outline}`,
      borderFocus: `1px solid ${t.primary}`,
    },
    InputNumber: {
      peers: {
        Input: {
          color: t.surfaceContainer,
          colorFocus: t.surfaceContainer,
          textColor: t.onSurface,
          border: `1px solid ${t.outlineVariant}`,
          borderHover: `1px solid ${t.outline}`,
          borderFocus: `1px solid ${t.primary}`,
        },
        Button: {
          textColor: t.onSurfaceVariant,
          textColorHover: t.onSurface,
        },
      },
    },
    Card: {
      color: t.surfaceContainer,
      textColor: t.onSurface,
      titleTextColor: t.onSurface,
      borderColor: t.outlineVariant,
    },
    Switch: {
      railColorActive: t.primary,
    },
    Select: {
      peers: {
        InternalSelection: {
          border: `1px solid ${t.outlineVariant}`,
          borderHover: `1px solid ${t.outline}`,
          borderFocus: `1px solid ${t.primary}`,
          borderActive: `1px solid ${t.primary}`,
        },
      },
    },
    Tag: {
      textColorCheckable: t.onSurfaceVariant,
      textColorHoverCheckable: t.primary,
      textColorChecked: t.onPrimary,
      colorChecked: t.primary,
      colorCheckedHover: t.primary,
    },
    Tabs: {
      tabTextColorActiveLine: t.primary,
      tabTextColorActiveBar: t.primary,
      tabTextColorHoverLine: t.primary,
      tabTextColorHoverBar: t.primary,
      barColor: t.primary,
    },
    Form: {
      labelTextColor: t.onSurfaceVariant,
    },
  };
}
