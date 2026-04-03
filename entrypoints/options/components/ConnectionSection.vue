<script lang="ts" setup>
/**
 * @fileoverview Connection settings section.
 *
 * RPC host/port/secret configuration with a "Test Connection" button
 * and status feedback. Uses Naive UI NInput, NInputNumber, NButton,
 * NTag, and NSpin for visual consistency with the desktop Basic.vue.
 */
import { computed } from 'vue';
import {
  NFormItem,
  NInput,
  NInputNumber,
  NButton,
  NTag,
  NIcon,
} from 'naive-ui';
import { CheckmarkCircleOutline, CloseCircleOutline } from '@vicons/ionicons5';
import { ConnectionStatus } from '@/modules/services/connection';

const props = defineProps<{
  port: number;
  secret: string;
  status: ConnectionStatus;
  version: string | null;
  error: string | null;
  testing: boolean;
}>();

const emit = defineEmits<{
  'update:port': [value: number];
  'update:secret': [value: string];
  test: [];
}>();

function i18n(key: string, fallback: string): string {
  return chrome.i18n.getMessage(key) || fallback;
}

const isConnected = computed(() => props.status === ConnectionStatus.Connected);

/** Map error class names from ConnectionService to i18n keys. */
const ERROR_I18N: Record<string, [key: string, fallback: string]> = {
  RpcUnreachableError: ['error_rpc_unreachable', 'Cannot connect to Motrix Next RPC'],
  RpcAuthError: ['error_rpc_auth', 'RPC secret is incorrect'],
  RpcTimeoutError: ['error_rpc_timeout', 'Connection timed out'],
  UnknownError: ['error_unknown', 'An unknown error occurred'],
};

const errorMessage = computed(() => {
  if (!props.error) return null;
  const entry = ERROR_I18N[props.error] ?? ERROR_I18N.UnknownError!;
  return i18n(entry[0], entry[1]);
});
</script>

<template>
  <div class="section">
    <div class="section__grid">
      <NFormItem :label="i18n('options_rpc_port_label', 'RPC Port')">
        <NInputNumber
          :value="port"
          :min="1"
          :max="65535"
          style="width: 140px"
          @update:value="(v: number | null) => emit('update:port', v ?? 16800)"
        />
      </NFormItem>
      <NFormItem :label="i18n('options_rpc_secret_label', 'RPC Secret')">
        <NInput
          :value="secret"
          type="password"
          show-password-on="click"
          placeholder="••••••••"
          style="width: 240px"
          @update:value="(v: string) => emit('update:secret', v)"
        />
      </NFormItem>
    </div>

    <div class="section__row">
      <NButton
        type="primary"
        :loading="testing"
        @click="emit('test')"
      >
        <Transition name="text-swap" mode="out-in">
          <span v-if="testing" key="testing">
            {{ i18n('options_testing_connection', 'Testing...') }}
          </span>
          <span v-else key="idle">
            {{ i18n('options_test_connection', 'Test Connection') }}
          </span>
        </Transition>
      </NButton>

      <Transition name="fade" mode="out-in">
        <span v-if="isConnected && version" key="ok" class="section__feedback section__feedback--ok">
          <NIcon :size="16"><CheckmarkCircleOutline /></NIcon>
          {{ i18n('options_connection_success_prefix', 'Connected · aria2') }}
          <NTag size="small" round>v{{ version }}</NTag>
        </span>
        <span v-else-if="error" key="err" class="section__feedback section__feedback--err">
          <NIcon :size="16"><CloseCircleOutline /></NIcon>
          {{ errorMessage }}
        </span>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.section__grid {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.section__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.section__feedback {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.section__feedback--ok {
  color: var(--color-success);
}

.section__feedback--err {
  color: var(--color-error);
}
</style>
