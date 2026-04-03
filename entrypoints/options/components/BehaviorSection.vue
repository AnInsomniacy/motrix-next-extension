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
  fallbackToBrowser: boolean;
  notifyOnStart: boolean;
  notifyOnComplete: boolean;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:minFileSize': [value: number];
  'update:fallbackToBrowser': [value: boolean];
  'update:notifyOnStart': [value: boolean];
  'update:notifyOnComplete': [value: boolean];
}>();

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}
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

    <NFormItem :label="i18n('options_fallback_label', 'Fallback to Browser on Failure')">
      <template #label>
        <div class="label-group">
          <span>{{ i18n('options_fallback_label', 'Fallback to Browser on Failure') }}</span>
          <span class="label-hint">{{
            i18n('options_fallback_desc', 'Resume download in browser if aria2 fails')
          }}</span>
        </div>
      </template>
      <NSwitch
        :value="fallbackToBrowser"
        @update:value="emit('update:fallbackToBrowser', $event)"
      />
    </NFormItem>

    <NDivider />

    <NFormItem :label="i18n('options_notify_start_label', 'Notify on Download Start')">
      <NSwitch :value="notifyOnStart" @update:value="emit('update:notifyOnStart', $event)" />
    </NFormItem>

    <NFormItem :label="i18n('options_notify_complete_label', 'Notify on Download Complete')">
      <NSwitch :value="notifyOnComplete" @update:value="emit('update:notifyOnComplete', $event)" />
    </NFormItem>
  </div>
</template>

<style scoped>
.section :deep(.n-form-item) {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
