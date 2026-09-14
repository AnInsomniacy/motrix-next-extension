<script lang="ts" setup>
/**
 * Options page root.
 *
 * State model — one snapshot, one dirty flag:
 *   - `draft`  : the full StorageSnapshot the UI edits
 *   - `saved`  : the last persisted baseline
 *   - `staged` : when a factory reset or backup import is pending, ALL
 *                changes stay local until Save writes the whole snapshot
 *
 * Two persistence classes:
 *   - immediate (enabled, scope, site rules, uiPrefs) — written
 *     on change unless `staged`
 *   - draft-tracked (connection + behavior/rules details) — written on Save,
 *     compared through `draftView()` for the dirty flag
 */
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import type { UiPrefs as InitialUiPrefs } from '@/lib/schema';
import { OpenOutline, InformationCircleOutline } from '@vicons/ionicons5';
import { parseDesktopActionResponse } from '@/lib/desktop';
import { NConfigProvider, NButton, NPopover, NIcon, createDiscreteApi } from 'naive-ui';
import {
  loadSnapshot,
  saveConnectionConfig,
  saveDiagnosticSettings,
  saveSiteRules,
  saveSnapshot,
  updateSettings,
  updateUiPrefs,
} from '@/lib/storage';
import {
  createDefaultSnapshot,
  parseConnectionConfig,
  parseDiagnosticSettings,
  parseDiagnosticEvents,
  parseDownloadSettings,
  parseSiteRules,
  parseUiPrefs,
  type DownloadSettings,
  type DiagnosticEvent,
  type InterceptionScope,
  type SiteRule,
  type StorageSnapshot,
  type ThemePreference,
  type UiPrefs,
} from '@/lib/schema';
import { createSettingsBackup, parseSettingsBackup } from '@/lib/backup';
import { DesktopApiClient, checkConnection, type ConnectionStatus } from '@/lib/api';
import {
  hasCookieForwardingAccess,
  hasDownloadUiAccess,
  requestCookieForwardingAccess,
  requestDownloadUiAccess,
} from '@/lib/browser';
import { CUSTOM_COLOR_SCHEME_ID, normalizeCustomColorScheme } from '@/shared/color-schemes';
import { deepEqual, jsonClone } from '@/shared/json';
import { useAppTheme } from '@/shared/theme';
import { createI18n, I18N_KEY, useNaiveLocale } from '@/shared/i18n/engine';

import OptionsNav from './components/OptionsNav.vue';
import SettingsPage from './components/SettingsPage.vue';
import ConnectionSection from './components/ConnectionSection.vue';
import BehaviorSection from './components/BehaviorSection.vue';
import RulesSection from './components/RulesSection.vue';
import AppearanceSection from './components/AppearanceSection.vue';
import MaintenanceSection from './components/MaintenanceSection.vue';
import SettingsActionBar from './components/SettingsActionBar.vue';
import LanguageSection from './components/LanguageSection.vue';
import BrandLogo from '@/shared/components/BrandLogo.vue';

// ─── Theme + i18n ───────────────────────────────────────

const theme = useAppTheme();
const props = defineProps<{ prefs?: InitialUiPrefs }>();
const i18nCtx = createI18n(props.prefs?.locale ?? 'auto', { localeApi: browser.i18n });
provide(I18N_KEY, i18nCtx);
const { t: i18n, tSub: i18nSub, effectiveLocale } = i18nCtx;
const { naiveLocale, naiveDateLocale, naiveRtl } = useNaiveLocale(effectiveLocale);

const { message: toast } = createDiscreteApi(['message'], {
  configProviderProps: computed(() => ({
    theme: theme.naiveTheme.value,
    themeOverrides: theme.themeOverrides.value,
    locale: naiveLocale.value,
    dateLocale: naiveDateLocale.value,
    rtl: naiveRtl.value,
    inlineThemeDisabled: true,
    preflightStyleDisabled: true,
  })),
});

// ─── State ──────────────────────────────────────────────

const activeSection = ref('general');
function selectSection(id: string): void {
  activeSection.value = id;
}
const saving = ref(false);
const immediatePending = ref(false);
const permissionPending = ref(false);
const importing = ref(false);
const loading = ref(true);
const controlsDisabled = computed(
  () =>
    saving.value ||
    loading.value ||
    immediatePending.value ||
    permissionPending.value ||
    importing.value,
);
const opening = ref(false);
let disposed = false;
let draftRevision = 0;
async function openDesktop() {
  if (opening.value) return;
  opening.value = true;
  try {
    const result = parseDesktopActionResponse(
      await browser.runtime.sendMessage({ type: 'OPEN_DESKTOP' }),
    );
    if (!result.ok) throw new Error('Activation rejected');
  } catch {
    toast.error(i18n('popup_action_failed'));
  } finally {
    opening.value = false;
  }
}

const canControlDownloadUi = !import.meta.env.FIREFOX;
const extensionVersion = browser.runtime.getManifest().version;

const draft = ref<StorageSnapshot>(createDefaultSnapshot());
const saved = ref<StorageSnapshot>(createDefaultSnapshot());
const diagnosticEvents = ref<DiagnosticEvent[]>([]);
const staged = ref<null | 'factory-reset' | 'backup-import'>(null);

/** The draft-tracked (Save/Discard) subset of a snapshot. */
function draftView(s: StorageSnapshot) {
  const { enabled: _e, interceptionScope: _s, ...tracked } = s.settings;
  return { connection: s.connection, diagnostics: s.diagnostics, ...tracked };
}

const isDirty = computed(
  () => staged.value !== null || !deepEqual(draftView(draft.value), draftView(saved.value)),
);

// ─── Immediate Persistence ──────────────────────────────

/** Immediate settings are a single user operation; failed writes restore their baseline. */
async function changeImmediate(
  change: (snapshot: StorageSnapshot) => void,
  persist: (snapshot: StorageSnapshot) => Promise<void>,
): Promise<boolean> {
  if (
    saving.value ||
    loading.value ||
    immediatePending.value ||
    permissionPending.value ||
    importing.value
  )
    return false;
  const previous = jsonClone(draft.value);
  change(draft.value);
  applyUiSideEffects(draft.value.uiPrefs);
  if (staged.value) return true;
  const snapshot = jsonClone(draft.value);
  const current = draftRevision;
  immediatePending.value = true;
  try {
    await persist(snapshot);
    if (!disposed && current === draftRevision) {
      saved.value.settings.enabled = snapshot.settings.enabled;
      saved.value.settings.interceptionScope = jsonClone(snapshot.settings.interceptionScope);
      saved.value.siteRules = jsonClone(snapshot.siteRules);
      saved.value.uiPrefs = jsonClone(snapshot.uiPrefs);
    }
    return true;
  } catch {
    if (!disposed && current === draftRevision) {
      draft.value.settings.enabled = previous.settings.enabled;
      draft.value.settings.interceptionScope = previous.settings.interceptionScope;
      draft.value.siteRules = previous.siteRules;
      draft.value.uiPrefs = previous.uiPrefs;
      applyUiSideEffects(previous.uiPrefs);
      toast.error(i18n('options_save_error'));
    }
    return false;
  } finally {
    immediatePending.value = false;
  }
}
function handleEnabledChange(value: boolean) {
  void changeImmediate(
    (s) => {
      s.settings.enabled = value;
    },
    () => updateSettings({ enabled: value }),
  );
}
function handleInterceptionScopeChange(value: Partial<InterceptionScope>) {
  void changeImmediate(
    (s) => {
      s.settings.interceptionScope = { ...s.settings.interceptionScope, ...value };
    },
    (s) => updateSettings({ interceptionScope: s.settings.interceptionScope }),
  );
}
function handleAddSiteRule(rule: Omit<SiteRule, 'id'>) {
  return changeImmediate(
    (s) => {
      s.siteRules.push({ ...rule, id: window.crypto.randomUUID() });
    },
    (s) => saveSiteRules(s.siteRules),
  );
}
function handleRemoveSiteRule(id: string) {
  void changeImmediate(
    (s) => {
      s.siteRules = s.siteRules.filter((rule) => rule.id !== id);
    },
    (s) => saveSiteRules(s.siteRules),
  );
}
function handleThemeChange(value: string) {
  void changeImmediate(
    (s) => {
      s.uiPrefs.theme = value as ThemePreference;
    },
    (s) => updateUiPrefs({ theme: s.uiPrefs.theme }),
  );
}
function handleColorSchemeChange(value: string) {
  void changeImmediate(
    (s) => {
      s.uiPrefs.colorScheme = value;
    },
    () => updateUiPrefs({ colorScheme: value }),
  );
}
function handleCustomColorChange(value: string) {
  const customColorScheme = normalizeCustomColorScheme(value);
  void changeImmediate(
    (snapshot) => {
      snapshot.uiPrefs.colorScheme = CUSTOM_COLOR_SCHEME_ID;
      snapshot.uiPrefs.customColorScheme = customColorScheme;
    },
    () => updateUiPrefs({ colorScheme: CUSTOM_COLOR_SCHEME_ID, customColorScheme }),
  );
}
function handleLocaleChange(value: string) {
  void changeImmediate(
    (s) => {
      s.uiPrefs.locale = value;
    },
    () => updateUiPrefs({ locale: value }),
  );
}

async function handleClearDiagnosticLog(): Promise<void> {
  try {
    const response: unknown = await browser.runtime.sendMessage({ type: 'CLEAR_DIAGNOSTICS' });
    if (
      response !== null &&
      typeof response === 'object' &&
      'ok' in response &&
      response.ok === true
    ) {
      diagnosticEvents.value = [];
      return;
    }
  } catch {
    // The shared error message below covers transport and persistence failures.
  }
  toast.error(i18n('options_diagnostics_clear_error', 'Failed to clear diagnostic events'));
}

async function getDiagnosticEvents(): Promise<DiagnosticEvent[]> {
  const response: unknown = await browser.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' });
  if (response === null || typeof response !== 'object' || !('events' in response)) {
    throw new Error('Diagnostic journal unavailable');
  }
  return parseDiagnosticEvents(response.events);
}

// ─── Permission-gated Toggles ───────────────────────────

async function requestSettingPermission(
  key: 'hideDownloadBar' | 'forwardCookies',
  value: boolean,
  request: () => Promise<boolean>,
  deniedKey: string,
): Promise<void> {
  if (
    permissionPending.value ||
    saving.value ||
    loading.value ||
    immediatePending.value ||
    importing.value
  )
    return;
  if (!value) {
    draft.value.settings[key] = false;
    return;
  }
  const current = draftRevision;
  permissionPending.value = true;
  try {
    const allowed = await request().catch(() => false);
    if (disposed || current !== draftRevision) return;
    draft.value.settings[key] = allowed;
    if (!allowed) toast.warning(i18n(deniedKey));
  } finally {
    permissionPending.value = false;
  }
}
function handleHideDownloadBarChange(value: boolean) {
  return requestSettingPermission(
    'hideDownloadBar',
    value && canControlDownloadUi,
    requestDownloadUiAccess,
    'options_permission_download_ui_denied',
  );
}
function handleForwardCookiesChange(value: boolean) {
  return requestSettingPermission(
    'forwardCookies',
    value,
    requestCookieForwardingAccess,
    'options_permission_cookies_denied',
  );
}

// ─── Save / Discard ─────────────────────────────────────

async function handleSave(): Promise<void> {
  if (
    saving.value ||
    loading.value ||
    immediatePending.value ||
    permissionPending.value ||
    importing.value ||
    !isDirty.value
  )
    return;
  saving.value = true;
  const snapshot = jsonClone(draft.value);
  try {
    if (staged.value) {
      await saveSnapshot(snapshot);
      staged.value = null;
    } else {
      await saveConnectionConfig(snapshot.connection);
      await saveDiagnosticSettings(snapshot.diagnostics);
      const { enabled: _e, interceptionScope: _s, ...tracked } = snapshot.settings;
      await updateSettings({
        ...tracked,
        hideDownloadBar: canControlDownloadUi && tracked.hideDownloadBar,
      });
    }
    saved.value = snapshot;
    toast.success(i18n('options_save_success'));
  } catch {
    toast.error(i18n('options_save_error'));
  } finally {
    saving.value = false;
  }
}

async function handleDiscard(): Promise<void> {
  if (
    saving.value ||
    loading.value ||
    immediatePending.value ||
    permissionPending.value ||
    importing.value
  )
    return;
  draftRevision++;
  try {
    if (staged.value) {
      loading.value = true;
      await loadFromStorage();
      staged.value = null;
    } else {
      draft.value = jsonClone(saved.value);
    }
    applyUiSideEffects(draft.value.uiPrefs);
    toast.info(i18n('options_discard_success'));
  } catch {
    toast.error(i18n('options_save_error'));
  } finally {
    loading.value = false;
  }
}

// ─── Staged Snapshots (factory reset / backup import) ───

function stageSnapshot(snapshot: StorageSnapshot, mode: 'factory-reset' | 'backup-import'): void {
  if (saving.value || immediatePending.value || permissionPending.value || importing.value) return;
  draftRevision++;
  draft.value = snapshot;
  staged.value = mode;
  applyUiSideEffects(snapshot.uiPrefs);
}

function stageFactoryReset(): void {
  stageSnapshot(createDefaultSnapshot(), 'factory-reset');
  toast.info(i18n('options_factory_reset_ready', 'Defaults ready to save'));
}

async function importSettingsBackup(file: globalThis.File): Promise<void> {
  if (saving.value || importing.value || immediatePending.value || permissionPending.value) return;
  importing.value = true;
  try {
    const current = draftRevision;
    const snapshot = parseSettingsBackup(await file.text());
    if (disposed || saving.value || current !== draftRevision) return;
    importing.value = false;
    stageSnapshot(snapshot, 'backup-import');
    toast.info(i18n('options_settings_backup_imported', 'Settings imported. Review and save.'));
  } catch {
    toast.error(i18n('options_settings_backup_invalid', 'Invalid backup file'));
  } finally {
    importing.value = false;
  }
}

// ─── Backup / Diagnostics Export ────────────────────────

function downloadJson(filename: string, data: unknown): void {
  // A data URI avoids waking the service worker for an extension-owned blob download.
  const json = JSON.stringify(data, null, 2);
  const a = document.createElement('a');
  a.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  a.download = filename;
  a.click();
}

function exportSettingsBackup(): void {
  try {
    const backup = createSettingsBackup(draft.value, {
      extensionVersion,
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`rayburst-connect-settings-backup-${date}.json`, backup);
    toast.success(i18n('options_settings_backup_exported', 'Backup exported'));
  } catch {
    toast.error(i18n('options_settings_backup_export_error', 'Failed to export backup'));
  }
}

async function exportDiagnosticReport(): Promise<void> {
  try {
    const { connection, settings, siteRules, uiPrefs, diagnostics } = draft.value;
    const [diagnosticLog, permissions] = await Promise.all([
      getDiagnosticEvents(),
      browser.permissions.getAll(),
    ]);
    downloadJson(`rayburst-diagnostic-${Date.now()}.json`, {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      extension: {
        id: browser.runtime.id,
        version: extensionVersion,
        manifestVersion: browser.runtime.getManifest().manifest_version,
      },
      browser: { userAgent: navigator.userAgent, language: navigator.language },
      permissions,
      config: { connection: { port: connection.port }, settings, siteRules, uiPrefs, diagnostics },
      diagnosticLog,
    });
  } catch {
    toast.error(i18n('options_diagnostics_export_error', 'Failed to export diagnostic report'));
  }
}

// ─── Connection Test ────────────────────────────────────

const connectionStatus = ref<ConnectionStatus>('disconnected');
const connectionVersion = ref<string | null>(null);
const connectionError = ref<string | null>(null);
const testingConnection = ref(false);
const connectionResultRevision = ref(0);

let connectionRevision = 0;
watch(
  () => [draft.value.connection.port, draft.value.connection.secret],
  () => {
    connectionRevision++;
    testingConnection.value = false;
    connectionStatus.value = 'disconnected';
    connectionVersion.value = null;
    connectionError.value = null;
  },
  { flush: 'sync' },
);
async function testConnection(): Promise<void> {
  if (testingConnection.value) return;
  const current = ++connectionRevision;
  testingConnection.value = true;
  // Keep the last result visible until this request settles.
  try {
    const result = await checkConnection(new DesktopApiClient({ ...draft.value.connection }));
    if (disposed || current !== connectionRevision) return;
    connectionStatus.value = result.status;
    connectionVersion.value = result.version;
    connectionError.value = result.status === 'disconnected' ? result.error : null;
  } catch {
    if (!disposed && current === connectionRevision) connectionError.value = 'UnknownError';
  } finally {
    if (!disposed && current === connectionRevision) {
      connectionResultRevision.value++;
      testingConnection.value = false;
    }
  }
}

// ─── Load + Live Sync ───────────────────────────────────

function applyUiSideEffects(prefs: UiPrefs): void {
  theme.configure(prefs);
  i18nCtx.setLocale(prefs.locale);
}

/** Reflect actually-granted permissions in permission-gated toggles. */
async function gatePermissions(settings: DownloadSettings): Promise<void> {
  settings.hideDownloadBar =
    canControlDownloadUi &&
    settings.hideDownloadBar &&
    (await hasDownloadUiAccess().catch(() => false));
  settings.forwardCookies =
    settings.forwardCookies && (await hasCookieForwardingAccess().catch(() => false));
}

async function loadFromStorage(): Promise<void> {
  const [data, events] = await Promise.all([loadSnapshot(), getDiagnosticEvents().catch(() => [])]);
  await gatePermissions(data.settings);
  if (disposed) return;
  draft.value = data;
  saved.value = jsonClone(data);
  diagnosticEvents.value = events;
  applyUiSideEffects(data.uiPrefs);
}

let stopStorageListener: (() => void) | null = null;

function bindStorageChanges(): void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local') return;

    if (changes.diagnosticLog?.newValue) {
      diagnosticEvents.value = parseDiagnosticEvents(changes.diagnosticLog.newValue);
    }

    if (staged.value || saving.value || immediatePending.value) return;

    if (changes.connection?.newValue && !isDirty.value) {
      const connection = parseConnectionConfig(changes.connection.newValue);
      draft.value.connection = connection;
      saved.value.connection = jsonClone(connection);
    }

    if (changes.settings?.newValue) {
      const settings = parseDownloadSettings(changes.settings.newValue);
      const current = draftRevision;
      void gatePermissions(settings).then(() => {
        if (
          disposed ||
          staged.value ||
          saving.value ||
          immediatePending.value ||
          current !== draftRevision
        )
          return;
        // Immediate-class fields always follow storage; draft-tracked fields
        // only when there are no unsaved local edits.
        const dirty = isDirty.value;
        saved.value.settings = jsonClone(settings);
        if (dirty) {
          draft.value.settings.enabled = settings.enabled;
          draft.value.settings.interceptionScope = settings.interceptionScope;
        } else {
          draft.value.settings = jsonClone(settings);
        }
      });
    }

    if (changes.siteRules?.newValue) {
      draft.value.siteRules = parseSiteRules(changes.siteRules.newValue);
      saved.value.siteRules = jsonClone(draft.value.siteRules);
    }

    if (changes.uiPrefs?.newValue) {
      const prefs = parseUiPrefs(changes.uiPrefs.newValue);
      draft.value.uiPrefs = prefs;
      saved.value.uiPrefs = jsonClone(prefs);
      applyUiSideEffects(prefs);
    }

    if (changes.diagnostics?.newValue && !isDirty.value) {
      const diagnostics = parseDiagnosticSettings(changes.diagnostics.newValue);
      draft.value.diagnostics = diagnostics;
      saved.value.diagnostics = jsonClone(diagnostics);
    }
  };

  browser.storage.onChanged.addListener(listener);
  stopStorageListener = () => browser.storage.onChanged.removeListener(listener);
}

// ─── Lifecycle ──────────────────────────────────────────

function onBeforeUnload(e: globalThis.BeforeUnloadEvent): void {
  if (isDirty.value) e.preventDefault();
}

watch(isDirty, (dirty) => {
  if (dirty) window.addEventListener('beforeunload', onBeforeUnload);
  else window.removeEventListener('beforeunload', onBeforeUnload);
});

onMounted(async () => {
  try {
    await loadFromStorage();
    if (!disposed) bindStorageChanges();
  } catch {
    toast.error(i18n('options_save_error'));
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  disposed = true;
  draftRevision++;
  connectionRevision++;
  window.removeEventListener('beforeunload', onBeforeUnload);
  stopStorageListener?.();
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
    <div class="options-root" :dir="['ar', 'fa'].includes(effectiveLocale) ? 'rtl' : 'ltr'">
      <aside class="options-sidebar">
        <div class="options-brand">
          <BrandLogo :size="30" /><span>Rayburst<span class="brand-edition">Connect</span></span>
        </div>
        <OptionsNav :active="activeSection" @select="selectSection" />
        <div class="sidebar-footer">
          <NButton text :loading="opening" @click="openDesktop"
            ><template #icon
              ><NIcon :size="16"><OpenOutline /></NIcon></template
            >{{ i18n('popup_action_open') }}</NButton
          >
          <NPopover trigger="click" placement="right-end"
            ><template #trigger
              ><NButton text
                ><template #icon
                  ><NIcon :size="16"><InformationCircleOutline /></NIcon></template
                >{{ i18n('options_about') }}</NButton
              ></template
            >{{ i18nSub('options_footer', [extensionVersion]) }}</NPopover
          >
        </div>
      </aside>
      <div class="options-body">
        <main class="options-pages" :aria-busy="loading">
          <SettingsPage
            id="general"
            :active="activeSection === 'general'"
            :title="i18n('options_section_general')"
            :disabled="controlsDisabled"
          >
            <div class="settings-section">
              <ConnectionSection
                :port="draft.connection.port"
                :secret="draft.connection.secret"
                :status="connectionStatus"
                :version="connectionVersion"
                :error="connectionError"
                :testing="testingConnection"
                :result-revision="connectionResultRevision"
                @update:port="draft.connection.port = $event"
                @update:secret="draft.connection.secret = $event"
                @test="testConnection"
              /><AppearanceSection
                :active="activeSection === 'general'"
                :theme="draft.uiPrefs.theme"
                :color-scheme="draft.uiPrefs.colorScheme"
                :custom-color-scheme="draft.uiPrefs.customColorScheme"
                @update:theme="handleThemeChange"
                @update:color-scheme="handleColorSchemeChange"
                @update:custom-color-scheme="handleCustomColorChange"
              >
                <LanguageSection
                  :locale="draft.uiPrefs.locale"
                  @update:locale="handleLocaleChange"
                />
              </AppearanceSection>
            </div>
          </SettingsPage>
          <SettingsPage
            id="behavior"
            :active="activeSection === 'behavior'"
            :title="i18n('options_section_behavior')"
            :disabled="controlsDisabled"
          >
            <BehaviorSection
              :enabled="draft.settings.enabled"
              :interception-scope="draft.settings.interceptionScope"
              :hide-download-bar="draft.settings.hideDownloadBar"
              :can-control-download-ui="canControlDownloadUi"
              :desktop-unavailable="draft.settings.desktopUnavailable"
              :forward-request-headers="draft.settings.forwardRequestHeaders"
              :forward-cookies="draft.settings.forwardCookies"
              :media-discovery="draft.settings.mediaDiscovery"
              @update:enabled="handleEnabledChange"
              @update:scope="handleInterceptionScopeChange"
              @update:hide-download-bar="handleHideDownloadBarChange"
              @update:desktop-unavailable="
                draft.settings.desktopUnavailable = {
                  ...draft.settings.desktopUnavailable,
                  ...$event,
                }
              "
              @update:forward-request-headers="draft.settings.forwardRequestHeaders = $event"
              @update:forward-cookies="handleForwardCookiesChange"
              @update:media-discovery="
                draft.settings.mediaDiscovery = {
                  ...draft.settings.mediaDiscovery,
                  ...$event,
                }
              "
            />
          </SettingsPage>
          <SettingsPage
            id="rules"
            :active="activeSection === 'rules'"
            :title="i18n('options_section_rules')"
            :disabled="controlsDisabled"
          >
            <RulesSection
              :duplicate-guard="draft.settings.duplicateGuard"
              :minimum-file-size="draft.settings.minimumFileSize"
              :file-extension-rule="draft.settings.fileExtensionRule"
              :site-rules="draft.siteRules"
              @update:duplicate-guard="
                draft.settings.duplicateGuard = {
                  ...draft.settings.duplicateGuard,
                  ...$event,
                }
              "
              @update:minimum-file-size="
                draft.settings.minimumFileSize = {
                  ...draft.settings.minimumFileSize,
                  ...$event,
                }
              "
              @update:file-extension-rule="
                draft.settings.fileExtensionRule = {
                  ...draft.settings.fileExtensionRule,
                  ...$event,
                }
              "
              :add-rule="handleAddSiteRule"
              @remove-site-rule="handleRemoveSiteRule"
            />
          </SettingsPage>
          <SettingsPage
            id="diagnostics"
            :active="activeSection === 'diagnostics'"
            :title="i18n('options_section_maintenance')"
            :disabled="controlsDisabled"
            wide
          >
            <MaintenanceSection
              :events="diagnosticEvents"
              :max-diagnostic-events="draft.diagnostics.maxEvents"
              @update:max-diagnostic-events="draft.diagnostics.maxEvents = $event"
              @export-settings="exportSettingsBackup"
              @import-settings="importSettingsBackup"
              @reset-settings="stageFactoryReset"
              @clear-diagnostics="handleClearDiagnosticLog"
              @export-diagnostics="exportDiagnosticReport"
            />
          </SettingsPage>
        </main>
        <SettingsActionBar
          :is-dirty="isDirty"
          :saving="saving"
          :disabled="loading || immediatePending || permissionPending || importing"
          @save="handleSave"
          @discard="handleDiscard"
        />
      </div>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.options-root {
  display: flex;
  min-height: 360px;
  height: 100dvh;
  font: 14px/1.5 var(--font-sans);
  background: var(--color-surface);
  color: var(--color-on-surface);
}
.options-sidebar {
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 28px 12px 20px;
  background: var(--color-surface-container-low);
}
.options-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-inline: 8px;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.25;
}
.brand-edition {
  display: block;
  font-size: 12px;
  font-weight: 400;
  color: var(--color-on-surface-variant);
  margin-block-start: 2px;
}
.sidebar-footer {
  margin-block-start: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
  padding: 16px 8px 0;
  border-block-start: 1px solid var(--color-outline-variant);
}
.options-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.options-pages {
  flex: 1;
  min-height: 0;
  position: relative;
  display: grid;
  overflow: hidden;
}
@media (max-width: 640px) {
  .options-root {
    flex-direction: column;
  }
  .options-sidebar {
    flex: none;
    gap: 12px;
    padding: 16px;
  }
  .sidebar-footer {
    flex-direction: row;
    margin: 0;
    padding: 0;
  }
}
</style>
