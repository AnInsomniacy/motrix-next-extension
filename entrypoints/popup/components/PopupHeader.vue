<script setup lang="ts">
import { NIcon } from 'naive-ui';
import { SettingsOutline } from '@vicons/ionicons5';
import BrandLogo from '@/shared/components/BrandLogo.vue';
import { useI18n } from '@/shared/i18n/engine';
defineProps<{
  status: 'initializing' | 'connected' | 'launching' | 'disconnected';
  version: string | null;
}>();
defineEmits<{ settings: [] }>();
const { t } = useI18n();
</script>
<template>
  <header class="popup-header">
    <BrandLogo :size="18" />
    <span class="wordmark">Rayburst Connect</span>
    <span
      class="connection"
      :class="{ connected: status === 'connected' }"
      :title="version ? `Rayburst ${version}` : undefined"
      role="status"
    >
      <span class="status-dot" />
      <span class="connection-text"
        ><Transition name="content"
          ><span :key="status">{{
            t(status === 'initializing' ? 'popup_status_connecting' : `popup_status_${status}`)
          }}</span></Transition
        ></span
      >
    </span>
    <button
      class="icon-button"
      :aria-label="t('popup_action_settings')"
      :title="t('popup_action_settings')"
      @click="$emit('settings')"
    >
      <NIcon :size="16"><SettingsOutline /></NIcon>
    </button>
  </header>
</template>
<style scoped>
.popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
}
.wordmark {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.connection {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin-inline-end: auto;
  color: var(--color-on-surface-variant);
  font-size: 12px;
}
.connection-text {
  position: relative;
  display: grid;
}
.connection-text > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-dot {
  inline-size: 5px;
  block-size: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-outline);
  transition: background-color 160ms;
}
.connected .status-dot {
  background: var(--color-success);
}
</style>
