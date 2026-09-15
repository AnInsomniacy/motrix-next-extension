<script lang="ts" setup>
/**
 * Popup root: connection status, live speed/task dashboard, quick actions.
 *
 * Data flows from the desktop HTTP API via visibility-aware polling with
 * exponential backoff. Theme, locale, and settings sync live through
 * browser.storage.onChanged.
 */
import { onMounted, onUnmounted, provide, ref } from 'vue';
import { browser } from 'wxt/browser';
import { NButton, NConfigProvider, NIcon, NSkeleton, NSpin } from 'naive-ui';
import { AlertCircleOutline, PauseOutline, PlayOutline, RocketOutline } from '@vicons/ionicons5';
import { DesktopApiClient, checkConnection, type StatResponse } from '@/lib/api';
import { loadSnapshot, updateSettings } from '@/lib/storage';
import {
  parseDesktopActionResponse,
  type DesktopAction,
  type DesktopActionResponse,
} from '@/lib/desktop';
import {
  DEFAULT_CONNECTION_CONFIG,
  parseConnectionConfig,
  parseDownloadSettings,
  parseUiPrefs,
} from '@/lib/schema';
import { usePolling } from '@/shared/use-polling';
import { useAppTheme } from '@/shared/theme';
import { createI18n, I18N_KEY, useNaiveLocale } from '@/shared/i18n/engine';

import PopupHeader from './components/PopupHeader.vue';
import StatDashboard from './components/StatDashboard.vue';

// ─── i18n + Theme ───────────────────────────────────────

const i18nCtx = createI18n('auto', { localeApi: browser.i18n });
provide(I18N_KEY, i18nCtx);
const { t: i18n, tSub: i18nSub, effectiveLocale } = i18nCtx;
const { naiveLocale, naiveDateLocale } = useNaiveLocale(effectiveLocale);
const theme = useAppTheme();

// ─── State ──────────────────────────────────────────────

type PopupPhase = 'initializing' | 'disconnected' | 'launching' | 'connected' | 'failed';

const phase = ref<PopupPhase>('initializing');
const version = ref<string | null>(null);
const errorType = ref<string | null>(null);
const connectionPort = ref(DEFAULT_CONNECTION_CONFIG.port);
const globalStat = ref<StatResponse | null>(null);
const enabled = ref(true);
const opening = ref(false);

const apiClient = new DesktopApiClient({ ...DEFAULT_CONNECTION_CONFIG });
let stopPolling: (() => void) | null = null;
let stopStorageListener: (() => void) | null = null;

// ─── Data Fetching ──────────────────────────────────────

async function fetchData(): Promise<boolean> {
  try {
    const result = await checkConnection(apiClient);
    version.value = result.version;
    errorType.value = result.status === 'disconnected' ? result.error : null;
    if (result.status === 'connected') {
      globalStat.value = result.stat;
      phase.value = 'connected';
      return true;
    } else if (phase.value !== 'launching' && phase.value !== 'failed') {
      phase.value = 'disconnected';
    }
    return false;
  } catch {
    if (phase.value !== 'launching' && phase.value !== 'failed') phase.value = 'disconnected';
    return false;
  }
}

// ─── Actions ────────────────────────────────────────────

async function pauseAll(): Promise<void> {
  await sendBackgroundCommand('PAUSE_ALL');
  await fetchData();
}

async function resumeAll(): Promise<void> {
  await sendBackgroundCommand('RESUME_ALL');
  await fetchData();
}

function openSettings(): void {
  void browser.runtime.openOptionsPage();
}

async function launchApp(): Promise<void> {
  phase.value = 'launching';
  try {
    const response = await sendDesktopAction('START_DESKTOP');
    if (!response.ok) {
      phase.value = 'failed';
      return;
    }
    if (!(await fetchData())) phase.value = 'failed';
  } catch {
    phase.value = 'failed';
  }
}

async function openApp(): Promise<void> {
  opening.value = true;
  try {
    await sendDesktopAction('OPEN_DESKTOP');
  } finally {
    opening.value = false;
  }
}

async function sendDesktopAction(type: DesktopAction): Promise<DesktopActionResponse> {
  return parseDesktopActionResponse(await browser.runtime.sendMessage({ type }));
}

async function sendBackgroundCommand(type: 'PAUSE_ALL' | 'RESUME_ALL'): Promise<boolean> {
  const response: unknown = await browser.runtime.sendMessage({ type });
  return (
    response !== null && typeof response === 'object' && 'ok' in response && response.ok === true
  );
}

/** Toggle interception; the background worker reacts via storage.onChanged. */
async function toggleEnabled(): Promise<void> {
  enabled.value = !enabled.value;
  try {
    await updateSettings({ enabled: enabled.value });
  } catch {
    enabled.value = !enabled.value; // revert — keep UI in sync with storage
  }
}

// ─── Live Sync ──────────────────────────────────────────

function bindStorageChanges(): void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local') return;

    if (changes.settings?.newValue) {
      enabled.value = parseDownloadSettings(changes.settings.newValue).enabled;
    }
    if (changes.connection?.newValue) {
      const connection = parseConnectionConfig(changes.connection.newValue);
      connectionPort.value = connection.port;
      apiClient.updateConfig(connection);
      void fetchData();
    }
    if (changes.uiPrefs?.newValue) {
      const prefs = parseUiPrefs(changes.uiPrefs.newValue);
      theme.setMode(prefs.theme);
      theme.setColorScheme(prefs.colorScheme);
      i18nCtx.setLocale(prefs.locale);
    }
  };

  browser.storage.onChanged.addListener(listener);
  stopStorageListener = () => browser.storage.onChanged.removeListener(listener);
}

// ─── Lifecycle ──────────────────────────────────────────

onMounted(async () => {
  const data = await loadSnapshot();
  enabled.value = data.settings.enabled;
  theme.setMode(data.uiPrefs.theme);
  theme.setColorScheme(data.uiPrefs.colorScheme);
  i18nCtx.setLocale(data.uiPrefs.locale);
  connectionPort.value = data.connection.port;
  apiClient.updateConfig(data.connection);
  bindStorageChanges();

  const poller = usePolling({
    fn: fetchData,
    baseIntervalMs: 500,
    maxIntervalMs: 5000,
  });
  poller.start();
  stopPolling = () => poller.stop();
});

onUnmounted(() => {
  stopPolling?.();
  stopStorageListener?.();
});
</script>

<template>
  <NConfigProvider
    :theme="theme.naiveTheme.value"
    :theme-overrides="theme.themeOverrides.value"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    inline-theme-disabled
  >
    <div class="popup-root">
      <div v-if="phase === 'initializing'" class="popup-skeleton" aria-busy="true">
        <div class="popup-skeleton__header">
          <NSkeleton width="64px" height="24px" />
          <NSkeleton width="84px" height="18px" round />
          <span class="popup-skeleton__spacer" />
          <NSkeleton width="96px" height="20px" round />
        </div>
        <div class="popup-skeleton__body">
          <NSkeleton height="108px" :sharp="false" />
          <NSkeleton height="108px" :sharp="false" />
        </div>
        <div class="popup-skeleton__footer">
          <NSkeleton width="140px" height="24px" :sharp="false" />
        </div>
      </div>

      <template v-else>
        <PopupHeader
          :status="
            phase === 'connected'
              ? 'connected'
              : phase === 'launching'
                ? 'launching'
                : 'disconnected'
          "
          :version="version"
          :enabled="enabled"
          @settings="openSettings"
          @toggle-enabled="toggleEnabled"
        />

        <div class="popup-viewport">
          <Transition name="phase-switch" mode="out-in">
            <section
              v-if="phase === 'launching'"
              key="launching"
              class="popup-page popup-launching"
            >
              <div class="popup-launching__content">
                <NSpin size="large" />
                <div class="popup-launching__copy" role="status" aria-live="polite">
                  <h2>{{ i18n('popup_launching_title', 'Starting Motrix Next') }}</h2>
                  <p>
                    {{
                      i18n('popup_launching_hint', 'Waiting for the desktop app to become ready…')
                    }}
                  </p>
                </div>
              </div>
            </section>

            <section
              v-else-if="phase === 'connected' && globalStat"
              key="connected"
              class="popup-page"
            >
              <StatDashboard :stat="globalStat" :disabled="!enabled" />
              <div class="popup-actions">
                <div class="popup-actions__left">
                  <NButton size="tiny" quaternary :disabled="!enabled" @click="pauseAll">
                    <template #icon>
                      <NIcon :size="12"><PauseOutline /></NIcon>
                    </template>
                    {{ i18n('popup_action_pause_all', 'Pause All') }}
                  </NButton>
                  <NButton size="tiny" quaternary :disabled="!enabled" @click="resumeAll">
                    <template #icon>
                      <NIcon :size="12"><PlayOutline /></NIcon>
                    </template>
                    {{ i18n('popup_action_resume_all', 'Resume All') }}
                  </NButton>
                </div>
                <NButton size="tiny" type="primary" :loading="opening" @click="openApp">
                  <template #icon>
                    <NIcon :size="12"><RocketOutline /></NIcon>
                  </template>
                  {{ i18n('popup_action_open', 'Open Motrix Next') }}
                </NButton>
              </div>
            </section>

            <section v-else :key="phase" class="popup-page popup-unavailable">
              <div class="popup-banner popup-banner--error">
                <NIcon :size="16" class="popup-banner__icon">
                  <AlertCircleOutline />
                </NIcon>
                <div v-if="phase === 'failed'">
                  <p class="popup-banner__title">
                    {{ i18n('popup_launch_failed_title', 'Could not start Motrix Next') }}
                  </p>
                  <p class="popup-banner__hint">
                    {{
                      i18n(
                        'popup_launch_failed_hint',
                        'Check that Motrix Next is installed and its API settings are correct.',
                      )
                    }}
                  </p>
                </div>
                <div v-else-if="errorType === 'ApiAuthError'">
                  <p class="popup-banner__title">
                    {{ i18n('popup_error_auth', 'API secret mismatch') }}
                  </p>
                  <p class="popup-banner__hint">
                    {{
                      i18n(
                        'popup_error_auth_hint',
                        'Check that the API secret in Settings matches your Motrix Next configuration.',
                      )
                    }}
                  </p>
                </div>
                <div v-else-if="errorType === 'ApiTimeoutError'">
                  <p class="popup-banner__title">
                    {{ i18n('popup_error_timeout', 'Connection timed out') }}
                  </p>
                  <p class="popup-banner__hint">
                    {{
                      i18nSub(
                        'popup_error_timeout_hint',
                        [String(connectionPort)],
                        `Check your network or firewall settings. API port: ${connectionPort}`,
                      )
                    }}
                  </p>
                </div>
                <div v-else>
                  <p class="popup-banner__title">
                    {{ i18n('popup_error_unreachable', 'Cannot connect to Motrix Next') }}
                  </p>
                  <p class="popup-banner__hint">
                    {{
                      i18nSub(
                        'popup_error_unreachable_hint',
                        [String(connectionPort)],
                        `Make sure Motrix Next is running. API port: ${connectionPort}`,
                      )
                    }}
                  </p>
                </div>
              </div>
              <div class="popup-actions popup-actions--unavailable">
                <NButton size="tiny" type="primary" @click="launchApp">
                  <template #icon>
                    <NIcon :size="12"><RocketOutline /></NIcon>
                  </template>
                  {{
                    phase === 'failed'
                      ? i18n('popup_action_retry', 'Try Again')
                      : i18n('popup_action_launch', 'Launch Motrix Next')
                  }}
                </NButton>
              </div>
            </section>
          </Transition>
        </div>
      </template>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.popup-root {
  width: 380px;
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-sans);
}

/* ── Skeleton ─────────────────────────────────────────────────── */
.popup-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  min-height: 216px;
}

.popup-skeleton__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.popup-skeleton__spacer {
  flex: 1;
}

.popup-skeleton__body {
  display: flex;
  gap: 8px;
  flex: 1;
}

.popup-skeleton__body :deep(.n-skeleton) {
  flex: 1;
}

.popup-skeleton__footer {
  display: flex;
  justify-content: flex-end;
}

.popup-viewport {
  min-height: 160px;
  overflow: hidden;
}

.popup-page {
  min-height: 160px;
}

.popup-launching {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 48px;
  padding: 0 20px;
  text-align: center;
}

.popup-launching::after {
  content: '';
}

.popup-launching__content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
}

.popup-launching__copy h2 {
  font-size: 14px;
  font-weight: 600;
}

.popup-launching__copy p {
  margin-top: 2px;
  color: var(--color-on-surface-variant);
  font-size: 11px;
}

.popup-unavailable {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.popup-unavailable > .popup-banner {
  align-self: center;
  width: calc(100% - 32px);
  margin: 0 16px;
}

/* ── Disconnected Banner ─────────────────────────────────────── */
.popup-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 4px 16px 8px;
  padding: 10px 12px;
  border-radius: 10px;
}

.popup-banner--error {
  background: color-mix(in srgb, var(--color-error) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 20%, transparent);
}

.popup-banner__icon {
  color: var(--color-error);
  flex-shrink: 0;
  margin-top: 1px;
}

.popup-banner__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-error);
}

.popup-banner__hint {
  font-size: 11px;
  color: var(--color-on-surface-variant);
  margin-top: 2px;
}

/* ── Actions ─────────────────────────────────────────────────── */
.popup-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
}

.popup-actions__left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.popup-actions--unavailable {
  justify-content: flex-end;
}
</style>
