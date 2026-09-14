<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { UiPrefs as InitialUiPrefs } from '@/lib/schema';
import {
  NButton,
  NConfigProvider,
  NIcon,
  NSwitch,
  NSpin,
  NTabs,
  NTabPane,
  NCollapseTransition,
} from 'naive-ui';
import { PauseOutline, PlayOutline } from '@vicons/ionicons5';
import { DesktopApiClient, checkConnection, type StatResponse } from '@/lib/api';
import { loadSnapshot, updateSettings } from '@/lib/storage';
import { parseDesktopActionResponse, type DesktopAction } from '@/lib/desktop';
import {
  DEFAULT_CONNECTION_CONFIG,
  parseConnectionConfig,
  parseDownloadSettings,
  parseUiPrefs,
} from '@/lib/schema';
import { usePolling } from '@/shared/use-polling';
import { useAppTheme } from '@/shared/theme';
import { useReducedMotion } from '@/shared/use-reduced-motion';
import { createI18n, I18N_KEY, useNaiveLocale } from '@/shared/i18n/engine';
import PopupHeader from './components/PopupHeader.vue';
import StatDashboard from './components/StatDashboard.vue';
import MediaPanel from './components/MediaPanel.vue';

const props = defineProps<{ prefs?: InitialUiPrefs }>();
const context = createI18n(props.prefs?.locale ?? 'auto', { localeApi: browser.i18n });
provide(I18N_KEY, context);
const { t, tSub, effectiveLocale } = context;
const { naiveLocale, naiveDateLocale, naiveRtl } = useNaiveLocale(effectiveLocale);
const theme = useAppTheme();
const reducedMotion = useReducedMotion();
type Phase = 'initializing' | 'disconnected' | 'launching' | 'connected' | 'failed';
const phase = ref<Phase>('initializing');
const version = ref<string | null>(null);
const errorType = ref<string | null>(null);
const port = ref(DEFAULT_CONNECTION_CONFIG.port);
const stat = ref<StatResponse | null>(null);
const enabled = ref(true);
const toggling = ref(false);
const opening = ref(false);
const taskAction = ref('');
const actionError = ref('');
const view = ref('overview');
const mediaCount = ref(0);
const api = new DesktopApiClient({ ...DEFAULT_CONNECTION_CONFIG });
let disposed = false;
let revision = 0;
let stopStorage: (() => void) | undefined;
const poller = usePolling({ fn: refresh, baseIntervalMs: 500, maxIntervalMs: 5000 });
const unavailableTitle = computed(() =>
  t(
    phase.value === 'failed'
      ? 'popup_launch_failed_title'
      : errorType.value === 'ApiAuthError'
        ? 'popup_error_auth'
        : errorType.value === 'ApiTimeoutError'
          ? 'popup_error_timeout'
          : 'popup_error_unreachable',
  ),
);
const unavailableHint = computed(() =>
  phase.value === 'failed'
    ? t('popup_launch_failed_hint')
    : errorType.value === 'ApiAuthError'
      ? t('popup_error_auth_hint')
      : tSub(
          errorType.value === 'ApiTimeoutError'
            ? 'popup_error_timeout_hint'
            : 'popup_error_unreachable_hint',
          [String(port.value)],
        ),
);

async function refresh(): Promise<boolean> {
  const current = ++revision;
  try {
    const result = await checkConnection(api);
    if (disposed || current !== revision) return false;
    version.value = result.version;
    errorType.value = result.status === 'disconnected' ? result.error : null;
    stat.value = result.status === 'connected' ? result.stat : null;
    if (result.status === 'connected') phase.value = 'connected';
    else if (!['launching', 'failed'].includes(phase.value)) phase.value = 'disconnected';
    return result.status === 'connected';
  } catch {
    if (!disposed && current === revision) {
      stat.value = null;
      if (!['launching', 'failed'].includes(phase.value)) phase.value = 'disconnected';
    }
    return false;
  }
}
async function runTaskAction(type: 'PAUSE_ALL' | 'RESUME_ALL') {
  if (taskAction.value || phase.value !== 'connected') return;
  taskAction.value = type;
  actionError.value = '';
  try {
    const result: unknown = await browser.runtime.sendMessage({ type });
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)
      throw new Error('Action rejected');
    await refresh();
  } catch {
    if (!disposed) actionError.value = 'popup_action_failed';
  } finally {
    taskAction.value = '';
  }
}
async function openApp() {
  if (opening.value) return;
  opening.value = true;
  actionError.value = '';
  const launch = phase.value !== 'connected';
  if (launch) phase.value = 'launching';
  try {
    const type: DesktopAction = launch ? 'START_DESKTOP' : 'OPEN_DESKTOP';
    const result = parseDesktopActionResponse(await browser.runtime.sendMessage({ type }));
    if (disposed) return;
    if (!result.ok) throw new Error('Activation rejected');
    if (launch && !(await refresh()) && !disposed) phase.value = 'failed';
  } catch {
    if (!disposed) {
      if (launch) phase.value = 'failed';
      else actionError.value = 'popup_action_failed';
    }
  } finally {
    opening.value = false;
  }
}
async function toggleEnabled(value: boolean) {
  if (toggling.value) return;
  toggling.value = true;
  actionError.value = '';
  try {
    await updateSettings({ enabled: value });
    if (!disposed) enabled.value = value;
  } catch {
    if (!disposed) actionError.value = 'options_save_error';
  } finally {
    toggling.value = false;
  }
}
function openSettings() {
  void browser.runtime.openOptionsPage();
}
function applyPrefs(value: unknown) {
  const prefs = parseUiPrefs(value);
  theme.configure(prefs);
  context.setLocale(prefs.locale);
}
onMounted(async () => {
  try {
    const snapshot = await loadSnapshot();
    if (disposed) return;
    enabled.value = snapshot.settings.enabled;
    port.value = snapshot.connection.port;
    api.updateConfig(snapshot.connection);
    applyPrefs(snapshot.uiPrefs);
    const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== 'local') return;
      if (changes.settings?.newValue)
        enabled.value = parseDownloadSettings(changes.settings.newValue).enabled;
      if (changes.connection?.newValue) {
        const connection = parseConnectionConfig(changes.connection.newValue);
        port.value = connection.port;
        api.updateConfig(connection);
        void refresh();
      }
      if (changes.uiPrefs?.newValue) applyPrefs(changes.uiPrefs.newValue);
    };
    browser.storage.onChanged.addListener(listener);
    stopStorage = () => browser.storage.onChanged.removeListener(listener);
    poller.start();
  } catch {
    if (!disposed) phase.value = 'disconnected';
  }
});
onUnmounted(() => {
  disposed = true;
  revision++;
  poller.stop();
  stopStorage?.();
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
    <div class="popup-root" :dir="['ar', 'fa'].includes(effectiveLocale) ? 'rtl' : 'ltr'">
      <PopupHeader
        :status="phase === 'failed' ? 'disconnected' : phase"
        :version="version"
        @settings="openSettings"
      />
      <NTabs
        v-model:value="view"
        type="line"
        :animated="!reducedMotion"
        :tabs-padding="16"
        size="small"
      >
        <template #suffix>
          <div class="interception-row">
            <span>{{ t('options_enabled_label') }}</span>
            <NSwitch
              size="small"
              :value="enabled"
              :loading="toggling"
              :disabled="phase === 'initializing'"
              :aria-label="t('options_enabled_label')"
              @update:value="toggleEnabled"
            />
          </div>
        </template>
        <NTabPane name="overview" :tab="t('media_downloads')" display-directive="show">
          <div class="overview">
            <div class="content-stage overview-stage">
              <Transition
                name="content"
                @before-enter="(el) => el.removeAttribute('inert')"
                @before-leave="(el) => el.setAttribute('inert', '')"
              >
                <StatDashboard v-if="phase === 'connected' && stat" key="connected" :stat="stat" />
                <div
                  v-else-if="phase === 'initializing' || phase === 'launching'"
                  key="waiting"
                  class="connection-copy"
                  role="status"
                >
                  <NSpin size="small" /><span>{{
                    t(phase === 'launching' ? 'popup_launching_hint' : 'popup_status_connecting')
                  }}</span>
                </div>
                <div v-else key="unavailable" class="connection-copy">
                  <div>
                    <p>{{ unavailableTitle }}</p>
                    <p class="hint">{{ unavailableHint }}</p>
                  </div>
                </div>
              </Transition>
            </div>
            <NCollapseTransition :show="Boolean(actionError)"
              ><p class="feedback feedback--error" role="alert">
                {{ t(actionError) }}
              </p></NCollapseTransition
            >
            <footer class="popup-actions">
              <div class="settings-actions">
                <NButton
                  text
                  size="small"
                  :disabled="phase !== 'connected' || Boolean(taskAction)"
                  :loading="taskAction === 'PAUSE_ALL'"
                  :aria-label="t('popup_action_pause_all')"
                  :title="t('popup_action_pause_all')"
                  @click="runTaskAction('PAUSE_ALL')"
                  ><template #icon
                    ><NIcon :size="14"><PauseOutline /></NIcon></template
                  >{{ t('popup_action_pause_all') }}</NButton
                >
                <NButton
                  text
                  size="small"
                  :disabled="phase !== 'connected' || Boolean(taskAction)"
                  :loading="taskAction === 'RESUME_ALL'"
                  :aria-label="t('popup_action_resume_all')"
                  :title="t('popup_action_resume_all')"
                  @click="runTaskAction('RESUME_ALL')"
                  ><template #icon
                    ><NIcon :size="14"><PlayOutline /></NIcon></template
                  >{{ t('popup_action_resume_all') }}</NButton
                >
              </div>
              <NButton
                v-if="errorType === 'ApiAuthError' && phase !== 'connected'"
                text
                type="primary"
                @click="openSettings"
                >{{ t('popup_action_settings') }}</NButton
              >
              <NButton
                v-else
                size="small"
                type="primary"
                :loading="opening"
                :disabled="phase === 'initializing'"
                @click="openApp"
                >{{ t(phase === 'failed' ? 'popup_action_retry' : 'popup_action_open') }}</NButton
              >
            </footer>
          </div>
        </NTabPane>
        <NTabPane
          name="media"
          :tab="`${t('media_tab')}${mediaCount ? ` ${mediaCount}` : ''}`"
          display-directive="show"
          ><MediaPanel :active="view === 'media'" @count="mediaCount = $event"
        /></NTabPane>
      </NTabs>
    </div>
  </NConfigProvider>
</template>
<style scoped>
.popup-root {
  width: 420px;
  font: 13px/1.5 var(--font-sans);
  max-height: 600px;
  overflow: auto;
  background: var(--color-surface);
  color: var(--color-on-surface);
}
.overview {
  padding: 0 16px 14px;
}
.interception-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-inline: 12px 16px;
  font-size: 12px;
}
.interception-row > .n-switch {
  margin-inline-start: auto;
}
.overview-stage {
  min-height: 108px;
}
.connection-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 108px;
  padding-block: 12px;
}
.connection-copy .hint {
  margin-block-start: 6px;
}
.popup-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-block-start: 8px;
}
</style>
