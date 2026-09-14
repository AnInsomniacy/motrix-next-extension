<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import { parseDesktopActionResponse } from '@/lib/desktop';
import {
  NEmpty,
  NButton,
  NForm,
  NFormItem,
  NInputNumber,
  NSelect,
  NSpace,
  NSpin,
  NCollapseTransition,
  NIcon,
} from 'naive-ui';
import { OpenOutline } from '@vicons/ionicons5';
import type { MediaItem } from '@/lib/media/messages';
import { selectionError, type MediaSelection } from '@/lib/media/contracts';
import {
  mediaFailureKey,
  mediaTrackLabel,
  mediaSize,
  mediaDuration,
} from '@/lib/media/presentation';
import { useI18n } from '@/shared/i18n/engine';
const { t: i18n, effectiveLocale } = useI18n();

const props = defineProps<{
  item: MediaItem;
  busy: boolean;
  draft?: MediaSelection;
}>();
const emit = defineEmits<{
  draft: [probeId: string, selection: MediaSelection];
  inspect: [];
  downloadFile: [];
  refresh: [];
  cancel: [];
  submit: [selection: MediaSelection];
  back: [];
}>();
const opening = ref(false);
const openError = ref(false);
async function openDesktop() {
  if (opening.value) return;
  opening.value = true;
  openError.value = false;
  try {
    const result = parseDesktopActionResponse(
      await browser.runtime.sendMessage({ type: 'OPEN_DESKTOP' }),
    );
    if (!result.ok) throw new Error('Activation rejected');
  } catch {
    openError.value = true;
  } finally {
    opening.value = false;
  }
}
const operation = computed(() => props.item.operation);
const presentation = computed(() =>
  operation.value?.probe?.state === 'ready' ? operation.value.probe.presentation : null,
);
const form = ref<MediaSelection | null>(null);
let formProbeId = '';
watch(
  presentation,
  (value) => {
    if (value && operation.value && formProbeId !== operation.value.probeId) {
      form.value = { ...(props.draft ?? value.defaults) };
      formProbeId = operation.value.probeId;
    }
  },
  { immediate: true },
);
watch(
  form,
  (value) => {
    if (value && formProbeId) emit('draft', formProbeId, { ...value });
  },
  { deep: true },
);
const videoOptions = computed(
  () =>
    presentation.value?.tracks
      .filter((track) => ['video', 'muxed'].includes(track.type))
      .map((track) => ({
        label: mediaTrackLabel(track, effectiveLocale.value, i18n('media_includes_audio')),
        value: track.id,
      })) ?? [],
);
const audioOptions = computed(
  () =>
    presentation.value?.tracks
      .filter((track) => {
        const video = presentation.value?.tracks.find((item) => item.id === form.value?.videoId);
        if (video?.type === 'muxed') return track.id === video.id;
        return track.type === 'audio' || (!video && track.type === 'muxed');
      })
      .map((track) => ({
        label: mediaTrackLabel(track, effectiveLocale.value, i18n('media_includes_audio')),
        value: track.id,
      })) ?? [],
);
const subtitleOptions = computed(
  () =>
    presentation.value?.tracks
      .filter((track) => track.type === 'subtitle')
      .map((track) => ({
        label: mediaTrackLabel(track, effectiveLocale.value, i18n('media_includes_audio')),
        value: track.id,
      })) ?? [],
);
const formatOptions = computed(
  () =>
    presentation.value?.formats.map((value) => ({
      label: value.toUpperCase(),
      value,
    })) ?? [],
);
watch(
  () => form.value?.videoId,
  (id) => {
    if (!form.value?.audioId || !presentation.value) return;
    const video = presentation.value.tracks.find((track) => track.id === id);
    const audio = presentation.value.tracks.find((track) => track.id === form.value?.audioId);
    if (video?.type === 'muxed') form.value.audioId = video.id;
    else if (video && audio?.type === 'muxed') {
      form.value.audioId =
        presentation.value.tracks.find((track) => track.type === 'audio')?.id ?? null;
    }
  },
);
const invalid = computed(() =>
  presentation.value && form.value ? selectionError(presentation.value, form.value) : null,
);
const pending = computed(
  () => operation.value && ['probing', 'submitting', 'cancelling'].includes(operation.value.state),
);
const canInspect = computed(
  () =>
    ['hls', 'dash'].includes(props.item.kind) &&
    (!operation.value || ['failed', 'cancelled'].includes(operation.value.state)),
);
const unsupported = computed(() => props.item.kind === 'embedded' || props.item.method !== 'GET');
function submit() {
  if (!props.busy && operation.value?.state === 'ready' && form.value && !invalid.value)
    emit('submit', { ...form.value });
}
</script>

<template>
  <section class="media-selection" :aria-label="i18n('media_options')" :aria-busy="busy">
    <NButton size="small" text class="back-button" @click="emit('back')">{{
      i18n('media_back')
    }}</NButton>
    <h3 id="media-options-heading" tabindex="-1">
      {{ item.filename || item.title || i18n('media_source') }}
    </h3>
    <p class="media-meta">
      {{ item.kind === 'embedded' ? i18n('media_waiting') : item.kind.toUpperCase() }} ·
      {{ mediaSize(item.size, effectiveLocale, i18n('media_size_unknown')) }}
    </p>
    <NCollapseTransition :show="unsupported"
      ><p class="feedback" role="status">
        {{ item.kind === 'embedded' ? i18n('media_waiting') : i18n('media_unsupported') }}
      </p></NCollapseTransition
    >
    <NCollapseTransition :show="Boolean(operation?.error)"
      ><p class="feedback feedback--error" role="alert">
        {{ i18n(mediaFailureKey(operation?.error ?? '')) }}
      </p></NCollapseTransition
    >
    <div class="content-stage selection-stage">
      <Transition
        name="content"
        @before-enter="(el) => el.removeAttribute('inert')"
        @before-leave="(el) => el.setAttribute('inert', '')"
      >
        <NForm
          v-if="presentation && form && operation?.state === 'ready'"
          key="ready"
          class="form-stack"
          label-placement="top"
          :disabled="busy"
          @submit.prevent="submit"
        >
          <p class="media-meta">
            {{
              presentation.live
                ? i18n('media_live')
                : presentation.durationMs === null
                  ? i18n('media_duration_unknown')
                  : mediaDuration(presentation.durationMs, effectiveLocale)
            }}
          </p>
          <NFormItem :show-feedback="false" :label="i18n('media_video')">
            <NSelect
              v-model:value="form.videoId"
              :options="videoOptions"
              clearable
              :placeholder="i18n('media_no_video')"
              :aria-label="i18n('media_video')"
              ><template #empty><NEmpty :description="i18n('media_none')" /></template
            ></NSelect>
          </NFormItem>
          <NFormItem :show-feedback="false" :label="i18n('media_audio')">
            <NSelect
              v-model:value="form.audioId"
              :options="audioOptions"
              :disabled="busy"
              clearable
              :placeholder="i18n('media_no_audio')"
              :aria-label="i18n('media_audio')"
              ><template #empty><NEmpty :description="i18n('media_none')" /></template
            ></NSelect>
          </NFormItem>
          <NFormItem :show-feedback="false" :label="i18n('media_subtitles')">
            <NSelect
              v-model:value="form.subtitleId"
              :options="subtitleOptions"
              clearable
              :placeholder="i18n('media_no_subtitles')"
              :aria-label="i18n('media_subtitles')"
              ><template #empty><NEmpty :description="i18n('media_none')" /></template
            ></NSelect>
          </NFormItem>
          <NFormItem :show-feedback="false" :label="i18n('media_format')">
            <NSelect
              v-model:value="form.format"
              :options="formatOptions"
              :aria-label="i18n('media_format')"
              ><template #empty><NEmpty :description="i18n('media_none')" /></template
            ></NSelect>
          </NFormItem>
          <NFormItem
            :show-feedback="false"
            v-if="presentation.live"
            :label="i18n('media_record_limit')"
          >
            <NInputNumber
              :value="form.recordTimeSeconds"
              :min="0"
              :max="31536000"
              :precision="0"
              :aria-label="i18n('media_record_limit')"
              @update:value="form.recordTimeSeconds = $event ?? 0"
            />
          </NFormItem>
          <p v-if="presentation.live" class="media-meta">
            {{ i18n('media_record_hint') }}
          </p>
          <NCollapseTransition :show="Boolean(invalid)"
            ><p class="feedback" role="alert">{{ i18n('media_invalid') }}</p></NCollapseTransition
          >
          <NSpace justify="end">
            <NButton :disabled="busy" @click="emit('cancel')">{{ i18n('media_cancel') }}</NButton>
            <NButton
              attr-type="submit"
              type="primary"
              :disabled="busy || Boolean(invalid)"
              :loading="busy"
              >{{ presentation.live ? i18n('media_record') : i18n('media_download') }}</NButton
            >
          </NSpace>
        </NForm>
        <div v-else key="status" class="selection-status">
          <div v-if="pending" class="media-progress" role="status">
            <NSpin v-if="!operation?.error" size="small" />
            <span>{{
              i18n(
                operation?.state === 'submitting'
                  ? 'media_confirming'
                  : operation?.state === 'cancelling'
                    ? 'media_cancelling'
                    : 'media_loading',
              )
            }}</span>
          </div>
          <p
            v-else-if="operation?.state === 'submitted' || item.sentToDesktop"
            class="feedback feedback--success"
            role="status"
          >
            {{ i18n('media_submitted') }}
          </p>
          <p v-else-if="operation?.state === 'cancelled'" class="feedback" role="status">
            {{ i18n('media_cancelled') }}
          </p>
          <p v-if="canInspect && !unsupported" class="media-meta">
            {{ i18n('media_inspect_hint') }}
          </p>
          <NSpace justify="end">
            <NButton
              v-if="operation?.state === 'submitted' || item.sentToDesktop"
              text
              type="primary"
              :loading="opening"
              @click="openDesktop"
              ><template #icon
                ><NIcon :size="14"><OpenOutline /></NIcon></template
              >{{ i18n('popup_action_open') }}</NButton
            >
            <NButton
              v-else-if="item.kind === 'file' && !unsupported"
              type="primary"
              :loading="busy"
              @click="emit('downloadFile')"
              >{{ i18n('media_download') }} · {{ i18n('media_original') }}</NButton
            >
            <template v-else-if="!unsupported">
              <NButton v-if="pending" :disabled="busy" @click="emit('cancel')">{{
                i18n('media_cancel')
              }}</NButton>
              <NButton
                v-if="pending && operation?.error"
                :loading="busy"
                @click="emit('refresh')"
                >{{ i18n('media_retry') }}</NButton
              >
              <NButton v-if="canInspect" type="primary" :loading="busy" @click="emit('inspect')">{{
                i18n('media_inspect')
              }}</NButton>
            </template>
          </NSpace>
          <NCollapseTransition :show="openError"
            ><p class="feedback feedback--error" role="alert">
              {{ i18n('popup_action_failed') }}
            </p></NCollapseTransition
          >
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.media-selection {
  display: grid;
  gap: 12px;
}
h3 {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
.media-meta {
  color: var(--color-on-surface-variant);
  font-size: 12px;
}
.media-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  min-height: 48px;
}
.n-form {
  gap: 20px;
}
.selection-status {
  display: grid;
  gap: 16px;
}
.selection-stage {
  min-height: 48px;
}
.back-button {
  justify-self: start;
}
.n-space {
  position: sticky;
  bottom: 0;
  padding-block: 12px;
  background: var(--color-surface);
  z-index: 1;
}
.n-form-item {
  margin: 0;
}
.n-input-number {
  width: 100%;
}
</style>
