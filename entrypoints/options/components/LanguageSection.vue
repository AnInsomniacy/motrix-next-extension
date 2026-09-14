<script setup lang="ts">
import { computed } from 'vue';
import { NSelect } from 'naive-ui';
import { useI18n } from '@/shared/i18n/engine';
import SettingsRow from './SettingsRow.vue';
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales';
defineProps<{ locale: string }>();
defineEmits<{ 'update:locale': [value: string] }>();
const { t } = useI18n();
const options = computed(() => [
  { value: 'auto', label: t('options_locale_auto_desc') },
  ...SUPPORTED_LOCALES.map(({ id, endonym, exonym }) => ({
    value: id,
    label: endonym === exonym ? endonym : `${endonym} / ${exonym}`,
  })),
]);
</script>
<template>
  <SettingsRow :label="t('options_section_language')">
    <NSelect
      :value="locale"
      :options="options"
      filterable
      :aria-label="t('options_section_language')"
      class="setting-control"
      @update:value="$emit('update:locale', $event)"
    />
  </SettingsRow>
</template>
