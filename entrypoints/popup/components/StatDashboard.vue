<script setup lang="ts">
import { computed } from 'vue';
import { NIcon } from 'naive-ui';
import { ArrowDown, ArrowUp } from '@lucide/vue';
import type { StatResponse } from '@/lib/api';
import { mediaSize } from '@/lib/media/presentation';
import { useI18n } from '@/shared/i18n/engine';
import SpeedSparkline from './SpeedSparkline.vue';
const props = defineProps<{ stat: StatResponse; history: number[] }>();
const { t, effectiveLocale } = useI18n();
const number = (value: string) =>
  new Intl.NumberFormat(effectiveLocale.value.replace('_', '-')).format(Number(value) || 0);
const speed = (value: string) =>
  `${mediaSize(Number(value), effectiveLocale.value.replace('_', '-'), '—')}/s`;
const transferring = computed(() => Number(props.stat.downloadSpeed) > 0);
const counts = computed(() => [
  { key: 'active', label: t('popup_stat_active'), value: number(props.stat.numActive) },
  { key: 'waiting', label: t('popup_stat_waiting'), value: number(props.stat.numWaiting) },
  { key: 'stopped', label: t('popup_stat_stopped'), value: number(props.stat.numStopped) },
]);
</script>
<template>
  <div class="stat-dash" :class="{ transferring }">
    <span class="stat-rays" aria-hidden="true" />
    <div class="speed-hero">
      <div class="speed-main">
        <span class="speed-label"
          ><NIcon :size="14"><ArrowDown /></NIcon>{{ t('popup_download') }}</span
        >
        <bdi class="speed-value">{{ speed(stat.downloadSpeed) }}</bdi>
      </div>
      <div class="speed-secondary">
        <span class="speed-label"
          ><NIcon :size="13"><ArrowUp /></NIcon>{{ t('popup_upload') }}</span
        >
        <bdi class="speed-value speed-value--small">{{ speed(stat.uploadSpeed) }}</bdi>
      </div>
    </div>
    <SpeedSparkline class="speed-graph" :values="history" :height="34" />
    <div class="counts">
      <span v-for="count in counts" :key="count.key" class="count-chip">
        {{ count.label }} <bdi>{{ count.value }}</bdi>
      </span>
    </div>
  </div>
</template>
<style scoped>
.stat-dash {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 14px;
  border-radius: var(--rb-radius-card);
  background: var(--rb-raised);
  box-shadow: var(--rb-shadow-raised);
  overflow: hidden;
}

.stat-rays {
  position: absolute;
  inset: -60% -20% auto;
  height: 160%;
  pointer-events: none;
  background:
    linear-gradient(118deg, transparent 44%, var(--rb-glow) 52%, transparent 60%),
    radial-gradient(60% 50% at 85% 0%, var(--rb-glow), transparent 70%);
  opacity: 0.35;
  transition: opacity var(--rb-motion-view) var(--rb-ease);
}

.transferring .stat-rays {
  opacity: 0.8;
}

.speed-hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.speed-main,
.speed-secondary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.speed-secondary {
  align-items: flex-end;
  text-align: end;
}

.speed-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--rb-text-muted);
}

.speed-value {
  font-size: 30px;
  line-height: 34px;
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  background: var(--rb-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  overflow-wrap: anywhere;
}

.speed-value--small {
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  background: none;
  color: var(--rb-text);
}

.speed-graph {
  position: relative;
}

.counts {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.count-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 22px;
  color: var(--rb-text-muted);
  background: var(--rb-fill);
}

.count-chip bdi {
  font-weight: 600;
  color: var(--rb-text);
  font-variant-numeric: tabular-nums;
}
</style>
