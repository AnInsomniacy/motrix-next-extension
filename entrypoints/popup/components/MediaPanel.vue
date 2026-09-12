<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import { NAlert, NButton, NEmpty, NInput, NSpace, NSpin, NSwitch } from 'naive-ui';
import { sendMediaCommand, type MediaCommand, type MediaList } from '@/lib/media/messages';
import { hostname } from '@/lib/media/detection';
import { mediaFailureKey, mediaSize } from '@/lib/media/presentation';
import { useI18n } from '@/shared/i18n/engine';
const { t: i18n, effectiveLocale } = useI18n();
import { MEDIA_SESSION_KEY } from '@/lib/schema';
import { usePolling } from '@/shared/use-polling';
import MediaSelection from './MediaSelection.vue';

const props = defineProps<{ frame?: boolean; playerUrl?: string; active?: boolean }>();
const send = (value: MediaCommand) => sendMediaCommand(value, props.frame);
const panelRoot = ref<InstanceType<typeof window.HTMLElement>>();
const state = ref<MediaList | null>(null);
const tabId = ref<number | null>(null);
const selectedId = ref('');
const query = ref('');
const busy = ref(false);
const error = ref('');
const loading = ref(true);
let disposed = false;
let polling = false;
let revision = 0;
const selected = computed(() => state.value?.items.find((item) => item.id === selectedId.value));
const visibleItems = computed(() => {
  const items = state.value?.items ?? [];
  const exact =
    props.playerUrl &&
    items.filter((item) => item.url === props.playerUrl && item.kind !== 'embedded');
  return exact && exact.length ? exact : items;
});
const uncertain = computed(
  () =>
    props.frame &&
    !visibleItems.value.some((item) => item.url === props.playerUrl && item.kind !== 'embedded'),
);
const filtered = computed(
  () =>
    visibleItems.value.filter((item) =>
      `${item.title} ${item.filename} ${hostname(item.url)} ${item.kind}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
    ) ?? [],
);

async function selectSource(id: string) {
  selectedId.value = id;
  await nextTick();
  panelRoot.value
    ?.querySelector<InstanceType<typeof window.HTMLElement>>('#media-options-heading')
    ?.focus();
  const item = selected.value;
  if (
    item &&
    item.kind !== 'embedded' &&
    item.method === 'GET' &&
    !item.operation &&
    tabId.value !== null
  )
    await command({ type: 'MEDIA_PROBE', tabId: tabId.value, candidateId: id });
}
async function showSources() {
  const id = selectedId.value;
  selectedId.value = '';
  await nextTick();
  const source = panelRoot.value?.querySelector(`button[data-media-id="${window.CSS.escape(id)}"]`);
  if (source instanceof window.HTMLElement) source.focus();
}

async function command(value: MediaCommand) {
  if (busy.value) return;
  const current = ++revision;
  busy.value = true;
  error.value = '';
  try {
    const data = await send(value);
    if (!disposed && current === revision) state.value = data;
  } catch (cause) {
    if (!disposed && current === revision)
      error.value = mediaFailureKey(cause instanceof Error ? cause.message : 'operation_failed');
  } finally {
    busy.value = false;
  }
}

async function refresh(): Promise<boolean> {
  if (props.active === false || disposed || polling || tabId.value === null || busy.value)
    return true;
  const current = revision;
  polling = true;
  try {
    const operation = selected.value?.operation;
    const active =
      operation &&
      !operation.error &&
      ['probing', 'submitting', 'cancelling'].includes(operation.state);
    const data = await send(
      active
        ? { type: 'MEDIA_POLL', tabId: tabId.value, candidateId: selectedId.value }
        : { type: 'MEDIA_LIST', tabId: tabId.value },
    );
    if (!disposed && current === revision) state.value = data;
    return true;
  } catch (cause) {
    if (!disposed && current === revision)
      error.value = mediaFailureKey(cause instanceof Error ? cause.message : 'operation_failed');
    return false;
  } finally {
    polling = false;
    loading.value = false;
  }
}

const poller = usePolling({ fn: refresh, baseIntervalMs: 1500, maxIntervalMs: 10_000 });
watch(
  () => props.active,
  (active) => {
    if (active === false) poller.stop();
    else if (tabId.value !== null && !disposed) poller.start();
  },
);
const changes: Parameters<typeof browser.storage.onChanged.addListener>[0] = (change, area) => {
  if (area === 'session' && change[MEDIA_SESSION_KEY]) void refresh();
};
onMounted(async () => {
  try {
    const [tab] = props.frame
      ? [{ id: 0, url: window.location.href }]
      : await browser.tabs.query({ active: true, currentWindow: true });
    if (disposed) return;
    if (tab?.id !== undefined && (props.frame || (tab.url && /^https?:/.test(tab.url)))) {
      tabId.value = tab.id;
      await refresh();
      if (disposed) return;
      selectedId.value =
        visibleItems.value.find(
          (item) =>
            item.operation &&
            ['probing', 'ready', 'submitting', 'cancelling'].includes(item.operation.state),
        )?.id ?? '';
      browser.storage.onChanged.addListener(changes);
      if (props.active !== false) poller.start();
    }
  } finally {
    loading.value = false;
  }
});
onUnmounted(() => {
  disposed = true;
  revision++;
  poller.stop();
  browser.storage.onChanged.removeListener(changes);
});
</script>

<template>
  <section
    ref="panelRoot"
    class="media-panel"
    :aria-label="i18n('media_sources')"
    :aria-busy="loading || busy"
  >
    <div v-if="loading" class="media-loading" role="status">
      <NSpin size="small" /> {{ i18n('media_loading') }}
    </div>
    <NEmpty v-else-if="tabId === null" :description="i18n('media_open_page')" />
    <template v-else>
      <div class="media-toolbar">
        <span class="media-host">{{ state?.host || i18n('media_sources') }}</span>
        <NSwitch
          v-if="!frame"
          :value="state?.enabled ?? true"
          :disabled="busy"
          :aria-label="i18n('media_discover')"
          @update:value="command({ type: 'MEDIA_ENABLE', tabId, enabled: $event })"
        />
      </div>
      <NAlert v-if="error" type="error" :show-icon="false" role="alert">{{ i18n(error) }}</NAlert>
      <NAlert v-if="state?.excluded" type="info" :show-icon="false">{{
        i18n('media_excluded')
      }}</NAlert>
      <NAlert v-else-if="state && !state.enabled" type="info" :show-icon="false">{{
        i18n('media_paused')
      }}</NAlert>
      <div class="media-stage">
        <Transition :name="selected ? 'media-forward' : 'media-back'"
          ><MediaSelection
            v-if="selected"
            :key="selected.id"
            :item="selected"
            :busy="busy"
            @back="showSources"
            @inspect="command({ type: 'MEDIA_PROBE', tabId, candidateId: selected.id })"
            @refresh="command({ type: 'MEDIA_POLL', tabId, candidateId: selected.id })"
            @cancel="command({ type: 'MEDIA_CANCEL', tabId, candidateId: selected.id })"
            @submit="
              command({ type: 'MEDIA_SUBMIT', tabId, candidateId: selected.id, selection: $event })
            "
          />
          <div v-else key="sources" class="media-source-view">
            <NSpace justify="space-between">
              <NButton
                size="small"
                :disabled="busy || !state?.enabled || state.excluded"
                @click="command({ type: 'MEDIA_RESCAN', tabId })"
                >{{ i18n('media_scan') }}</NButton
              >
              <NButton
                size="small"
                :disabled="busy || !state?.items.length"
                v-if="!frame"
                @click="command({ type: 'MEDIA_CLEAR', tabId })"
                >{{ i18n('media_clear') }}</NButton
              >
            </NSpace>
            <NInput
              v-if="state && state.items.length > 5"
              v-model:value="query"
              clearable
              :placeholder="i18n('media_filter')"
              :aria-label="i18n('media_filter')"
            />
            <p v-if="uncertain" class="media-hint">{{ i18n('media_ambiguous') }}</p>
            <ul v-if="filtered.length" class="media-sources" :aria-label="i18n('media_sources')">
              <li v-for="item in filtered" :key="item.id">
                <button
                  type="button"
                  class="media-source"
                  :data-media-id="item.id"
                  @click="selectSource(item.id)"
                >
                  <span class="media-kind">{{
                    item.kind === 'embedded' ? i18n('media_source') : item.kind.toUpperCase()
                  }}</span>
                  <span class="media-source-copy">
                    <strong>{{ item.filename || item.title || i18n('media_source') }}</strong>
                    <span
                      >{{ hostname(item.url) || i18n('media_waiting') }} ·
                      {{ mediaSize(item.size, effectiveLocale, i18n('media_size_unknown')) }}</span
                    >
                    <span v-if="item.operation?.state === 'submitted'" class="media-success">{{
                      i18n('media_submitted')
                    }}</span>
                    <span v-else-if="item.operation?.state === 'ready'">{{
                      i18n('media_ready')
                    }}</span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
                <NButton
                  size="tiny"
                  quaternary
                  @click="command({ type: 'MEDIA_LOCATE', tabId, candidateId: item.id })"
                  >{{ i18n('media_locate') }}</NButton
                >
              </li>
            </ul>
            <NEmpty v-else :description="i18n('media_none')" />
            <p class="media-hint">
              {{ i18n('media_hint') }}
            </p>
            <NButton
              size="small"
              quaternary
              :disabled="busy || !state?.host"
              @click="command({ type: 'MEDIA_SITE', tabId, excluded: !state?.excluded })"
              >{{
                state?.excluded ? i18n('media_enable_site') : i18n('media_disable_site')
              }}</NButton
            >
          </div></Transition
        >
      </div>
    </template>
  </section>
</template>

<style scoped>
.media-stage {
  position: relative;
  min-height: 140px;
}
.media-source-view {
  display: grid;
  gap: 12px;
}
.media-panel {
  display: grid;
  gap: 12px;
  padding: 4px 16px 16px;
  max-height: 500px;
  overflow-y: auto;
}
.media-loading {
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.media-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: 40px;
}
.media-host {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-sources {
  list-style: none;
  display: grid;
  gap: 8px;
}
.media-source {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--color-outline-variant);
  border-radius: 12px;
  background: var(--color-surface-container-low);
  color: inherit;
  text-align: start;
  cursor: pointer;
  font: inherit;
}
.media-source:hover {
  background: var(--color-surface-container-high);
}
.media-source:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.media-source:active {
  background: var(--color-surface-container-highest);
}
.media-kind {
  font-size: 10px;
  font-weight: 700;
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
  border-radius: 6px;
  padding: 4px 6px;
  flex: none;
}
.media-source-copy {
  display: grid;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.media-source-copy strong {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
  line-height: 1.4;
}
.media-source-copy > span,
.media-hint {
  font-size: 12px;
  color: var(--color-on-surface-variant);
  overflow-wrap: anywhere;
}
.media-source-copy > .media-success {
  color: var(--color-success);
}
</style>
