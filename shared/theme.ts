/**
 * The extension's theme owner: resolves light/dark and the accent scheme,
 * writes `--rb-*` custom properties before Vue mounts, and produces Naive UI
 * provider props. The color engine lives in `./theme/palette.ts`.
 */
import { computed, onScopeDispose, ref, watchEffect } from 'vue';
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui';
import { parseUiPrefs, type ThemePreference, type UiPrefs } from '@/lib/schema';
import { resolveColorScheme, type ColorSchemeDefinition } from './theme/schemes';
import { buildThemeTokens, themeCssVariables, type ThemeTokens } from './theme/palette';
import { buildNaiveOverrides } from './theme/naive';

export { COLOR_SCHEMES } from './theme/schemes';

function resolveThemeClass(preference: ThemePreference, systemIsDark: boolean): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemIsDark ? 'dark' : 'light';
}

export function buildTokens(scheme: ColorSchemeDefinition, isDark: boolean): ThemeTokens {
  return buildThemeTokens({
    seed: scheme.seed,
    neutral: scheme.variant === 'content',
    dark: isDark,
  });
}

/** Every themed CSS custom property for a scheme and mode. */
export function createThemeVars(input: {
  readonly scheme: ColorSchemeDefinition;
  readonly isDark: boolean;
}): Record<string, string> {
  return themeCssVariables(buildTokens(input.scheme, input.isDark));
}

export function buildThemeOverrides(
  scheme: ColorSchemeDefinition,
  isDark: boolean,
): GlobalThemeOverrides {
  return buildNaiveOverrides(buildTokens(scheme, isDark));
}

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

let bootstrappedPrefs: UiPrefs | undefined;

/** Apply the persisted theme before Vue mounts so the first frame is already themed. */
export async function bootstrapStoredTheme(storage: {
  getItem: (key: 'local:uiPrefs') => Promise<unknown>;
}): Promise<UiPrefs> {
  const prefs = parseUiPrefs(await storage.getItem('local:uiPrefs').catch(() => null));
  applyThemeToDocument(prefs, window.matchMedia('(prefers-color-scheme: dark)').matches);
  bootstrappedPrefs = prefs;
  return prefs;
}

/** Single theme composable for every UI root. */
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
    isDark,
    naiveTheme: computed(() => (isDark.value ? darkTheme : null)),
    themeOverrides: computed(() => buildThemeOverrides(scheme.value, isDark.value)),
    configure: (value: UiPrefs) => {
      prefs.value = value;
    },
  };
}
