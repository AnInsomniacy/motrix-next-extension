<script lang="ts" setup>
import { computed, h, onUnmounted, ref, watch } from 'vue';
import {
  NButton,
  NButtonGroup,
  NDataTable,
  NEmpty,
  NFormItem,
  NIcon,
  NInputNumber,
  NSelect,
  NTag,
  type DataTableColumns,
  type PaginationProps,
} from 'naive-ui';
import {
  CloudDownloadOutline,
  CloudUploadOutline,
  DownloadOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5';
import {
  DIAGNOSTIC_EVENT_LIMIT_MAX,
  DIAGNOSTIC_EVENT_LIMIT_MIN,
  type DiagnosticEvent,
  type DiagnosticLevel,
} from '@/lib/schema';
import { useI18n } from '@/shared/i18n/engine';
import ClearDiagnosticsButtonLabel from './ClearDiagnosticsButtonLabel.vue';
import DiagnosticDetailsPopover from './DiagnosticDetailsPopover.vue';

const props = defineProps<{
  events: DiagnosticEvent[];
  maxDiagnosticEvents: number;
}>();

const emit = defineEmits<{
  exportSettings: [];
  importSettings: [file: globalThis.File];
  resetSettings: [];
  clearDiagnostics: [];
  exportDiagnostics: [];
  'update:maxDiagnosticEvents': [value: number];
}>();

const { effectiveLocale, t: i18n, tSub: i18nSub } = useI18n();
const fileInput = ref<globalThis.HTMLInputElement | null>(null);
const confirmingReset = ref(false);
const confirmingClearDiagnostics = ref(false);
const clearConfirmationSeconds = ref(0);
const levelFilter = ref<'all' | DiagnosticLevel>('all');
const codeFilter = ref<string | null>(null);
const diagnosticPage = ref(1);
let resetConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let clearConfirmationTimer: ReturnType<typeof setInterval> | null = null;

const CLEAR_CONFIRMATION_SECONDS = 4;
const DIAGNOSTIC_PAGE_SIZE = 10;
const DIAGNOSTIC_ROW_HEIGHT = 38;
const DIAGNOSTIC_BODY_HEIGHT = DIAGNOSTIC_PAGE_SIZE * DIAGNOSTIC_ROW_HEIGHT;
const LEVEL_TAG_TYPES: Record<DiagnosticLevel, 'info' | 'warning' | 'error'> = {
  info: 'info',
  warn: 'warning',
  error: 'error',
};

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
const diagnosticTimeFormatter = computed(
  () =>
    new Intl.DateTimeFormat(effectiveLocale.value.replace('_', '-'), {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
);
const diagnosticDateTimeFormatter = computed(
  () =>
    new Intl.DateTimeFormat(effectiveLocale.value.replace('_', '-'), {
      dateStyle: 'short',
      timeStyle: 'medium',
    }),
);

const diagnosticColumns = computed<DataTableColumns<DiagnosticEvent>>(() => [
  {
    title: i18n('options_diagnostics_column_time', 'Time'),
    key: 'ts',
    width: 108,
    render: (event) =>
      h('time', { datetime: new Date(event.ts).toISOString() }, formatTime(event.ts)),
  },
  {
    title: i18n('options_diagnostics_column_level', 'Level'),
    key: 'level',
    width: 90,
    render: (event) =>
      h(
        NTag,
        { bordered: false, size: 'small', type: LEVEL_TAG_TYPES[event.level] },
        { default: () => diagnosticLevelLabel(event.level) },
      ),
  },
  {
    title: i18n('options_diagnostics_column_event', 'Event'),
    key: 'code',
    minWidth: 210,
    ellipsis: { tooltip: true },
    render: (event) => h('code', { class: 'diagnostic-code' }, event.code),
  },
  {
    title: i18n('options_diagnostics_column_message', 'Message'),
    key: 'message',
    minWidth: 260,
    ellipsis: { tooltip: true },
  },
  {
    title: '',
    key: 'details',
    width: 40,
    align: 'center',
    render: (event) =>
      h(DiagnosticDetailsPopover, {
        event,
        formattedTime: formatDateTime(event.ts),
        levelLabel: diagnosticLevelLabel(event.level),
        tagType: LEVEL_TAG_TYPES[event.level],
      }),
  },
]);

const diagnosticPagination = computed<PaginationProps>(() => ({
  page: diagnosticPage.value,
  pageSize: DIAGNOSTIC_PAGE_SIZE,
  pageSlot: 7,
  size: 'small',
  prefix: ({ startIndex, endIndex, itemCount }) => {
    const total = itemCount ?? 0;
    const range = total === 0 ? '0' : `${startIndex + 1}–${endIndex + 1}`;
    return i18nSub(
      'options_diagnostics_pagination',
      [range, String(total), String(props.maxDiagnosticEvents)],
      '$1 of $2 · max $3',
    );
  },
}));

watch([levelFilter, codeFilter], () => {
  diagnosticPage.value = 1;
});

watch(filteredEvents, (events) => {
  const pageCount = Math.max(1, Math.ceil(events.length / DIAGNOSTIC_PAGE_SIZE));
  diagnosticPage.value = Math.min(diagnosticPage.value, pageCount);
});

watch(
  () => props.events,
  (events) => {
    if (codeFilter.value && !events.some((event) => event.code === codeFilter.value)) {
      codeFilter.value = null;
    }
  },
);

function clearResetConfirmTimer(): void {
  if (resetConfirmTimer) {
    clearTimeout(resetConfirmTimer);
    resetConfirmTimer = null;
  }
}

function cancelClearDiagnosticsConfirmation(): void {
  if (clearConfirmationTimer) {
    clearInterval(clearConfirmationTimer);
    clearConfirmationTimer = null;
  }
  confirmingClearDiagnostics.value = false;
  clearConfirmationSeconds.value = 0;
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

function handleClearDiagnosticsClick(): void {
  if (confirmingClearDiagnostics.value) {
    cancelClearDiagnosticsConfirmation();
    emit('clearDiagnostics');
    return;
  }

  confirmingClearDiagnostics.value = true;
  clearConfirmationSeconds.value = CLEAR_CONFIRMATION_SECONDS;
  clearConfirmationTimer = setInterval(() => {
    clearConfirmationSeconds.value -= 1;
    if (clearConfirmationSeconds.value <= 0) cancelClearDiagnosticsConfirmation();
  }, 1000);
}

function handleMaxDiagnosticEvents(value: number | null): void {
  if (value !== null) emit('update:maxDiagnosticEvents', value);
}

function diagnosticLevelLabel(level: DiagnosticLevel): string {
  const option = levelOptions.value.find(({ value }) => value === level);
  return option?.label ?? level;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return diagnosticTimeFormatter.value.format(d);
  }
  return diagnosticDateTimeFormatter.value.format(d);
}

function formatDateTime(ts: number): string {
  return diagnosticDateTimeFormatter.value.format(new Date(ts));
}

onUnmounted(() => {
  clearResetConfirmTimer();
  cancelClearDiagnosticsConfirmation();
});
</script>

<template>
  <div class="settings-section">
    <section class="settings-group">
      <h3 class="settings-group-title">
        {{ i18n('options_settings_backup_title', 'Settings Backup') }}
      </h3>

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
      <h3 class="settings-group-title">
        {{ i18n('options_section_diagnostics', 'Diagnostics') }}
      </h3>

      <NFormItem
        class="diagnostics-retention-setting"
        :label="i18n('options_diagnostics_log_entry_limit', 'Log entry limit')"
        label-placement="left"
        :show-feedback="false"
      >
        <NInputNumber
          :max="DIAGNOSTIC_EVENT_LIMIT_MAX"
          :min="DIAGNOSTIC_EVENT_LIMIT_MIN"
          :precision="0"
          :show-button="false"
          :step="10"
          :value="maxDiagnosticEvents"
          size="small"
          @update:value="handleMaxDiagnosticEvents"
        >
          <template #suffix>
            {{ i18n('options_diagnostics_entries_suffix', 'entries') }}
          </template>
        </NInputNumber>
      </NFormItem>

      <div class="diagnostics-toolbar">
        <NButtonGroup role="group" :aria-label="i18n('options_section_diagnostics', 'Diagnostics')">
          <NButton
            v-for="option in levelOptions"
            :key="option.value"
            size="small"
            :type="levelFilter === option.value ? 'primary' : 'default'"
            :aria-pressed="levelFilter === option.value"
            @click="levelFilter = option.value"
          >
            {{ option.label }}
            {{ levelCounts[option.value] }}
          </NButton>
        </NButtonGroup>

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
          <NButton size="small" @click="emit('exportDiagnostics')">
            <template #icon>
              <NIcon :size="14"><DownloadOutline /></NIcon>
            </template>
            {{ i18n('options_diagnostics_export', 'Export Report') }}
          </NButton>
          <NButton ghost size="small" type="error" @click="handleClearDiagnosticsClick">
            <template #icon>
              <NIcon :size="14"><TrashOutline /></NIcon>
            </template>
            <ClearDiagnosticsButtonLabel
              :clear-label="i18n('options_diagnostics_clear', 'Clear Log')"
              :confirm-label="i18n('options_diagnostics_clear_confirm', 'Confirm Clear')"
              :confirming="confirmingClearDiagnostics"
              :seconds="clearConfirmationSeconds"
              :seconds-suffix="i18n('options_seconds_suffix', 's')"
            />
          </NButton>
        </div>
      </div>

      <NDataTable
        class="diagnostics-table"
        :columns="diagnosticColumns"
        :data="filteredEvents"
        :max-height="DIAGNOSTIC_BODY_HEIGHT"
        :min-height="DIAGNOSTIC_BODY_HEIGHT"
        :pagination="diagnosticPagination"
        :row-key="(event: DiagnosticEvent) => event.id"
        :single-line="false"
        size="small"
        table-layout="fixed"
        @update:page="diagnosticPage = $event"
      >
        <template #empty>
          <NEmpty
            size="small"
            :description="i18n('options_diagnostics_empty', 'No diagnostic events.')"
          />
        </template>
      </NDataTable>
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

.diagnostics-retention-setting {
  max-width: 300px;
  margin-bottom: 12px;
}

.diagnostics-retention-setting :deep(.n-input-number) {
  width: 150px;
}

.diagnostics-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.diagnostics-code-filter {
  width: min(180px, 100%);
}

.diagnostics-actions {
  margin-left: auto;
}

.diagnostics-table {
  font-family: var(--font-mono);
}

.diagnostics-table :deep(.n-data-table-th),
.diagnostics-table :deep(.n-data-table-td) {
  font-size: 12px;
}

.diagnostics-table :deep(.n-data-table-td) {
  height: 38px;
  padding-top: 0;
  padding-bottom: 0;
}

.diagnostics-table :deep(.diagnostic-code) {
  font-weight: 600;
}

.diagnostics-table :deep(.n-data-table__pagination .n-pagination) {
  width: 100%;
}

.diagnostics-table :deep(.n-pagination-prefix) {
  margin-right: auto;
}

@media (max-width: 700px) {
  .diagnostics-actions {
    width: 100%;
    margin-left: 0;
  }
}
</style>
