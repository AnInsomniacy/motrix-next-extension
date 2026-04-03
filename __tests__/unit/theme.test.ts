import { describe, it, expect } from 'vitest';
import { resolveThemeClass } from '@/lib/services/theme';

describe('resolveThemeClass', () => {
  it('returns "dark" for explicit dark preference', () => {
    expect(resolveThemeClass('dark')).toBe('dark');
  });

  it('returns "light" for explicit light preference', () => {
    expect(resolveThemeClass('light')).toBe('light');
  });

  it('returns "dark" for system preference when system is dark', () => {
    expect(resolveThemeClass('system', true)).toBe('dark');
  });

  it('returns "light" for system preference when system is light', () => {
    expect(resolveThemeClass('system', false)).toBe('light');
  });

  it('defaults to light when system preference is unknown', () => {
    expect(resolveThemeClass('system')).toBe('light');
  });
});
