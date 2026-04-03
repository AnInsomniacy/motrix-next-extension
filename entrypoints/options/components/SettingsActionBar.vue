<script lang="ts" setup>
/**
 * @fileoverview Sticky save/discard action bar for the Options page.
 *
 * Uses CSS Grid `grid-template-rows: 0fr → 1fr` for smooth expand/collapse.
 * This is the industry-standard approach that avoids the jank of `height`
 * or `max-height` animations — grid track sizing is handled efficiently
 * by the browser's layout engine without per-frame reflow.
 *
 * @see https://css-tricks.com/css-grid-can-do-auto-height-transitions/
 * @see /motrix-next/src/components/preference/PreferenceActionBar.vue
 */
import { NButton, NIcon } from 'naive-ui';
import { SaveOutline, ArrowUndoOutline } from '@vicons/ionicons5';

defineProps<{ isDirty: boolean }>();
defineEmits<{ save: []; discard: [] }>();

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}
</script>

<template>
  <div class="action-bar-wrapper" :class="{ 'action-bar-wrapper--open': isDirty }">
    <div class="action-bar-inner">
      <div class="action-bar">
        <div class="action-bar__indicator">
          <span class="action-bar__dot" />
          <span class="action-bar__label">
            {{ i18n('options_changes_indicator', 'Unsaved changes') }}
          </span>
        </div>

        <div class="action-bar__buttons">
          <NButton
            class="save-btn"
            type="primary"
            @click="$emit('save')"
          >
            <template #icon>
              <NIcon :size="16"><SaveOutline /></NIcon>
            </template>
            {{ i18n('options_save', 'Save') }}
          </NButton>
          <NButton
            class="discard-btn"
            @click="$emit('discard')"
          >
            <template #icon>
              <NIcon :size="14"><ArrowUndoOutline /></NIcon>
            </template>
            {{ i18n('options_discard', 'Discard') }}
          </NButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════
 * ── CSS Grid Expand/Collapse ────────────────────────────────────
 * grid-template-rows: 0fr → 1fr is smooth because the browser
 * interpolates the grid track size natively. The inner wrapper
 * with min-height:0 + overflow:hidden clips the content.
 * Opacity fades in/out simultaneously.
 * ═══════════════════════════════════════════════════════════════════ */
.action-bar-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 0.25s ease,
    opacity 0.2s ease;
}

.action-bar-wrapper--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.action-bar-inner {
  overflow: hidden;
  min-height: 0;
}

/* ── Bar Layout ──────────────────────────────────────────────────── */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0 0;
  border-top: 1px solid var(--color-outline-variant);
  margin-top: 20px;
}

.action-bar__buttons {
  display: flex;
  gap: 10px;
}

/* ── Unsaved changes indicator ──────────────────────────────────── */
.action-bar__indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-warning);
  animation: pulse-dot 2s ease infinite;
}

.action-bar__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-on-surface-variant);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

/* ═══════════════════════════════════════════════════════════════════
 * ── Save Button — success fill ──────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════ */
.save-btn {
  background-color: var(--color-success) !important;
  color: var(--color-on-success) !important;
  transition:
    background-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    transform 0.35s cubic-bezier(0.05, 0.7, 0.1, 1);
}

.save-btn :deep(.n-button__border) {
  border-color: var(--color-success) !important;
  transition: border-color 0.35s cubic-bezier(0.2, 0, 0, 1);
}

.save-btn :deep(.n-button__state-border) {
  border-color: var(--color-success) !important;
  transition: border-color 0.35s cubic-bezier(0.2, 0, 0, 1);
}

.save-btn:active {
  transform: scale(0.97);
  transition:
    background-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    transform 0.15s cubic-bezier(0.2, 0, 0, 1);
}

/* ═══════════════════════════════════════════════════════════════════
 * ── Discard Button — error-container tonal fill ─────────────────
 * ═══════════════════════════════════════════════════════════════════ */
.discard-btn {
  background-color: var(--color-error-container) !important;
  color: var(--color-error) !important;
  transition:
    background-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    color 0.35s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    transform 0.35s cubic-bezier(0.05, 0.7, 0.1, 1);
}

.discard-btn :deep(.n-button__border) {
  border-color: var(--color-error-container) !important;
  transition: border-color 0.35s cubic-bezier(0.2, 0, 0, 1);
}

.discard-btn :deep(.n-button__state-border) {
  border-color: var(--color-error-container) !important;
  transition: border-color 0.35s cubic-bezier(0.2, 0, 0, 1);
}

.discard-btn:active {
  transform: scale(0.97);
  transition:
    background-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    color 0.35s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.35s cubic-bezier(0.2, 0, 0, 1),
    transform 0.15s cubic-bezier(0.2, 0, 0, 1);
}
</style>
