<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import { NButton, NEmpty, NInput, NIcon, NSpin, NSwitch, NCollapseTransition } from 'naive-ui';
import { sendMediaCommand, type MediaCommand, type MediaList } from '@/lib/media/messages';
import { hostname } from '@/lib/media/detection';
import { mediaFailureKey, mediaSize } from '@/lib/media/presentation';
import { useI18n } from '@/shared/i18n/engine';
const { t: i18n, effectiveLocale } = useI18n();
import { DocumentOutline, ChevronForwardOutline } from '@vicons/ionicons5';
import type { MediaSelection as Selection } from '@/lib/media/contracts';
import { MEDIA_SESSION_KEY } from '@/lib/schema';
import { usePolling } from '@/shared/use-polling';
import MediaSelection from './MediaSelection.vue';

const emit = defineEmits<{ count: [value: number] }>();
const drafts = new Map<string, Selection>();
const sourceScroll = ref<InstanceType<typeof window.HTMLElement>>();
let scrollTop = 0;
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
const needsPolling = computed(() => {
  const operation = selected.value?.operation;
  return (
    props.active !== false &&
    Boolean(
      operation &&
      ['probing', 'submitting', 'cancelling'].includes(operation.state) &&
      !['connection_changed', 'privacy_changed', 'api_auth_failed', 'conflict'].includes(
        operation.error ?? '',
      ),
    )
  );
});
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
  scrollTop = sourceScroll.value?.scrollTop ?? 0;
  selectedId.value = id;
  await nextTick();
  panelRoot.value
    ?.querySelector<InstanceType<typeof window.HTMLElement>>('#media-options-heading')
    ?.focus();
  const item = selected.value;
  if (
    item &&
    ['hls', 'dash'].includes(item.kind) &&
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
  if (sourceScroll.value) sourceScroll.value.scrollTop = scrollTop;
  const source = panelRoot.value?.querySelector(`button[data-media-id="${window.CSS.escape(id)}"]`);
  if (source instanceof window.HTMLElement) source.focus({ preventScroll: true });
}

async function command(value: MediaCommand) {
  if (busy.value) return;
  const current = ++revision;
  busy.value = true;
  error.value = '';
  try {
    const data = await send(value);
    if (!disposed && current === revision) {
      state.value = data;
      error.value = '';
    }
  } catch (cause) {
    if (!disposed && current === revision)
      error.value = mediaFailureKey(cause instanceof Error ? cause.message : 'operation_failed');
  } finally {
    busy.value = false;
  }
}

async function refresh(initial = false): Promise<boolean> {
  if (
    (!initial && props.active === false) ||
    disposed ||
    polling ||
    tabId.value === null ||
    busy.value
  )
    return true;
  const current = revision;
  polling = true;
  try {
    const active = needsPolling.value;
    const data = await send(
      active
        ? { type: 'MEDIA_POLL', tabId: tabId.value, candidateId: selectedId.value }
        : { type: 'MEDIA_LIST', tabId: tabId.value },
    );
    if (!disposed && current === revision) {
      state.value = data;
      error.value = '';
    }
    return !active || !selected.value?.operation?.error;
  } catch (cause) {
    if (!disposed && current === revision)
      error.value = mediaFailureKey(cause instanceof Error ? cause.message : 'operation_failed');
    return false;
  } finally {
    polling = false;
    loading.value = false;
  }
}

const poller = usePolling({ fn: () => refresh(), baseIntervalMs: 1500, maxIntervalMs: 10_000 });
watch(needsPolling, (pending) => {
  if (pending && tabId.value !== null && !disposed) poller.start();
  else poller.stop();
});
const changes: Parameters<typeof browser.storage.onChanged.addListener>[0] = (change, area) => {
  if (area === 'session' && change[MEDIA_SESSION_KEY]) void refresh(true);
};
onMounted(async () => {
  try {
    const [tab] = props.frame
      ? [{ id: 0, url: window.location.href }]
      : await browser.tabs.query({ active: true, currentWindow: true });
    if (disposed) return;
    if (tab?.id !== undefined && (props.frame || (tab.url && /^https?:/.test(tab.url)))) {
      tabId.value = tab.id;
      await refresh(true);
      if (disposed) return;
      selectedId.value =
        visibleItems.value.find(
          (item) =>
            item.operation &&
            ['probing', 'ready', 'submitting', 'cancelling'].includes(item.operation.state),
        )?.id ?? '';
      browser.storage.onChanged.addListener(changes);
    }
  } catch {
    if (!disposed) error.value = 'media_failed';
  } finally {
    loading.value = false;
  }
});
watch(
  () => props.active,
  (active) => {
    if (active) void refresh();
  },
);
watch(
  () => state.value?.items,
  (items) => {
    emit('count', items?.length ?? 0);
    const probes = new Set(items?.map((item) => item.operation?.probeId));
    for (const id of drafts.keys()) if (!probes.has(id)) drafts.delete(id);
  },
);
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
    :class="{ 'media-panel--frame': frame }"
    :aria-label="i18n('media_sources')"
    :aria-busy="loading || busy"
  >
    <div v-if="loading" class="media-loading" role="status">
      <NSpin size="small" /> {{ i18n('media_loading') }}
    </div>
    <NEmpty v-else-if="tabId === null" :show-icon="false" :description="i18n('media_open_page')" />
    <template v-else>
      <div class="media-toolbar">
        <span class="media-host">{{ state?.host || i18n('media_sources') }}</span>
        <NSwitch
          size="small"
          v-if="!frame"
          :value="state?.enabled ?? true"
          :disabled="busy || !state"
          :aria-label="i18n('media_discover')"
          :title="i18n('media_discover')"
          @update:value="command({ type: 'MEDIA_ENABLE', tabId, enabled: $event })"
        />
      </div>
      <NCollapseTransition :show="Boolean(error || state?.excluded || (state && !state.enabled))">
        <p
          class="feedback"
          :class="{ 'feedback--error': error }"
          :role="error ? 'alert' : 'status'"
        >
          {{
            error ? i18n(error) : state?.excluded ? i18n('media_excluded') : i18n('media_paused')
          }}
        </p>
      </NCollapseTransition>
      <div class="media-stage">
        <Transition
          name="content"
          @before-enter="(el) => el.removeAttribute('inert')"
          @before-leave="(el) => el.setAttribute('inert', '')"
          ><MediaSelection
            v-if="selected"
            :key="selected.id"
            :item="selected"
            :draft="selected.operation ? drafts.get(selected.operation.probeId) : undefined"
            @draft="(probeId, selection) => drafts.set(probeId, selection)"
            :busy="busy"
            @back="showSources"
            @download-file="
              command({ type: 'MEDIA_DOWNLOAD_FILE', tabId, candidateId: selected.id })
            "
            @inspect="command({ type: 'MEDIA_PROBE', tabId, candidateId: selected.id })"
            @refresh="command({ type: 'MEDIA_POLL', tabId, candidateId: selected.id })"
            @cancel="command({ type: 'MEDIA_CANCEL', tabId, candidateId: selected.id })"
            @submit="
              command({ type: 'MEDIA_SUBMIT', tabId, candidateId: selected.id, selection: $event })
            "
          />
          <div v-else key="sources" class="media-source-view">
            <NInput
              v-if="state && state.items.length > 5"
              v-model:value="query"
              clearable
              :placeholder="i18n('media_filter')"
              :aria-label="i18n('media_filter')"
            />
            <p v-if="uncertain" class="media-hint">{{ i18n('media_ambiguous') }}</p>
            <div ref="sourceScroll" class="source-scroll">
              <TransitionGroup
                name="list"
                tag="ul"
                class="media-sources"
                :aria-label="i18n('media_sources')"
              >
                <li v-for="item in filtered" :key="item.id" class="source-row">
                  <button
                    type="button"
                    :title="`${item.filename || item.title} · ${hostname(item.url)}`"
                    class="media-source"
                    :data-media-id="item.id"
                    @click="selectSource(item.id)"
                  >
                    <NIcon :size="18"><DocumentOutline /></NIcon>
                    <span class="media-source-copy">
                      <strong
                        ><bdi>{{
                          item.filename || item.title || i18n('media_source')
                        }}</bdi></strong
                      >
                      <span
                        >{{
                          item.kind === 'embedded' ? i18n('media_source') : item.kind.toUpperCase()
                        }}
                        ·
                        {{ mediaSize(item.size, effectiveLocale, i18n('media_size_unknown')) }} ·
                        {{ hostname(item.url) }}</span
                      >
                      <span v-if="item.operation?.state === 'submitted'" class="media-success">{{
                        i18n('media_submitted')
                      }}</span>
                      <span v-else-if="item.operation?.state === 'ready'">{{
                        i18n('media_ready')
                      }}</span>
                    </span>
                    <NIcon :size="14" class="source-chevron"><ChevronForwardOutline /></NIcon>
                  </button>
                  <NButton
                    size="tiny"
                    text
                    :disabled="busy"
                    @click="command({ type: 'MEDIA_LOCATE', tabId, candidateId: item.id })"
                    >{{ i18n('media_locate') }}</NButton
                  >
                </li>
              </TransitionGroup>
              <NEmpty
                v-if="!filtered.length"
                :show-icon="false"
                :description="i18n('media_none')"
              />
            </div>
            <footer class="media-actions">
              <NButton
                size="small"
                text
                :disabled="busy || !state?.enabled || state.excluded"
                @click="command({ type: 'MEDIA_RESCAN', tabId })"
                >{{ i18n('media_scan') }}</NButton
              >
              <NButton
                v-if="!frame"
                size="small"
                text
                :disabled="busy || !state?.items.length"
                @click="command({ type: 'MEDIA_CLEAR', tabId })"
                >{{ i18n('media_clear') }}</NButton
              >
              <NButton
                size="small"
                text
                :disabled="busy || !state?.host"
                @click="command({ type: 'MEDIA_SITE', tabId, excluded: !state?.excluded })"
                >{{
                  state?.excluded ? i18n('media_enable_site') : i18n('media_disable_site')
                }}</NButton
              >
            </footer>
          </div></Transition
        >
      </div>
    </template>
  </section>
</template>

<style scoped>
.media-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px 14px;
  max-height: 440px;
  overflow: hidden;
}
.media-panel--frame {
  max-height: calc(100dvh - 24px);
  padding: 0;
}
.media-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.media-source-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.media-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: 30px;
}
.media-host {
  font-size: 12px;
  color: var(--color-on-surface-variant);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 140px;
}
.source-scroll {
  max-height: 300px;
  overflow: auto;
  min-height: 80px;
}
.media-sources {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}
.source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
}
.media-source {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: start;
  cursor: pointer;
  transition: background-color 120ms;
}
.media-source:hover {
  background: var(--color-hover);
}
.media-source > .n-icon {
  flex-shrink: 0;
  color: var(--color-on-surface-variant);
}
.media-source-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}
.media-source-copy strong {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.media-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding-block: 12px 2px;
  border-block-start: 1px solid var(--color-outline-variant);
}
.media-actions > :last-child {
  margin-inline-start: auto;
}
:dir(rtl) .source-chevron {
  transform: rotate(180deg);
}
</style>
