<script setup lang="ts">
import { NButton } from 'naive-ui';
import { AnimatePresence, motion } from 'motion-v';
import { useI18n } from '@/shared/i18n/engine';
defineProps<{ isDirty: boolean; saving: boolean; disabled: boolean }>();
defineEmits<{ save: []; discard: [] }>();
const { t } = useI18n();
</script>
<template>
  <AnimatePresence>
    <motion.div
      v-if="isDirty"
      key="bar"
      class="action-bar-host"
      :initial="{ opacity: 0, y: 24 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: 24 }"
    >
      <footer class="action-bar">
        <span class="hint" role="status">{{ t('options_changes_indicator') }}</span>
        <div class="settings-actions">
          <NButton size="small" :disabled="saving || disabled" @click="$emit('discard')">{{
            t('options_discard')
          }}</NButton>
          <NButton
            size="small"
            type="primary"
            :disabled="disabled"
            :loading="saving"
            @click="$emit('save')"
            >{{ t('options_save') }}</NButton
          >
        </div>
      </footer>
    </motion.div>
  </AnimatePresence>
</template>
<style scoped>
.action-bar-host {
  position: absolute;
  inset-inline: 36px;
  bottom: 18px;
  z-index: 5;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: min(100%, 560px);
  padding: 8px 8px 8px 16px;
  border-radius: 999px;
  background: var(--rb-overlay);
  box-shadow: var(--rb-shadow-overlay);
  pointer-events: auto;
}

.action-bar .hint {
  font-weight: 500;
}

@media (max-width: 640px) {
  .action-bar-host {
    inset-inline: 16px;
  }
}
</style>
