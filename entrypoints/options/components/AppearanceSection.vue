<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NRadioGroup, NRadioButton, NColorPicker, NSelect, NButton } from 'naive-ui';
import {
  COLOR_SCHEMES,
  CUSTOM_COLOR_SCHEME_ID,
  normalizeCustomColorScheme,
} from '@/shared/color-schemes';
import { useI18n } from '@/shared/i18n/engine';
import SettingsRow from './SettingsRow.vue';

const props = withDefaults(
  defineProps<{
    theme: string;
    colorScheme: string;
    customColorScheme: string;
    active?: boolean;
  }>(),
  { active: true },
);
const emit = defineEmits<{
  'update:theme': [value: string];
  'update:colorScheme': [value: string];
  'update:customColorScheme': [value: string];
}>();
const { t } = useI18n();
const modes = ['system', 'light', 'dark'] as const;
const options = computed(() => [
  ...COLOR_SCHEMES.map((scheme) => ({ value: scheme.id, label: t(scheme.labelKey) })),
  { value: CUSTOM_COLOR_SCHEME_ID, label: t('options_color_scheme_custom') },
]);
const color = ref(props.customColorScheme);
const pickerOpen = ref(false);
watch(
  () => props.active,
  (active) => {
    if (!active) pickerOpen.value = false;
  },
);
watch(pickerOpen, (open) => {
  // Swatches and the native preview do not emit the library's complete event.
  if (!open && color.value !== props.customColorScheme) completeColor(color.value);
});
watch(
  () => props.customColorScheme,
  (value) => {
    color.value = value;
  },
);
function completeColor(value: string | null) {
  color.value = normalizeCustomColorScheme(value);
  emit('update:customColorScheme', color.value);
}
</script>

<template>
  <section class="settings-group" aria-labelledby="appearance-heading">
    <h2 id="appearance-heading" class="settings-group-title">
      {{ t('options_section_appearance') }}
    </h2>
    <SettingsRow :label="t('options_theme_label')">
      <NRadioGroup
        :value="theme"
        name="appearance-mode"
        :aria-label="t('options_theme_label')"
        @update:value="emit('update:theme', $event)"
      >
        <NRadioButton v-for="mode in modes" :key="mode" :value="mode">{{
          t(`options_theme_${mode}`)
        }}</NRadioButton>
      </NRadioGroup>
    </SettingsRow>
    <SettingsRow :label="t('options_color_scheme')">
      <NSelect
        class="setting-control"
        :value="colorScheme"
        :options="options"
        :aria-label="t('options_color_scheme')"
        @update:value="emit('update:colorScheme', $event)"
      />
    </SettingsRow>
    <SettingsRow :label="t('options_custom_color')">
      <NColorPicker
        v-model:value="color"
        v-model:show="pickerOpen"
        :modes="['hex']"
        :show-alpha="false"
        :show-preview="true"
        :swatches="COLOR_SCHEMES.map((scheme) => scheme.seed)"
        @complete="completeColor"
      >
        <template #trigger="{ onClick, ref: triggerRef }">
          <NButton
            :ref="triggerRef"
            class="setting-color"
            :aria-label="t('options_custom_color')"
            :aria-expanded="pickerOpen"
            @click="onClick"
          >
            <template #icon
              ><span class="color-sample" :style="{ backgroundColor: color }"
            /></template>
            <bdi>{{ color }}</bdi>
          </NButton>
        </template>
      </NColorPicker>
    </SettingsRow>
    <slot />
  </section>
</template>

<style scoped>
.color-sample {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--color-outline-variant);
}
</style>
