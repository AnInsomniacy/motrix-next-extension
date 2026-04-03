/**
 * @fileoverview Theme resolution composable for the extension's Vue UI.
 *
 * Combines dark/light mode detection with MCU-generated color scheme
 * to produce reactive Naive UI NConfigProvider props.
 *
 * Architecture:
 *   ThemeMode (system/light/dark) → isDark
 *   isDark + seedHex → useColorScheme → CSS vars + themeOverrides
 *
 * @see /motrix-next/src/composables/useTheme.ts
 * @see /motrix-next/src/composables/useColorScheme.ts
 */
import { ref, computed, onMounted, onBeforeUnmount, type Ref } from 'vue';
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui';
import { useColorScheme } from './use-color-scheme';
import { resolveScheme } from './color-schemes';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Composable that manages theme state (dark/light) and color scheme
 * (MCU seed), producing matching Naive UI theme/overrides.
 *
 * @param colorSchemeId - Reactive ref to the active color scheme ID
 */
export function useTheme(colorSchemeId?: Ref<string>): {
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

  /** Reactive seed hex derived from the color scheme ID. */
  const seedHex = computed(() => {
    const id = colorSchemeId?.value ?? 'amber';
    return resolveScheme(id).seed;
  });

  /** MCU-generated theme overrides + CSS variable injection. */
  const { themeOverrides } = useColorScheme(seedHex, isDark);

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
