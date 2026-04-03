/**
 * @fileoverview Composable for appearance settings (theme + color scheme).
 *
 * Encapsulates theme/color scheme state, immediate persistence,
 * and DOM class application for light/dark mode.
 */
import { ref } from 'vue';
import { resolveThemeClass } from '@/modules/services/theme';
import type { UiPrefs } from '@/shared/types';
import { DEFAULT_UI_PREFS } from '@/shared/constants';

export function useAppearance(
  setTheme: (theme: UiPrefs['theme']) => void,
  setColorSchemeId: (id: string) => void,
) {
  const uiTheme = ref<UiPrefs['theme']>(DEFAULT_UI_PREFS.theme);
  const uiColorScheme = ref(DEFAULT_UI_PREFS.colorScheme);

  function hydrate(prefs: { theme?: UiPrefs['theme']; colorScheme?: string }): void {
    if (prefs.theme) uiTheme.value = prefs.theme;
    if (prefs.colorScheme) {
      uiColorScheme.value = prefs.colorScheme;
      setColorSchemeId(prefs.colorScheme);
    }
    setTheme(uiTheme.value);
  }

  function handleThemeChange(value: string): void {
    const theme = value as UiPrefs['theme'];
    uiTheme.value = theme;
    setTheme(theme);
    void chrome.storage.local.set({
      uiPrefs: { theme, colorScheme: uiColorScheme.value },
    });
    applyTheme();
  }

  function handleColorSchemeChange(value: string): void {
    uiColorScheme.value = value;
    setColorSchemeId(value);
    void chrome.storage.local.set({
      uiPrefs: { theme: uiTheme.value, colorScheme: value },
    });
  }

  function applyTheme(): void {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.className = resolveThemeClass(uiTheme.value, systemDark);
  }

  return {
    uiTheme,
    uiColorScheme,
    hydrate,
    handleThemeChange,
    handleColorSchemeChange,
    applyTheme,
  };
}
