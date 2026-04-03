export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Resolves a user theme preference into the CSS class to apply on <html>.
 *
 * @param preference - User's stored theme choice
 * @param systemIsDark - Whether the OS reports prefers-color-scheme: dark
 * @returns 'light' or 'dark' class name
 */
export function resolveThemeClass(
  preference: ThemePreference,
  systemIsDark?: boolean,
): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  // system
  return systemIsDark ? 'dark' : 'light';
}
