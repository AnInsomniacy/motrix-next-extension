<script setup lang="ts">
import { NIcon } from 'naive-ui';
import { ArrowDownOutline, ArrowUpOutline } from '@vicons/ionicons5';
import type { StatResponse } from '@/lib/api';
import { mediaSize } from '@/lib/media/presentation';
import { useI18n } from '@/shared/i18n/engine';
defineProps<{ stat: StatResponse }>();
const { t, effectiveLocale } = useI18n();
const number = (value: string) =>
  new Intl.NumberFormat(effectiveLocale.value.replace('_', '-')).format(Number(value) || 0);
const speed = (value: string) =>
  `${mediaSize(Number(value), effectiveLocale.value.replace('_', '-'), '—')}/s`;
</script>
<template>
  <div class="stat-dash">
    <div class="speed-row">
      <NIcon :size="16"><ArrowDownOutline /></NIcon>
      <bdi>{{ speed(stat.downloadSpeed) }}</bdi>
      <span>{{ t('popup_download') }}</span>
    </div>
    <div class="speed-row">
      <NIcon :size="16"><ArrowUpOutline /></NIcon>
      <bdi>{{ speed(stat.uploadSpeed) }}</bdi>
      <span>{{ t('popup_upload') }}</span>
    </div>
    <div class="counts">
      <span
        >{{ t('popup_stat_active') }} <bdi>{{ number(stat.numActive) }}</bdi></span
      >
      <span
        >{{ t('popup_stat_waiting') }} <bdi>{{ number(stat.numWaiting) }}</bdi></span
      >
      <span
        >{{ t('popup_stat_stopped') }} <bdi>{{ number(stat.numStopped) }}</bdi></span
      >
    </div>
  </div>
</template>
<style scoped>
.stat-dash {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  padding-block-start: 12px;
}
.speed-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 0 8px;
}
.speed-row .n-icon {
  color: var(--color-primary);
}
.speed-row bdi {
  font-size: 18px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.speed-row > span {
  grid-column: 2;
  font-size: 12px;
  color: var(--color-on-surface-variant);
}
.counts {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-block-start: 14px;
  padding-block: 10px 4px;
  border-block-start: 1px solid var(--color-outline-variant);
  font-size: 12px;
  color: var(--color-on-surface-variant);
}
.counts bdi {
  margin-inline-start: 4px;
  font-variant-numeric: tabular-nums;
}
</style>
