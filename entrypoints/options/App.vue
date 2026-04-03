<script lang="ts" setup>
/**
 * @fileoverview Options page root component.
 *
 * Dual-pane layout (sidebar nav + content area) wrapped in Naive UI
 * NConfigProvider for M3 Amber Gold theming. Each settings section is
 * a dedicated Vue component; all business logic (storage, permissions,
 * diagnostics) is preserved from the original monolithic implementation.
 *
 * Layout mirrors the desktop Motrix Next `MainLayout.vue` aside + content
 * pattern, with responsive collapse to horizontal tabs at ≤640px.
 */
import { ref, reactive, onMounted, watch } from 'vue';
import { NConfigProvider } from 'naive-ui';
import { Aria2Client } from '@/modules/rpc/aria2-client';
import { ConnectionService, ConnectionStatus } from '@/modules/services/connection';
import { resolveThemeClass } from '@/modules/services/theme';
import type {
  RpcConfig,
  DownloadSettings,
  SiteRule,
  DiagnosticEvent,
  UiPrefs,
} from '@/shared/types';
import {
  DEFAULT_RPC_CONFIG,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_UI_PREFS,
} from '@/shared/constants';
import { useTheme } from '@/shared/use-theme';

import OptionsNav from './components/OptionsNav.vue';
import ConnectionSection from './components/ConnectionSection.vue';
import BehaviorSection from './components/BehaviorSection.vue';
import SiteRulesSection from './components/SiteRulesSection.vue';
import EnhancedSection from './components/EnhancedSection.vue';
import AppearanceSection from './components/AppearanceSection.vue';
import DiagnosticsSection from './components/DiagnosticsSection.vue';

// ─── Theme ──────────────────────────────────────────────────────────

const { naiveTheme, themeOverrides } = useTheme();

// ─── i18n ───────────────────────────────────────────────────────────

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

function i18nSub(key: string, subs: string[], fallback: string): string {
  return chrome.i18n.getMessage(key, subs) || fallback;
}

// ─── Navigation ─────────────────────────────────────────────────────

const activeSection = ref('connection');

// ─── Reactive State ─────────────────────────────────────────────────

const rpc = reactive<RpcConfig>({ ...DEFAULT_RPC_CONFIG });
const settings = reactive<DownloadSettings>({ ...DEFAULT_DOWNLOAD_SETTINGS });
const uiPrefs = reactive<UiPrefs>({ ...DEFAULT_UI_PREFS });
const siteRules = ref<SiteRule[]>([]);
const diagnosticEvents = ref<DiagnosticEvent[]>([]);
const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.Disconnected);
const connectionVersion = ref<string | null>(null);
const connectionError = ref<string | null>(null);
const testingConnection = ref(false);
const enhancedGranted = ref(false);
const extensionVersion = chrome.runtime.getManifest().version;

// ─── Save / Load ────────────────────────────────────────────────────

function saveToStorage(): void {
  void chrome.storage.local.set({
    rpc: { host: rpc.host, port: rpc.port, secret: rpc.secret },
    settings: { ...settings },
    siteRules: siteRules.value,
    uiPrefs: { ...uiPrefs },
  });
}

async function loadFromStorage(): Promise<void> {
  const stored = await chrome.storage.local.get([
    'rpc',
    'settings',
    'siteRules',
    'uiPrefs',
    'diagnosticLog',
  ]);
  if (stored.rpc) Object.assign(rpc, stored.rpc);
  if (stored.settings) Object.assign(settings, stored.settings);
  if (stored.uiPrefs) Object.assign(uiPrefs, stored.uiPrefs);
  if (stored.siteRules) siteRules.value = stored.siteRules as SiteRule[];
  if (stored.diagnosticLog) diagnosticEvents.value = stored.diagnosticLog as DiagnosticEvent[];

  try {
    enhancedGranted.value = await chrome.permissions.contains({
      permissions: ['cookies', 'downloads.ui'],
      origins: ['https://*/*', 'http://*/*'],
    });
  } catch {
    enhancedGranted.value = false;
  }
}

// Auto-save when settings change
watch(
  [
    () => rpc.port,
    () => rpc.secret,
    () => settings.enabled,
    () => settings.minFileSize,
    () => settings.fallbackToBrowser,
    () => settings.hideDownloadBar,
    () => settings.notifyOnStart,
    () => settings.notifyOnComplete,
    () => uiPrefs.theme,
  ],
  saveToStorage,
  { deep: true },
);

// ─── Connection ─────────────────────────────────────────────────────

async function testConnection(): Promise<void> {
  testingConnection.value = true;
  connectionError.value = null;
  const client = new Aria2Client(rpc, { timeoutMs: 5000 });
  const svc = new ConnectionService(client);
  const result = await svc.checkConnection();
  connectionStatus.value = result.status;
  connectionVersion.value = result.version;
  connectionError.value = result.error ?? null;
  testingConnection.value = false;
}

// ─── Site Rules ─────────────────────────────────────────────────────

function addRule(rule: Omit<SiteRule, 'id'>): void {
  siteRules.value.push({
    id: `rule-${Date.now()}`,
    pattern: rule.pattern,
    action: rule.action,
  });
  saveToStorage();
}

function removeRule(id: string): void {
  siteRules.value = siteRules.value.filter((r) => r.id !== id);
  saveToStorage();
}

// ─── Enhanced Permissions ───────────────────────────────────────────

async function grantEnhanced(): Promise<void> {
  try {
    const granted = await chrome.permissions.request({
      permissions: ['cookies', 'downloads.ui'],
      origins: ['https://*/*', 'http://*/*'],
    });
    enhancedGranted.value = granted;
  } catch {
    enhancedGranted.value = false;
  }
}

async function revokeEnhanced(): Promise<void> {
  try {
    await chrome.permissions.remove({
      permissions: ['cookies', 'downloads.ui'],
      origins: ['https://*/*', 'http://*/*'],
    });
    enhancedGranted.value = false;
  } catch {
    // silent
  }
}

// ─── Diagnostics ────────────────────────────────────────────────────

function copyDiagnosticLog(): void {
  const json = JSON.stringify(diagnosticEvents.value, null, 2);
  void navigator.clipboard.writeText(json);
}

function clearDiagnosticLog(): void {
  diagnosticEvents.value = [];
  void chrome.storage.local.set({ diagnosticLog: [] });
}

// ─── Theme Application ─────────────────────────────────────────────

function applyTheme(): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.className = resolveThemeClass(
    uiPrefs.theme as 'system' | 'light' | 'dark',
    systemDark,
  );
}

watch(() => uiPrefs.theme, () => applyTheme());

// ─── Lifecycle ──────────────────────────────────────────────────────

onMounted(() => {
  void loadFromStorage().then(() => applyTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
  });
});
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
    inline-theme-disabled
  >
    <div class="options-root">
      <!-- ── Header ──────────────────────────────────────────── -->
      <header class="options-header">
        <div class="options-header__brand">
          <div class="options-header__icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="18"
              viewBox="0 0 40 18"
            >
              <rect
                x="0.5" y="0.5" width="39" height="17" rx="4"
                fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"
              />
              <text
                x="20" y="13" fill="currentColor"
                font-family="Arial, Helvetica, sans-serif"
                font-weight="900" font-size="10"
                text-anchor="middle" letter-spacing="1"
              >NEXT</text>
            </svg>
          </div>
          <div>
            <h1 class="options-header__title">
              {{ i18n('options_header_title', 'Motrix Next') }}
            </h1>
            <p class="options-header__subtitle">
              {{ i18n('options_header_subtitle', 'Extension Settings') }}
            </p>
          </div>
        </div>
      </header>

      <!-- ── Body: Nav + Content ─────────────────────────────── -->
      <div class="options-body">
        <OptionsNav :active="activeSection" @select="activeSection = $event" />

        <main class="options-content">
          <Transition name="fade" mode="out-in">
            <!-- Connection -->
            <div v-if="activeSection === 'connection'" key="connection" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_connection', 'Connection') }}</h2>
              <div class="card">
                <ConnectionSection
                  :port="rpc.port"
                  :secret="rpc.secret"
                  :status="connectionStatus"
                  :version="connectionVersion"
                  :error="connectionError"
                  :testing="testingConnection"
                  @update:port="rpc.port = $event"
                  @update:secret="rpc.secret = $event"
                  @test="testConnection"
                />
              </div>
            </div>

            <!-- Behavior -->
            <div v-else-if="activeSection === 'behavior'" key="behavior" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_behavior', 'Download Behavior') }}</h2>
              <div class="card">
                <BehaviorSection
                  :enabled="settings.enabled"
                  :min-file-size="settings.minFileSize"
                  :fallback-to-browser="settings.fallbackToBrowser"
                  :notify-on-start="settings.notifyOnStart"
                  :notify-on-complete="settings.notifyOnComplete"
                  @update:enabled="settings.enabled = $event"
                  @update:min-file-size="settings.minFileSize = $event"
                  @update:fallback-to-browser="settings.fallbackToBrowser = $event"
                  @update:notify-on-start="settings.notifyOnStart = $event"
                  @update:notify-on-complete="settings.notifyOnComplete = $event"
                />
              </div>
            </div>

            <!-- Site Rules -->
            <div v-else-if="activeSection === 'rules'" key="rules" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_rules', 'Site Rules') }}</h2>
              <div class="card">
                <SiteRulesSection
                  :rules="siteRules"
                  @add="addRule"
                  @remove="removeRule"
                />
              </div>
            </div>

            <!-- Enhanced -->
            <div v-else-if="activeSection === 'enhanced'" key="enhanced" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_enhanced', 'Enhanced Mode') }}</h2>
              <div class="card">
                <EnhancedSection
                  :granted="enhancedGranted"
                  :hide-download-bar="settings.hideDownloadBar"
                  @grant="grantEnhanced"
                  @revoke="revokeEnhanced"
                  @update:hide-download-bar="settings.hideDownloadBar = $event"
                />
              </div>
            </div>

            <!-- Appearance -->
            <div v-else-if="activeSection === 'appearance'" key="appearance" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_appearance', 'Appearance') }}</h2>
              <div class="card">
                <AppearanceSection
                  :theme="uiPrefs.theme"
                  @update:theme="uiPrefs.theme = $event as UiPrefs['theme']"
                />
              </div>
            </div>

            <!-- Diagnostics -->
            <div v-else-if="activeSection === 'diagnostics'" key="diagnostics" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_diagnostics', 'Diagnostics') }}</h2>
              <div class="card">
                <DiagnosticsSection
                  :events="diagnosticEvents"
                  @copy="copyDiagnosticLog"
                  @clear="clearDiagnosticLog"
                />
              </div>
            </div>
          </Transition>
        </main>
      </div>

      <!-- ── Footer ──────────────────────────────────────────── -->
      <footer class="options-footer">
        {{ i18nSub('options_footer', [extensionVersion], `Motrix Next Extension v${extensionVersion}`) }}
      </footer>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.options-root {
  min-height: 100vh;
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-sans);
  display: flex;
  flex-direction: column;
}

/* ── Header ──────────────────────────────────────────────────── */
.options-header {
  padding: 28px 32px 16px;
  border-bottom: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-low);
}

.options-header__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.options-header__icon {
  color: var(--color-primary);
}

.options-header__title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-on-surface);
}

.options-header__subtitle {
  font-size: 13px;
  color: var(--color-on-surface-variant);
  margin-top: 1px;
}

/* ── Body: dual-pane layout ──────────────────────────────────── */
.options-body {
  display: flex;
  flex: 1;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  padding: 16px 0;
}

.options-content {
  flex: 1;
  min-width: 0;
  padding: 8px 32px 32px 16px;
}

.section-wrapper {
  /* anchor for Transition */
}

/* ── Footer ──────────────────────────────────────────────────── */
.options-footer {
  text-align: center;
  font-size: 12px;
  color: var(--color-on-surface-variant);
  opacity: 0.5;
  padding: 16px;
  border-top: 1px solid var(--color-outline-variant);
}

/* ── Responsive: ≤640px → stacked layout ─────────────────────── */
@media (max-width: 640px) {
  .options-body {
    flex-direction: column;
    padding: 0;
  }

  .options-content {
    padding: 16px;
  }

  .options-header {
    padding: 20px 16px 12px;
  }
}
</style>
