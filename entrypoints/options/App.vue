<script lang="ts" setup>
import { ref, reactive, onMounted, watch } from 'vue';
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

// ─── Reactive State ─────────────────────────────────────

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

// ─── Rule Editor ────────────────────────────────────────

const newRulePattern = ref('');
const newRuleAction = ref<SiteRule['action']>('always-intercept');

function addRule(): void {
  if (!newRulePattern.value.trim()) return;
  siteRules.value.push({
    id: `rule-${Date.now()}`,
    pattern: newRulePattern.value.trim(),
    action: newRuleAction.value,
  });
  newRulePattern.value = '';
  saveToStorage();
}

function removeRule(id: string): void {
  siteRules.value = siteRules.value.filter((r) => r.id !== id);
  saveToStorage();
}

// ─── Save / Load ────────────────────────────────────────

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

// ─── Test Connection ────────────────────────────────────

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

// ─── Enhanced Permissions ───────────────────────────────

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

// ─── Diagnostics ────────────────────────────────────────

function copyDiagnosticLog(): void {
  const json = JSON.stringify(diagnosticEvents.value, null, 2);
  void navigator.clipboard.writeText(json);
}

function clearDiagnosticLog(): void {
  diagnosticEvents.value = [];
  void chrome.storage.local.set({ diagnosticLog: [] });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

// ─── i18n Helper ────────────────────────────────────────

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

function i18nSub(key: string, substitutions: string[], fallback: string): string {
  return chrome.i18n.getMessage(key, substitutions) || fallback;
}

const THEME_LABELS: Record<string, string> = {
  system: i18n('options_theme_system', 'System'),
  light: i18n('options_theme_light', 'Light'),
  dark: i18n('options_theme_dark', 'Dark'),
};

// ─── Theme ────────────────────────────────────────────────

function applyTheme(): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.className = resolveThemeClass(
    uiPrefs.theme as 'system' | 'light' | 'dark',
    systemDark,
  );
}

watch(
  () => uiPrefs.theme,
  () => applyTheme(),
);

// ─── Init ───────────────────────────────────────────────
onMounted(() => {
  void loadFromStorage().then(() => applyTheme());

  // Live-track system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
  });
});
</script>

<template>
  <div class="min-h-screen bg-surface text-on-surface">
    <div class="mx-auto max-w-2xl px-6 py-8">
      <!-- Header -->
      <header class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight">
          {{ i18n('options_header_title', 'Motrix Next') }}
        </h1>
        <p class="text-sm text-on-surface-variant mt-1">
          {{ i18n('options_header_subtitle', 'Extension Settings') }}
        </p>
      </header>

      <!-- Connection Section -->
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full"
            :class="connectionStatus === 'connected' ? 'bg-success' : 'bg-error'"
          />
          {{ i18n('options_section_connection', 'Connection') }}
        </h2>
        <div class="space-y-4 bg-surface-container rounded-lg p-4">
          <div class="grid grid-cols-2 gap-4">
            <label class="block">
              <span class="text-sm text-on-surface-variant">{{
                i18n('options_rpc_port_label', 'RPC Port')
              }}</span>
              <input
                v-model.number="rpc.port"
                type="number"
                min="1"
                max="65535"
                class="mt-1 w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label class="block">
              <span class="text-sm text-on-surface-variant">{{
                i18n('options_rpc_secret_label', 'RPC Secret')
              }}</span>
              <input
                v-model="rpc.secret"
                type="password"
                class="mt-1 w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>
          <div class="flex items-center gap-3">
            <button
              @click="testConnection"
              :disabled="testingConnection"
              class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors duration-medium ease-standard"
            >
              {{
                testingConnection
                  ? i18n('options_testing_connection', 'Testing...')
                  : i18n('options_test_connection', 'Test Connection')
              }}
            </button>
            <span v-if="connectionVersion" class="text-sm text-success">
              ✓ {{ i18n('options_connection_success_prefix', 'Connected · aria2') }}
              {{ connectionVersion }}
            </span>
            <span v-else-if="connectionError" class="text-sm text-error">
              ✗ {{ connectionError }}
            </span>
          </div>
        </div>
      </section>

      <!-- Behavior Section -->
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4">
          {{ i18n('options_section_behavior', 'Download Behavior') }}
        </h2>
        <div class="space-y-4 bg-surface-container rounded-lg p-4">
          <label class="flex items-center justify-between">
            <span class="text-sm">{{
              i18n('options_enabled_label', 'Enable Download Interception')
            }}</span>
            <input v-model="settings.enabled" type="checkbox" class="h-4 w-4 accent-brand-500" />
          </label>
          <label class="block">
            <span class="text-sm text-on-surface-variant">{{
              i18n('options_min_size_label', 'Minimum File Size (MB)')
            }}</span>
            <input
              v-model.number="settings.minFileSize"
              type="number"
              min="0"
              step="1"
              class="mt-1 w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm">{{
              i18n('options_fallback_label', 'Fallback to Browser on Failure')
            }}</span>
            <input
              v-model="settings.fallbackToBrowser"
              type="checkbox"
              class="h-4 w-4 accent-brand-500"
            />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm">{{
              i18n('options_notify_start_label', 'Notify on Download Start')
            }}</span>
            <input
              v-model="settings.notifyOnStart"
              type="checkbox"
              class="h-4 w-4 accent-brand-500"
            />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm">{{
              i18n('options_notify_complete_label', 'Notify on Download Complete')
            }}</span>
            <input
              v-model="settings.notifyOnComplete"
              type="checkbox"
              class="h-4 w-4 accent-brand-500"
            />
          </label>
        </div>
      </section>

      <!-- Site Rules Section -->
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4">
          {{ i18n('options_section_rules', 'Site Rules') }}
        </h2>
        <div class="bg-surface-container rounded-lg p-4">
          <div v-if="siteRules.length" class="space-y-2 mb-4">
            <div
              v-for="rule in siteRules"
              :key="rule.id"
              class="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm"
            >
              <code class="font-mono text-brand-600">{{ rule.pattern }}</code>
              <div class="flex items-center gap-2">
                <span
                  class="text-xs text-on-surface-variant px-2 py-0.5 rounded-full"
                  :class="{
                    'bg-success/10 text-success': rule.action === 'always-intercept',
                    'bg-error/10 text-error': rule.action === 'always-skip',
                    'bg-outline-variant/20': rule.action === 'use-global',
                  }"
                >
                  {{ rule.action }}
                </span>
                <button
                  @click="removeRule(rule.id)"
                  class="text-on-surface-variant hover:text-error transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-on-surface-variant mb-4">
            {{ i18n('options_rules_empty', 'No rules configured.') }}
          </p>
          <div class="flex gap-2">
            <input
              v-model="newRulePattern"
              type="text"
              placeholder="*.github.com"
              class="flex-1 rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              v-model="newRuleAction"
              class="rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="always-intercept">
                {{ i18n('options_rule_always_intercept', 'Always Intercept') }}
              </option>
              <option value="always-skip">
                {{ i18n('options_rule_always_skip', 'Always Skip') }}
              </option>
              <option value="use-global">
                {{ i18n('options_rule_use_global', 'Use Global') }}
              </option>
            </select>
            <button
              @click="addRule"
              class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              {{ i18n('options_add_rule', 'Add') }}
            </button>
          </div>
        </div>
      </section>

      <!-- Enhanced Permissions Section -->
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4">
          {{ i18n('options_section_enhanced', 'Enhanced Mode') }}
        </h2>
        <div class="bg-surface-container rounded-lg p-4 space-y-4">
          <p class="text-sm text-on-surface-variant">
            {{
              i18n(
                'options_enhanced_description',
                'Grant additional permissions for cookie forwarding and hiding the browser download bar.',
              )
            }}
            {{
              i18n(
                'options_enhanced_cookie_note',
                'Cookie forwarding is best-effort — it may not work for all sites due to browser privacy policies.',
              )
            }}
          </p>
          <div v-if="enhancedGranted" class="space-y-2">
            <p class="text-sm text-success font-medium">
              ✓ {{ i18n('options_enhanced_status_granted', 'Enhanced permissions granted') }}
            </p>
            <label class="flex items-center justify-between">
              <span class="text-sm">{{
                i18n('options_enhanced_hide_bar_label', 'Hide Browser Download Bar')
              }}</span>
              <input
                v-model="settings.hideDownloadBar"
                type="checkbox"
                class="h-4 w-4 accent-brand-500"
              />
            </label>
            <button @click="revokeEnhanced" class="text-sm text-error underline hover:no-underline">
              {{ i18n('options_enhanced_revoke', 'Revoke Permissions') }}
            </button>
          </div>
          <button
            v-else
            @click="grantEnhanced"
            class="rounded-md bg-surface border border-outline-variant px-4 py-2 text-sm hover:bg-surface-dim transition-colors"
          >
            {{ i18n('options_enhanced_grant', 'Grant Enhanced Permissions') }}
          </button>
        </div>
      </section>

      <!-- Appearance Section -->
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4">
          {{ i18n('options_section_appearance', 'Appearance') }}
        </h2>
        <div class="bg-surface-container rounded-lg p-4">
          <div class="flex gap-2">
            <button
              v-for="theme in ['system', 'light', 'dark'] as const"
              :key="theme"
              @click="uiPrefs.theme = theme"
              class="rounded-md px-4 py-2 text-sm capitalize transition-colors"
              :class="
                uiPrefs.theme === theme
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface border border-outline-variant hover:bg-surface-dim'
              "
            >
              {{ THEME_LABELS[theme] || theme }}
            </button>
          </div>
        </div>
      </section>

      <!-- Diagnostics Section -->
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-4">
          {{ i18n('options_section_diagnostics', 'Diagnostics') }}
        </h2>
        <div class="bg-surface-container rounded-lg p-4">
          <div class="flex gap-2 mb-4">
            <button
              @click="copyDiagnosticLog"
              class="rounded-md bg-surface border border-outline-variant px-4 py-2 text-sm hover:bg-surface-dim transition-colors"
            >
              {{ i18n('options_diagnostics_copy', 'Copy Log (JSON)') }}
            </button>
            <button
              @click="clearDiagnosticLog"
              class="rounded-md border border-error/30 px-4 py-2 text-sm text-error hover:bg-error/5 transition-colors"
            >
              {{ i18n('options_diagnostics_clear', 'Clear Log') }}
            </button>
          </div>
          <div v-if="diagnosticEvents.length" class="max-h-64 overflow-y-auto space-y-1">
            <div
              v-for="event in [...diagnosticEvents].reverse()"
              :key="event.id"
              class="flex gap-2 text-xs font-mono rounded px-2 py-1"
              :class="{
                'bg-success/5': event.level === 'info',
                'bg-warning/5': event.level === 'warn',
                'bg-error/5': event.level === 'error',
              }"
            >
              <span class="text-on-surface-variant shrink-0">{{ formatTime(event.ts) }}</span>
              <span
                :class="{
                  'text-success': event.level === 'info',
                  'text-warning': event.level === 'warn',
                  'text-error': event.level === 'error',
                }"
                >{{ event.code }}</span
              >
              <span class="text-on-surface-variant truncate">{{ event.message }}</span>
            </div>
          </div>
          <p v-else class="text-sm text-on-surface-variant">
            {{ i18n('options_diagnostics_empty', 'No diagnostic events.') }}
          </p>
        </div>
      </section>

      <!-- Footer -->
      <footer
        class="text-center text-xs text-on-surface-variant pt-4 border-t border-outline-variant"
      >
        {{
          i18nSub(
            'options_footer',
            [extensionVersion],
            `Motrix Next Extension v${extensionVersion}`,
          )
        }}
      </footer>
    </div>
  </div>
</template>
