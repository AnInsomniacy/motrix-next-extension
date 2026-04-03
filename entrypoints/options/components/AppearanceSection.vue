<script lang="ts" setup>
/**
 * @fileoverview Appearance / theme selection section.
 *
 * Provides a System / Light / Dark toggle using Naive UI NRadioGroup
 * with NRadioButton, matching the desktop Basic.vue appearance picker.
 */
import { NRadioGroup, NRadioButton, NFormItem, NIcon } from 'naive-ui';
import { SunnyOutline, MoonOutline, DesktopOutline } from '@vicons/ionicons5';

const props = defineProps<{
  theme: string;
}>();

const emit = defineEmits<{
  'update:theme': [value: string];
}>();

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}
</script>

<template>
  <div class="section">
    <NFormItem :label="i18n('options_section_appearance', 'Theme')">
      <NRadioGroup
        :value="theme"
        size="medium"
        @update:value="(v: string) => emit('update:theme', v)"
      >
        <NRadioButton value="system">
          <span class="theme-btn">
            <NIcon :size="14"><DesktopOutline /></NIcon>
            {{ i18n('options_theme_system', 'System') }}
          </span>
        </NRadioButton>
        <NRadioButton value="light">
          <span class="theme-btn">
            <NIcon :size="14"><SunnyOutline /></NIcon>
            {{ i18n('options_theme_light', 'Light') }}
          </span>
        </NRadioButton>
        <NRadioButton value="dark">
          <span class="theme-btn">
            <NIcon :size="14"><MoonOutline /></NIcon>
            {{ i18n('options_theme_dark', 'Dark') }}
          </span>
        </NRadioButton>
      </NRadioGroup>
    </NFormItem>
  </div>
</template>

<style scoped>
.theme-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
