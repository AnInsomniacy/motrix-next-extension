<script lang="ts" setup>
/**
 * @fileoverview Popup root component.
 *
 * Wraps the popup UI in a Naive UI NConfigProvider for consistent M3
 * theming, delegates rendering to dedicated sub-components, and manages
 * the data polling lifecycle. All business logic (RPC client, connection
 * check, task polling) is preserved unchanged from the original.
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { NConfigProvider, NSpin, NIcon, NButton } from 'naive-ui';
import {
  PauseOutline,
  PlayOutline,
  RocketOutline,
  AlertCircleOutline,
} from '@vicons/ionicons5';
import { Aria2Client } from '@/modules/rpc/aria2-client';
import { ConnectionService, ConnectionStatus } from '@/modules/services/connection';
import { buildProtocolUrl } from '@/modules/protocol/launcher';
import { resolveThemeClass } from '@/modules/services/theme';
import type { ThemePreference } from '@/modules/services/theme';
import type { Aria2Task, Aria2GlobalStat, RpcConfig } from '@/shared/types';
import { DEFAULT_RPC_CONFIG, DEFAULT_UI_PREFS } from '@/shared/constants';
import { useTheme } from '@/shared/use-theme';

import PopupHeader from './components/PopupHeader.vue';
import SpeedBar from './components/SpeedBar.vue';
import TaskCard from './components/TaskCard.vue';

// ─── i18n ───────────────────────────────────────────────────────────

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

// ─── Theme + Color Scheme ───────────────────────────────────────────

const colorSchemeId = ref(DEFAULT_UI_PREFS.colorScheme);
const { naiveTheme, themeOverrides } = useTheme(colorSchemeId);

// ─── State ──────────────────────────────────────────────────────────

const status = ref<ConnectionStatus>(ConnectionStatus.Disconnected);
const version = ref<string | null>(null);
const tasks = ref<Aria2Task[]>([]);
const globalStat = ref<Aria2GlobalStat | null>(null);
const loading = ref(true);

let client: Aria2Client;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Data Fetching ──────────────────────────────────────────────────

async function fetchData(): Promise<void> {
  try {
    const connectionSvc = new ConnectionService(client);
    const result = await connectionSvc.checkConnection();
    status.value = result.status;
    version.value = result.version;

    if (result.status === ConnectionStatus.Connected) {
      const [activeTasks, stat] = await Promise.all([
        client.tellActive(),
        client.getGlobalStat(),
      ]);
      tasks.value = activeTasks;
      globalStat.value = stat;
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

// ─── Lifecycle ──────────────────────────────────────────────────────

onMounted(async () => {
  // Apply theme class to <html> for Tailwind `.dark` utilities
  const uiStored = await chrome.storage.local.get(['uiPrefs']);
  const uiPrefs = uiStored.uiPrefs as Record<string, string> | undefined;
  const theme = (uiPrefs?.theme ?? 'system') as ThemePreference;
  colorSchemeId.value = uiPrefs?.colorScheme ?? DEFAULT_UI_PREFS.colorScheme;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.className = resolveThemeClass(theme, mediaQuery.matches);
  mediaQuery.addEventListener('change', (e) => {
    document.documentElement.className = resolveThemeClass(theme, e.matches);
  });

  // Initialize RPC client
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
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
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
          @settings="openSettings"
        />

        <!-- ── Disconnected Banner ─────────────────────────────── -->
        <Transition name="fade-scale">
          <div
            v-if="status !== 'connected'"
            class="popup-banner popup-banner--error"
          >
            <NIcon :size="16" class="popup-banner__icon">
              <AlertCircleOutline />
            </NIcon>
            <div>
              <p class="popup-banner__title">
                {{ i18n('popup_error_unreachable', 'Cannot connect to Motrix Next') }}
              </p>
              <p class="popup-banner__hint">
                {{ i18n('popup_error_hint', 'Make sure Motrix Next is running and RPC is enabled.') }}
              </p>
            </div>
          </div>
        </Transition>

        <!-- ── Connected: Speed + Tasks ────────────────────────── -->
        <template v-if="status === 'connected'">
          <SpeedBar v-if="globalStat" :stat="globalStat" />

          <div class="popup-tasks">
            <div v-if="tasks.length === 0" class="popup-empty">
              {{ i18n('popup_no_active_tasks', 'No active downloads') }}
            </div>
            <TransitionGroup v-else name="list-item" tag="div" class="popup-task-list">
              <TaskCard
                v-for="task in tasks"
                :key="task.gid"
                :task="task"
              />
            </TransitionGroup>
          </div>
        </template>

        <!-- ── Actions ─────────────────────────────────────────── -->
        <div class="popup-actions">
          <NButton
            v-if="status === 'connected'"
            size="small"
            quaternary
            @click="pauseAll"
          >
            <template #icon>
              <NIcon :size="14"><PauseOutline /></NIcon>
            </template>
            {{ i18n('popup_action_pause_all', 'Pause All') }}
          </NButton>
          <NButton
            v-if="status === 'connected'"
            size="small"
            quaternary
            @click="resumeAll"
          >
            <template #icon>
              <NIcon :size="14"><PlayOutline /></NIcon>
            </template>
            {{ i18n('popup_action_resume_all', 'Resume All') }}
          </NButton>
          <NButton
            size="small"
            type="primary"
            @click="launchApp"
          >
            <template #icon>
              <NIcon :size="14"><RocketOutline /></NIcon>
            </template>
            {{ i18n('popup_action_launch', 'Launch') }}
          </NButton>
        </div>
      </template>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.popup-root {
  width: 380px;
  min-height: 240px;
  background: var(--color-surface);
  color: var(--color-on-surface);
  font-family: var(--font-sans);
}

/* ── Loading ──────────────────────────────────────────────────── */
.popup-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 240px;
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

/* ── Task List ───────────────────────────────────────────────── */
.popup-tasks {
  padding: 8px 16px 4px;
}

.popup-task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.popup-empty {
  text-align: center;
  font-size: 13px;
  color: var(--color-on-surface-variant);
  padding: 28px 0;
  border: 1px dashed var(--color-outline-variant);
  border-radius: 10px;
}

/* ── Actions ─────────────────────────────────────────────────── */
.popup-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 16px 14px;
}
</style>
