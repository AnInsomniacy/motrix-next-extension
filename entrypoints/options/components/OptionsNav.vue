<script lang="ts" setup>
/** Left-rail navigation for the Options page. */
import { NIcon } from 'naive-ui';
import { LayoutGroup, motion } from 'motion-v';
import { SlidersHorizontal, Download, ListChecks, Wrench } from '@lucide/vue';
import { useI18n } from '@/shared/i18n/engine';

defineProps<{
  active: string;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();

const sections = [
  { id: 'general', icon: SlidersHorizontal, label: () => t('options_section_general') },
  { id: 'behavior', icon: Download, label: () => t('options_section_behavior', 'Download') },
  { id: 'rules', icon: ListChecks, label: () => t('options_section_rules', 'Rules') },
  { id: 'diagnostics', icon: Wrench, label: () => t('options_section_maintenance', 'Maintenance') },
];
</script>

<template>
  <LayoutGroup id="options-navigation">
    <nav class="options-nav">
      <button
        v-for="s in sections"
        :key="s.id"
        type="button"
        :aria-current="active === s.id ? 'page' : undefined"
        :class="['nav-item', { 'nav-item--active': active === s.id }]"
        @click="emit('select', s.id)"
      >
        <motion.span
          v-if="active === s.id"
          layout-id="options-nav-active"
          class="nav-item__active"
          aria-hidden="true"
        />
        <NIcon :size="17" class="nav-item__icon"><component :is="s.icon" /></NIcon>
        <span class="nav-item__label">{{ s.label() }}</span>
      </button>
    </nav>
  </LayoutGroup>
</template>

<style scoped>
.options-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--rb-radius-control);
  border: none;
  background: transparent;
  color: var(--rb-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: start;
  transition: color var(--rb-motion-feedback) var(--rb-ease);
}

.nav-item:hover {
  color: var(--rb-text);
}

.nav-item:hover:not(.nav-item--active)::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--rb-hover);
}

.nav-item--active {
  color: var(--rb-accent-text);
}

.nav-item__active {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--rb-raised);
  box-shadow: var(--rb-shadow-raised);
}

.nav-item__active::before {
  content: '';
  position: absolute;
  inset-block: 9px;
  inset-inline-start: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--rb-gradient);
}

.nav-item__icon,
.nav-item__label {
  position: relative;
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
