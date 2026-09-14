import { describe, expect, it } from 'vitest';
import {
  argbFromHex,
  hexFromArgb,
  Scheme,
  themeFromSourceColor,
} from '@material/material-color-utilities';
import { parseUiPrefs } from '@/lib/schema';
import { resolveColorScheme } from '@/shared/color-schemes';
import { buildThemeOverrides, createThemeVars } from '@/shared/theme';

describe('custom theme', () => {
  it('normalizes opaque HEX values using the desktop configuration contract', () => {
    expect(parseUiPrefs({ colorScheme: 'custom', customColorScheme: ' f90 ' })).toMatchObject({
      colorScheme: 'custom',
      customColorScheme: '#FF9900',
    });
    for (const value of ['#12345678', 'red', '', null]) {
      expect(parseUiPrefs({ customColorScheme: value }).customColorScheme).toBe('#737373');
    }
  });

  it('uses MCU content colors for custom grey and the graphite preset', () => {
    for (const id of ['custom', 'graphite']) {
      const definition = resolveColorScheme(id, '#737373');
      for (const isDark of [false, true]) {
        const source = argbFromHex('#737373');
        const palette = isDark ? Scheme.darkContent(source) : Scheme.lightContent(source);
        const vars = createThemeVars({ scheme: definition, isDark });
        const overrides = buildThemeOverrides(definition, isDark);
        expect(vars['--color-primary']).toBe(hexFromArgb(palette.primary));
        expect(overrides.common?.primaryColor).toBe(vars['--color-primary']);
        expect(overrides.common?.errorColor).not.toBe(overrides.common?.primaryColor);
      }
    }
  });

  it('uses the standard MCU source palette for chromatic custom colors', () => {
    const scheme = resolveColorScheme('custom', '#D75A35');
    const source = themeFromSourceColor(argbFromHex(scheme.seed));
    for (const isDark of [false, true]) {
      const expected = isDark ? source.schemes.dark : source.schemes.light;
      expect(createThemeVars({ scheme, isDark })['--color-primary']).toBe(
        hexFromArgb(expected.primary),
      );
    }
  });
});
