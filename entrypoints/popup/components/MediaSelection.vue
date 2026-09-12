<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAlert, NButton, NForm, NFormItem, NInputNumber, NSelect, NSpace, NSpin } from 'naive-ui';
import type { MediaItem } from '@/lib/media/messages';
import { selectionError, type MediaSelection } from '@/lib/media/contracts';
import { mediaFailureMessage, mediaTrackLabel, mediaSize } from '@/lib/media/presentation';

const props = defineProps<{ item: MediaItem; busy: boolean }>();
const emit = defineEmits<{
  inspect: [];
  refresh: [];
  cancel: [];
  submit: [selection: MediaSelection];
  back: [];
}>();
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
      form.value = { ...value.defaults };
      formProbeId = operation.value.probeId;
    }
  },
  { immediate: true },
);
const videoOptions = computed(
  () =>
    presentation.value?.tracks
      .filter((track) => ['video', 'muxed'].includes(track.type))
      .map((track) => ({ label: mediaTrackLabel(track), value: track.id })) ?? [],
);
const audioOptions = computed(
  () =>
    presentation.value?.tracks
      .filter((track) => {
        const video = presentation.value?.tracks.find((item) => item.id === form.value?.videoId);
        if (video?.type === 'muxed') return track.id === video.id;
        return track.type === 'audio' || (!video && track.type === 'muxed');
      })
      .map((track) => ({ label: mediaTrackLabel(track), value: track.id })) ?? [],
);
const subtitleOptions = computed(
  () =>
    presentation.value?.tracks
      .filter((track) => track.type === 'subtitle')
      .map((track) => ({ label: mediaTrackLabel(track), value: track.id })) ?? [],
);
const formatOptions = computed(
  () =>
    presentation.value?.formats.map((value) => ({
      label: value === 'original' ? 'Original file' : value.toUpperCase(),
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
  () => !operation.value || ['failed', 'cancelled'].includes(operation.value.state),
);
const unsupported = computed(() => props.item.kind === 'embedded' || props.item.method !== 'GET');
function submit() {
  if (form.value && !invalid.value) emit('submit', { ...form.value });
}
</script>

<template>
  <section class="media-selection" aria-label="Media options" :aria-busy="busy">
    <NButton size="small" quaternary @click="emit('back')">Back to sources</NButton>
    <h3 id="media-options-heading" tabindex="-1">
      {{ item.filename || item.title || 'Media source' }}
    </h3>
    <p class="media-meta">
      {{ item.kind === 'embedded' ? 'In-page playback' : item.kind.toUpperCase() }} ·
      {{ mediaSize(item.size) }}
    </p>
    <NAlert v-if="unsupported" type="info" :show-icon="false">
      {{
        item.kind === 'embedded'
          ? 'This is an in-page playback reference. Play the video to discover its original network source.'
          : 'This source requires a request method the media interface does not support.'
      }}
    </NAlert>
    <NAlert v-if="operation?.error" type="error" :show-icon="false" role="alert">{{
      mediaFailureMessage(operation.error)
    }}</NAlert>
    <div v-if="pending" class="media-progress" role="status" aria-live="polite">
      <NSpin v-if="!operation?.error" size="small" />
      <span>{{
        operation?.state === 'submitting'
          ? 'Confirming the download…'
          : operation?.state === 'cancelling'
            ? 'Cancelling inspection…'
            : 'Inspecting available formats…'
      }}</span>
    </div>
    <NAlert v-if="operation?.state === 'submitted'" type="success" :show-icon="false" role="status">
      Download created in Motrix Next.
    </NAlert>
    <NAlert v-if="operation?.state === 'cancelled'" type="info" :show-icon="false"
      >Inspection cancelled.</NAlert
    >

    <NForm
      v-if="presentation && form && operation?.state === 'ready'"
      label-placement="top"
      :disabled="busy"
      @submit.prevent="submit"
    >
      <p class="media-meta">
        {{
          presentation.live
            ? 'Live recording'
            : presentation.durationMs === null
              ? 'Duration unknown'
              : `${Math.round(presentation.durationMs / 1000)} seconds`
        }}
      </p>
      <template v-if="presentation.kind !== 'file'">
        <NFormItem label="Video quality">
          <NSelect
            v-model:value="form.videoId"
            :options="videoOptions"
            clearable
            placeholder="No video"
            :aria-label="'Video quality'"
          />
        </NFormItem>
        <NFormItem label="Audio">
          <NSelect
            v-model:value="form.audioId"
            :options="audioOptions"
            :disabled="busy"
            clearable
            placeholder="No audio"
            aria-label="Audio track"
          />
        </NFormItem>
        <NFormItem label="Subtitles">
          <NSelect
            v-model:value="form.subtitleId"
            :options="subtitleOptions"
            clearable
            placeholder="No subtitles"
            aria-label="Subtitle track"
          />
        </NFormItem>
      </template>
      <NFormItem label="Output format">
        <NSelect v-model:value="form.format" :options="formatOptions" aria-label="Output format" />
      </NFormItem>
      <NFormItem v-if="presentation.live" label="Recording limit (seconds)">
        <NInputNumber
          :value="form.recordTimeSeconds"
          :min="0"
          :max="31536000"
          :precision="0"
          aria-label="Recording limit in seconds"
          @update:value="form.recordTimeSeconds = $event ?? 0"
        />
      </NFormItem>
      <p v-if="presentation.live" class="media-meta">
        Zero records until you finish the recording in Motrix Next.
      </p>
      <NAlert v-if="invalid" type="warning" :show-icon="false" role="alert">{{ invalid }}</NAlert>
      <NSpace justify="end">
        <NButton :disabled="busy" @click="emit('cancel')">Cancel</NButton>
        <NButton
          attr-type="submit"
          type="primary"
          :disabled="busy || Boolean(invalid)"
          :loading="busy"
          >{{ presentation.live ? 'Start recording' : 'Download' }}</NButton
        >
      </NSpace>
    </NForm>
    <NSpace v-else-if="!unsupported && operation?.state !== 'submitted'" justify="end">
      <NButton v-if="pending" :disabled="busy" @click="emit('cancel')">Cancel</NButton>
      <NButton v-if="pending && operation?.error" :loading="busy" @click="emit('refresh')"
        >Retry</NButton
      >
      <NButton v-if="canInspect" type="primary" :loading="busy" @click="emit('inspect')"
        >Inspect formats</NButton
      >
    </NSpace>
    <p v-if="canInspect && !unsupported" class="media-meta">
      Motrix Next inspects the source. Nothing downloads until you confirm.
    </p>
  </section>
</template>

<style scoped>
.media-selection {
  display: grid;
  gap: 12px;
}
h3 {
  font-size: 15px;
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
  display: grid;
  gap: 8px;
}
.n-form-item {
  margin: 0;
}
.n-input-number {
  width: 100%;
}
</style>
