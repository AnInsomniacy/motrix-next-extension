<script lang="ts" setup>
import { computed, onUnmounted, ref } from 'vue';
import { NBadge, NButton, NEmpty, NFormItem, NIcon, NSwitch, NTag } from 'naive-ui';
import {
  CloudDownloadOutline,
  CloudUploadOutline,
  DownloadOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5';
import type { DiagnosticEvent } from '@/shared/types';
import { useI18n } from '@/shared/i18n/engine';

const props = defineProps<{
  events: DiagnosticEvent[];
  includeConnectionSecret: boolean;
}>();

const emit = defineEmits<{
  exportSettings: [];
  importSettings: [file: globalThis.File];
  updateIncludeConnectionSecret: [value: boolean];
  resetSettings: [];
  clearDiagnostics: [];
  exportDiagnostics: [];
}>();

const { t: i18n } = useI18n();
const fileInput = ref<globalThis.HTMLInputElement | null>(null);
const confirmingReset = ref(false);
const expandedId = ref<string | null>(null);
let resetConfirmTimer: ReturnType<typeof setTimeout> | null = null;

const LEVEL_TYPE: Record<string, 'success' | 'warning' | 'error'> = {
  info: 'success',
  warn: 'warning',
  error: 'error',
};

const reversedEvents = computed(() => [...props.events].reverse());

function clearResetConfirmTimer(): void {
  if (resetConfirmTimer) {
    clearTimeout(resetConfirmTimer);
    resetConfirmTimer = null;
  }
}

function chooseBackupFile(): void {
  fileInput.value?.click();
}

function handleFileChange(event: globalThis.Event): void {
  const input = event.target as globalThis.HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) emit('importSettings', file);
}

function handleResetClick(): void {
  if (confirmingReset.value) {
    clearResetConfirmTimer();
    confirmingReset.value = false;
    emit('resetSettings');
    return;
  }

  confirmingReset.value = true;
  resetConfirmTimer = setTimeout(() => {
    confirmingReset.value = false;
    resetConfirmTimer = null;
  }, 4000);
}

function toggleExpand(id: string): void {
  expandedId.value = expandedId.value === id ? null : id;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString();
  }
  return d.toLocaleString();
}

onUnmounted(clearResetConfirmTimer);
</script>

<template>
  <div class="settings-section">
    <section class="settings-group">
      <h3 class="settings-group-title">
        {{ i18n('options_settings_backup_title', 'Settings Backup') }}
      </h3>

      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_settings_backup_include_secret', 'Export API Secret')"
      >
        <NSwitch
          :value="includeConnectionSecret"
          @update:value="emit('updateIncludeConnectionSecret', $event)"
        />
      </NFormItem>

      <div class="maintenance-actions">
        <NButton size="small" @click="emit('exportSettings')">
          <template #icon>
            <NIcon :size="14"><CloudDownloadOutline /></NIcon>
          </template>
          {{ i18n('options_settings_backup_export', 'Export Settings') }}
        </NButton>
        <NButton size="small" @click="chooseBackupFile">
          <template #icon>
            <NIcon :size="14"><CloudUploadOutline /></NIcon>
          </template>
          {{ i18n('options_settings_backup_import', 'Import Settings') }}
        </NButton>
        <NButton
          class="maintenance-reset-button"
          size="small"
          :type="confirmingReset ? 'error' : 'default'"
          @click="handleResetClick"
        >
          <template #icon>
            <NIcon :size="14"><RefreshOutline /></NIcon>
          </template>
          {{
            confirmingReset
              ? i18n('options_factory_reset_confirm', 'Click Again to Reset')
              : i18n('options_factory_reset_button', 'Reset Settings')
          }}
        </NButton>
      </div>

      <input
        ref="fileInput"
        class="maintenance-file-input"
        type="file"
        accept="application/json,.json"
        @change="handleFileChange"
      />
    </section>

    <section class="settings-group">
      <div class="maintenance-group-header">
        <h3 class="settings-group-title">
          {{ i18n('options_section_diagnostics', 'Diagnostics') }}
        </h3>
        <NBadge v-if="events.length" :value="events.length" :max="999" type="info" />
      </div>

      <div class="maintenance-actions diagnostics-actions">
        <NButton size="small" quaternary @click="emit('exportDiagnostics')">
          <template #icon>
            <NIcon :size="14"><DownloadOutline /></NIcon>
          </template>
          {{ i18n('options_diagnostics_export', 'Export Report') }}
        </NButton>
        <NButton size="small" quaternary type="error" @click="emit('clearDiagnostics')">
          <template #icon>
            <NIcon :size="14"><TrashOutline /></NIcon>
          </template>
          {{ i18n('options_diagnostics_clear', 'Clear Log') }}
        </NButton>
      </div>

      <Transition name="fade" mode="out-in">
        <div v-if="events.length" key="log" class="diag-log">
          <div v-for="event in reversedEvents" :key="event.id" class="diag-entry-wrapper">
            <div class="diag-entry" @click="event.context ? toggleExpand(event.id) : undefined">
              <span class="diag-entry__time">{{ formatTime(event.ts) }}</span>
              <NTag :type="LEVEL_TYPE[event.level] ?? 'default'" size="tiny" round>
                {{ event.level }}
              </NTag>
              <code class="diag-entry__code">{{ event.code }}</code>
              <span class="diag-entry__msg">{{ event.message }}</span>
              <span
                v-if="event.context"
                class="diag-entry__chevron"
                :class="{ expanded: expandedId === event.id }"
                >›</span
              >
            </div>
            <Transition name="context-expand">
              <div v-if="event.context && expandedId === event.id" class="diag-context">
                <div
                  v-for="(value, key) in event.context"
                  :key="String(key)"
                  class="diag-context__row"
                >
                  <span class="diag-context__key">{{ key }}</span>
                  <span class="diag-context__value">{{ value }}</span>
                </div>
              </div>
            </Transition>
          </div>
        </div>
        <NEmpty
          v-else
          key="empty"
          size="small"
          :description="i18n('options_diagnostics_empty', 'No diagnostic events.')"
        />
      </Transition>
    </section>
  </div>
</template>

<style scoped>
.maintenance-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.maintenance-file-input {
  display: none;
}

.maintenance-reset-button {
  flex-shrink: 0;
}

.maintenance-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.diagnostics-actions {
  margin-bottom: 12px;
}

.diag-log {
  max-height: min(400px, 50vh);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--color-surface-container-high);
  border-radius: 10px;
  padding: 8px;
}

.diag-entry-wrapper {
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.diag-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 5px 8px;
  border-radius: 6px;
  cursor: default;
  transition: background-color 0.15s;
}

.diag-entry:hover {
  background: color-mix(in srgb, var(--color-on-surface) 4%, transparent);
}

.diag-entry__time {
  color: var(--color-on-surface-variant);
  opacity: 0.65;
  flex-shrink: 0;
  font-size: 11px;
}

.diag-entry__code {
  font-weight: 600;
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.diag-entry__msg {
  color: var(--color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diag-entry__chevron {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--color-on-surface-variant);
  opacity: 0.5;
  font-size: 14px;
  font-weight: 700;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.diag-entry__chevron.expanded {
  transform: rotate(90deg);
}

.diag-context {
  padding: 4px 8px 8px 30px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diag-context__row {
  display: flex;
  gap: 8px;
  font-size: 11px;
  font-family: var(--font-mono);
}

.diag-context__key {
  color: var(--color-primary);
  flex-shrink: 0;
  font-weight: 500;
  min-width: 60px;
}

.diag-context__value {
  color: var(--color-on-surface-variant);
  word-break: break-all;
}

.context-expand-enter-active,
.context-expand-leave-active {
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  overflow: hidden;
}

.context-expand-enter-from,
.context-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.context-expand-enter-to,
.context-expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
