/**
 * @fileoverview Theme resolution composable for the extension's Vue UI.
 *
 * Detects the active system/user theme preference and provides reactive
 * state for use with Naive UI's NConfigProvider. Mirrors the desktop
 * Motrix Next `useTheme.ts` composable.
 */
import { ref, computed, onMounted, onBeforeUnmount, type Ref } from 'vue';
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui';
import { createThemeOverrides } from './naive-theme';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Composable that manages theme state and produces matching Naive UI
 * theme / overrides.
 *
 * @returns Reactive refs for NConfigProvider props and a setter for
 *          manually switching themes.
 */
export function useTheme(): {
  isDark: Ref<boolean>;
  naiveTheme: Ref<typeof darkTheme | null>;
  themeOverrides: Ref<GlobalThemeOverrides>;
  setTheme: (mode: ThemeMode) => void;
} {
  const mode = ref<ThemeMode>('system');
  const systemDark = ref(false);

  let mql: MediaQueryList | null = null;

  /** Resolve effective dark state from preference + system query. */
  const isDark = computed(() => {
    if (mode.value === 'dark') return true;
    if (mode.value === 'light') return false;
    return systemDark.value;
  });

  /** Naive UI theme object (null = light token set). */
  const naiveTheme = computed(() => (isDark.value ? darkTheme : null));

  /** M3 Amber Gold overrides keyed to current dark state. */
  const themeOverrides = computed(() => createThemeOverrides(isDark.value));

  function onMediaChange(e: MediaQueryListEvent) {
    systemDark.value = e.matches;
  }

  onMounted(() => {
    mql = window.matchMedia('(prefers-color-scheme: dark)');
    systemDark.value = mql.matches;
    mql.addEventListener('change', onMediaChange);
    syncDomClass();
  });

  onBeforeUnmount(() => {
    mql?.removeEventListener('change', onMediaChange);
  });

  function syncDomClass() {
    document.documentElement.classList.toggle('dark', isDark.value);
  }

  /** Persist theme preference and update DOM class. */
  function setTheme(m: ThemeMode) {
    mode.value = m;
    syncDomClass();
  }

  return { isDark, naiveTheme, themeOverrides, setTheme };
}
