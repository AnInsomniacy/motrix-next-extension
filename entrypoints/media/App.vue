<script setup lang="ts">
import { onMounted, onUnmounted, provide } from 'vue';
import { browser } from 'wxt/browser';
import { NConfigProvider } from 'naive-ui';
import { createI18n, I18N_KEY, useNaiveLocale } from '@/shared/i18n/engine';
import { useAppTheme } from '@/shared/theme';
import { parseUiPrefs, type UiPrefs } from '@/lib/schema';
import MediaPanel from '../popup/components/MediaPanel.vue';

const props = defineProps<{ prefs: UiPrefs }>();
const i18n = createI18n(props.prefs.locale, { localeApi: browser.i18n });
provide(I18N_KEY, i18n);
const { naiveLocale, naiveDateLocale, naiveRtl } = useNaiveLocale(i18n.effectiveLocale);
const theme = useAppTheme();
const playerUrl = new URL(window.location.href).searchParams.get('source') ?? '';
function configure(value: unknown) {
  const prefs = parseUiPrefs(value);
  i18n.setLocale(prefs.locale);
  theme.configure(prefs);
}
const changed: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
  if (area === 'local' && changes.uiPrefs) configure(changes.uiPrefs.newValue);
};
configure(props.prefs);
onMounted(() => {
  document.addEventListener('keydown', closeOnEscape);
  browser.storage.onChanged.addListener(changed);
});
function closeOnEscape(event: InstanceType<typeof window.KeyboardEvent>) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (document.querySelector('[role="listbox"], [role="dialog"], [role="menu"]')) return;
  window.parent.postMessage('RAYBURST_MEDIA_CLOSE', '*');
}
onUnmounted(() => {
  browser.storage.onChanged.removeListener(changed);
  document.removeEventListener('keydown', closeOnEscape);
});
</script>

<template>
  <NConfigProvider
    :theme="theme.naiveTheme.value"
    :theme-overrides="theme.themeOverrides.value"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :rtl="naiveRtl"
    preflight-style-disabled
    inline-theme-disabled
  >
    <MediaPanel frame :player-url="playerUrl" />
  </NConfigProvider>
</template>

<style scoped>
:global(body) {
  margin: 0;
  padding: 12px 14px;
  min-width: 0;
  background: var(--rb-canvas);
}
:deep(.media-panel) {
  max-height: calc(100vh - 24px);
}
</style>
