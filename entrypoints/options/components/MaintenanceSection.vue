<script lang="ts" setup>
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  NButton,
  NCode,
  NDataTable,
  NEmpty,
  NFormItem,
  NIcon,
  NInputNumber,
  NSelect,
  NTag,
  type DataTableColumns,
  type DataTableRowKey,
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
import CollapsePanel from '@/shared/components/CollapsePanel.vue';

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

const { t: i18n } = useI18n();
const fileInput = ref<globalThis.HTMLInputElement | null>(null);
const confirmingReset = ref(false);
const levelFilter = ref<'all' | DiagnosticLevel>('all');
const codeFilter = ref<string | null>(null);
const diagnosticPage = ref(1);
const expandedRowKeys = ref<DataTableRowKey[]>([]);
const detailsOpen = ref(false);
const tableHost = ref<globalThis.HTMLDivElement | null>(null);
let resetConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let detailCloseTimer: ReturnType<typeof setTimeout> | null = null;

const DIAGNOSTIC_PAGE_SIZE = 10;
const DIAGNOSTIC_ROW_HEIGHT = 38;
const DIAGNOSTIC_BODY_HEIGHT = DIAGNOSTIC_PAGE_SIZE * DIAGNOSTIC_ROW_HEIGHT;
const DETAIL_TRANSITION_MS = 220;
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

const diagnosticColumns: DataTableColumns<DiagnosticEvent> = [
  {
    type: 'expand',
    width: 36,
    expandable: (event) => Boolean(event.context),
    renderExpand: (event) =>
      h(
        CollapsePanel,
        { open: detailsOpen.value && expandedRowKeys.value.includes(event.id) },
        {
          default: () =>
            h(NCode, {
              class: 'diagnostic-context',
              code: JSON.stringify(event.context, null, 2),
              internalNoHighlight: true,
              language: 'json',
              wordWrap: true,
            }),
        },
      ),
  },
  {
    title: 'Time',
    key: 'ts',
    width: 108,
    render: (event) =>
      h('time', { datetime: new Date(event.ts).toISOString() }, formatTime(event.ts)),
  },
  {
    title: 'Level',
    key: 'level',
    width: 90,
    render: (event) =>
      h(
        NTag,
        { bordered: false, size: 'small', type: LEVEL_TAG_TYPES[event.level] },
        { default: () => event.level.toUpperCase() },
      ),
  },
  {
    title: 'Event',
    key: 'code',
    minWidth: 210,
    ellipsis: { tooltip: true },
    render: (event) => h('code', { class: 'diagnostic-code' }, event.code),
  },
  {
    title: 'Message',
    key: 'message',
    minWidth: 260,
    ellipsis: { tooltip: true },
  },
];

const diagnosticPagination = computed<PaginationProps>(() => ({
  page: diagnosticPage.value,
  pageSize: DIAGNOSTIC_PAGE_SIZE,
  pageSlot: 7,
  size: 'small',
  prefix: ({ startIndex, endIndex, itemCount }) => {
    const total = itemCount ?? 0;
    const range = total === 0 ? '0' : `${startIndex + 1}–${endIndex + 1}`;
    return `${range} of ${total} · max ${props.maxDiagnosticEvents}`;
  },
}));

watch([levelFilter, codeFilter], () => {
  diagnosticPage.value = 1;
  closeDetailsImmediately();
  void animateDiagnosticRows();
});

watch(filteredEvents, (events) => {
  const pageCount = Math.max(1, Math.ceil(events.length / DIAGNOSTIC_PAGE_SIZE));
  diagnosticPage.value = Math.min(diagnosticPage.value, pageCount);
  if (expandedRowKeys.value.some((key) => !events.some((event) => event.id === key))) {
    closeDetailsImmediately();
  }
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

function clearDetailCloseTimer(): void {
  if (detailCloseTimer) {
    clearTimeout(detailCloseTimer);
    detailCloseTimer = null;
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

function handleDiagnosticPageChange(page: number): void {
  diagnosticPage.value = page;
  closeDetailsImmediately();
  void animateDiagnosticRows();
}

async function handleExpandedRowKeys(keys: DataTableRowKey[]): Promise<void> {
  const latest = keys.at(-1);
  clearDetailCloseTimer();

  if (latest === undefined) {
    detailsOpen.value = false;
    if (prefersReducedMotion()) {
      expandedRowKeys.value = [];
      return;
    }
    detailCloseTimer = setTimeout(() => {
      expandedRowKeys.value = [];
      detailCloseTimer = null;
    }, DETAIL_TRANSITION_MS);
    return;
  }

  detailsOpen.value = false;
  expandedRowKeys.value = [latest];
  await nextTick();
  window.requestAnimationFrame(() => {
    if (expandedRowKeys.value[0] === latest) detailsOpen.value = true;
  });
}

function closeDetailsImmediately(): void {
  clearDetailCloseTimer();
  detailsOpen.value = false;
  expandedRowKeys.value = [];
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function animateDiagnosticRows(): Promise<void> {
  await nextTick();
  if (prefersReducedMotion()) return;

  const body = tableHost.value?.querySelector('tbody');
  if (!body || typeof body.animate !== 'function') return;
  for (const animation of body.getAnimations()) animation.cancel();
  body.animate(
    [
      { opacity: 0.72, transform: 'translateY(2px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  );
}

function handleMaxDiagnosticEvents(value: number | null): void {
  if (value !== null) emit('update:maxDiagnosticEvents', value);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString();
  }
  return d.toLocaleString();
}

onMounted(() => void animateDiagnosticRows());
onUnmounted(() => {
  clearResetConfirmTimer();
  clearDetailCloseTimer();
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
        label="Retained events"
        label-placement="left"
        :show-feedback="false"
      >
        <NInputNumber
          :max="DIAGNOSTIC_EVENT_LIMIT_MAX"
          :min="DIAGNOSTIC_EVENT_LIMIT_MIN"
          :precision="0"
          :step="10"
          :value="maxDiagnosticEvents"
          size="small"
          @update:value="handleMaxDiagnosticEvents"
        >
          <template #suffix>events</template>
        </NInputNumber>
      </NFormItem>

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

      <div ref="tableHost">
        <NDataTable
          class="diagnostics-table"
          :columns="diagnosticColumns"
          :data="filteredEvents"
          :expanded-row-keys="expandedRowKeys"
          :max-height="DIAGNOSTIC_BODY_HEIGHT"
          :min-height="DIAGNOSTIC_BODY_HEIGHT"
          :pagination="diagnosticPagination"
          :row-key="(event: DiagnosticEvent) => event.id"
          :single-line="false"
          size="small"
          table-layout="fixed"
          @update:expanded-row-keys="handleExpandedRowKeys"
          @update:page="handleDiagnosticPageChange"
        >
          <template #empty>
            <NEmpty
              size="small"
              :description="i18n('options_diagnostics_empty', 'No diagnostic events.')"
            />
          </template>
        </NDataTable>
      </div>
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

.diagnostics-table {
  font-family: var(--font-mono);
}

.diagnostics-table :deep(.n-data-table-th),
.diagnostics-table :deep(.n-data-table-td) {
  font-size: 12px;
}

.diagnostics-table :deep(.n-data-table-tr:not(.n-data-table-tr--expanded) > .n-data-table-td) {
  height: 38px;
  padding-top: 0;
  padding-bottom: 0;
}

.diagnostics-table :deep(.n-data-table-tr--expanded > .n-data-table-td) {
  height: auto;
  padding: 0;
}

.diagnostics-table :deep(.diagnostic-code) {
  font-weight: 600;
}

.diagnostics-table :deep(.diagnostic-context) {
  display: block;
  max-height: 220px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--color-surface-container-lowest);
  font-size: 11px;
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
