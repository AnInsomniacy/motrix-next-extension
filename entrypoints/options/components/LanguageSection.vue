<script lang="ts" setup>
/**
 * @fileoverview Language selector section for the Options page.
 *
 * ALL labels in this section are bilingual:
 *   - Auto:  "跟随系统 / Auto" with detected language name
 *   - Each locale: "中文 / Chinese", "日本語 / Japanese", "English"
 *   - Sorted alphabetically by English exonym
 *
 * The bilingual pattern: native text from t() + English text from tEn().
 * When they're identical (i.e. English locale), no duplication.
 */
import { computed } from 'vue';
import { NIcon } from 'naive-ui';
import { GlobeOutline } from '@vicons/ionicons5';
import { useI18n } from '@/shared/i18n/engine';
import { SUPPORTED_LOCALES, type LocaleEntry } from '@/shared/i18n/dictionaries';

const { t, tEn, effectiveLocale } = useI18n();

defineProps<{
  locale: string;
}>();

const emit = defineEmits<{
  'update:locale': [value: string];
}>();

// ─── Bilingual helper ──────────────────────────────────
// Composes "native / english" — skips duplication when native === english.
function bilingual(key: string, enFallback: string): string {
  const native = t(key, enFallback);
  const en = tEn(key, enFallback);
  return native === en ? native : `${native} / ${en}`;
}

// ─── Locale display ────────────────────────────────────
// Each locale: "endonym / exonym" (e.g. "中文 / Chinese")
// English doesn't need duplication: just "English"
function displayLabel(entry: LocaleEntry): string {
  if (entry.endonym === entry.exonym) return entry.endonym;
  return `${entry.endonym} / ${entry.exonym}`;
}

// Sort SUPPORTED_LOCALES alphabetically by English exonym
const sortedLocales = computed(() =>
  [...SUPPORTED_LOCALES].sort((a, b) => a.exonym.localeCompare(b.exonym)),
);

// ─── Detected language info for Auto ───────────────────
// Shows which language the browser is actually using
const detectedLocaleName = computed(() => {
  const detected = effectiveLocale.value;
  const entry = SUPPORTED_LOCALES.find((e) => e.id === detected);
  if (!entry) return '';
  return entry.endonym === entry.exonym ? entry.endonym : `${entry.endonym} / ${entry.exonym}`;
});
</script>

<template>
  <div class="language-section">
    <!-- Auto -->
    <button
      class="locale-card"
      :class="{ active: locale === 'auto' }"
      @click="emit('update:locale', 'auto')"
    >
      <div class="locale-card__icon">
        <NIcon :size="20"><GlobeOutline /></NIcon>
      </div>
      <div class="locale-card__text">
        <span class="locale-card__name">{{ bilingual('options_locale_auto', 'Auto') }}</span>
        <span class="locale-card__desc">
          {{ bilingual('options_locale_auto_desc', 'Follow browser language') }}
          <template v-if="detectedLocaleName"> · {{ detectedLocaleName }}</template>
        </span>
      </div>
      <div v-if="locale === 'auto'" class="locale-card__check">
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M4 8.5L6.5 11L12 5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </button>

    <!-- Each supported locale (sorted alphabetically by exonym) -->
    <button
      v-for="entry in sortedLocales"
      :key="entry.id"
      class="locale-card"
      :class="{ active: locale === entry.id }"
      @click="emit('update:locale', entry.id)"
    >
      <div class="locale-card__text">
        <span class="locale-card__name">{{ displayLabel(entry) }}</span>
      </div>
      <div v-if="locale === entry.id" class="locale-card__check">
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M4 8.5L6.5 11L12 5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </button>
  </div>
</template>

<style scoped>
.language-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.locale-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1.5px solid var(--color-outline-variant, rgba(128, 128, 128, 0.2));
  background-color: transparent;
  cursor: pointer;
  transition:
    background-color 0.25s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.25s cubic-bezier(0.2, 0, 0, 1),
    box-shadow 0.25s cubic-bezier(0.2, 0, 0, 1);
  text-align: left;
  width: 100%;
  color: inherit;
  font: inherit;
}

.locale-card:hover {
  background-color: var(--color-surface-container, rgba(128, 128, 128, 0.06));
  border-color: var(--color-outline);
}

.locale-card.active {
  border-color: var(--color-primary, #d4a017);
  background-color: var(--color-primary-container, rgba(212, 160, 23, 0.08));
  box-shadow: 0 0 0 1px var(--color-primary, #d4a017);
}

.locale-card__icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.locale-card__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.locale-card__name {
  font-weight: 500;
  font-size: 14px;
}

.locale-card__desc {
  font-size: 12px;
  opacity: 0.6;
}

.locale-card__check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--color-primary, #d4a017);
}

.locale-card__check svg {
  width: 100%;
  height: 100%;
}
</style>
