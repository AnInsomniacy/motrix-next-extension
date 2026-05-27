<script lang="ts" setup>
/**
 * @fileoverview Download behavior settings section.
 *
 * Toggle switches for controlling download interception behavior.
 * Uses Naive UI NSwitch, matching the desktop Basic.vue controls.
 */
import { NFormItem, NSwitch, NDivider, NInputNumber, NSelect } from 'naive-ui';
import { motion } from 'motion-v';
import { computed } from 'vue';
import type { InterceptionScope, MinimumFileSizeSettings } from '@/shared/types';

defineProps<{
  enabled: boolean;
  interceptionScope: InterceptionScope;
  minimumFileSize: MinimumFileSizeSettings;
  hideDownloadBar: boolean;
  autoLaunchApp: boolean;
  forwardRequestHeaders: boolean;
  forwardCookies: boolean;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:scope': [value: Partial<InterceptionScope>];
  'update:minimumFileSize': [value: Partial<MinimumFileSizeSettings>];
  'update:hideDownloadBar': [value: boolean];
  'update:autoLaunchApp': [value: boolean];
  'update:forwardRequestHeaders': [value: boolean];
  'update:forwardCookies': [value: boolean];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();

const unknownSizeOptions = computed(() => [
  {
    label: i18n('options_min_size_unknown_intercept', 'Send to Motrix Next'),
    value: 'intercept',
  },
  {
    label: i18n('options_min_size_unknown_skip', 'Use browser'),
    value: 'skip',
  },
]);
</script>

<template>
  <div class="section">
    <NFormItem :label="i18n('options_enabled_label', 'Enable Download Interception')">
      <NSwitch :value="enabled" @update:value="emit('update:enabled', $event)" />
    </NFormItem>

    <motion.div
      class="scope-panel-motion"
      :initial="false"
      :animate="enabled ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }"
      :transition="{ duration: 0.22, ease: [0.2, 0, 0, 1] }"
    >
      <div class="scope-panel">
        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_browser_downloads_label', 'Regular Downloads')"
        >
          <NSwitch
            :value="interceptionScope.browserDownloads"
            @update:value="emit('update:scope', { browserDownloads: $event })"
          />
        </NFormItem>

        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_magnet_label', 'Magnet Links')"
        >
          <NSwitch
            :value="interceptionScope.magnet"
            @update:value="emit('update:scope', { magnet: $event })"
          />
        </NFormItem>

        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_ed2k_label', 'ED2K Links')"
        >
          <NSwitch
            :value="interceptionScope.ed2k"
            @update:value="emit('update:scope', { ed2k: $event })"
          />
        </NFormItem>

        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_thunder_label', 'Thunder Links')"
        >
          <NSwitch
            :value="interceptionScope.thunder"
            @update:value="emit('update:scope', { thunder: $event })"
          />
        </NFormItem>
      </div>
    </motion.div>

    <NDivider />

    <NFormItem :label="i18n('options_min_size_label', 'Small File Filter')">
      <NSwitch
        :value="minimumFileSize.enabled"
        @update:value="emit('update:minimumFileSize', { enabled: $event })"
      />
    </NFormItem>

    <motion.div
      class="scope-panel-motion"
      :initial="false"
      :animate="
        minimumFileSize.enabled ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }
      "
      :transition="{ duration: 0.22, ease: [0.2, 0, 0, 1] }"
    >
      <div class="size-panel">
        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_min_size_value_label', 'File smaller than')"
        >
          <NInputNumber
            :value="minimumFileSize.sizeMb"
            :min="0"
            :step="1"
            style="width: 132px"
            @update:value="(v: number | null) => emit('update:minimumFileSize', { sizeMb: v ?? 0 })"
          >
            <template #suffix>MB</template>
          </NInputNumber>
        </NFormItem>

        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_min_size_unknown_label', 'When size is unknown')"
        >
          <NSelect
            :value="minimumFileSize.unknownSizeAction"
            :options="unknownSizeOptions"
            style="width: 210px"
            @update:value="
              (value: 'intercept' | 'skip') =>
                emit('update:minimumFileSize', { unknownSizeAction: value })
            "
          />
        </NFormItem>
      </div>
    </motion.div>

    <NFormItem :label="i18n('options_hide_download_bar_label', 'Hide Browser Download Bar')">
      <NSwitch :value="hideDownloadBar" @update:value="emit('update:hideDownloadBar', $event)" />
    </NFormItem>

    <NFormItem :label="i18n('options_auto_launch_label', 'Auto-launch Motrix Next')">
      <NSwitch :value="autoLaunchApp" @update:value="emit('update:autoLaunchApp', $event)" />
    </NFormItem>

    <NFormItem :label="i18n('options_forward_request_headers_label', 'Forward Request Headers')">
      <NSwitch
        :value="forwardRequestHeaders"
        @update:value="emit('update:forwardRequestHeaders', $event)"
      />
    </NFormItem>

    <NFormItem :label="i18n('options_forward_cookies_label', 'Forward Cookies')">
      <NSwitch :value="forwardCookies" @update:value="emit('update:forwardCookies', $event)" />
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

.scope-panel-motion {
  overflow: hidden;
}

.scope-panel {
  padding: 8px 0 0 18px;
}

.size-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 0 20px 18px;
}

.scope-panel__item {
  margin-bottom: 0;
}
</style>
