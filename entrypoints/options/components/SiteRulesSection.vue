<script lang="ts" setup>
/**
 * @fileoverview Site rules management section.
 *
 * CRUD interface for per-site download rules. Uses Naive UI NInput,
 * NSelect, NButton, NTag for the rule list, and Vue TransitionGroup
 * for animated list operations (matching desktop TaskItemActions.vue
 * list animation pattern).
 */
import { ref } from 'vue';
import {
  NInput,
  NSelect,
  NButton,
  NTag,
  NIcon,
  NEmpty,
} from 'naive-ui';
import { CloseOutline, AddOutline } from '@vicons/ionicons5';
import type { SiteRule } from '@/shared/types';

const props = defineProps<{
  rules: SiteRule[];
}>();

const emit = defineEmits<{
  add: [rule: Omit<SiteRule, 'id'>];
  remove: [id: string];
}>();

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

const newPattern = ref('');
const newAction = ref<SiteRule['action']>('always-intercept');

const actionOptions = [
  { label: 'Always Intercept', value: 'always-intercept' },
  { label: 'Always Skip', value: 'always-skip' },
  { label: 'Use Global', value: 'use-global' },
];

const ACTION_TYPE_MAP: Record<SiteRule['action'], 'success' | 'error' | 'default'> = {
  'always-intercept': 'success',
  'always-skip': 'error',
  'use-global': 'default',
};

function handleAdd(): void {
  if (!newPattern.value.trim()) return;
  emit('add', { pattern: newPattern.value.trim(), action: newAction.value });
  newPattern.value = '';
}
</script>

<template>
  <div class="section">
    <!-- Rule List -->
    <div v-if="rules.length" class="rule-list">
      <TransitionGroup name="list-item" tag="div" class="rule-list__inner">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="rule-item"
        >
          <code class="rule-item__pattern">{{ rule.pattern }}</code>
          <div class="rule-item__actions">
            <NTag :type="ACTION_TYPE_MAP[rule.action]" size="small" round>
              {{ rule.action }}
            </NTag>
            <button
              type="button"
              class="rule-item__remove"
              @click="emit('remove', rule.id)"
            >
              <NIcon :size="14"><CloseOutline /></NIcon>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
    <NEmpty
      v-else
      size="small"
      :description="i18n('options_rules_empty', 'No rules configured.')"
      style="margin-bottom: 16px"
    />

    <!-- Add Rule Form -->
    <div class="rule-add">
      <NInput
        v-model:value="newPattern"
        placeholder="*.github.com"
        style="flex: 1; font-family: var(--font-mono)"
        @keydown.enter="handleAdd"
      />
      <NSelect
        v-model:value="newAction"
        :options="actionOptions"
        style="width: 170px"
      />
      <NButton type="primary" @click="handleAdd">
        <template #icon>
          <NIcon :size="16"><AddOutline /></NIcon>
        </template>
        {{ i18n('options_add_rule', 'Add') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.rule-list {
  margin-bottom: 16px;
}

.rule-list__inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rule-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--color-surface-container-high);
  border-radius: 10px;
  transition: background-color 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.rule-item:hover {
  background: var(--color-surface-container-highest);
}

.rule-item__pattern {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-primary);
  font-weight: 500;
}

.rule-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-item__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--color-on-surface-variant);
  cursor: pointer;
  /* Release: spring-back (emphasized-decelerate) */
  transition:
    color 0.15s cubic-bezier(0.2, 0, 0, 1),
    background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
    transform 0.35s cubic-bezier(0.05, 0.7, 0.1, 1);
}

.rule-item__remove:hover {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
}

.rule-item__remove:active {
  transform: scale(0.85);
  /* Press: fast compress (emphasized) */
  transition:
    color 0.15s cubic-bezier(0.2, 0, 0, 1),
    background-color 0.15s cubic-bezier(0.2, 0, 0, 1),
    transform 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.rule-add {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
