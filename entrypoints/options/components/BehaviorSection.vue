<script lang="ts" setup>
/**
 * @fileoverview Download behavior settings section.
 *
 * Toggle switches and a numeric input for controlling download
 * interception behavior. Uses Naive UI NSwitch (identical component
 * to the desktop Basic.vue), NInputNumber, and NDivider.
 */
import { NFormItem, NSwitch, NInputNumber, NDivider } from 'naive-ui';

defineProps<{
  enabled: boolean;
  minFileSize: number;
  autoLaunchApp: boolean;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:minFileSize': [value: number];
  'update:autoLaunchApp': [value: boolean];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();
</script>

<template>
  <div class="section">
    <NFormItem :label="i18n('options_enabled_label', 'Enable Download Interception')">
      <template #label>
        <div class="label-group">
          <span>{{ i18n('options_enabled_label', 'Enable Download Interception') }}</span>
          <span class="label-hint">{{
            i18n('options_enabled_desc', 'Automatically intercept browser downloads')
          }}</span>
        </div>
      </template>
      <NSwitch :value="enabled" @update:value="emit('update:enabled', $event)" />
    </NFormItem>

    <NFormItem :label="i18n('options_min_size_label', 'Minimum File Size (MB)')">
      <template #label>
        <div class="label-group">
          <span>{{ i18n('options_min_size_label', 'Minimum File Size (MB)') }}</span>
          <span class="label-hint">{{
            i18n('options_min_size_desc', 'Skip files smaller than this threshold')
          }}</span>
        </div>
      </template>
      <NInputNumber
        :value="minFileSize"
        :min="0"
        :step="1"
        style="width: 120px"
        @update:value="(v: number | null) => emit('update:minFileSize', v ?? 0)"
      />
    </NFormItem>

    <NDivider />

    <NFormItem :label="i18n('options_auto_launch_label', 'Auto-launch Motrix Next')">
      <template #label>
        <div class="label-group">
          <span>{{ i18n('options_auto_launch_label', 'Auto-launch Motrix Next') }}</span>
          <span class="label-hint">{{
            i18n('options_auto_launch_desc', "Try to launch Motrix Next when it's not running")
          }}</span>
        </div>
      </template>
      <NSwitch :value="autoLaunchApp" @update:value="emit('update:autoLaunchApp', $event)" />
    </NFormItem>
  </div>
</template>

<style scoped>
.section :deep(.n-form-item) {
  display: flex;
  align-items: center;
  gap: 16px;
}

.section :deep(.n-form-item-label) {
  flex: 1;
  min-width: 0;
}

.label-group {
  display: flex;
  flex-direction: column;
}

.label-hint {
  font-size: 12px;
  color: var(--color-on-surface-variant);
  opacity: 0.8;
  margin-top: 2px;
  font-weight: 400;
}
</style>
