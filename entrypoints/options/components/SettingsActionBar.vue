<script setup lang="ts">
import { NButton, NCollapseTransition } from 'naive-ui';
import { useI18n } from '@/shared/i18n/engine';
defineProps<{ isDirty: boolean; saving: boolean; disabled: boolean }>();
defineEmits<{ save: []; discard: [] }>();
const { t } = useI18n();
</script>
<template>
  <NCollapseTransition :show="isDirty">
    <footer class="action-bar" :inert="!isDirty">
      <div class="action-bar-content">
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
      </div>
    </footer>
  </NCollapseTransition>
</template>
<style scoped>
.action-bar {
  border-block-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface);
}
.action-bar-content {
  max-width: 784px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 40px;
}
@media (max-width: 640px) {
  .action-bar-content {
    padding-inline: 20px;
  }
}
</style>
