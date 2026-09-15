<script lang="ts" setup>
import { computed } from 'vue';
import { NButton, NDescriptions, NDescriptionsItem, NIcon, NPopover, NTag } from 'naive-ui';
import { ChevronForwardOutline } from '@vicons/ionicons5';
import type { DiagnosticEvent } from '@/lib/schema';
import { useI18n } from '@/shared/i18n/engine';

const props = defineProps<{
  event: DiagnosticEvent;
  formattedTime: string;
  levelLabel: string;
  tagType: 'info' | 'warning' | 'error';
}>();

const { t: i18n } = useI18n();
const contextEntries = computed(() => Object.entries(props.event.context ?? {}));

function formatContextValue(value: string | number | boolean): string {
  return String(value);
}
</script>

<template>
  <NPopover
    :max-width="380"
    placement="left-start"
    scrollable
    style="max-height: min(360px, calc(100vh - 32px))"
    trigger="click"
  >
    <template #trigger>
      <NButton
        circle
        size="tiny"
        text
        :aria-label="i18n('options_diagnostics_view_details', 'View event details')"
      >
        <template #icon>
          <NIcon :size="16"><ChevronForwardOutline /></NIcon>
        </template>
      </NButton>
    </template>

    <template #header>
      {{ i18n('options_diagnostics_details_title', 'Event details') }}
    </template>

    <div class="diagnostic-details">
      <div class="diagnostic-details-heading">
        <NTag :bordered="false" size="small" :type="tagType">
          {{ levelLabel }}
        </NTag>
        <time :datetime="new Date(event.ts).toISOString()">{{ formattedTime }}</time>
      </div>

      <code class="diagnostic-details-code">{{ event.code }}</code>

      <section class="diagnostic-details-section">
        <h4>{{ i18n('options_diagnostics_details_message', 'Message') }}</h4>
        <p>{{ event.message }}</p>
      </section>

      <section v-if="contextEntries.length" class="diagnostic-details-section">
        <h4>{{ i18n('options_diagnostics_details_context', 'Context') }}</h4>
        <NDescriptions bordered :column="1" label-placement="left" size="small">
          <NDescriptionsItem v-for="[key, value] in contextEntries" :key="key" :label="key">
            <code>{{ formatContextValue(value) }}</code>
          </NDescriptionsItem>
        </NDescriptions>
      </section>
    </div>
  </NPopover>
</template>

<style scoped>
.diagnostic-details {
  width: min(348px, calc(100vw - 64px));
}

.diagnostic-details-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-on-surface-variant);
  font-size: 12px;
}

.diagnostic-details-code {
  display: block;
  margin-top: 12px;
  overflow-wrap: anywhere;
  color: var(--color-on-surface);
  font-size: 13px;
  font-weight: 600;
}

.diagnostic-details-section {
  margin-top: 20px;
}

.diagnostic-details-section h4 {
  margin-bottom: 8px;
  color: var(--color-on-surface-variant);
  font-size: 12px;
  font-weight: 500;
}

.diagnostic-details-section p,
.diagnostic-details-section code {
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
