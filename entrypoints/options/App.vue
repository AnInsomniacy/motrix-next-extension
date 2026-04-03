<script lang="ts" setup>
/**
 * @fileoverview Options page root component.
 *
 * Dual-pane layout (sidebar nav + content area) wrapped in Naive UI
 * NConfigProvider for M3 Amber Gold theming. Business logic is delegated
 * to focused composables; this file handles only layout, lifecycle,
 * and composable wiring.
 *
 * Persistence model:
 *   - Connection / Behavior settings: explicit Save via usePreferenceForm
 *   - Site Rules: immediate persist on add/remove (useSiteRules)
 *   - Theme: immediate persist + patchSnapshot (useAppearance)
 *   - Diagnostics: read-only / immediate persist on clear (useDiagnostics)
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { NConfigProvider, createDiscreteApi } from 'naive-ui';
import type { RpcConfig, UiPrefs, SiteRule, DiagnosticEvent } from '@/shared/types';
import { DEFAULT_RPC_CONFIG, DEFAULT_DOWNLOAD_SETTINGS, DEFAULT_UI_PREFS } from '@/shared/constants';
import { useTheme } from '@/shared/use-theme';
import { usePreferenceForm } from '@/shared/use-preference-form';

import { useSiteRules } from './composables/use-site-rules';
import { useConnectionTest } from './composables/use-connection-test';
import { useEnhancedPermissions } from './composables/use-enhanced-permissions';
import { useDiagnostics } from './composables/use-diagnostics';
import { useAppearance } from './composables/use-appearance';

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

// ─── Composables ────────────────────────────────────────────────────

const { siteRules, hydrate: hydrateSiteRules, addRule, removeRule } = useSiteRules();
const { enhancedGranted, checkPermissions, grantEnhanced, revokeEnhanced } = useEnhancedPermissions();
const { diagnosticEvents, hydrate: hydrateDiagnostics, copyDiagnosticLog, clearDiagnosticLog } = useDiagnostics();
const appearance = useAppearance(setTheme, (id) => { colorSchemeId.value = id; });

// ─── Preference Form (dirty-tracked settings) ──────────────────────

interface SettingsForm {
  port: number;
  secret: string;
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

async function handleSave(): Promise<void> {
  try {
    await rawSave();
  } catch {
    toast.error(i18n('options_save_error', 'Failed to save settings'));
  }
}

function handleReset(): void {
  rawReset();
  toast.info(i18n('options_discard', 'Discard'));
}

// ─── Connection Test ────────────────────────────────────────────────

const rpcForTest = computed<RpcConfig>(() => ({
  host: DEFAULT_RPC_CONFIG.host,
  port: form.value.port,
  secret: form.value.secret,
}));

const {
  connectionStatus,
  connectionVersion,
  connectionError,
  testingConnection,
  testConnection,
} = useConnectionTest(rpcForTest);

// ─── Extension Version ─────────────────────────────────────────────

const extensionVersion = chrome.runtime.getManifest().version;

// ─── Load from Storage ──────────────────────────────────────────────

async function loadFromStorage(): Promise<void> {
  const stored = await chrome.storage.local.get([
    'rpc',
    'settings',
    'siteRules',
    'uiPrefs',
    'diagnosticLog',
  ]) as Record<string, Record<string, unknown> | SiteRule[] | DiagnosticEvent[] | undefined>;

  // Hydrate dirty-tracked form
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
  resetSnapshot();

  // Hydrate composables
  const uiData = stored.uiPrefs as Record<string, unknown> | undefined;
  appearance.hydrate({
    theme: uiData?.theme as UiPrefs['theme'] | undefined,
    colorScheme: uiData?.colorScheme as string | undefined,
  });
  if (stored.siteRules) hydrateSiteRules(stored.siteRules as SiteRule[]);
  if (stored.diagnosticLog) hydrateDiagnostics(stored.diagnosticLog as DiagnosticEvent[]);

  await checkPermissions();
}

// ─── Lifecycle ──────────────────────────────────────────────────────

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
  void loadFromStorage().then(() => appearance.applyTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    appearance.applyTheme();
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
                  :hide-download-bar="form.hideDownloadBar"
                  @grant="grantEnhanced"
                  @revoke="revokeEnhanced"
                  @update:hide-download-bar="form.hideDownloadBar = $event"
                />
                <SettingsActionBar :is-dirty="isDirty" @save="handleSave" @discard="handleReset" />
              </div>
            </div>

            <!-- Appearance -->
            <div v-else-if="activeSection === 'appearance'" key="appearance" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_appearance', 'Appearance') }}</h2>
              <div class="card">
                <AppearanceSection
                  :theme="appearance.uiTheme.value"
                  :color-scheme="appearance.uiColorScheme.value"
                  @update:theme="appearance.handleThemeChange"
                  @update:color-scheme="appearance.handleColorSchemeChange"
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
