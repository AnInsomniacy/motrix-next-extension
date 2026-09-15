<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NRadioGroup, NRadio, NColorPicker, NIcon } from 'naive-ui';
import { Sun, Moon, Monitor, Check, Plus } from '@lucide/vue';
import {
  COLOR_SCHEMES,
  CUSTOM_COLOR_SCHEME_ID,
  normalizeCustomColorScheme,
} from '@/shared/theme/schemes';
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
const modes = [
  { value: 'system', icon: Monitor },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
] as const;
const swatches = computed(() =>
  COLOR_SCHEMES.map((scheme) => ({ id: scheme.id, seed: scheme.seed, label: t(scheme.labelKey) })),
);
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
        class="theme-picker"
        :aria-label="t('options_theme_label')"
        @update:value="emit('update:theme', $event)"
      >
        <NRadio v-for="mode in modes" :key="mode.value" :value="mode.value" class="theme-option">
          <span class="theme-card" :data-theme="mode.value" aria-hidden="true">
            <span class="theme-card__bar" /><span class="theme-card__row" /><span
              class="theme-card__row short"
            />
          </span>
          <span class="theme-option__label"
            ><NIcon :size="13"><component :is="mode.icon" /></NIcon
            >{{ t(`options_theme_${mode.value}`) }}</span
          >
        </NRadio>
      </NRadioGroup>
    </SettingsRow>
    <SettingsRow :label="t('options_color_scheme')">
      <div class="swatch-row" role="radiogroup" :aria-label="t('options_color_scheme')">
        <button
          v-for="swatch in swatches"
          :key="swatch.id"
          type="button"
          class="swatch"
          :class="{ 'is-active': colorScheme === swatch.id }"
          :style="{ '--swatch': swatch.seed }"
          role="radio"
          :aria-checked="colorScheme === swatch.id"
          :aria-label="swatch.label"
          :title="swatch.label"
          @click="emit('update:colorScheme', swatch.id)"
        >
          <NIcon v-if="colorScheme === swatch.id" :size="13"><Check :stroke-width="3" /></NIcon>
        </button>
      </div>
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
          <button
            :ref="triggerRef"
            type="button"
            class="custom-color"
            :class="{ 'is-active': colorScheme === CUSTOM_COLOR_SCHEME_ID }"
            :aria-label="t('options_custom_color')"
            :aria-expanded="pickerOpen"
            @click="onClick"
          >
            <span class="swatch swatch--inline" :style="{ '--swatch': color }" aria-hidden="true">
              <NIcon :size="12"
                ><Check v-if="colorScheme === CUSTOM_COLOR_SCHEME_ID" :stroke-width="3" /><Plus
                  v-else
                  :stroke-width="2.5"
              /></NIcon>
            </span>
            <bdi class="rb-mono">{{ color }}</bdi>
          </button>
        </template>
      </NColorPicker>
    </SettingsRow>
    <slot />
  </section>
</template>

<style scoped>
.theme-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.theme-option {
  --n-box-shadow: none;
  --n-box-shadow-active: none;
  --n-box-shadow-focus: none;
  --n-box-shadow-hover: none;
  --n-box-shadow-disabled: none;
  margin: 0;
  align-items: flex-start;
}

.theme-option :deep(.n-radio__dot-wrapper) {
  display: none;
}

.theme-option :deep(.n-radio__label) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
  cursor: pointer;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 72px;
  height: 48px;
  padding: 8px 9px;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--rb-border);
  transition: box-shadow var(--rb-motion-feedback) var(--rb-ease);
}

.theme-card[data-theme='light'] {
  background: #f7f6fc;
}

.theme-card[data-theme='dark'] {
  background: #14111d;
}

.theme-card[data-theme='system'] {
  background: linear-gradient(110deg, #f7f6fc 50%, #14111d 50%);
}

.theme-card__bar {
  width: 20px;
  height: 6px;
  border-radius: 3px;
  background: var(--rb-gradient);
}

.theme-card__row {
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: rgb(127 127 127 / 35%);
}

.theme-card__row.short {
  width: 60%;
}

.theme-option.n-radio--checked .theme-card {
  box-shadow:
    inset 0 0 0 2px var(--rb-accent),
    0 0 0 3px var(--rb-glow);
}

.theme-option__label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--rb-text-muted);
}

.theme-option.n-radio--checked .theme-option__label {
  color: var(--rb-text);
  font-weight: 500;
}

.swatch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.swatch {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--swatch);
  color: #ffffff;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%);
  cursor: pointer;
  transition:
    transform var(--rb-motion-feedback) var(--rb-ease),
    box-shadow var(--rb-motion-feedback) var(--rb-ease);
}

.swatch:hover {
  transform: scale(1.1);
}

.swatch.is-active {
  box-shadow:
    inset 0 0 0 1px rgb(0 0 0 / 12%),
    0 0 0 2px var(--rb-raised),
    0 0 0 4px var(--swatch);
}

.swatch--inline {
  width: 20px;
  height: 20px;
}

.custom-color {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--rb-border);
  border-radius: var(--rb-radius-control);
  background: var(--rb-raised);
  color: var(--rb-text);
  cursor: pointer;
  transition: border-color var(--rb-motion-feedback) var(--rb-ease);
}

.custom-color:hover {
  border-color: var(--rb-border-strong);
}

.custom-color.is-active {
  border-color: var(--rb-accent);
}
</style>
