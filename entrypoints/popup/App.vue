<script lang="ts" setup>
/**
 * @fileoverview Popup root component.
 *
 * Wraps the popup UI in a Naive UI NConfigProvider for consistent M3
 * theming, delegates rendering to dedicated sub-components, and manages
 * the data polling lifecycle. All business logic (API client, connection
 * check, task polling) is preserved unchanged from the original.
 */
import { ref, provide, onMounted, onUnmounted } from 'vue';
import { usePolling } from '@/shared/use-polling';
import { NConfigProvider, NSpin, NIcon, NButton } from 'naive-ui';
import { PauseOutline, PlayOutline, RocketOutline, AlertCircleOutline } from '@vicons/ionicons5';
import { DesktopApiClient } from '@/lib/api';
import { ConnectionService, ConnectionStatus } from '@/lib/services';
import { buildProtocolUrl, ProtocolAction } from '@/lib/protocol';
import { resolveThemeClass } from '@/lib/services';
import type { ThemePreference } from '@/lib/services';
import { StorageService } from '@/lib/storage';
import type { StatResponse } from '@/lib/api/desktop-client';
import { DEFAULT_CONNECTION_CONFIG, DEFAULT_UI_PREFS } from '@/shared/constants';
import { useTheme } from '@/shared/use-theme';

import { createI18n, I18N_KEY, useNaiveLocale } from '@/shared/i18n/engine';

import PopupHeader from './components/PopupHeader.vue';
import StatDashboard from './components/StatDashboard.vue';

// ─── i18n ───────────────────────────────────────────────────────────

const i18nCtx = createI18n();
provide(I18N_KEY, i18nCtx);
const { t: i18n, tSub: i18nSub, effectiveLocale } = i18nCtx;
const { naiveLocale, naiveDateLocale } = useNaiveLocale(effectiveLocale);

// ─── Theme + Color Scheme ───────────────────────────────────────────

const colorSchemeId = ref(DEFAULT_UI_PREFS.colorScheme);
const { naiveTheme, themeOverrides } = useTheme(colorSchemeId);

// ─── State ──────────────────────────────────────────────────────────

const status = ref<ConnectionStatus>(ConnectionStatus.Disconnected);
const version = ref<string | null>(null);
const errorType = ref<string | null>(null);
const connectionPort = ref(DEFAULT_CONNECTION_CONFIG.port);
const globalStat = ref<StatResponse | null>(null);
const loading = ref(true);
const enabled = ref(true);

let apiClient: DesktopApiClient;
let storageService: StorageService;
let stopPolling: (() => void) | null = null;

// ─── Data Fetching ──────────────────────────────────────────────────

async function fetchData(): Promise<void> {
  try {
    const connectionSvc = new ConnectionService(apiClient);
    const result = await connectionSvc.checkConnection();
    status.value = result.status;
    version.value = result.version;
    errorType.value = result.error ?? null;

    if (result.status === ConnectionStatus.Connected) {
      globalStat.value = await apiClient.getStat();
    }
  } catch {
    status.value = ConnectionStatus.Disconnected;
  } finally {
    loading.value = false;
  }
}

// ─── Actions ────────────────────────────────────────────────────────

async function pauseAll(): Promise<void> {
  try {
    await apiClient.pauseAll();
    await fetchData();
  } catch {
    /* silent */
  }
}

async function resumeAll(): Promise<void> {
  try {
    await apiClient.resumeAll();
    await fetchData();
  } catch {
    /* silent */
  }
}

function openSettings(): void {
  void chrome.runtime.openOptionsPage();
}

function launchApp(): void {
  // Connected: focus the existing window. Disconnected: wake the app via OS.
  const url =
    status.value === ConnectionStatus.Connected
      ? buildProtocolUrl(ProtocolAction.Tasks)
      : buildProtocolUrl();
  // Let Chrome handle the protocol tab lifecycle naturally —
  // the OS will process the custom scheme and Chrome manages the tab.
  void chrome.tabs.create({ url, active: true });
}

/**
 * Toggle download interception on/off. Performs a read-modify-write to
 * preserve all other DownloadSettings fields. The background service
 * worker picks up the change automatically via chrome.storage.onChanged.
 */
async function toggleEnabled(): Promise<void> {
  enabled.value = !enabled.value;
  try {
    const { storage: data } = await storageService.load();
    await storageService.saveSettings({
      ...data.settings,
      enabled: enabled.value,
    });
  } catch {
    // Revert on failure — keep UI in sync with actual storage state.
    enabled.value = !enabled.value;
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────

onMounted(async () => {
  storageService = new StorageService(chrome.storage.local);
  const { storage: data } = await storageService.load();

  // Hydrate interception toggle state
  enabled.value = data.settings.enabled;

  // Apply theme
  const theme = data.uiPrefs.theme as ThemePreference;
  colorSchemeId.value = data.uiPrefs.colorScheme;
  i18nCtx.setLocale(data.uiPrefs.locale);
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.className = resolveThemeClass(theme, mediaQuery.matches);
  mediaQuery.addEventListener('change', (e) => {
    document.documentElement.className = resolveThemeClass(theme, e.matches);
  });

  // Initialize API client with validated config
  connectionPort.value = data.connection.port;
  apiClient = new DesktopApiClient({ port: data.connection.port, secret: data.connection.secret });

  // Smart polling with exponential backoff + visibility awareness
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
});
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    inline-theme-disabled
  >
    <div class="popup-root">
      <!-- ── Loading State ─────────────────────────────────────── -->
      <div v-if="loading" class="popup-loading">
        <NSpin size="medium" />
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
                <!-- Auth Error -->
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
                <!-- Timeout Error -->
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
                <!-- Unreachable / Unknown (default) -->
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
        <template v-if="status === 'connected'">
          <StatDashboard v-if="globalStat" :stat="globalStat" :disabled="!enabled" />
        </template>

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

/* ── Loading ──────────────────────────────────────────────────── */
.popup-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
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
