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
import { ref, provide, onMounted, onUnmounted, computed, watch } from 'vue';
import { browser } from 'wxt/browser';
import { storage as wxtStorage } from '#imports';
import { NConfigProvider, createDiscreteApi } from 'naive-ui';
import {
  StorageService,
  createWxtStorageApi,
  parseConnectionConfig,
  parseDownloadSettings,
  parseSiteRules,
  parseUiPrefs,
} from '@/lib/storage';
import { PermissionService } from '@/lib/services';
import type {
  ConnectionConfig,
  DiagnosticEvent,
  InterceptionScope,
  MinimumFileSizeSettings,
} from '@/shared/types';
import {
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_UI_PREFS,
} from '@/shared/constants';
import { useTheme } from '@/shared/use-theme';
import { getBootstrappedUiPrefs } from '@/shared/theme-bootstrap';
import { usePreferenceForm } from '@/shared/use-preference-form';

import { useSiteRules } from './composables/use-site-rules';
import { useConnectionTest } from './composables/use-connection-test';
import { useDiagnostics } from './composables/use-diagnostics';
import { useAppearance } from './composables/use-appearance';
import { createI18n, I18N_KEY, useNaiveLocale } from '@/shared/i18n/engine';

import OptionsNav from './components/OptionsNav.vue';
import ConnectionSection from './components/ConnectionSection.vue';
import BehaviorSection from './components/BehaviorSection.vue';
import SiteRulesSection from './components/SiteRulesSection.vue';
import AppearanceSection from './components/AppearanceSection.vue';
import DiagnosticsSection from './components/DiagnosticsSection.vue';
import SettingsActionBar from './components/SettingsActionBar.vue';
import LanguageSection from './components/LanguageSection.vue';

// ─── Theme + Color Scheme ───────────────────────────────────────────

const bootstrappedUiPrefs = getBootstrappedUiPrefs();
const colorSchemeId = ref(bootstrappedUiPrefs?.colorScheme ?? DEFAULT_UI_PREFS.colorScheme);
const { naiveTheme, themeOverrides, setTheme } = useTheme(colorSchemeId);

// ─── i18n ───────────────────────────────────────────────────────────

const i18nCtx = createI18n('auto', { localeApi: browser.i18n });
provide(I18N_KEY, i18nCtx);
const { t: i18n, tEn: i18nEn, tSub: i18nSub, effectiveLocale, setLocale: i18nSetLocale } = i18nCtx;
const { naiveLocale, naiveDateLocale } = useNaiveLocale(effectiveLocale);

/** Bilingual display for the Language section title. */
function i18nBilingual(key: string, enFallback: string): string {
  const native = i18n(key, enFallback);
  const en = i18nEn(key, enFallback);
  return native === en ? native : `${native} / ${en}`;
}

// ─── Navigation ─────────────────────────────────────────────────────

const activeSection = ref('connection');

// ─── StorageService ──────────────────────────────────────────────────

const storageService = new StorageService(createWxtStorageApi(wxtStorage));
const permissionService = new PermissionService({
  contains: (permissions) => browser.permissions.contains(permissions),
  request: (permissions) => browser.permissions.request(permissions),
});

// ─── Composables ────────────────────────────────────────────────────

const { siteRules, hydrate: hydrateSiteRules, addRule, removeRule } = useSiteRules(storageService);
const {
  diagnosticEvents,
  hydrate: hydrateDiagnostics,
  clearDiagnosticLog,
  exportDiagnosticReport,
} = useDiagnostics(storageService, {
  getManifest: () => browser.runtime.getManifest(),
});
const appearance = useAppearance(storageService, setTheme, (id) => {
  colorSchemeId.value = id;
});

// ─── Preference Form (dirty-tracked settings) ──────────────────────

interface SettingsForm {
  port: number;
  secret: string;
  hideDownloadBar: boolean;
  autoLaunchApp: boolean;
  forwardCookies: boolean;
  minimumFileSize: MinimumFileSizeSettings;
}

const interceptionEnabled = ref(DEFAULT_DOWNLOAD_SETTINGS.enabled);
const interceptionScope = ref<InterceptionScope>({
  ...DEFAULT_DOWNLOAD_SETTINGS.interceptionScope,
});
function buildForm(): SettingsForm {
  return {
    port: DEFAULT_CONNECTION_CONFIG.port,
    secret: DEFAULT_CONNECTION_CONFIG.secret,
    hideDownloadBar: DEFAULT_DOWNLOAD_SETTINGS.hideDownloadBar,
    autoLaunchApp: DEFAULT_DOWNLOAD_SETTINGS.autoLaunchApp,
    forwardCookies: DEFAULT_DOWNLOAD_SETTINGS.forwardCookies,
    minimumFileSize: { ...DEFAULT_DOWNLOAD_SETTINGS.minimumFileSize },
  };
}

const discreteConfigProviderProps = computed(() => ({
  theme: naiveTheme.value,
  themeOverrides: themeOverrides.value,
  locale: naiveLocale.value,
  dateLocale: naiveDateLocale.value,
  inlineThemeDisabled: true,
}));

const { message: toast } = createDiscreteApi(['message'], {
  configProviderProps: discreteConfigProviderProps,
});

const {
  form,
  isDirty,
  handleSave: rawSave,
  handleReset: rawReset,
  resetSnapshot,
} = usePreferenceForm<SettingsForm>({
  buildForm,
  persist: async (f) => {
    await storageService.updateConnectionConfig({
      port: f.port,
      secret: f.secret,
    });
    await storageService.updateSettings({
      hideDownloadBar: f.hideDownloadBar,
      autoLaunchApp: f.autoLaunchApp,
      forwardCookies: f.forwardCookies,
      minimumFileSize: f.minimumFileSize,
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

async function handleEnabledChange(value: boolean): Promise<void> {
  const previous = interceptionEnabled.value;
  interceptionEnabled.value = value;
  try {
    await storageService.updateSettings({ enabled: value });
  } catch {
    interceptionEnabled.value = previous;
    toast.error(i18n('options_save_error', 'Failed to save settings'));
  }
}

async function handleInterceptionScopeChange(value: Partial<InterceptionScope>): Promise<void> {
  const previous = { ...interceptionScope.value };
  interceptionScope.value = { ...interceptionScope.value, ...value };
  try {
    await storageService.updateSettings({ interceptionScope: interceptionScope.value });
  } catch {
    interceptionScope.value = previous;
    toast.error(i18n('options_save_error', 'Failed to save settings'));
  }
}

function handleMinimumFileSizeChange(value: Partial<MinimumFileSizeSettings>): void {
  form.value.minimumFileSize = { ...form.value.minimumFileSize, ...value };
}

async function handleHideDownloadBarChange(value: boolean): Promise<void> {
  if (!value) {
    form.value.hideDownloadBar = false;
    return;
  }

  const granted = await permissionService.requestDownloadUiAccess().catch(() => false);
  if (granted) {
    form.value.hideDownloadBar = true;
    return;
  }

  form.value.hideDownloadBar = false;
  toast.warning(
    i18n(
      'options_permission_download_ui_denied',
      'Grant download UI permission to hide the browser download bar.',
    ),
  );
}

async function handleForwardCookiesChange(value: boolean): Promise<void> {
  if (!value) {
    form.value.forwardCookies = false;
    return;
  }

  const granted = await permissionService.requestCookieForwardingAccess().catch(() => false);
  if (granted) {
    form.value.forwardCookies = true;
    return;
  }

  form.value.forwardCookies = false;
  toast.warning(
    i18n(
      'options_permission_cookies_denied',
      'Grant cookie and site permissions to forward cookies to Motrix Next.',
    ),
  );
}

// ─── Connection Test ────────────────────────────────────────────────

const connectionForTest = computed<ConnectionConfig>(() => ({
  port: form.value.port,
  secret: form.value.secret,
}));

const { connectionStatus, connectionVersion, connectionError, testingConnection, testConnection } =
  useConnectionTest(connectionForTest);

// ─── Extension Version ─────────────────────────────────────────────

const extensionVersion = browser.runtime.getManifest().version;
type StorageChangeListener = Parameters<typeof browser.storage.onChanged.addListener>[0];
let stopThemeMediaListener: (() => void) | null = null;
let stopStorageListener: (() => void) | null = null;

// ─── Load from Storage ──────────────────────────────────────────────

async function loadFromStorage(): Promise<void> {
  const { storage: data } = await storageService.load();

  // Hydrate dirty-tracked form (schema-validated, no casts)
  form.value.port = data.connection.port;
  form.value.secret = data.connection.secret;
  interceptionEnabled.value = data.settings.enabled;
  interceptionScope.value = data.settings.interceptionScope;
  form.value.minimumFileSize = data.settings.minimumFileSize;
  form.value.hideDownloadBar =
    data.settings.hideDownloadBar &&
    (await permissionService.hasDownloadUiAccess().catch(() => false));
  form.value.autoLaunchApp = data.settings.autoLaunchApp;
  form.value.forwardCookies =
    data.settings.forwardCookies &&
    (await permissionService.hasCookieForwardingAccess().catch(() => false));
  resetSnapshot();

  // Hydrate composables (already type-safe from Zod)
  appearance.hydrate(data.uiPrefs);
  i18nCtx.setLocale(data.uiPrefs.locale);
  hydrateSiteRules(data.siteRules);
  hydrateDiagnostics(data.diagnosticLog);
}

function applyConnectionStorageChange(value: unknown): void {
  const connection = parseConnectionConfig(value);
  form.value.port = connection.port;
  form.value.secret = connection.secret;
}

async function applySettingsStorageChange(value: unknown): Promise<void> {
  const settings = parseDownloadSettings(value);
  interceptionEnabled.value = settings.enabled;
  interceptionScope.value = settings.interceptionScope;
  if (isDirty.value) return;

  form.value.minimumFileSize = settings.minimumFileSize;
  form.value.hideDownloadBar =
    settings.hideDownloadBar && (await permissionService.hasDownloadUiAccess().catch(() => false));
  form.value.autoLaunchApp = settings.autoLaunchApp;
  form.value.forwardCookies =
    settings.forwardCookies &&
    (await permissionService.hasCookieForwardingAccess().catch(() => false));
}

function applyUiPrefsStorageChange(value: unknown): void {
  const prefs = parseUiPrefs(value);
  appearance.hydrate(prefs);
  i18nCtx.setLocale(prefs.locale);
  appearance.applyTheme();
}

// ─── Lifecycle ──────────────────────────────────────────────────────

function onBeforeUnload(e: globalThis.BeforeUnloadEvent): void {
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

function bindThemeMediaChanges(): void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleMediaChange = (): void => {
    appearance.applyTheme();
  };
  mediaQuery.addEventListener('change', handleMediaChange);
  stopThemeMediaListener = () => mediaQuery.removeEventListener('change', handleMediaChange);
}

function bindStorageChanges(): void {
  const handleStorageChange: StorageChangeListener = (changes, area) => {
    if (area !== 'local') return;

    if (changes.connection?.newValue && !isDirty.value) {
      applyConnectionStorageChange(changes.connection.newValue);
      resetSnapshot();
    }

    if (changes.settings?.newValue) {
      void applySettingsStorageChange(changes.settings.newValue).then(() => {
        if (!isDirty.value) resetSnapshot();
      });
    }

    if (changes.siteRules?.newValue) {
      hydrateSiteRules(parseSiteRules(changes.siteRules.newValue));
    }

    if (changes.uiPrefs?.newValue) {
      applyUiPrefsStorageChange(changes.uiPrefs.newValue);
    }

    if (changes.diagnosticLog?.newValue) {
      hydrateDiagnostics(changes.diagnosticLog.newValue as DiagnosticEvent[]);
    }
  };

  browser.storage.onChanged.addListener(handleStorageChange);
  stopStorageListener = () => browser.storage.onChanged.removeListener(handleStorageChange);
}

onMounted(() => {
  void loadFromStorage().then(() => appearance.applyTheme());
  bindThemeMediaChanges();
  bindStorageChanges();
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
  stopThemeMediaListener?.();
  stopStorageListener?.();
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
    <div class="options-root">
      <!-- ── Header ──────────────────────────────────────────── -->
      <header class="options-header">
        <div class="options-header__brand">
          <div class="options-header__icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="18" viewBox="0 0 40 18">
              <rect
                x="0.5"
                y="0.5"
                width="39"
                height="17"
                rx="4"
                fill="none"
                stroke="currentColor"
                stroke-width="1"
                opacity="0.6"
              />
              <text
                x="20"
                y="13"
                fill="currentColor"
                font-family="Arial, Helvetica, sans-serif"
                font-weight="900"
                font-size="10"
                text-anchor="middle"
                letter-spacing="1"
              >
                NEXT
              </text>
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
              <h2 class="section-title">
                {{ i18n('options_section_behavior', 'Download Behavior') }}
              </h2>
              <div class="card">
                <BehaviorSection
                  :enabled="interceptionEnabled"
                  :interception-scope="interceptionScope"
                  :minimum-file-size="form.minimumFileSize"
                  :hide-download-bar="form.hideDownloadBar"
                  :auto-launch-app="form.autoLaunchApp"
                  :forward-cookies="form.forwardCookies"
                  @update:enabled="handleEnabledChange"
                  @update:scope="handleInterceptionScopeChange"
                  @update:minimum-file-size="handleMinimumFileSizeChange"
                  @update:hide-download-bar="handleHideDownloadBarChange"
                  @update:auto-launch-app="form.autoLaunchApp = $event"
                  @update:forward-cookies="handleForwardCookiesChange"
                />
                <SettingsActionBar :is-dirty="isDirty" @save="handleSave" @discard="handleReset" />
              </div>
            </div>

            <!-- Site Rules -->
            <div v-else-if="activeSection === 'rules'" key="rules" class="section-wrapper">
              <h2 class="section-title">{{ i18n('options_section_rules', 'Site Rules') }}</h2>
              <div class="card">
                <SiteRulesSection :rules="siteRules" @add="addRule" @remove="removeRule" />
              </div>
            </div>

            <!-- Appearance -->
            <div
              v-else-if="activeSection === 'appearance'"
              key="appearance"
              class="section-wrapper"
            >
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

            <!-- Language -->
            <div v-else-if="activeSection === 'language'" key="language" class="section-wrapper">
              <h2 class="section-title">
                {{ i18nBilingual('options_section_language', 'Language') }}
              </h2>
              <div class="card">
                <LanguageSection
                  :locale="i18nCtx.locale.value"
                  @update:locale="
                    (v: string) => {
                      i18nSetLocale(v);
                      appearance.handleLocaleChange(v);
                    }
                  "
                />
              </div>
            </div>

            <!-- Diagnostics -->
            <div
              v-else-if="activeSection === 'diagnostics'"
              key="diagnostics"
              class="section-wrapper"
            >
              <h2 class="section-title">
                {{ i18n('options_section_diagnostics', 'Diagnostics') }}
              </h2>
              <div class="card">
                <DiagnosticsSection
                  :events="diagnosticEvents"
                  @clear="clearDiagnosticLog"
                  @export="exportDiagnosticReport"
                />
              </div>
            </div>
          </Transition>
        </main>
      </div>

      <!-- ── Footer ──────────────────────────────────────────── -->
      <footer class="options-footer">
        {{
          i18nSub(
            'options_footer',
            [extensionVersion],
            `Motrix Next Extension v${extensionVersion}`,
          )
        }}
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
  width: 100%;
  margin: 0 auto;
  padding: 16px 24px;
}

.options-content {
  flex: 3;
  min-width: 0;
  padding: 8px 32px 32px 16px;
  border-left: 1px solid var(--color-outline-variant);
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
