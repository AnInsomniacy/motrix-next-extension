<script lang="ts" setup>
/**
 * @fileoverview Diagnostic log viewer section.
 *
 * Displays extension diagnostic events in a monospace log viewer
 * with level-colored badges and formatted timestamps. Uses Naive UI
 * NButton for actions and NEmpty for the zero-state.
 */
import { computed } from 'vue';
import { NButton, NIcon, NTag, NEmpty } from 'naive-ui';
import { CopyOutline, TrashOutline } from '@vicons/ionicons5';
import type { DiagnosticEvent } from '@/shared/types';

const props = defineProps<{
  events: DiagnosticEvent[];
}>();

const emit = defineEmits<{
  copy: [];
  clear: [];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

const reversed = computed(() => [...props.events].reverse());

const LEVEL_TYPE: Record<string, 'success' | 'warning' | 'error'> = {
  info: 'success',
  warn: 'warning',
  error: 'error',
};
</script>

<template>
  <div class="section">
    <div class="diag-actions">
      <NButton size="small" quaternary @click="emit('copy')">
        <template #icon>
          <NIcon :size="14"><CopyOutline /></NIcon>
        </template>
        {{ i18n('options_diagnostics_copy', 'Copy Log (JSON)') }}
      </NButton>
      <NButton size="small" quaternary type="error" @click="emit('clear')">
        <template #icon>
          <NIcon :size="14"><TrashOutline /></NIcon>
        </template>
        {{ i18n('options_diagnostics_clear', 'Clear Log') }}
      </NButton>
    </div>

    <Transition name="fade" mode="out-in">
      <div v-if="events.length" key="log" class="diag-log">
        <div v-for="event in reversed" :key="event.id" class="diag-entry">
          <span class="diag-entry__time">{{ formatTime(event.ts) }}</span>
          <NTag :type="LEVEL_TYPE[event.level] ?? 'default'" size="tiny" round>
            {{ event.level }}
          </NTag>
          <code class="diag-entry__code">{{ event.code }}</code>
          <span class="diag-entry__msg">{{ event.message }}</span>
        </div>
      </div>
      <NEmpty
        v-else
        key="empty"
        size="small"
        :description="i18n('options_diagnostics_empty', 'No diagnostic events.')"
      />
    </Transition>
  </div>
</template>

<style scoped>
.diag-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.diag-log {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--color-surface-container-high);
  border-radius: 10px;
  padding: 8px;
}

.diag-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 5px 8px;
  border-radius: 6px;
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
</style>
