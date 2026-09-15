<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{
  clearLabel: string;
  confirmLabel: string;
  confirming: boolean;
  seconds: number;
  secondsSuffix: string;
}>();

const measure = ref<globalThis.HTMLSpanElement | null>(null);
const width = ref<number | null>(null);
let observer: globalThis.ResizeObserver | null = null;

const renderedText = computed(() =>
  props.confirming
    ? `${props.confirmLabel} · ${props.seconds} ${props.secondsSuffix}`
    : props.clearLabel,
);

function syncWidth(): void {
  const nextWidth = measure.value?.getBoundingClientRect().width;
  if (nextWidth) width.value = Math.ceil(nextWidth);
}

onMounted(() => {
  observer = new globalThis.ResizeObserver(syncWidth);
  if (measure.value) observer.observe(measure.value);
  syncWidth();
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <span
    class="clear-diagnostics-label"
    :style="width === null ? undefined : { width: `${width}px` }"
  >
    <span ref="measure" aria-hidden="true" class="clear-diagnostics-label__measure">
      {{ renderedText }}
    </span>

    <Transition name="text-swap" mode="out-in">
      <span v-if="!confirming" key="clear" class="clear-diagnostics-label__value">
        {{ clearLabel }}
      </span>
      <span v-else key="confirm" class="clear-diagnostics-label__value">
        <span>{{ confirmLabel }}</span>
        <span aria-hidden="true">·</span>
        <span class="clear-diagnostics-label__countdown">
          <Transition name="count-swap" mode="out-in">
            <span :key="seconds">{{ seconds }}</span>
          </Transition>
        </span>
        <span>{{ secondsSuffix }}</span>
      </span>
    </Transition>
  </span>
</template>

<style scoped>
.clear-diagnostics-label {
  display: inline-grid;
  min-height: 1em;
  overflow: hidden;
  position: relative;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  transition: width 0.2s var(--m3-ease-emphasized);
}

.clear-diagnostics-label__measure {
  position: absolute;
  visibility: hidden;
  white-space: nowrap;
}

.clear-diagnostics-label__value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  grid-area: 1 / 1;
  white-space: nowrap;
}

.clear-diagnostics-label__countdown {
  display: inline-grid;
  min-width: 1ch;
  text-align: center;
}

.clear-diagnostics-label__countdown > span {
  grid-area: 1 / 1;
}

.count-swap-enter-active,
.count-swap-leave-active {
  transition:
    opacity 0.12s var(--m3-ease-emphasized),
    transform 0.12s var(--m3-ease-emphasized);
}

.count-swap-enter-from {
  opacity: 0;
  transform: translateY(50%);
}

.count-swap-leave-to {
  opacity: 0;
  transform: translateY(-50%);
}
</style>
