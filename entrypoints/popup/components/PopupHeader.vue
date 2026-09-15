<script setup lang="ts">
import { NIcon } from 'naive-ui';
import { Settings } from '@lucide/vue';
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
    <BrandLogo :size="22" class="brand-mark" />
    <span class="wordmark">Rayburst<span class="wordmark-edition">Connect</span></span>
    <span
      class="rb-pill connection"
      :data-tone="
        status === 'connected' ? 'success' : status === 'launching' ? 'active' : undefined
      "
      :class="{ pulsing: status === 'launching' || status === 'initializing' }"
      :title="version ? `Rayburst v${version}` : undefined"
      role="status"
    >
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
      <NIcon :size="17"><Settings /></NIcon>
    </button>
  </header>
</template>
<style scoped>
.popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 8px 14px;
}

.brand-mark {
  filter: drop-shadow(0 2px 6px var(--rb-glow));
}

.wordmark {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.wordmark-edition {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--rb-text-muted);
}

.connection {
  min-width: 0;
  margin-inline-start: auto;
  margin-inline-end: 2px;
}

.connection.pulsing::before {
  animation: connection-pulse 1.2s var(--rb-ease) infinite;
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

@keyframes connection-pulse {
  50% {
    opacity: 0.3;
  }
}
</style>
