<script lang="ts" setup>
/**
 * @fileoverview Enhanced permissions section.
 *
 * Manages optional browser permissions for cookie forwarding and
 * hiding the download bar. Uses Naive UI NSwitch, NButton, NTag,
 * and NCollapseTransition for the conditional sub-settings reveal
 * (matching desktop Basic.vue collapse pattern).
 */
import {
  NButton,
  NSwitch,
  NFormItem,
  NIcon,
  NCollapseTransition,
} from 'naive-ui';
import { CheckmarkCircleOutline, ShieldCheckmarkOutline } from '@vicons/ionicons5';

const props = defineProps<{
  granted: boolean;
  hideDownloadBar: boolean;
}>();

const emit = defineEmits<{
  grant: [];
  revoke: [];
  'update:hideDownloadBar': [value: boolean];
}>();

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}
</script>

<template>
  <div class="section">
    <p class="enhanced-desc">
      {{ i18n('options_enhanced_description', 'Grant additional permissions for cookie forwarding and hiding the browser download bar.') }}
      <span class="enhanced-note">
        {{ i18n('options_enhanced_cookie_note', 'Cookie forwarding is best-effort — it may not work for all sites due to browser privacy policies.') }}
      </span>
    </p>

    <Transition name="phase-switch" mode="out-in">
      <!-- Granted State -->
      <div v-if="granted" key="granted" class="enhanced-granted">
        <div class="enhanced-status">
          <NIcon :size="18" class="enhanced-status__icon">
            <CheckmarkCircleOutline />
          </NIcon>
          <span>{{ i18n('options_enhanced_status_granted', 'Enhanced permissions granted') }}</span>
        </div>

        <NCollapseTransition :show="granted">
          <NFormItem :label="i18n('options_enhanced_hide_bar_label', 'Hide Browser Download Bar')" class="enhanced-toggle">
            <NSwitch
              :value="hideDownloadBar"
              @update:value="emit('update:hideDownloadBar', $event)"
            />
          </NFormItem>
        </NCollapseTransition>

        <NButton
          size="small"
          type="error"
          quaternary
          @click="emit('revoke')"
        >
          {{ i18n('options_enhanced_revoke', 'Revoke Permissions') }}
        </NButton>
      </div>

      <!-- Not Granted State -->
      <div v-else key="not-granted">
        <NButton type="primary" secondary @click="emit('grant')">
          <template #icon>
            <NIcon :size="16"><ShieldCheckmarkOutline /></NIcon>
          </template>
          {{ i18n('options_enhanced_grant', 'Grant Enhanced Permissions') }}
        </NButton>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.enhanced-desc {
  font-size: 13px;
  color: var(--color-on-surface-variant);
  line-height: 1.6;
  margin-bottom: 16px;
}

.enhanced-note {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.75;
}

.enhanced-granted {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.enhanced-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 8%, transparent);
  border-radius: 10px;
  padding: 10px 14px;
}

.enhanced-status__icon {
  flex-shrink: 0;
}

.enhanced-toggle :deep(.n-form-item) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
