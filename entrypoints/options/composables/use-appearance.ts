/**
 * @fileoverview Composable for appearance settings (theme + color scheme + locale).
 *
 * Encapsulates theme/color scheme/locale state, immediate persistence via
 * StorageService, and DOM class application for light/dark mode.
 */
import { ref } from 'vue';
import type { StorageService } from '@/lib/storage';
import { resolveThemeClass } from '@/lib/services';
import type { UiPrefs } from '@/shared/types';
import { DEFAULT_UI_PREFS } from '@/shared/constants';

export function useAppearance(
  storageService: StorageService,
  setTheme: (theme: UiPrefs['theme']) => void,
  setColorSchemeId: (id: string) => void,
) {
  const uiTheme = ref<UiPrefs['theme']>(DEFAULT_UI_PREFS.theme);
  const uiColorScheme = ref(DEFAULT_UI_PREFS.colorScheme);
  const uiLocale = ref(DEFAULT_UI_PREFS.locale);

  function hydrate(prefs: {
    theme?: UiPrefs['theme'];
    colorScheme?: string;
    locale?: string;
  }): void {
    if (prefs.theme) uiTheme.value = prefs.theme;
    if (prefs.colorScheme) {
      uiColorScheme.value = prefs.colorScheme;
      setColorSchemeId(prefs.colorScheme);
    }
    if (prefs.locale) uiLocale.value = prefs.locale;
    setTheme(uiTheme.value);
  }

  function currentPrefs(): UiPrefs {
    return { theme: uiTheme.value, colorScheme: uiColorScheme.value, locale: uiLocale.value };
  }

  function handleThemeChange(value: string): void {
    const theme = value as UiPrefs['theme'];
    uiTheme.value = theme;
    setTheme(theme);
    void storageService.saveUiPrefs({ ...currentPrefs(), theme });
    applyTheme();
  }

  function handleColorSchemeChange(value: string): void {
    uiColorScheme.value = value;
    setColorSchemeId(value);
    void storageService.saveUiPrefs({ ...currentPrefs(), colorScheme: value });
  }

  function handleLocaleChange(value: string): void {
    uiLocale.value = value;
    void storageService.saveUiPrefs({ ...currentPrefs(), locale: value });
  }

  function applyTheme(): void {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.className = resolveThemeClass(uiTheme.value, systemDark);
  }

  return {
    uiTheme,
    uiColorScheme,
    uiLocale,
    hydrate,
    handleThemeChange,
    handleColorSchemeChange,
    handleLocaleChange,
    applyTheme,
  };
}
