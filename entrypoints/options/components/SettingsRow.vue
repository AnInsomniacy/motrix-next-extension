<script setup lang="ts">
import { useId } from 'vue';
import { NFormItem } from 'naive-ui';

defineProps<{ label: string; hint?: string; compact?: boolean }>();
const labelId = useId();
const hintId = useId();
</script>

<template>
  <NFormItem
    class="settings-row"
    :class="{ 'settings-row--compact': compact }"
    :theme-overrides="
      compact
        ? { blankHeightSmall: '24px', blankHeightMedium: '24px', blankHeightLarge: '24px' }
        : undefined
    "
    label-placement="left"
    label-align="left"
    :show-feedback="false"
    :label-props="{ id: labelId }"
    role="group"
    :aria-labelledby="labelId"
    :aria-describedby="hint ? hintId : undefined"
  >
    <template #label>
      <span class="setting-label">{{ label }}</span>
      <span v-if="hint" :id="hintId" class="hint setting-hint">{{ hint }}</span>
    </template>
    <slot :label-id="labelId" :hint-id="hint ? hintId : undefined" />
  </NFormItem>
</template>
