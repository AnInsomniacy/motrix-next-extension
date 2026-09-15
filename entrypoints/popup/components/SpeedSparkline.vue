<script setup lang="ts">
/** @fileoverview Compact area chart of recent samples. Path geometry comes from d3-shape. */
import { computed, ref, useId } from 'vue';
import { useElementSize } from '@/shared/components/use-element-size';
import { area, line, curveMonotoneX } from 'd3-shape';

const props = withDefaults(
  defineProps<{ values: number[]; capacity?: number; height?: number }>(),
  {
    capacity: 90,
    height: 28,
  },
);

const host = ref<InstanceType<typeof window.HTMLElement> | null>(null);
const { width } = useElementSize(host);
const gradientId = `sparkline-${useId()}`;

const geometry = computed(() => {
  const w = Math.max(1, width.value);
  const h = props.height;
  const values = props.values.slice(-props.capacity);
  if (values.length < 2 || w < 2) return { area: '', line: '' };
  const max = Math.max(1, ...values);
  const step = w / (props.capacity - 1);
  const offset = w - step * (values.length - 1);
  const points = values.map((value, index) => [offset + index * step, value] as [number, number]);
  const x = (point: [number, number]) => point[0];
  const y = (point: [number, number]) => h - 2 - ((h - 4) * point[1]) / max;
  const areaPath = area<[number, number]>().x(x).y0(h).y1(y).curve(curveMonotoneX)(points) ?? '';
  const linePath = line<[number, number]>().x(x).y(y).curve(curveMonotoneX)(points) ?? '';
  return { area: areaPath, line: linePath };
});
</script>

<template>
  <div ref="host" class="sparkline" :style="{ height: `${height}px` }" aria-hidden="true">
    <svg v-if="geometry.line" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--rb-accent)" stop-opacity="0.32" />
          <stop offset="1" stop-color="var(--rb-accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="geometry.area" :fill="`url(#${gradientId})`" />
      <path
        :d="geometry.line"
        fill="none"
        stroke="var(--rb-accent)"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<style scoped>
.sparkline {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.sparkline svg {
  display: block;
}

.sparkline path {
  transition: d var(--rb-motion-progress) linear;
}
</style>
