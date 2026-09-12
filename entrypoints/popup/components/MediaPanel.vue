<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { NAlert, NButton, NEmpty, NInput, NSpace, NSpin, NSwitch } from 'naive-ui';
import { sendMediaCommand, type MediaCommand, type MediaList } from '@/lib/media/messages';
import { hostname } from '@/lib/media/detection';
import { mediaFailureMessage, mediaSize } from '@/lib/media/presentation';
import { MEDIA_SESSION_KEY } from '@/lib/schema';
import { usePolling } from '@/shared/use-polling';
import MediaSelection from './MediaSelection.vue';

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
const filtered = computed(
  () =>
    state.value?.items.filter((item) =>
      `${item.title} ${item.filename} ${hostname(item.url)} ${item.kind}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
    ) ?? [],
);

async function selectSource(id: string) {
  selectedId.value = id;
  await nextTick();
  document.getElementById('media-options-heading')?.focus();
}
async function showSources() {
  const id = selectedId.value;
  selectedId.value = '';
  await nextTick();
  const source = document.querySelector(`button[data-media-id="${window.CSS.escape(id)}"]`);
  if (source instanceof window.HTMLElement) source.focus();
}

async function command(value: MediaCommand) {
  if (busy.value) return;
  const current = ++revision;
  busy.value = true;
  error.value = '';
  try {
    const data = await sendMediaCommand(value);
    if (!disposed && current === revision) state.value = data;
  } catch (cause) {
    if (!disposed && current === revision)
      error.value = mediaFailureMessage(
        cause instanceof Error ? cause.message : 'operation_failed',
      );
  } finally {
    busy.value = false;
  }
}

async function refresh(): Promise<boolean> {
  if (disposed || polling || tabId.value === null || busy.value) return true;
  const current = revision;
  polling = true;
  try {
    const operation = selected.value?.operation;
    const active =
      operation &&
      !operation.error &&
      ['probing', 'submitting', 'cancelling'].includes(operation.state);
    const data = await sendMediaCommand(
      active
        ? { type: 'MEDIA_POLL', tabId: tabId.value, candidateId: selectedId.value }
        : { type: 'MEDIA_LIST', tabId: tabId.value },
    );
    if (!disposed && current === revision) state.value = data;
    return true;
  } catch (cause) {
    if (!disposed && current === revision)
      error.value = mediaFailureMessage(
        cause instanceof Error ? cause.message : 'operation_failed',
      );
    return false;
  } finally {
    polling = false;
    loading.value = false;
  }
}

const poller = usePolling({ fn: refresh, baseIntervalMs: 1500, maxIntervalMs: 10_000 });
const changes: Parameters<typeof browser.storage.onChanged.addListener>[0] = (change, area) => {
  if (area === 'session' && change[MEDIA_SESSION_KEY]) void refresh();
};
onMounted(async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (disposed) return;
    if (tab?.id !== undefined && tab.url && /^https?:/.test(tab.url)) {
      tabId.value = tab.id;
      await refresh();
      if (disposed) return;
      selectedId.value =
        state.value?.items.find(
          (item) =>
            item.operation &&
            ['probing', 'ready', 'submitting', 'cancelling'].includes(item.operation.state),
        )?.id ?? '';
      browser.storage.onChanged.addListener(changes);
      poller.start();
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
  <section class="media-panel" aria-label="Page media" :aria-busy="loading || busy">
    <div v-if="loading" class="media-loading" role="status">
      <NSpin size="small" /> Finding page media…
    </div>
    <NEmpty v-else-if="tabId === null" description="Open a web page to discover its media." />
    <template v-else>
      <div class="media-toolbar">
        <span class="media-host">{{ state?.host || 'Current page' }}</span>
        <NSwitch
          :value="state?.enabled ?? true"
          :disabled="busy"
          aria-label="Discover page media"
          @update:value="command({ type: 'MEDIA_ENABLE', tabId, enabled: $event })"
        />
      </div>
      <NAlert v-if="error" type="error" :show-icon="false" role="alert">{{ error }}</NAlert>
      <NAlert v-if="state?.excluded" type="info" :show-icon="false"
        >Discovery is disabled for this site.</NAlert
      >
      <NAlert v-else-if="state && !state.enabled" type="info" :show-icon="false"
        >Media discovery is paused.</NAlert
      >
      <MediaSelection
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
      <template v-else>
        <NSpace justify="space-between">
          <NButton
            size="small"
            :disabled="busy || !state?.enabled || state.excluded"
            @click="command({ type: 'MEDIA_RESCAN', tabId })"
            >Scan page</NButton
          >
          <NButton
            size="small"
            :disabled="busy || !state?.items.length"
            @click="command({ type: 'MEDIA_CLEAR', tabId })"
            >Clear sources</NButton
          >
        </NSpace>
        <NInput
          v-if="state && state.items.length > 5"
          v-model:value="query"
          clearable
          placeholder="Filter media sources"
          aria-label="Filter media sources"
        />
        <ul v-if="filtered.length" class="media-sources" aria-label="Discovered sources">
          <li v-for="item in filtered" :key="item.id">
            <button
              type="button"
              class="media-source"
              :data-media-id="item.id"
              @click="selectSource(item.id)"
            >
              <span class="media-kind">{{
                item.kind === 'embedded' ? 'PAGE' : item.kind.toUpperCase()
              }}</span>
              <span class="media-source-copy">
                <strong>{{ item.filename || item.title || 'Media source' }}</strong>
                <span
                  >{{ hostname(item.url) || 'In-page playback' }} · {{ mediaSize(item.size) }}</span
                >
                <span v-if="item.operation?.state === 'submitted'" class="media-success"
                  >Sent to Motrix Next</span
                >
                <span v-else-if="item.operation?.state === 'ready'">Formats ready</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
        <NEmpty v-else description="No media sources found yet." />
        <p class="media-hint">
          Play the video or audio on this page. Available sources appear here automatically.
        </p>
        <NButton
          size="small"
          quaternary
          :disabled="busy || !state?.host"
          @click="command({ type: 'MEDIA_SITE', tabId, excluded: !state?.excluded })"
          >{{ state?.excluded ? 'Enable on this site' : 'Disable on this site' }}</NButton
        >
      </template>
    </template>
  </section>
</template>

<style scoped>
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
