<script lang="ts" setup>
/**
 * @fileoverview Download behavior settings section.
 *
 * Toggle switches for controlling download interception behavior.
 * Uses Naive UI NSwitch, matching the desktop Basic.vue controls.
 */
import { computed } from 'vue';
import { NFormItem, NInputNumber, NSelect, NSwitch } from 'naive-ui';
import { motion } from 'motion-v';
import type {
  DesktopUnavailableAction,
  DesktopUnavailableSettings,
  InterceptionScope,
} from '@/shared/types';

defineProps<{
  enabled: boolean;
  interceptionScope: InterceptionScope;
  hideDownloadBar: boolean;
  canControlDownloadUi: boolean;
  desktopUnavailable: DesktopUnavailableSettings;
  forwardRequestHeaders: boolean;
  forwardCookies: boolean;
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:scope': [value: Partial<InterceptionScope>];
  'update:hideDownloadBar': [value: boolean];
  'update:desktopUnavailable': [value: Partial<DesktopUnavailableSettings>];
  'update:forwardRequestHeaders': [value: boolean];
  'update:forwardCookies': [value: boolean];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();

const unavailableActionOptions = computed(() => [
  {
    label: i18n('options_desktop_unavailable_launch', 'Launch Motrix Next'),
    value: 'launch',
  },
  {
    label: i18n('options_desktop_unavailable_browser', 'Use Browser'),
    value: 'browser',
  },
]);
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
        v-if="canControlDownloadUi"
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_hide_download_bar_label', 'Hide Browser Download Bar')"
      >
        <NSwitch :value="hideDownloadBar" @update:value="emit('update:hideDownloadBar', $event)" />
      </NFormItem>

      <NFormItem
        class="settings-row"
        :show-feedback="false"
        :label="i18n('options_desktop_unavailable_label', 'When Motrix Next Is Unavailable')"
      >
        <NSelect
          :value="desktopUnavailable.action"
          :options="unavailableActionOptions"
          style="width: 210px"
          @update:value="
            (value: DesktopUnavailableAction) =>
              emit('update:desktopUnavailable', { action: value })
          "
        />
      </NFormItem>

      <motion.div
        class="settings-panel-motion"
        :initial="false"
        :animate="
          desktopUnavailable.action === 'launch'
            ? { height: 'auto', opacity: 1 }
            : { height: 0, opacity: 0 }
        "
        :transition="{ duration: 0.22, ease: [0.2, 0, 0, 1] }"
      >
        <div class="settings-subpanel">
          <NFormItem
            class="settings-row settings-row--nested"
            :show-feedback="false"
            :label="i18n('options_desktop_startup_timeout_label', 'Startup Timeout')"
          >
            <NInputNumber
              :value="desktopUnavailable.startupTimeoutSeconds"
              :min="1"
              :max="60"
              :step="1"
              style="width: 132px"
              @update:value="
                (value: number | null) =>
                  emit('update:desktopUnavailable', { startupTimeoutSeconds: value ?? 15 })
              "
            >
              <template #suffix>
                {{ i18n('options_seconds_suffix', 's') }}
              </template>
            </NInputNumber>
          </NFormItem>
        </div>
      </motion.div>
    </section>
  </div>
</template>
