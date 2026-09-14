<script lang="ts" setup>
/** Connection settings section. */
import { computed, shallowRef, watch } from 'vue';
import { NInput, NInputNumber, NButton, NIcon, NCollapseTransition } from 'naive-ui';
import { CheckmarkCircleOutline, CloseCircleOutline } from '@vicons/ionicons5';
import type { ConnectionStatus } from '@/lib/api';
import SettingsRow from './SettingsRow.vue';
import { DEFAULT_CONNECTION_CONFIG } from '@/lib/schema';

const props = defineProps<{
  port: number;
  secret: string;
  status: ConnectionStatus;
  version: string | null;
  error: string | null;
  testing: boolean;
  resultRevision: number;
}>();

const emit = defineEmits<{
  'update:port': [value: number];
  'update:secret': [value: string];
  test: [];
}>();

import { useI18n } from '@/shared/i18n/engine';

const { t: i18n } = useI18n();

const isConnected = computed(() => props.status === 'connected');

/** Map API error names to translated messages. */
const ERROR_I18N: Record<string, [key: string, fallback: string]> = {
  ApiUnreachableError: ['error_api_unreachable', 'Cannot connect to Rayburst'],
  ApiAuthError: ['error_api_auth', 'API secret is incorrect'],
  ApiTimeoutError: ['error_api_timeout', 'Connection timed out'],
  UnknownError: ['error_unknown', 'An unknown error occurred'],
};

const errorMessage = computed(() => {
  if (!props.error) return null;
  const entry = ERROR_I18N[props.error] ?? ERROR_I18N.UnknownError!;
  return i18n(entry[0], entry[1]);
});
// Retain the rendered result while the library closes the feedback region.
interface Feedback {
  revision: number;
  error: boolean;
  message: string;
  version: string | null;
}
const feedback = shallowRef<Feedback | null>(null);
watch(
  () => ({
    revision: props.resultRevision,
    error: props.error,
    connected: isConnected.value,
    message: errorMessage.value,
    version: props.version,
    success: i18n('options_connection_success_prefix'),
  }),
  (result) => {
    if (!result.error && !result.connected) return;
    feedback.value = {
      revision: result.revision,
      error: Boolean(result.error),
      message: result.error ? result.message! : result.success,
      version: result.error ? null : result.version,
    };
  },
  { immediate: true },
);
</script>

<template>
  <section class="settings-group" aria-labelledby="connection-heading">
    <div class="settings-group-header">
      <h2 id="connection-heading" class="settings-group-title">
        {{ i18n('options_section_connection') }}
      </h2>
      <NButton size="small" :loading="testing" @click="emit('test')">{{
        i18n('options_test_connection')
      }}</NButton>
    </div>
    <SettingsRow :label="i18n('options_api_port_label')">
      <NInputNumber
        :value="port"
        :min="1024"
        :max="65535"
        :precision="0"
        :aria-label="i18n('options_api_port_label')"
        class="setting-port"
        :show-button="false"
        @update:value="emit('update:port', $event ?? DEFAULT_CONNECTION_CONFIG.port)"
      />
    </SettingsRow>
    <SettingsRow :label="i18n('options_api_secret_label')" :hint="i18n('options_api_secret_hint')">
      <NInput
        :value="secret"
        type="password"
        show-password-on="click"
        :input-props="{ autocomplete: 'off', spellcheck: false }"
        :placeholder="i18n('options_api_secret_placeholder')"
        :aria-label="i18n('options_api_secret_label')"
        class="setting-secret"
        @update:value="emit('update:secret', $event)"
      />
    </SettingsRow>
    <NCollapseTransition :show="Boolean(error || isConnected)">
      <p class="feedback" role="status" :aria-busy="testing">
        <Transition
          name="connection-feedback"
          @before-leave="(element) => element.setAttribute('aria-hidden', 'true')"
          @before-enter="(element) => element.removeAttribute('aria-hidden')"
          @leave-cancelled="(element) => element.removeAttribute('aria-hidden')"
        >
          <span
            v-if="feedback"
            :key="`${feedback.revision}:${feedback.error}:${feedback.message}:${feedback.version}`"
            class="feedback-result"
            :class="feedback.error ? 'feedback--error' : 'feedback--success'"
          >
            <NIcon :size="16"
              ><CloseCircleOutline v-if="feedback.error" /><CheckmarkCircleOutline v-else
            /></NIcon>
            <span
              >{{ feedback.message
              }}<bdi v-if="feedback.version">{{ `\u00a0v${feedback.version}` }}</bdi></span
            >
          </span>
        </Transition>
      </p>
    </NCollapseTransition>
  </section>
</template>

<style scoped>
.feedback {
  display: grid;
  text-align: end;
}
.feedback-result {
  grid-area: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
/* Fade the previous result first so identical replies still acknowledge the test. */
.connection-feedback-enter-active {
  transition: opacity 160ms ease 80ms;
}
.connection-feedback-leave-active {
  transition: opacity 80ms ease;
}
.connection-feedback-enter-from,
.connection-feedback-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .connection-feedback-enter-active {
    transition-delay: 0ms;
  }
}
</style>
