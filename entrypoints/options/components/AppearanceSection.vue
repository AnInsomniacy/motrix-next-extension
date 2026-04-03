<script lang="ts" setup>
/**
 * @fileoverview Appearance section: theme toggle + color scheme picker.
 *
 * - System / Light / Dark toggle (NRadioGroup)
 * - 10 preset color scheme swatches with checkmark SVG
 *
 * Both controls persist immediately (no dirty tracking).
 *
 * @see /motrix-next/src/components/preference/Basic.vue L575-598
 */
import { NRadioGroup, NRadioButton, NFormItem, NIcon, NTooltip } from 'naive-ui';
import { SunnyOutline, MoonOutline, DesktopOutline } from '@vicons/ionicons5';
import { COLOR_SCHEMES } from '@/shared/color-schemes';

defineProps<{
  theme: string;
  colorScheme: string;
}>();

const emit = defineEmits<{
  'update:theme': [value: string];
  'update:colorScheme': [value: string];
}>();

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}
</script>

<template>
  <div class="section">
    <!-- Theme Mode -->
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

    <!-- Color Scheme Picker -->
    <!-- Ref: desktop Basic.vue L575-598 -->
    <NFormItem :label="i18n('options_color_scheme', 'Color Scheme')">
      <div class="color-scheme-picker">
        <NTooltip v-for="scheme in COLOR_SCHEMES" :key="scheme.id">
          <template #trigger>
            <button
              class="color-swatch"
              :class="{ active: colorScheme === scheme.id }"
              :style="{ '--swatch-color': scheme.seed }"
              @click="emit('update:colorScheme', scheme.id)"
            >
              <svg
                v-if="colorScheme === scheme.id"
                class="swatch-check"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M4 8.5L6.5 11L12 5"
                  stroke="white"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </template>
          {{ i18n(scheme.labelKey, scheme.id) }}
        </NTooltip>
      </div>
    </NFormItem>
  </div>
</template>

<style scoped>
.theme-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ── Color Scheme Picker ─────────────────────────────────────────── */
/* Ref: desktop Basic.vue L866-907                                    */
.color-scheme-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-swatch {
  position: relative;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: var(--swatch-color);
  cursor: pointer;
  transition:
    transform 0.2s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
    box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  padding: 0;
}

.color-swatch:hover {
  transform: scale(1.18);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.color-swatch:active {
  transform: scale(1.05);
}

.color-swatch.active {
  border-color: var(--color-on-surface, #fff);
  box-shadow:
    0 0 0 2px var(--swatch-color),
    0 2px 8px rgba(0, 0, 0, 0.25);
}

.swatch-check {
  width: 14px;
  height: 14px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}
</style>
