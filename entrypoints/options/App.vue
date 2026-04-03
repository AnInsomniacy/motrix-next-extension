<script lang="ts" setup>
/**
 * @fileoverview Options page root component.
 *
 * Dual-pane layout (sidebar nav + content area) wrapped in Naive UI
 * NConfigProvider for M3 Amber Gold theming. Uses the `usePreferenceForm`
 * composable for snapshot-based dirty tracking with explicit Save/Discard,
 * matching the desktop Motrix Next preference page lifecycle.
 *
 * Persistence model:
 *   - Connection / Behavior settings: explicit Save via usePreferenceForm
 *   - Site Rules: immediate persist on add/remove (CRUD intent is clear)
 *   - Theme: immediate persist + patchSnapshot (no dirty contribution)
 *   - Diagnostics: read-only / immediate persist on clear
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { NConfigProvider, createDiscreteApi } from 'naive-ui';
import { Aria2Client } from '@/modules/rpc/aria2-client';
import { ConnectionService, ConnectionStatus } from '@/modules/services/connection';
import { resolveThemeClass } from '@/modules/services/theme';
import type {
  RpcConfig,
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
import { usePreferenceForm } from '@/shared/use-preference-form';

import OptionsNav from './components/OptionsNav.vue';
import ConnectionSection from './components/ConnectionSection.vue';
import BehaviorSection from './components/BehaviorSection.vue';
import SiteRulesSection from './components/SiteRulesSection.vue';
import EnhancedSection from './components/EnhancedSection.vue';
import AppearanceSection from './components/AppearanceSection.vue';
import DiagnosticsSection from './components/DiagnosticsSection.vue';
import SettingsActionBar from './components/SettingsActionBar.vue';

// ─── Theme + Color Scheme ───────────────────────────────────────────

const colorSchemeId = ref(DEFAULT_UI_PREFS.colorScheme);
const { naiveTheme, themeOverrides, setTheme } = useTheme(colorSchemeId);

// ─── i18n ───────────────────────────────────────────────────────────

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

function i18nSub(key: string, subs: string[], fallback: string): string {
  return chrome.i18n.getMessage(key, subs) || fallback;
}

// ─── Navigation ─────────────────────────────────────────────────────

const activeSection = ref('connection');

// ═══════════════════════════════════════════════════════════════════
// ── Preference Form (dirty-tracked settings) ────────────────────
//
// Settings that participate in dirty tracking: RPC config + download
// behavior. Theme, site rules, and diagnostics are NOT dirty-tracked
// (they persist immediately).
//
// Ref: desktop usePreferenceForm.ts
// ═══════════════════════════════════════════════════════════════════

interface SettingsForm {
  // RPC
  port: number;
  secret: string;
  // Behavior
  enabled: boolean;
  minFileSize: number;
  fallbackToBrowser: boolean;
  hideDownloadBar: boolean;
  notifyOnStart: boolean;
  notifyOnComplete: boolean;
}

function buildForm(): SettingsForm {
  return {
    port: DEFAULT_RPC_CONFIG.port,
    secret: DEFAULT_RPC_CONFIG.secret,
    enabled: DEFAULT_DOWNLOAD_SETTINGS.enabled,
    minFileSize: DEFAULT_DOWNLOAD_SETTINGS.minFileSize,
    fallbackToBrowser: DEFAULT_DOWNLOAD_SETTINGS.fallbackToBrowser,
    hideDownloadBar: DEFAULT_DOWNLOAD_SETTINGS.hideDownloadBar,
    notifyOnStart: DEFAULT_DOWNLOAD_SETTINGS.notifyOnStart,
    notifyOnComplete: DEFAULT_DOWNLOAD_SETTINGS.notifyOnComplete,
  };
}

// ── Discrete API (toast messages without NMessageProvider wrapper) ──
const { message: toast } = createDiscreteApi(['message']);

const { form, isDirty, handleSave: rawSave, handleReset: rawReset, resetSnapshot } =
  usePreferenceForm<SettingsForm>({
    buildForm,
    persist: async (f) => {
      await chrome.storage.local.set({
        rpc: {
          host: DEFAULT_RPC_CONFIG.host,
          port: f.port,
          secret: f.secret,
        },
        settings: {
          enabled: f.enabled,
          minFileSize: f.minFileSize,
          fallbackToBrowser: f.fallbackToBrowser,
          hideDownloadBar: f.hideDownloadBar,
          notifyOnStart: f.notifyOnStart,
          notifyOnComplete: f.notifyOnComplete,
        },
      });
    },
    afterSave: () => {
      toast.success(i18n('options_save_success', 'Settings saved'));
    },
  });

/** Wrapped save with error handling + toast */
async function handleSave(): Promise<void> {
  try {
    await rawSave();
  } catch {
    toast.error(i18n('options_save_error', 'Failed to save settings'));
  }
}

/** Wrapped reset with toast feedback */
function handleReset(): void {
  rawReset();
  toast.info(i18n('options_discard', 'Discard'));
}

// ─── Non-dirty-tracked State ────────────────────────────────────────

const uiTheme = ref<UiPrefs['theme']>(DEFAULT_UI_PREFS.theme);
const uiColorScheme = ref(DEFAULT_UI_PREFS.colorScheme);
const siteRules = ref<SiteRule[]>([]);
const diagnosticEvents = ref<DiagnosticEvent[]>([]);
const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.Disconnected);
const connectionVersion = ref<string | null>(null);
const connectionError = ref<string | null>(null);
const testingConnection = ref(false);
const enhancedGranted = ref(false);
const extensionVersion = chrome.runtime.getManifest().version;

// ─── RPC Config (computed from form for ConnectionSection) ──────────

const rpcForTest = computed<RpcConfig>(() => ({
  host: DEFAULT_RPC_CONFIG.host,
  port: form.value.port,
  secret: form.value.secret,
}));

// ─── Load from Storage ──────────────────────────────────────────────

async function loadFromStorage(): Promise<void> {
  const stored = await chrome.storage.local.get([
    'rpc',
    'settings',
    'siteRules',
    'uiPrefs',
    'diagnosticLog',
  ]) as Record<string, Record<string, unknown> | SiteRule[] | DiagnosticEvent[] | undefined>;

  // Hydrate the dirty-tracked form
  const loaded = buildForm();
  const rpcData = stored.rpc as Record<string, unknown> | undefined;
  if (rpcData) {
    loaded.port = (rpcData.port as number) ?? loaded.port;
    loaded.secret = (rpcData.secret as string) ?? loaded.secret;
  }
  const settingsData = stored.settings as Record<string, unknown> | undefined;
  if (settingsData) {
    loaded.enabled = (settingsData.enabled as boolean) ?? loaded.enabled;
    loaded.minFileSize = (settingsData.minFileSize as number) ?? loaded.minFileSize;
    loaded.fallbackToBrowser = (settingsData.fallbackToBrowser as boolean) ?? loaded.fallbackToBrowser;
    loaded.hideDownloadBar = (settingsData.hideDownloadBar as boolean) ?? loaded.hideDownloadBar;
    loaded.notifyOnStart = (settingsData.notifyOnStart as boolean) ?? loaded.notifyOnStart;
    loaded.notifyOnComplete = (settingsData.notifyOnComplete as boolean) ?? loaded.notifyOnComplete;
  }
  Object.assign(form.value, loaded);
  // Mark as the saved baseline (so isDirty starts false)
  resetSnapshot();

  // Hydrate non-dirty-tracked state
  const uiData = stored.uiPrefs as Record<string, unknown> | undefined;
  if (uiData) {
    uiTheme.value = (uiData.theme as UiPrefs['theme']) ?? uiTheme.value;
    uiColorScheme.value = (uiData.colorScheme as string) ?? uiColorScheme.value;
    colorSchemeId.value = uiColorScheme.value;
    // Sync composable's isDark state with persisted theme preference
    setTheme(uiTheme.value);
  }
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

// ─── Connection ─────────────────────────────────────────────────────

async function testConnection(): Promise<void> {
  testingConnection.value = true;
  connectionError.value = null;
  const client = new Aria2Client(rpcForTest.value, { timeoutMs: 5000 });
  const svc = new ConnectionService(client);
  // Minimum 600ms so the loading animation doesn't flash on fast local connections
  const minDelay = new Promise((r) => setTimeout(r, 600));
  const [result] = await Promise.all([svc.checkConnection(), minDelay]);
  connectionStatus.value = result.status;
  connectionVersion.value = result.version;
  connectionError.value = result.error ?? null;
  testingConnection.value = false;
}

// ─── Site Rules (immediate persist) ─────────────────────────────────

function persistSiteRules(): void {
  void chrome.storage.local.set({ siteRules: siteRules.value });
}

function addRule(rule: Omit<SiteRule, 'id'>): void {
  siteRules.value.push({
    id: `rule-${Date.now()}`,
    pattern: rule.pattern,
    action: rule.action,
  });
  persistSiteRules();
}

function removeRule(id: string): void {
  siteRules.value = siteRules.value.filter((r) => r.id !== id);
  persistSiteRules();
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

// ─── Theme + Color Scheme (immediate persist) ──────────────────────

function handleThemeChange(value: string): void {
  const theme = value as UiPrefs['theme'];
  uiTheme.value = theme;
  // Update the composable's internal mode → recalculates isDark → MCU re-injects
  setTheme(theme);
  void chrome.storage.local.set({
    uiPrefs: { theme, colorScheme: uiColorScheme.value },
  });
  applyTheme();
}

function handleColorSchemeChange(value: string): void {
  uiColorScheme.value = value;
  colorSchemeId.value = value;
  void chrome.storage.local.set({
    uiPrefs: { theme: uiTheme.value, colorScheme: value },
  });
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
  document.documentElement.className = resolveThemeClass(uiTheme.value, systemDark);
}

// ─── Lifecycle ──────────────────────────────────────────────────────

// beforeunload guard — browser native "Leave this page?" dialog
// Ref: desktop useAppEvents.ts L191 (router.beforeEach with pendingChanges)
function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (isDirty.value) {
    e.preventDefault();
  }
}

watch(isDirty, (dirty) => {
  if (dirty) {
    window.addEventListener('beforeunload', onBeforeUnload);
  } else {
    window.removeEventListener('beforeunload', onBeforeUnload);
  }
});

onMounted(() => {
  void loadFromStorage().then(() => applyTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
  });
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
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
                  :port="form.port"
                  :secret="form.secret"
                  :status="connectionStatus"
                  :version="connectionVersion"
                  :error="connectionError"
                  :testing="testingConnection"
                  @update:port="form.port = $event"
                  @update:secret="form.secret = $event"
                  @test="testConnection"
                />
                <SettingsActionBar :is-dirty="isDirty" @save="handleSave" @discard="handleReset" />
              </div>
            </div>

            <!-- Behavior -->
            <div v-else-if="activeSection === 'behavior'" key="behavior" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_behavior', 'Download Behavior') }}</h2>
              <div class="card">
                <BehaviorSection
                  :enabled="form.enabled"
                  :min-file-size="form.minFileSize"
                  :fallback-to-browser="form.fallbackToBrowser"
                  :notify-on-start="form.notifyOnStart"
                  :notify-on-complete="form.notifyOnComplete"
                  @update:enabled="form.enabled = $event"
                  @update:min-file-size="form.minFileSize = $event"
                  @update:fallback-to-browser="form.fallbackToBrowser = $event"
                  @update:notify-on-start="form.notifyOnStart = $event"
                  @update:notify-on-complete="form.notifyOnComplete = $event"
                />
                <SettingsActionBar :is-dirty="isDirty" @save="handleSave" @discard="handleReset" />
              </div>
            </div>

            <!-- Site Rules (immediate persist — no action bar) -->
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
                  :hide-download-bar="form.hideDownloadBar"
                  @grant="grantEnhanced"
                  @revoke="revokeEnhanced"
                  @update:hide-download-bar="form.hideDownloadBar = $event"
                />
                <SettingsActionBar :is-dirty="isDirty" @save="handleSave" @discard="handleReset" />
              </div>
            </div>

            <!-- Appearance (immediate persist — no action bar) -->
            <div v-else-if="activeSection === 'appearance'" key="appearance" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_appearance', 'Appearance') }}</h2>
              <div class="card">
                <AppearanceSection
                  :theme="uiTheme"
                  :color-scheme="uiColorScheme"
                  @update:theme="handleThemeChange"
                  @update:color-scheme="handleColorSchemeChange"
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
