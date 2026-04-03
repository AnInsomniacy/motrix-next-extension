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
    <div class="mx-auto max-w-2xl px-6 py-10">
      <!-- Header -->
      <header class="mb-10">
        <div class="flex items-center gap-3 mb-1">
          <div
            class="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shadow-elevated"
          >
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </div>
          <div>
            <h1 class="text-2xl font-bold tracking-tight">
              {{ i18n('options_header_title', 'Motrix Next') }}
            </h1>
            <p class="text-sm text-on-surface-variant">
              {{ i18n('options_header_subtitle', 'Extension Settings') }}
            </p>
          </div>
        </div>
      </header>

      <!-- Connection Section -->
      <section class="mb-8">
        <h2 class="section-title flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full"
            :class="connectionStatus === 'connected' ? 'bg-success' : 'bg-error'"
          />
          {{ i18n('options_section_connection', 'Connection') }}
        </h2>
        <div class="card space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <label class="block">
              <span class="text-sm font-medium text-on-surface-variant mb-1.5 block">{{
                i18n('options_rpc_port_label', 'RPC Port')
              }}</span>
              <input v-model.number="rpc.port" type="number" min="1" max="65535" class="input" />
            </label>
            <label class="block">
              <span class="text-sm font-medium text-on-surface-variant mb-1.5 block">{{
                i18n('options_rpc_secret_label', 'RPC Secret')
              }}</span>
              <input v-model="rpc.secret" type="password" class="input" placeholder="••••••••" />
            </label>
          </div>
          <div class="flex items-center gap-3">
            <button @click="testConnection" :disabled="testingConnection" class="btn btn-primary">
              <svg
                v-if="testingConnection"
                class="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="3"
                  class="opacity-25"
                />
                <path
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  class="opacity-75"
                />
              </svg>
              {{
                testingConnection
                  ? i18n('options_testing_connection', 'Testing...')
                  : i18n('options_test_connection', 'Test Connection')
              }}
            </button>
            <span v-if="connectionVersion" class="text-sm text-success font-medium">
              ✓ {{ i18n('options_connection_success_prefix', 'Connected · aria2') }}
              {{ connectionVersion }}
            </span>
            <span v-else-if="connectionError" class="text-sm text-error font-medium">
              ✗ {{ connectionError }}
            </span>
          </div>
        </div>
      </section>

      <!-- Behavior Section -->
      <section class="mb-8">
        <h2 class="section-title">
          {{ i18n('options_section_behavior', 'Download Behavior') }}
        </h2>
        <div class="card space-y-0 divide-y divide-outline-variant/50">
          <label
            class="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 cursor-pointer"
          >
            <div>
              <span class="text-sm font-medium">{{
                i18n('options_enabled_label', 'Enable Download Interception')
              }}</span>
              <p class="text-xs text-on-surface-variant mt-0.5">
                {{ i18n('options_enabled_desc', 'Automatically intercept browser downloads') }}
              </p>
            </div>
            <input v-model="settings.enabled" type="checkbox" class="toggle" />
          </label>

          <label class="block py-3.5">
            <span class="text-sm font-medium">{{
              i18n('options_min_size_label', 'Minimum File Size (MB)')
            }}</span>
            <p class="text-xs text-on-surface-variant mt-0.5 mb-2">
              {{ i18n('options_min_size_desc', 'Skip files smaller than this threshold') }}
            </p>
            <input
              v-model.number="settings.minFileSize"
              type="number"
              min="0"
              step="1"
              class="input max-w-32"
            />
          </label>

          <label class="flex items-center justify-between py-3.5 cursor-pointer">
            <div>
              <span class="text-sm font-medium">{{
                i18n('options_fallback_label', 'Fallback to Browser on Failure')
              }}</span>
              <p class="text-xs text-on-surface-variant mt-0.5">
                {{ i18n('options_fallback_desc', 'Resume download in browser if aria2 fails') }}
              </p>
            </div>
            <input v-model="settings.fallbackToBrowser" type="checkbox" class="toggle" />
          </label>

          <label class="flex items-center justify-between py-3.5 cursor-pointer">
            <span class="text-sm font-medium">{{
              i18n('options_notify_start_label', 'Notify on Download Start')
            }}</span>
            <input v-model="settings.notifyOnStart" type="checkbox" class="toggle" />
          </label>

          <label class="flex items-center justify-between py-3.5 last:pb-0 cursor-pointer">
            <span class="text-sm font-medium">{{
              i18n('options_notify_complete_label', 'Notify on Download Complete')
            }}</span>
            <input v-model="settings.notifyOnComplete" type="checkbox" class="toggle" />
          </label>
        </div>
      </section>

      <!-- Site Rules Section -->
      <section class="mb-8">
        <h2 class="section-title">
          {{ i18n('options_section_rules', 'Site Rules') }}
        </h2>
        <div class="card">
          <div v-if="siteRules.length" class="space-y-2 mb-4">
            <div
              v-for="rule in siteRules"
              :key="rule.id"
              class="flex items-center justify-between rounded-lg bg-surface-container-high px-3.5 py-2.5"
            >
              <code class="font-mono text-sm text-brand-400">{{ rule.pattern }}</code>
              <div class="flex items-center gap-2">
                <span
                  class="text-xs font-medium px-2.5 py-1 rounded-full"
                  :class="{
                    'bg-success/10 text-success': rule.action === 'always-intercept',
                    'bg-error/10 text-error': rule.action === 'always-skip',
                    'bg-outline-variant/30 text-on-surface-variant': rule.action === 'use-global',
                  }"
                >
                  {{ rule.action }}
                </span>
                <button
                  @click="removeRule(rule.id)"
                  class="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
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
              class="input flex-1 font-mono"
            />
            <select v-model="newRuleAction" class="input w-auto min-w-[140px]">
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
            <button @click="addRule" class="btn btn-primary">
              {{ i18n('options_add_rule', 'Add') }}
            </button>
          </div>
        </div>
      </section>

      <!-- Enhanced Permissions Section -->
      <section class="mb-8">
        <h2 class="section-title">
          {{ i18n('options_section_enhanced', 'Enhanced Mode') }}
        </h2>
        <div class="card space-y-4">
          <p class="text-sm text-on-surface-variant leading-relaxed">
            {{
              i18n(
                'options_enhanced_description',
                'Grant additional permissions for cookie forwarding and hiding the browser download bar.',
              )
            }}
            <span class="block mt-1 text-xs opacity-75">
              {{
                i18n(
                  'options_enhanced_cookie_note',
                  'Cookie forwarding is best-effort — it may not work for all sites due to browser privacy policies.',
                )
              }}
            </span>
          </p>
          <div v-if="enhancedGranted" class="space-y-3">
            <div
              class="flex items-center gap-2 text-sm text-success font-medium bg-success/10 rounded-lg px-3 py-2"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
              {{ i18n('options_enhanced_status_granted', 'Enhanced permissions granted') }}
            </div>
            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-sm font-medium">{{
                i18n('options_enhanced_hide_bar_label', 'Hide Browser Download Bar')
              }}</span>
              <input v-model="settings.hideDownloadBar" type="checkbox" class="toggle" />
            </label>
            <button @click="revokeEnhanced" class="btn btn-danger text-xs">
              {{ i18n('options_enhanced_revoke', 'Revoke Permissions') }}
            </button>
          </div>
          <button v-else @click="grantEnhanced" class="btn btn-secondary">
            {{ i18n('options_enhanced_grant', 'Grant Enhanced Permissions') }}
          </button>
        </div>
      </section>

      <!-- Appearance Section -->
      <section class="mb-8">
        <h2 class="section-title">
          {{ i18n('options_section_appearance', 'Appearance') }}
        </h2>
        <div class="card">
          <div class="flex gap-2">
            <button
              v-for="theme in ['system', 'light', 'dark'] as const"
              :key="theme"
              @click="uiPrefs.theme = theme"
              class="btn capitalize"
              :class="uiPrefs.theme === theme ? 'btn-primary' : 'btn-secondary'"
            >
              {{ THEME_LABELS[theme] || theme }}
            </button>
          </div>
        </div>
      </section>

      <!-- Diagnostics Section -->
      <section class="mb-8">
        <h2 class="section-title">
          {{ i18n('options_section_diagnostics', 'Diagnostics') }}
        </h2>
        <div class="card">
          <div class="flex gap-2 mb-4">
            <button @click="copyDiagnosticLog" class="btn btn-secondary">
              {{ i18n('options_diagnostics_copy', 'Copy Log (JSON)') }}
            </button>
            <button @click="clearDiagnosticLog" class="btn btn-danger">
              {{ i18n('options_diagnostics_clear', 'Clear Log') }}
            </button>
          </div>
          <div
            v-if="diagnosticEvents.length"
            class="max-h-64 overflow-y-auto space-y-1 rounded-lg bg-surface-container-high p-3"
          >
            <div
              v-for="event in [...diagnosticEvents].reverse()"
              :key="event.id"
              class="flex gap-2 text-xs font-mono rounded-md px-2.5 py-1.5"
              :class="{
                'bg-success/8': event.level === 'info',
                'bg-warning/8': event.level === 'warn',
                'bg-error/8': event.level === 'error',
              }"
            >
              <span class="text-on-surface-variant shrink-0">{{ formatTime(event.ts) }}</span>
              <span
                class="font-semibold"
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
          <p v-else class="text-sm text-on-surface-variant italic">
            {{ i18n('options_diagnostics_empty', 'No diagnostic events.') }}
          </p>
        </div>
      </section>

      <!-- Footer -->
      <footer class="text-center text-xs text-on-surface-variant pt-6 pb-4 opacity-60">
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
