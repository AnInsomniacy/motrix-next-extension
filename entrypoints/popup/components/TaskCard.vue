<script lang="ts" setup>
/**
 * @fileoverview Individual task card for the popup task list.
 *
 * Renders a compact download item with status color bar, task name,
 * Naive UI NProgress bar (with processing shimmer), speed indicator,
 * and file-size progress. Visually aligned with the desktop
 * TaskItem.vue component.
 */
import { computed } from 'vue';
import { NProgress, NIcon } from 'naive-ui';
import { ArrowDownOutline } from '@vicons/ionicons5';
import type { Aria2Task } from '@/shared/types';

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

const props = defineProps<{
  task: Aria2Task;
}>();

/* ── Computed Data ───────────────────────────────────────────────── */

const progress = computed(() => {
  const total = parseInt(props.task.totalLength, 10);
  const done = parseInt(props.task.completedLength, 10);
  if (!total || isNaN(total)) return 0;
  return Math.round((done / total) * 100);
});

const taskName = computed(() => {
  if (props.task.bittorrent?.info?.name) return props.task.bittorrent.info.name;
  const file = props.task.files[0];
  if (file?.path) {
    const parts = file.path.split('/');
    return parts[parts.length - 1] || i18n('task_name_unknown', 'Unknown');
  }
  if (file?.uris?.[0]?.uri) {
    try {
      return new URL(file.uris[0].uri).pathname.split('/').pop() || i18n('task_name_unknown', 'Unknown');
    } catch {
      /* fallthrough */
    }
  }
  return props.task.gid;
});

const statusColor = computed(() => {
  const s = props.task.status;
  if (s === 'active') return 'var(--color-primary)';
  if (s === 'paused' || s === 'waiting') return 'var(--color-warning)';
  if (s === 'error') return 'var(--color-error)';
  if (s === 'complete') return 'var(--color-success)';
  return 'var(--color-outline)';
});

const isActive = computed(() => props.task.status === 'active');

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
</script>

<template>
  <div class="task-card">
    <!-- Status color bar (desktop TaskItem.vue style) -->
    <div
      class="task-card__status-bar"
      :style="{ backgroundColor: statusColor }"
    />
    <div class="task-card__body">
      <div class="task-card__row">
        <span class="task-card__name" :title="taskName">{{ taskName }}</span>
        <span v-if="isActive" class="task-card__speed">
          <NIcon :size="10"><ArrowDownOutline /></NIcon>
          {{ formatSpeed(task.downloadSpeed) }}
        </span>
      </div>

      <!-- NProgress from Naive UI — same component as desktop TaskItem -->
      <NProgress
        type="line"
        :percentage="progress"
        :height="6"
        :border-radius="3"
        :show-indicator="false"
        :processing="isActive"
        class="task-card__progress"
      />

      <div class="task-card__row task-card__meta">
        <span>{{ formatSize(task.completedLength) }} / {{ formatSize(task.totalLength) }}</span>
        <span>{{ progress }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-card {
  display: flex;
  background: var(--color-surface-container);
  border-radius: 8px;
  overflow: hidden;
  transition: background-color 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.task-card:hover {
  background: var(--color-surface-container-high);
}

/* 3px status bar on the left — mirrors desktop TaskItem */
.task-card__status-bar {
  width: 3px;
  flex-shrink: 0;
  border-radius: 2px 0 0 2px;
}

.task-card__body {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
}

.task-card__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-card__name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.task-card__speed {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
  flex-shrink: 0;
  margin-left: 8px;
}

.task-card__progress {
  margin: 4px 0 3px;
}

.task-card__meta {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--color-on-surface-variant);
  opacity: 0.8;
}
</style>
