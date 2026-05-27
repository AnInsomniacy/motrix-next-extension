<script lang="ts" setup>
/**
 * @fileoverview Download behavior settings section.
 *
 * Toggle switches for controlling download interception behavior.
 * Uses Naive UI NSwitch, matching the desktop Basic.vue controls.
 */
import { NFormItem, NSwitch } from 'naive-ui';
import { motion } from 'motion-v';
import type { InterceptionScope } from '@/shared/types';

defineProps<{
  enabled: boolean;
  interceptionScope: InterceptionScope;
  hideDownloadBar: boolean;
  autoLaunchApp: boolean;
  forwardRequestHeaders: boolean;
  forwardCookies: boolean;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:scope': [value: Partial<InterceptionScope>];
  'update:hideDownloadBar': [value: boolean];
  'update:autoLaunchApp': [value: boolean];
  'update:forwardRequestHeaders': [value: boolean];
  'update:forwardCookies': [value: boolean];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();
</script>

<template>
  <div class="settings-section">
    <section class="settings-group">
      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_enabled_label', 'Enable Download Interception')"
      >
        <NSwitch :value="enabled" @update:value="emit('update:enabled', $event)" />
      </NFormItem>

      <motion.div
        class="settings-panel-motion"
        :initial="false"
        :animate="enabled ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }"
        :transition="{ duration: 0.22, ease: [0.2, 0, 0, 1] }"
      >
        <div class="settings-subpanel">
          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_scope_browser_downloads_label', 'Regular Downloads')"
          >
            <NSwitch
              :value="interceptionScope.browserDownloads"
              @update:value="emit('update:scope', { browserDownloads: $event })"
            />
          </NFormItem>

          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_scope_magnet_label', 'Magnet Links')"
          >
            <NSwitch
              :value="interceptionScope.magnet"
              @update:value="emit('update:scope', { magnet: $event })"
            />
          </NFormItem>

          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_scope_ed2k_label', 'ED2K Links')"
          >
            <NSwitch
              :value="interceptionScope.ed2k"
              @update:value="emit('update:scope', { ed2k: $event })"
            />
          </NFormItem>

          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_scope_thunder_label', 'Thunder Links')"
          >
            <NSwitch
              :value="interceptionScope.thunder"
              @update:value="emit('update:scope', { thunder: $event })"
            />
          </NFormItem>
        </div>
      </motion.div>
    </section>

    <section class="settings-group">
      <h3 class="settings-group-title">
        {{ i18n('options_privacy_section_label', 'Privacy') }}
      </h3>

      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_forward_request_headers_label', 'Forward Request Headers')"
      >
        <NSwitch
          :value="forwardRequestHeaders"
          @update:value="emit('update:forwardRequestHeaders', $event)"
        />
      </NFormItem>

      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_forward_cookies_label', 'Forward Cookies')"
      >
        <NSwitch :value="forwardCookies" @update:value="emit('update:forwardCookies', $event)" />
      </NFormItem>
    </section>

    <section class="settings-group">
      <h3 class="settings-group-title">
        {{ i18n('options_download_handling_section_label', 'Download Handling') }}
      </h3>

      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_hide_download_bar_label', 'Hide Browser Download Bar')"
      >
        <NSwitch :value="hideDownloadBar" @update:value="emit('update:hideDownloadBar', $event)" />
      </NFormItem>

      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_auto_launch_label', 'Auto-launch Motrix Next')"
      >
        <NSwitch :value="autoLaunchApp" @update:value="emit('update:autoLaunchApp', $event)" />
      </NFormItem>
    </section>
  </div>
</template>
