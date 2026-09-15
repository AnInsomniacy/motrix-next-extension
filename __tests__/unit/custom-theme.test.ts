import { describe, expect, it } from 'vitest';
import { oklch, parse } from 'culori';
import { parseUiPrefs } from '@/lib/schema';
import { resolveColorScheme } from '@/shared/theme/schemes';
import { buildThemeOverrides, createThemeVars } from '@/shared/theme';

function chroma(hex: string): number {
  return oklch(parse(hex)!)?.c ?? 0;
}

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

  it('keeps grey seeds and the graphite preset achromatic in both modes', () => {
    for (const id of ['custom', 'graphite']) {
      const definition = resolveColorScheme(id, '#737373');
      for (const isDark of [false, true]) {
        const vars = createThemeVars({ scheme: definition, isDark });
        const overrides = buildThemeOverrides(definition, isDark);
        expect(chroma(vars['--rb-accent']!)).toBeLessThan(0.01);
        expect(chroma(vars['--rb-canvas']!)).toBeLessThan(0.005);
        expect(overrides.common?.primaryColor).toBe(vars['--rb-accent']);
        expect(overrides.common?.errorColor).not.toBe(overrides.common?.primaryColor);
      }
    }
  });

  it('derives a saturated accent and tinted surfaces from chromatic custom colors', () => {
    const scheme = resolveColorScheme('custom', '#D75A35');
    for (const isDark of [false, true]) {
      const vars = createThemeVars({ scheme, isDark });
      expect(chroma(vars['--rb-accent']!)).toBeGreaterThan(0.08);
      expect(chroma(vars['--rb-canvas']!)).toBeGreaterThan(0);
      expect(vars['--rb-gradient']).toContain(vars['--rb-accent']);
    }
  });
});
