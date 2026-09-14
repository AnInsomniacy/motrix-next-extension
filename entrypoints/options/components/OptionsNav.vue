<script lang="ts" setup>
/** Left-rail navigation for the Options page. */
import { NIcon } from 'naive-ui';
import { OptionsOutline, DownloadOutline, ListOutline, ConstructOutline } from '@vicons/ionicons5';
import { useI18n } from '@/shared/i18n/engine';

defineProps<{
  active: string;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();

const sections = [
  {
    id: 'general',
    icon: OptionsOutline,
    label: () => t('options_section_general'),
  },
  {
    id: 'behavior',
    icon: DownloadOutline,
    label: () => t('options_section_behavior', 'Download'),
  },
  { id: 'rules', icon: ListOutline, label: () => t('options_section_rules', 'Rules') },
  {
    id: 'diagnostics',
    icon: ConstructOutline,
    label: () => t('options_section_maintenance', 'Maintenance'),
  },
];
</script>

<template>
  <nav class="options-nav">
    <button
      v-for="s in sections"
      :key="s.id"
      type="button"
      :aria-current="active === s.id ? 'page' : undefined"
      :class="['nav-item', { 'nav-item--active': active === s.id }]"
      @click="emit('select', s.id)"
    >
      <NIcon :size="16" class="nav-item__icon"><component :is="s.icon" /></NIcon>
      <span class="nav-item__label">{{ s.label() }}</span>
    </button>
  </nav>
</template>

<style scoped>
.options-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 7px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-on-surface-variant);
  font-size: 14px;
  cursor: pointer;
  text-align: start;
  transition:
    background-color 120ms,
    color 120ms;
}
.nav-item:hover {
  background: var(--color-hover);
  color: var(--color-on-surface);
}
.nav-item--active,
.nav-item--active:hover {
  background: var(--color-selected);
  color: var(--color-primary);
}
.nav-item__icon {
  flex-shrink: 0;
}
.nav-item__label {
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .options-nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
