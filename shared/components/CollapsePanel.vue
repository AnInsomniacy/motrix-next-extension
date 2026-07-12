<script lang="ts" setup>
/**
 * CSS-only collapsible panel.
 * Uses the grid-template-rows 0fr→1fr technique for smooth height:auto
 * transitions; respects prefers-reduced-motion via globals.css.
 */
defineProps<{ open: boolean }>();
</script>

<template>
  <div class="collapse" :class="{ 'collapse--open': open }" :inert="!open">
    <div class="collapse__inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 0.22s var(--m3-ease-emphasized),
    opacity 0.22s var(--m3-ease-emphasized);
}

.collapse--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.collapse__inner {
  overflow: hidden;
  min-height: 0;
}
</style>
