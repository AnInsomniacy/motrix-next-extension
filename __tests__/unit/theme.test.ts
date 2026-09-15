import { describe, expect, it } from 'vitest';
import { argbFromHex, Hct, Contrast } from '@material/material-color-utilities';
import { createThemeVars } from '@/shared/theme';
import { parseUiPrefs } from '@/lib/schema';

describe('Rayburst Connect theme', () => {
  it('defaults invalid and missing preferences to Rayburst purple', () => {
    expect(parseUiPrefs(null).colorScheme).toBe('rayburst');
    expect(parseUiPrefs({ colorScheme: 'unknown' }).colorScheme).toBe('rayburst');
  });
  it('keeps state colors distinct and their labels readable in both modes', () => {
    for (const isDark of [false, true]) {
      const vars = createThemeVars({ seedHex: '#7B3ED1', isDark });
      for (const role of ['primary', 'warning', 'error', 'success', 'info']) {
        const background = Hct.fromInt(argbFromHex(vars[`--color-${role}`]!)).tone;
        const foreground = Hct.fromInt(argbFromHex(vars[`--color-on-${role}`]!)).tone;
        expect(Contrast.ratioOfTones(background, foreground)).toBeGreaterThanOrEqual(4.5);
      }
      expect(vars['--color-warning']).not.toBe(vars['--color-primary']);
    }
  });
});
