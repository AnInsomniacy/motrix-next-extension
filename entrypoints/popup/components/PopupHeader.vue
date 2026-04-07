<script lang="ts" setup>
/**
 * @fileoverview Popup header component.
 *
 * Layout: [NEXT badge] [connection chip] ... [status label + NSwitch] [gear]
 *
 * The NSwitch toggles download interception on/off. A reactive label next
 * to it shows "Intercepting" or "Paused" so the user always knows the
 * current state at a glance.
 *
 * The toggle writes to chrome.storage.local immediately (via parent), and
 * the background service worker reacts via its onChanged listener — no
 * message passing needed.
 */
import { NIcon, NSwitch } from 'naive-ui';
import { SettingsOutline } from '@vicons/ionicons5';
import { ConnectionStatus } from '@/lib/services';
import { useI18n } from '@/shared/i18n/engine';

const props = defineProps<{
  status: ConnectionStatus;
  version: string | null;
  enabled: boolean;
}>();

const emit = defineEmits<{
  settings: [];
  'toggle-enabled': [];
}>();

const { t: i18n } = useI18n();
</script>

<template>
  <header class="popup-header">
    <div class="popup-header__brand">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="18"
        viewBox="0 0 40 18"
        class="popup-header__logo"
      >
        <rect
          x="0.5"
          y="0.5"
          width="39"
          height="17"
          rx="4"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          opacity="0.5"
        />
        <text
          x="20"
          y="13"
          fill="currentColor"
          font-family="Arial, Helvetica, sans-serif"
          font-weight="900"
          font-size="10"
          text-anchor="middle"
          letter-spacing="1"
        >
          NEXT
        </text>
      </svg>
      <span
        class="popup-header__badge"
        :class="status === 'connected' ? 'popup-header__badge--ok' : 'popup-header__badge--err'"
      >
        {{
          status === 'connected'
            ? i18n('popup_status_connected', 'Connected')
            : i18n('popup_status_disconnected', 'Disconnected')
        }}
      </span>
      <span v-if="version" class="popup-header__version">v{{ version }}</span>
    </div>
    <div class="popup-header__controls">
      <!-- Interception toggle — NSwitch + contextual label -->
      <div class="popup-header__toggle">
        <span class="popup-header__toggle-crossfade">
          <span
            :class="[
              'popup-header__toggle-label',
              'popup-header__toggle-label--on',
              { 'popup-header__toggle-label--active': props.enabled },
            ]"
          >
            {{ i18n('popup_toggle_enabled', 'Intercepting') }}
          </span>
          <span
            :class="[
              'popup-header__toggle-label',
              'popup-header__toggle-label--off',
              { 'popup-header__toggle-label--active': !props.enabled },
            ]"
          >
            {{ i18n('popup_toggle_disabled', 'Paused') }}
          </span>
        </span>
        <NSwitch :value="props.enabled" size="small" @update:value="emit('toggle-enabled')" />
      </div>
      <!-- Settings gear -->
      <button
        type="button"
        class="popup-header__settings"
        :title="i18n('popup_action_settings', 'Settings')"
        @click="emit('settings')"
      >
        <NIcon :size="18"><SettingsOutline /></NIcon>
      </button>
    </div>
  </header>
</template>

<style scoped>
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
}

.popup-header__brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.popup-header__logo {
  color: var(--color-on-surface);
  flex-shrink: 0;
}

.popup-header__badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
}

.popup-header__badge--ok {
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
}

.popup-header__badge--err {
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
}

.popup-header__version {
  font-size: 11px;
  color: var(--color-on-surface-variant);
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

/* ── Header Controls Group ────────────────────────────────── */
.popup-header__controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Interception Toggle ──────────────────────────────────── */
.popup-header__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Cross-fade container: sized by the wider label, children overlap */
.popup-header__toggle-crossfade {
  position: relative;
  display: inline-grid;
}

.popup-header__toggle-crossfade > .popup-header__toggle-label {
  grid-area: 1 / 1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  user-select: none;
  transition:
    opacity 0.42s cubic-bezier(0.2, 0, 0, 1),
    transform 0.42s cubic-bezier(0.2, 0, 0, 1);
}

/* Inactive labels: hidden + shifted */
.popup-header__toggle-label--on:not(.popup-header__toggle-label--active) {
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
}

.popup-header__toggle-label--off:not(.popup-header__toggle-label--active) {
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
}

/* Active labels: visible + centered */
.popup-header__toggle-label--active {
  opacity: 1;
  transform: translateY(0);
}

.popup-header__toggle-label--on {
  color: var(--color-success);
}

.popup-header__toggle-label--off {
  color: var(--color-on-surface-variant);
}

/* ── Settings button ──────────────────────────────────────── */
.popup-header__settings {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-on-surface-variant);
  border-radius: 50%;
  cursor: pointer;
  /* Release: spring-back (emphasized-decelerate) */
  transition:
    color 0.15s cubic-bezier(0.2, 0, 0, 1),
    background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
    transform 0.35s cubic-bezier(0.05, 0.7, 0.1, 1);
}

.popup-header__settings:hover {
  color: var(--color-on-surface);
  background: color-mix(in srgb, var(--color-on-surface) 8%, transparent);
}

.popup-header__settings:active {
  transform: scale(0.92);
  /* Press: fast compress (emphasized) */
  transition:
    color 0.15s cubic-bezier(0.2, 0, 0, 1),
    background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
    transform 0.15s cubic-bezier(0.2, 0, 0, 1);
}
</style>
