<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { Aria2Client } from '@/modules/rpc/aria2-client';
import { ConnectionService, ConnectionStatus } from '@/modules/services/connection';
import { buildProtocolUrl } from '@/modules/protocol/launcher';
import { resolveThemeClass } from '@/modules/services/theme';
import type { ThemePreference } from '@/modules/services/theme';
import type { Aria2Task, Aria2GlobalStat, RpcConfig } from '@/shared/types';
import { DEFAULT_RPC_CONFIG } from '@/shared/constants';

// ─── i18n Helper ────────────────────────────────────────

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

function i18nSub(key: string, substitutions: string[], fallback: string): string {
  return chrome.i18n.getMessage(key, substitutions) || fallback;
}

// ─── State ──────────────────────────────────────────────

const status = ref<ConnectionStatus>(ConnectionStatus.Disconnected);
const version = ref<string | null>(null);
const tasks = ref<Aria2Task[]>([]);
const globalStat = ref<Aria2GlobalStat | null>(null);
const loading = ref(true);

let client: Aria2Client;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ────────────────────────────────────────────

function formatSpeed(bytesPerSec: string): string {
  const n = parseInt(bytesPerSec, 10);
  if (isNaN(n) || n === 0) return '0 B/s';
  if (n < 1024) return `${n} B/s`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB/s`;
  return `${(n / 1048576).toFixed(1)} MB/s`;
}

function formatSize(bytes: string): string {
  const n = parseInt(bytes, 10);
  if (isNaN(n) || n === 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function getProgress(task: Aria2Task): number {
  const total = parseInt(task.totalLength, 10);
  const completed = parseInt(task.completedLength, 10);
  if (!total || isNaN(total)) return 0;
  return Math.round((completed / total) * 100);
}

function getTaskName(task: Aria2Task): string {
  if (task.bittorrent?.info?.name) return task.bittorrent.info.name;
  const file = task.files[0];
  if (file?.path) {
    const parts = file.path.split('/');
    return parts[parts.length - 1] || 'Unknown';
  }
  if (file?.uris?.[0]?.uri) {
    try {
      return new URL(file.uris[0].uri).pathname.split('/').pop() || 'Unknown';
    } catch {
      /* fallthrough */
    }
  }
  return task.gid;
}

// ─── Data Fetching ──────────────────────────────────────

async function fetchData(): Promise<void> {
  try {
    const connectionSvc = new ConnectionService(client);
    const result = await connectionSvc.checkConnection();
    status.value = result.status;
    version.value = result.version;

    if (result.status === ConnectionStatus.Connected) {
      const [activeTasks, stat] = await Promise.all([client.tellActive(), client.getGlobalStat()]);
      tasks.value = activeTasks;
      globalStat.value = stat;
    }
  } catch {
    status.value = ConnectionStatus.Disconnected;
  } finally {
    loading.value = false;
  }
}

// ─── Actions ────────────────────────────────────────────

async function pauseAll(): Promise<void> {
  try {
    await client.pauseAll();
    await fetchData();
  } catch {
    /* silent */
  }
}

async function resumeAll(): Promise<void> {
  try {
    await client.unpauseAll();
    await fetchData();
  } catch {
    /* silent */
  }
}

function openSettings(): void {
  void chrome.runtime.openOptionsPage();
}

function launchApp(): void {
  void chrome.tabs.create({ url: buildProtocolUrl(), active: false }).then((tab) => {
    if (tab.id) setTimeout(() => chrome.tabs.remove(tab.id!), 500);
  });
}

// ─── Lifecycle ──────────────────────────────────────────

onMounted(async () => {
  // Apply theme
  const uiStored = await chrome.storage.local.get(['uiPrefs']);
  const theme = ((uiStored.uiPrefs as Record<string, string> | undefined)?.theme ??
    'system') as ThemePreference;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.className = resolveThemeClass(theme, mediaQuery.matches);

  // Live-track system theme changes
  mediaQuery.addEventListener('change', (e) => {
    document.documentElement.className = resolveThemeClass(theme, e.matches);
  });

  const stored = await chrome.storage.local.get(['rpc']);
  const rpcConfig: RpcConfig = (stored.rpc as RpcConfig) ?? { ...DEFAULT_RPC_CONFIG };
  client = new Aria2Client(rpcConfig, { timeoutMs: 3000 });

  await fetchData();
  pollTimer = setInterval(() => void fetchData(), 2000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="w-[380px] min-h-[240px] bg-surface text-on-surface font-sans">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-60">
      <div
        class="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"
      />
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-center justify-between px-4 pt-4 pb-2">
        <div class="flex items-center gap-2">
          <h1 class="text-base font-semibold">{{ i18n('popup_title', 'Motrix Next') }}</h1>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            :class="
              status === 'connected' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
            "
          >
            {{
              status === 'connected'
                ? i18n('popup_status_connected', 'Connected')
                : i18n('popup_status_disconnected', 'Disconnected')
            }}
          </span>
        </div>
        <button
          @click="openSettings"
          class="text-on-surface-variant hover:text-on-surface transition-colors"
          :title="i18n('popup_action_settings', 'Settings')"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .254c-.008.38.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </button>
      </div>

      <!-- Connected State -->
      <template v-if="status === 'connected'">
        <!-- Speed Bar -->
        <div
          v-if="globalStat"
          class="flex items-center justify-between px-4 py-2 text-xs text-on-surface-variant"
        >
          <span>↓ {{ formatSpeed(globalStat.downloadSpeed) }}</span>
          <span>↑ {{ formatSpeed(globalStat.uploadSpeed) }}</span>
          <span>{{
            i18nSub(
              'popup_speed_active_count',
              [globalStat.numActive],
              `${globalStat.numActive} active`,
            )
          }}</span>
        </div>

        <!-- Task List -->
        <div class="px-4 pb-2">
          <div
            v-if="tasks.length === 0"
            class="text-center text-sm text-on-surface-variant py-8 border border-dashed border-outline-variant rounded-lg"
          >
            {{ i18n('popup_no_active_tasks', 'No active downloads') }}
          </div>
          <div v-else class="space-y-2 max-h-[200px] overflow-y-auto">
            <div
              v-for="task in tasks"
              :key="task.gid"
              class="bg-surface-container rounded-md px-3 py-2"
            >
              <div class="flex justify-between items-start mb-1">
                <span class="text-xs font-medium truncate max-w-[260px]">{{
                  getTaskName(task)
                }}</span>
                <span class="text-[10px] text-on-surface-variant shrink-0 ml-2">{{
                  formatSpeed(task.downloadSpeed)
                }}</span>
              </div>
              <div class="w-full bg-outline-variant/30 rounded-full h-1.5">
                <div
                  class="bg-brand-500 h-1.5 rounded-full transition-all duration-medium ease-standard"
                  :style="{ width: `${getProgress(task)}%` }"
                />
              </div>
              <div class="flex justify-between text-[10px] text-on-surface-variant mt-0.5">
                <span
                  >{{ formatSize(task.completedLength) }} / {{ formatSize(task.totalLength) }}</span
                >
                <span>{{ getProgress(task) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 px-4 pb-4">
          <button
            @click="pauseAll"
            class="flex-1 rounded-md bg-surface-container px-3 py-1.5 text-xs font-medium hover:bg-surface-dim transition-colors"
          >
            {{ i18n('popup_action_pause_all', 'Pause All') }}
          </button>
          <button
            @click="resumeAll"
            class="flex-1 rounded-md bg-surface-container px-3 py-1.5 text-xs font-medium hover:bg-surface-dim transition-colors"
          >
            {{ i18n('popup_action_resume_all', 'Resume All') }}
          </button>
          <button
            @click="launchApp"
            class="flex-1 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 transition-colors"
          >
            {{ i18n('popup_action_launch', 'Launch Motrix Next') }}
          </button>
        </div>
      </template>

      <!-- Disconnected State -->
      <template v-else>
        <div class="flex flex-col items-center justify-center py-10 px-6">
          <div class="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mb-4">
            <svg
              class="w-6 h-6 text-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <p class="text-sm font-medium text-error mb-1">
            {{ i18n('popup_error_unreachable', 'Cannot connect to Motrix Next') }}
          </p>
          <p class="text-xs text-on-surface-variant text-center mb-4">
            {{ i18n('popup_error_hint', 'Make sure Motrix Next is running and RPC is enabled.') }}
          </p>
          <div class="flex gap-2">
            <button
              @click="openSettings"
              class="rounded-md bg-surface-container border border-outline-variant px-4 py-2 text-xs font-medium hover:bg-surface-dim transition-colors"
            >
              {{ i18n('popup_error_check_settings', 'Check Settings') }}
            </button>
            <button
              @click="launchApp"
              class="rounded-md bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600 transition-colors"
            >
              {{ i18n('popup_action_launch', 'Launch Motrix Next') }}
            </button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
