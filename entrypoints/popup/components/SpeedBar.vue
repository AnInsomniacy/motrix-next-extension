<script lang="ts" setup>
/**
 * @fileoverview Global speed indicator strip.
 *
 * Displays download/upload speeds and active task count in a compact
 * single-line bar, mirroring the desktop Speedometer.vue widget.
 * Uses @vicons/ionicons5 for directional arrows.
 */
import { computed } from 'vue';
import { NIcon } from 'naive-ui';
import { ArrowDownOutline, ArrowUpOutline, SpeedometerOutline } from '@vicons/ionicons5';
import type { StatResponse } from '@/lib/rpc/desktop-client';

const props = defineProps<{
  stat: StatResponse;
}>();

import { useI18n } from '@/shared/i18n/engine';

const { tSub: i18nSub } = useI18n();

function formatSpeed(bytesPerSec: string): string {
  const n = parseInt(bytesPerSec, 10);
  if (isNaN(n) || n === 0) return '0 B/s';
  if (n < 1024) return `${n} B/s`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB/s`;
  return `${(n / 1048576).toFixed(1)} MB/s`;
}

const isStopped = computed(() => parseInt(props.stat.numActive, 10) === 0);
</script>

<template>
  <div :class="['speed-bar', { 'speed-bar--stopped': isStopped }]">
    <div class="speed-bar__col speed-bar__col--dl">
      <NIcon :size="11" class="speed-bar__arrow"><ArrowDownOutline /></NIcon>
      <span>{{ formatSpeed(stat.downloadSpeed) }}</span>
    </div>
    <div class="speed-bar__col speed-bar__col--ul">
      <NIcon :size="11" class="speed-bar__arrow"><ArrowUpOutline /></NIcon>
      <span>{{ formatSpeed(stat.uploadSpeed) }}</span>
    </div>
    <div class="speed-bar__col speed-bar__col--active">
      <NIcon :size="12"><SpeedometerOutline /></NIcon>
      <span>{{
        i18nSub('popup_speed_active_count', [stat.numActive], `${stat.numActive} active`)
      }}</span>
    </div>
  </div>
</template>

<style scoped>
.speed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--color-on-surface-variant);
  border-top: 1px solid var(--color-outline-variant);
  border-bottom: 1px solid var(--color-outline-variant);
  background: var(--color-surface-container-low);
}

.speed-bar--stopped {
  opacity: 0.6;
}

.speed-bar__col {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.speed-bar__col--dl {
  color: var(--color-primary);
  font-weight: 500;
}

.speed-bar__col--ul {
  color: var(--color-on-surface-variant);
}

.speed-bar__col--active {
  color: var(--color-on-surface-variant);
  gap: 4px;
}

.speed-bar__arrow {
  flex-shrink: 0;
}
</style>
