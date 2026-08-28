<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { NBadge, NButton, NEmpty, NFormItem, NIcon, NSelect, NSwitch } from 'naive-ui';
import {
  CloudDownloadOutline,
  CloudUploadOutline,
  DownloadOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5';
import type { DiagnosticEvent, DiagnosticLevel } from '@/lib/schema';
import { useI18n } from '@/shared/i18n/engine';
import CollapsePanel from '@/shared/components/CollapsePanel.vue';

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

const { t: i18n, tSub: i18nSub } = useI18n();
const fileInput = ref<globalThis.HTMLInputElement | null>(null);
const confirmingReset = ref(false);
const expandedId = ref<string | null>(null);
const levelFilter = ref<'all' | DiagnosticLevel>('all');
const codeFilter = ref<string | null>(null);
let resetConfirmTimer: ReturnType<typeof setTimeout> | null = null;

const levelCounts = computed(() => ({
  all: props.events.length,
  error: props.events.filter((event) => event.level === 'error').length,
  warn: props.events.filter((event) => event.level === 'warn').length,
  info: props.events.filter((event) => event.level === 'info').length,
}));
const codeOptions = computed(() =>
  [...new Set(props.events.map((event) => event.code))]
    .sort()
    .map((code) => ({ label: code, value: code })),
);
const filteredEvents = computed(() =>
  props.events
    .filter((event) => levelFilter.value === 'all' || event.level === levelFilter.value)
    .filter((event) => codeFilter.value === null || event.code === codeFilter.value)
    .reverse(),
);

const levelOptions = computed<Array<{ value: 'all' | DiagnosticLevel; label: string }>>(() => [
  { value: 'all', label: i18n('options_diagnostics_filter_all', 'All') },
  { value: 'error', label: i18n('options_diagnostics_filter_error', 'Error') },
  { value: 'warn', label: i18n('options_diagnostics_filter_warning', 'Warning') },
  { value: 'info', label: i18n('options_diagnostics_filter_info', 'Info') },
]);

watch(
  () => props.events,
  (events) => {
    if (codeFilter.value && !events.some((event) => event.code === codeFilter.value)) {
      codeFilter.value = null;
    }
    if (expandedId.value && !events.some((event) => event.id === expandedId.value)) {
      expandedId.value = null;
    }
  },
);

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

      <div class="diagnostics-toolbar">
        <div
          class="diagnostics-levels"
          role="group"
          :aria-label="i18n('options_section_diagnostics', 'Diagnostics')"
        >
          <button
            v-for="option in levelOptions"
            :key="option.value"
            type="button"
            class="diagnostics-level"
            :class="{ active: levelFilter === option.value }"
            @click="levelFilter = option.value"
          >
            {{ option.label }}
            <span>{{ levelCounts[option.value] }}</span>
          </button>
        </div>

        <NSelect
          v-model:value="codeFilter"
          class="diagnostics-code-filter"
          size="small"
          clearable
          filterable
          :options="codeOptions"
          :placeholder="i18n('options_diagnostics_filter_code', 'Event type')"
        />

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
      </div>

      <Transition name="fade" mode="out-in">
        <TransitionGroup
          v-if="filteredEvents.length"
          key="log"
          name="list-item"
          tag="div"
          class="diag-log"
        >
          <div
            v-for="event in filteredEvents"
            :key="event.id"
            class="diag-entry-wrapper"
            :class="`diag-entry-wrapper--${event.level}`"
          >
            <button
              type="button"
              class="diag-entry"
              :disabled="!event.context"
              :aria-expanded="event.context ? expandedId === event.id : undefined"
              :aria-label="`${event.level}: ${event.code}. ${event.message}`"
              @click="event.context ? toggleExpand(event.id) : undefined"
            >
              <span class="diag-entry__time">{{ formatTime(event.ts) }}</span>
              <code class="diag-entry__code">{{ event.code }}</code>
              <span class="diag-entry__msg">{{ event.message }}</span>
              <span
                v-if="event.context"
                class="diag-entry__chevron"
                :class="{ expanded: expandedId === event.id }"
                >›</span
              >
            </button>
            <CollapsePanel :open="Boolean(event.context && expandedId === event.id)">
              <div v-if="event.context" class="diag-context">
                <div
                  v-for="(value, key) in event.context"
                  :key="String(key)"
                  class="diag-context__row"
                >
                  <span class="diag-context__key">{{ key }}</span>
                  <span class="diag-context__value">{{ value }}</span>
                </div>
              </div>
            </CollapsePanel>
          </div>
        </TransitionGroup>
        <NEmpty
          v-else
          key="empty"
          size="small"
          :description="i18n('options_diagnostics_empty', 'No diagnostic events.')"
        />
      </Transition>

      <p class="diagnostics-retention">
        {{
          i18nSub(
            'options_diagnostics_retention',
            ['100', '7'],
            'Latest 100 events · Removed after 7 days',
          )
        }}
      </p>
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

.diagnostics-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.diagnostics-levels {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: var(--color-surface-container-high);
}

.diagnostics-level {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 3px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-on-surface-variant);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    color 0.15s cubic-bezier(0.2, 0, 0, 1),
    background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
    transform 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.diagnostics-level span {
  font-family: var(--font-mono);
  opacity: 0.65;
}

.diagnostics-level:hover {
  color: var(--color-on-surface);
}

.diagnostics-level:active {
  transform: scale(0.97);
}

.diagnostics-level.active {
  background: var(--color-surface-container-highest);
  color: var(--color-on-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--color-on-surface) 12%, transparent);
}

.diagnostics-level:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.diagnostics-code-filter {
  width: min(180px, 100%);
}

.diagnostics-actions {
  margin-left: auto;
}

.diag-log {
  max-height: min(400px, 50vh);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--color-surface-container);
  border-radius: 10px;
  padding: 6px;
}

.diag-entry-wrapper {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--color-surface-container-high) 72%, transparent);
}

.diag-entry-wrapper::before {
  position: absolute;
  z-index: 1;
  top: 6px;
  bottom: 6px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--color-outline);
  content: '';
}

.diag-entry-wrapper--warn::before {
  background: var(--color-warning);
}

.diag-entry-wrapper--error::before {
  background: var(--color-error);
}

.diag-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 7px 9px 7px 11px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.diag-entry:disabled {
  cursor: default;
  opacity: 1;
}

.diag-entry:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-on-surface) 4%, transparent);
}

.diag-entry:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
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
  min-width: min(245px, 38%);
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
  padding: 2px 10px 9px 30px;
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

.diagnostics-retention {
  margin: 8px 2px 0;
  color: var(--color-on-surface-variant);
  font-size: 10px;
  text-align: right;
  opacity: 0.65;
}

@media (max-width: 700px) {
  .diagnostics-actions {
    width: 100%;
    margin-left: 0;
  }

  .diag-entry__code {
    min-width: 0;
  }
}
</style>
