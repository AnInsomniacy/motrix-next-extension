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
import { NButton, NConfigProvider, NIcon } from 'naive-ui';
import { AlertCircleOutline, PauseOutline, PlayOutline, RocketOutline } from '@vicons/ionicons5';
import {
  DesktopApiClient,
  checkConnection,
  type ConnectionStatus,
  type StatResponse,
} from '@/lib/api';
import { buildProtocolUrl } from '@/lib/desktop';
import { loadSnapshot, updateSettings } from '@/lib/storage';
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

const status = ref<ConnectionStatus>('disconnected');
const version = ref<string | null>(null);
const errorType = ref<string | null>(null);
const connectionPort = ref(DEFAULT_CONNECTION_CONFIG.port);
const globalStat = ref<StatResponse | null>(null);
const loading = ref(true);
const enabled = ref(true);

const apiClient = new DesktopApiClient({ ...DEFAULT_CONNECTION_CONFIG });
let stopPolling: (() => void) | null = null;
let stopStorageListener: (() => void) | null = null;

// ─── Data Fetching ──────────────────────────────────────

async function fetchData(): Promise<void> {
  try {
    const result = await checkConnection(apiClient);
    status.value = result.status;
    version.value = result.version;
    errorType.value = result.error ?? null;
    if (result.status === 'connected') {
      globalStat.value = await apiClient.getStat();
    }
  } catch {
    status.value = 'disconnected';
  } finally {
    loading.value = false;
  }
}

// ─── Actions ────────────────────────────────────────────

async function pauseAll(): Promise<void> {
  await apiClient.pauseAll().catch(() => {});
  await fetchData();
}

async function resumeAll(): Promise<void> {
  await apiClient.resumeAll().catch(() => {});
  await fetchData();
}

function openSettings(): void {
  void browser.runtime.openOptionsPage();
}

function launchApp(): void {
  // Connected: focus the existing window. Disconnected: wake via the OS.
  const url = status.value === 'connected' ? buildProtocolUrl('tasks') : buildProtocolUrl();
  void browser.tabs.create({ url, active: true });
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
    backoffMultiplier: 2,
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
      <!-- ── Skeleton (first poll in flight) ─────────────────── -->
      <div v-if="loading" class="popup-skeleton" aria-busy="true">
        <div class="popup-skeleton__header">
          <span class="skeleton skeleton--logo" />
          <span class="skeleton skeleton--chip" />
          <span class="popup-skeleton__spacer" />
          <span class="skeleton skeleton--switch" />
        </div>
        <div class="popup-skeleton__body">
          <span class="skeleton skeleton--stat" />
          <span class="skeleton skeleton--stat" />
        </div>
        <div class="popup-skeleton__footer">
          <span class="skeleton skeleton--button" />
        </div>
      </div>

      <template v-else>
        <!-- ── Header ──────────────────────────────────────────── -->
        <PopupHeader
          :status="status"
          :version="version"
          :enabled="enabled"
          @settings="openSettings"
          @toggle-enabled="toggleEnabled"
        />

        <!-- ── Disconnected Banner (error-type-specific) ──────── -->
        <Transition name="fade-scale">
          <div v-if="status !== 'connected'" class="popup-banner popup-banner--error">
            <NIcon :size="16" class="popup-banner__icon">
              <AlertCircleOutline />
            </NIcon>
            <div>
              <Transition name="text-swap" mode="out-in">
                <div v-if="errorType === 'ApiAuthError'" key="auth">
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
                <div v-else-if="errorType === 'ApiTimeoutError'" key="timeout">
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
                <div v-else key="unreachable">
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
              </Transition>
            </div>
          </div>
        </Transition>

        <!-- ── Connected: Stat Dashboard ────────────────────────── -->
        <StatDashboard
          v-if="status === 'connected' && globalStat"
          :stat="globalStat"
          :disabled="!enabled"
        />

        <!-- ── Actions ─────────────────────────────────────────── -->
        <div class="popup-actions">
          <div v-if="status === 'connected'" class="popup-actions__left">
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
          <div v-else class="popup-actions__left" />
          <NButton size="tiny" type="primary" @click="launchApp">
            <template #icon>
              <NIcon :size="12"><RocketOutline /></NIcon>
            </template>
            <Transition
              :name="status === 'connected' ? 'text-swap' : 'text-swap-reverse'"
              mode="out-in"
            >
              <span v-if="status === 'connected'" key="open">
                {{ i18n('popup_action_open', 'Open Motrix Next') }}
              </span>
              <span v-else key="launch">
                {{ i18n('popup_action_launch', 'Launch Motrix Next') }}
              </span>
            </Transition>
          </NButton>
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

.popup-skeleton__footer {
  display: flex;
  justify-content: flex-end;
}

.skeleton {
  display: inline-block;
  border-radius: 8px;
  background: linear-gradient(
    100deg,
    var(--color-surface-container) 40%,
    var(--color-surface-container-high) 50%,
    var(--color-surface-container) 60%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.2s ease-in-out infinite;
}

.skeleton--logo {
  width: 64px;
  height: 24px;
}

.skeleton--chip {
  width: 84px;
  height: 18px;
  border-radius: 9999px;
}

.skeleton--switch {
  width: 96px;
  height: 20px;
  border-radius: 9999px;
}

.skeleton--stat {
  flex: 1;
  height: 108px;
  border-radius: 12px;
}

.skeleton--button {
  width: 140px;
  height: 24px;
}

@keyframes skeleton-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
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
</style>
