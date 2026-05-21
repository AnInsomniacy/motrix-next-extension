<script lang="ts" setup>
/**
 * @fileoverview Download behavior settings section.
 *
 * Toggle switches for controlling download interception behavior.
 * Uses Naive UI NSwitch, matching the desktop Basic.vue controls.
 */
import { NFormItem, NSwitch, NDivider } from 'naive-ui';
import { motion } from 'motion-v';
import type { InterceptionScope } from '@/shared/types';

defineProps<{
  enabled: boolean;
  interceptionScope: InterceptionScope;
  hideDownloadBar: boolean;
  autoLaunchApp: boolean;
  forwardCookies: boolean;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:scope': [value: Partial<InterceptionScope>];
  'update:hideDownloadBar': [value: boolean];
  'update:autoLaunchApp': [value: boolean];
  'update:forwardCookies': [value: boolean];
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

    <motion.div
      class="scope-panel-motion"
      :initial="false"
      :animate="enabled ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }"
      :transition="{ duration: 0.22, ease: [0.2, 0, 0, 1] }"
    >
      <div class="scope-panel">
        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_browser_downloads_label', 'Browser Downloads')"
        >
          <template #label>
            <div class="label-group">
              <span>{{ i18n('options_scope_browser_downloads_label', 'Browser Downloads') }}</span>
              <span class="label-hint">{{
                i18n(
                  'options_scope_browser_downloads_desc',
                  'HTTP, HTTPS, FTP, torrent files, and normal browser downloads',
                )
              }}</span>
            </div>
          </template>
          <NSwitch
            :value="interceptionScope.browserDownloads"
            @update:value="emit('update:scope', { browserDownloads: $event })"
          />
        </NFormItem>

        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_magnet_label', 'Magnet Links')"
        >
          <template #label>
            <div class="label-group">
              <span>{{ i18n('options_scope_magnet_label', 'Magnet Links') }}</span>
              <span class="label-hint">{{
                i18n('options_scope_magnet_desc', 'magnet: links opened from web pages')
              }}</span>
            </div>
          </template>
          <NSwitch
            :value="interceptionScope.magnet"
            @update:value="emit('update:scope', { magnet: $event })"
          />
        </NFormItem>

        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_ed2k_label', 'ED2K Links')"
        >
          <template #label>
            <div class="label-group">
              <span>{{ i18n('options_scope_ed2k_label', 'ED2K Links') }}</span>
              <span class="label-hint">{{
                i18n('options_scope_ed2k_desc', 'ed2k: links opened from web pages')
              }}</span>
            </div>
          </template>
          <NSwitch
            :value="interceptionScope.ed2k"
            @update:value="emit('update:scope', { ed2k: $event })"
          />
        </NFormItem>

        <NFormItem
          class="scope-panel__item"
          :label="i18n('options_scope_thunder_label', 'Thunder Links')"
        >
          <template #label>
            <div class="label-group">
              <span>{{ i18n('options_scope_thunder_label', 'Thunder Links') }}</span>
              <span class="label-hint">{{
                i18n('options_scope_thunder_desc', 'thunder: links opened from web pages')
              }}</span>
            </div>
          </template>
          <NSwitch
            :value="interceptionScope.thunder"
            @update:value="emit('update:scope', { thunder: $event })"
          />
        </NFormItem>
      </div>
    </motion.div>

    <NDivider />

    <NFormItem :label="i18n('options_hide_download_bar_label', 'Hide Browser Download Bar')">
      <template #label>
        <div class="label-group">
          <span>{{ i18n('options_hide_download_bar_label', 'Hide Browser Download Bar') }}</span>
          <span class="label-hint">{{
            i18n(
              'options_hide_download_bar_desc',
              'Requests optional download UI permission before changing browser UI',
            )
          }}</span>
        </div>
      </template>
      <NSwitch :value="hideDownloadBar" @update:value="emit('update:hideDownloadBar', $event)" />
    </NFormItem>

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

    <NFormItem :label="i18n('options_forward_cookies_label', 'Forward Cookies')">
      <template #label>
        <div class="label-group">
          <span>{{ i18n('options_forward_cookies_label', 'Forward Cookies') }}</span>
          <span class="label-hint">{{
            i18n('options_forward_cookies_desc', 'Forwards cookies for authenticated downloads')
          }}</span>
        </div>
      </template>
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

.scope-panel-motion {
  overflow: hidden;
}

.scope-panel {
  padding: 8px 0 0 18px;
}

.scope-panel__item {
  margin-bottom: 0;
}
</style>
