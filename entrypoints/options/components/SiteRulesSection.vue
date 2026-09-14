<script lang="ts" setup>
/** Site rules management section. */
import { ref, computed } from 'vue';
import { NInput, NSelect, NButton, NIcon, NFormItem } from 'naive-ui';
import { CloseOutline, AddOutline } from '@vicons/ionicons5';
import type { SiteRule } from '@/lib/schema';

const props = defineProps<{
  rules: SiteRule[];
  addRule: (rule: Omit<SiteRule, 'id'>) => Promise<boolean>;
}>();

const emit = defineEmits<{
  remove: [id: string];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();

const newPattern = ref('');
const newAction = ref<SiteRule['action']>('always-intercept');

const actionOptions = computed(() => [
  { label: i18n('options_rule_always_intercept', 'Always Intercept'), value: 'always-intercept' },
  { label: i18n('options_rule_always_skip', 'Always Skip'), value: 'always-skip' },
  { label: i18n('options_rule_use_global', 'Use Global'), value: 'use-global' },
]);

function actionLabel(action: SiteRule['action']): string {
  const map: Record<SiteRule['action'], [key: string, fallback: string]> = {
    'always-intercept': ['options_rule_always_intercept', 'Always Intercept'],
    'always-skip': ['options_rule_always_skip', 'Always Skip'],
    'use-global': ['options_rule_use_global', 'Use Global'],
  };
  const [key, fallback] = map[action];
  return i18n(key, fallback);
}

const adding = ref(false);
async function handleAdd(): Promise<void> {
  const pattern = newPattern.value.trim();
  if (!pattern || adding.value) return;
  adding.value = true;
  try {
    if (await props.addRule({ pattern, action: newAction.value })) newPattern.value = '';
  } finally {
    adding.value = false;
  }
}
</script>

<template>
  <div class="form-stack">
    <TransitionGroup name="list" tag="ul" class="rule-list">
      <li v-for="rule in rules" :key="rule.id" class="rule-item">
        <bdi class="pattern">{{ rule.pattern }}</bdi>
        <span class="hint">{{ actionLabel(rule.action) }}</span>
        <button
          type="button"
          class="icon-button"
          :aria-label="i18n('options_remove_rule')"
          :title="i18n('options_remove_rule')"
          @click="emit('remove', rule.id)"
        >
          <NIcon :size="16"><CloseOutline /></NIcon>
        </button>
      </li>
    </TransitionGroup>
    <p v-if="!rules.length" class="hint">{{ i18n('options_rules_empty') }}</p>
    <div class="rule-add">
      <NFormItem :show-feedback="false" :label="i18n('options_site_pattern')"
        ><NInput
          v-model:value="newPattern"
          placeholder="*.github.com"
          :aria-label="i18n('options_site_pattern')"
      /></NFormItem>
      <NFormItem :show-feedback="false" :label="i18n('options_rule_action')"
        ><NSelect
          v-model:value="newAction"
          :options="actionOptions"
          :aria-label="i18n('options_rule_action')"
      /></NFormItem>
      <NButton @click="handleAdd" :disabled="!newPattern.trim()" :loading="adding"
        ><template #icon
          ><NIcon :size="16"><AddOutline /></NIcon></template
        >{{ i18n('options_add_rule') }}</NButton
      >
    </div>
  </div>
</template>
<style scoped>
.rule-list {
  list-style: none;
  padding: 0;
  position: relative;
}
.rule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
}
.pattern {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.rule-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px auto;
  align-items: end;
  gap: 12px;
}
@container (max-width: 520px) {
  .rule-add {
    grid-template-columns: minmax(0, 1fr);
  }
  .rule-add > .n-button {
    justify-self: start;
  }
}
</style>
