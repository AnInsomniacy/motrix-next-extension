<script lang="ts" setup>
/**
 * @fileoverview Sticky save/discard action bar for the Options page.
 *
 * Mirrors desktop PreferenceActionBar.vue behavior:
 * - Save button turns success-green when isDirty (0.35s M3 emphasized)
 * - Discard button turns error-container red when isDirty
 * - Entire bar slides in from below (phase-switch-enter) visibility transition
 * - "Unsaved changes" indicator dot pulses when dirty
 * - Buttons are ALWAYS clickable (desktop pattern), but visually muted when clean
 *
 * i18n keys: options_save, options_discard, options_changes_indicator
 *
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
  <!--
    Wrap in Transition so the bar slides in when isDirty becomes true.
    Matches desktop behavior where the action bar visually activates on dirty.
  -->
  <Transition name="action-bar">
    <div v-if="isDirty" class="action-bar">
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
  </Transition>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════
 * ── Bar Layout ──────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════ */
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
  animation: pulse-dot 2s cubic-bezier(0.2, 0, 0, 1) infinite;
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
 * ── Save Button — M3 success fill ───────────────────────────────
 * Ref: desktop PreferenceActionBar.vue L69-83
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
 * ── Discard Button — M3 error-container tonal fill ──────────────
 * Ref: desktop PreferenceActionBar.vue L85-101
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

/* ═══════════════════════════════════════════════════════════════════
 * ── Bar Enter/Leave Transition ──────────────────────────────────
 * Simple expand/collapse — no directional movement.
 * Uses max-height for the height animation + opacity for the fade.
 * ═══════════════════════════════════════════════════════════════════ */
.action-bar-enter-active {
  transition:
    opacity 0.25s ease,
    max-height 0.3s ease;
  overflow: hidden;
}

.action-bar-leave-active {
  transition:
    opacity 0.15s ease,
    max-height 0.2s ease;
  overflow: hidden;
}

.action-bar-enter-from,
.action-bar-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  margin-top: 0;
}

.action-bar-enter-to,
.action-bar-leave-from {
  max-height: 80px;
}
</style>
