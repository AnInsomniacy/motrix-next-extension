<script lang="ts" setup>
import { computed, h, ref, watch } from 'vue';
import {
  NButton,
  NButtonGroup,
  NPopconfirm,
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
import { CloudDownload, CloudUpload, Download, RefreshCw, Trash2 } from '@lucide/vue';
import {
  DIAGNOSTIC_EVENT_LIMIT_MAX,
  DIAGNOSTIC_EVENT_LIMIT_MIN,
  type DiagnosticEvent,
  type DiagnosticLevel,
} from '@/lib/schema';
import { useI18n } from '@/shared/i18n/engine';
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
const levelFilter = ref<'all' | DiagnosticLevel>('all');
const codeFilter = ref<string | null>(null);
const diagnosticPage = ref(1);
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

function chooseBackupFile(): void {
  fileInput.value?.click();
}

function handleFileChange(event: globalThis.Event): void {
  const input = event.target as globalThis.HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) emit('importSettings', file);
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
</script>

<template>
  <div class="settings-section">
    <section class="settings-group">
      <h2 class="settings-group-title">
        {{ i18n('options_settings_backup_title', 'Settings Backup') }}
      </h2>

      <div class="maintenance-actions">
        <NButton size="small" @click="emit('exportSettings')">
          <template #icon>
            <NIcon :size="14"><CloudDownload /></NIcon>
          </template>
          {{ i18n('options_settings_backup_export', 'Export Settings') }}
        </NButton>
        <NButton size="small" @click="chooseBackupFile">
          <template #icon>
            <NIcon :size="14"><CloudUpload /></NIcon>
          </template>
          {{ i18n('options_settings_backup_import', 'Import Settings') }}
        </NButton>
        <NPopconfirm
          :positive-text="i18n('options_factory_reset_button')"
          :negative-text="i18n('media_cancel')"
          @positive-click="emit('resetSettings')"
        >
          <template #trigger
            ><NButton size="small"
              ><template #icon
                ><NIcon :size="14"><RefreshCw /></NIcon></template
              >{{ i18n('options_factory_reset_button') }}</NButton
            ></template
          >
          {{ i18n('options_factory_reset_confirm') }}
        </NPopconfirm>
      </div>

      <p class="hint">{{ i18n('options_backup_secret_hint') }}</p>
      <input
        ref="fileInput"
        class="maintenance-file-input"
        type="file"
        accept="application/json,.json"
        @change="handleFileChange"
      />
    </section>

    <section class="settings-group">
      <h2 class="settings-group-title">
        {{ i18n('options_section_diagnostics', 'Diagnostics') }}
      </h2>

      <NFormItem
        class="diagnostics-retention-setting"
        :label="i18n('options_diagnostics_log_entry_limit', 'Log entry limit')"
        label-placement="left"
        :show-feedback="false"
      >
        <NInputNumber
          :aria-label="i18n('options_diagnostics_log_entry_limit')"
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
          :aria-label="i18n('options_diagnostics_filter_code')"
          size="small"
          clearable
          filterable
          :options="codeOptions"
          :placeholder="i18n('options_diagnostics_filter_code', 'Event type')"
        />

        <div class="maintenance-actions diagnostics-actions">
          <NButton size="small" @click="emit('exportDiagnostics')">
            <template #icon>
              <NIcon :size="14"><Download /></NIcon>
            </template>
            {{ i18n('options_diagnostics_export', 'Export Report') }}
          </NButton>
          <NPopconfirm
            :positive-text="i18n('options_diagnostics_clear')"
            :negative-text="i18n('media_cancel')"
            @positive-click="emit('clearDiagnostics')"
          >
            <template #trigger
              ><NButton size="small" :disabled="!events.length"
                ><template #icon
                  ><NIcon :size="14"><Trash2 /></NIcon></template
                >{{ i18n('options_diagnostics_clear') }}</NButton
              ></template
            >
            {{ i18n('options_diagnostics_clear_confirm') }}
          </NPopconfirm>
        </div>
      </div>

      <NDataTable
        class="diagnostics-table"
        :columns="diagnosticColumns"
        :data="filteredEvents"
        :max-height="DIAGNOSTIC_BODY_HEIGHT"
        :scroll-x="708"
        :pagination="diagnosticPagination"
        :row-key="(event: DiagnosticEvent) => event.id"
        :bordered="false"
        :single-line="true"
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
  margin-inline-start: auto;
}

.diagnostics-table :deep(.n-data-table-th),
.diagnostics-table :deep(.n-data-table-td) {
  font-size: 13px;
}

.diagnostics-table :deep(.n-data-table-td) {
  height: 38px;
  padding-top: 0;
  padding-bottom: 0;
}

.diagnostics-table :deep(.diagnostic-code) {
  font-family: var(--rb-font-mono);
  font-weight: 400;
}

.diagnostics-table :deep(.n-data-table__pagination .n-pagination) {
  width: 100%;
}

.diagnostics-table :deep(.n-pagination-prefix) {
  margin-inline-end: auto;
}

@media (max-width: 700px) {
  .diagnostics-actions {
    width: 100%;
    margin-inline-start: 0;
  }
}
</style>
