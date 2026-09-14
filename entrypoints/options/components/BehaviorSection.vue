<script lang="ts" setup>
/** Download behavior settings section. */
import { computed } from 'vue';
import SettingsRow from './SettingsRow.vue';
import {
  NCheckbox,
  NInputNumber,
  NSelect,
  NSwitch,
  NTag,
  NSpace,
  NCollapseTransition,
} from 'naive-ui';
import type {
  DesktopUnavailableAction,
  DesktopUnavailableSettings,
  InterceptionScope,
  DownloadSettings,
} from '@/lib/schema';

defineProps<{
  enabled: boolean;
  interceptionScope: InterceptionScope;
  hideDownloadBar: boolean;
  canControlDownloadUi: boolean;
  desktopUnavailable: DesktopUnavailableSettings;
  forwardRequestHeaders: boolean;
  forwardCookies: boolean;
  mediaDiscovery: DownloadSettings['mediaDiscovery'];
}>();

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  'update:scope': [value: Partial<InterceptionScope>];
  'update:hideDownloadBar': [value: boolean];
  'update:desktopUnavailable': [value: Partial<DesktopUnavailableSettings>];
  'update:forwardRequestHeaders': [value: boolean];
  'update:forwardCookies': [value: boolean];
  'update:mediaDiscovery': [value: Partial<DownloadSettings['mediaDiscovery']>];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();

const scopes: { key: keyof InterceptionScope; label: string }[] = [
  { key: 'browserDownloads', label: 'options_scope_browser_downloads_label' },
  { key: 'magnet', label: 'options_scope_magnet_label' },
  { key: 'ed2k', label: 'options_scope_ed2k_label' },
  { key: 'thunder', label: 'options_scope_thunder_label' },
];
const unavailableActionOptions = computed(() => [
  {
    label: i18n('options_desktop_unavailable_launch', 'Launch Rayburst'),
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
      <SettingsRow compact :label="i18n('options_enabled_label', 'Enable Download Interception')">
        <NSwitch
          :aria-label="i18n('options_enabled_label', 'Enable Download Interception')"
          :value="enabled"
          @update:value="emit('update:enabled', $event)"
        />
      </SettingsRow>

      <NCollapseTransition :show="enabled">
        <div
          class="settings-subpanel scope-options"
          role="group"
          :aria-label="i18n('options_enabled_label')"
          :inert="!enabled"
        >
          <SettingsRow compact v-for="scope in scopes" :key="scope.key" :label="i18n(scope.label)">
            <NCheckbox
              :checked="interceptionScope[scope.key]"
              :aria-label="i18n(scope.label)"
              @update:checked="emit('update:scope', { [scope.key]: $event })"
            />
          </SettingsRow>
        </div>
      </NCollapseTransition>
    </section>

    <section class="settings-group">
      <SettingsRow compact :label="i18n('media_discover')" :hint="i18n('media_hint')">
        <NSwitch
          :aria-label="i18n('media_discover')"
          :value="mediaDiscovery.enabled"
          @update:value="emit('update:mediaDiscovery', { enabled: $event })"
        />
      </SettingsRow>
      <NSpace
        v-if="mediaDiscovery.excludedHosts.length"
        class="settings-subpanel"
        :aria-label="i18n('media_excluded_sites')"
      >
        <NTag
          v-for="host in mediaDiscovery.excludedHosts"
          :key="host"
          closable
          @close="
            emit('update:mediaDiscovery', {
              excludedHosts: mediaDiscovery.excludedHosts.filter((value) => value !== host),
            })
          "
          >{{ host }}</NTag
        >
      </NSpace>
    </section>

    <section class="settings-group">
      <h2 class="settings-group-title">
        {{ i18n('options_privacy_section_label', 'Privacy') }}
      </h2>

      <SettingsRow
        compact
        :label="i18n('options_forward_request_headers_label', 'Forward Request Headers')"
      >
        <NSwitch
          :aria-label="i18n('options_forward_request_headers_label', 'Forward Request Headers')"
          :value="forwardRequestHeaders"
          @update:value="emit('update:forwardRequestHeaders', $event)"
        />
      </SettingsRow>

      <SettingsRow compact :label="i18n('options_forward_cookies_label', 'Forward Cookies')">
        <NSwitch
          :aria-label="i18n('options_forward_cookies_label', 'Forward Cookies')"
          :value="forwardCookies"
          @update:value="emit('update:forwardCookies', $event)"
        />
      </SettingsRow>
    </section>

    <section class="settings-group">
      <h2 class="settings-group-title">
        {{ i18n('options_download_handling_section_label', 'Download Handling') }}
      </h2>

      <SettingsRow
        compact
        v-if="canControlDownloadUi"
        :label="i18n('options_hide_download_bar_label', 'Hide Browser Download Bar')"
      >
        <NSwitch
          :aria-label="i18n('options_hide_download_bar_label', 'Hide Browser Download Bar')"
          :value="hideDownloadBar"
          @update:value="emit('update:hideDownloadBar', $event)"
        />
      </SettingsRow>

      <SettingsRow
        :label="i18n('options_desktop_unavailable_label', 'When Rayburst Is Unavailable')"
      >
        <NSelect
          :aria-label="i18n('options_desktop_unavailable_label', 'When Rayburst Is Unavailable')"
          :value="desktopUnavailable.action"
          :options="unavailableActionOptions"
          class="setting-control"
          @update:value="
            (value: DesktopUnavailableAction) =>
              emit('update:desktopUnavailable', { action: value })
          "
        />
      </SettingsRow>

      <NCollapseTransition :show="desktopUnavailable.action === 'launch'"
        ><div class="settings-subpanel" :inert="!(desktopUnavailable.action === 'launch')">
          <SettingsRow :label="i18n('options_desktop_startup_timeout_label', 'Startup Timeout')">
            <NInputNumber
              :aria-label="i18n('options_desktop_startup_timeout_label', 'Startup Timeout')"
              :value="desktopUnavailable.startupTimeoutSeconds"
              :min="1"
              :max="60"
              :step="1"
              class="setting-number"
              @update:value="
                (value: number | null) =>
                  emit('update:desktopUnavailable', { startupTimeoutSeconds: value ?? 15 })
              "
            >
              <template #suffix>
                {{ i18n('options_seconds_suffix', 's') }}
              </template>
            </NInputNumber>
          </SettingsRow>
        </div>
      </NCollapseTransition>
    </section>
  </div>
</template>
