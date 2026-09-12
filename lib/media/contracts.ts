/** The versioned desktop media protocol. No browser or engine implementation lives here. */
import { z } from 'zod';

export const MEDIA_API_PATH = 'media/v1';
export const MEDIA_PROTOCOL_VERSION = 1;
export const MediaSourceKindSchema = z.enum(['file', 'hls', 'dash']);
export const MediaFormatSchema = z.enum(['original', 'mp4', 'mkv']);
export const MediaHttpUrlSchema = z
  .string()
  .max(16_384)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Expected an HTTP(S) URL without embedded credentials');
const identifier = z.string().min(1).max(128);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const MediaFailureCodeSchema = z.enum([
  'unsupported_source',
  'protected_media',
  'authentication_required',
  'source_expired',
  'unsupported_selection',
  'probe_failed',
  'expired',
  'not_found',
  'conflict',
]);

export const MediaRequestContextSchema = z.strictObject({
  url: MediaHttpUrlSchema,
  capturedAt: integer,
  headers: z
    .array(z.strictObject({ name: z.string().min(1).max(128), value: z.string().max(8192) }))
    .max(32),
});

export const MediaSourceSchema = z.strictObject({
  url: MediaHttpUrlSchema,
  kind: MediaSourceKindSchema,
  pageUrl: MediaHttpUrlSchema,
  title: z.string().max(512),
  filename: z.string().max(255),
  mime: z.string().max(128),
  requestContexts: z.array(MediaRequestContextSchema).max(8),
});

export const MediaTrackSchema = z.strictObject({
  id: identifier,
  type: z.enum(['video', 'audio', 'muxed', 'subtitle']),
  language: z.string().max(64),
  codec: z.string().max(128),
  width: integer,
  height: integer,
  bandwidth: integer,
  frameRate: z.number().finite().nonnegative().max(1000),
});

export const MediaSelectionSchema = z.strictObject({
  videoId: identifier.nullable(),
  audioId: identifier.nullable(),
  subtitleId: identifier.nullable(),
  format: MediaFormatSchema,
  recordTimeSeconds: z.number().int().min(0).max(31_536_000),
});

export const MediaPresentationSchema = z
  .strictObject({
    kind: MediaSourceKindSchema,
    title: z.string().max(512),
    live: z.boolean(),
    durationMs: integer.nullable(),
    size: integer.nullable(),
    tracks: z.array(MediaTrackSchema).max(256),
    formats: z.array(MediaFormatSchema).min(1).max(3),
    defaults: MediaSelectionSchema,
  })
  .superRefine((value, ctx) => {
    if (new Set(value.tracks.map((track) => track.id)).size !== value.tracks.length) {
      ctx.addIssue({ code: 'custom', message: 'Track identifiers must be unique' });
    }
    if (selectionError(value, value.defaults)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid default selection' });
    }
  });

export const MediaCapabilitiesSchema = z.strictObject({
  protocolVersion: z.literal(MEDIA_PROTOCOL_VERSION),
  sourceKinds: z.array(MediaSourceKindSchema).min(1).max(3),
});
export const MediaProbeRequestSchema = z.strictObject({ id: z.uuid(), source: MediaSourceSchema });
const probeBase = { id: z.uuid(), expiresAt: integer };
export const MediaProbeSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...probeBase, state: z.literal('probing') }),
  z.strictObject({
    ...probeBase,
    state: z.literal('ready'),
    presentation: MediaPresentationSchema,
  }),
  z.strictObject({ ...probeBase, state: z.literal('failed'), error: MediaFailureCodeSchema }),
  z.strictObject({ ...probeBase, state: z.literal('cancelled') }),
  z.strictObject({
    ...probeBase,
    state: z.literal('submitted'),
    submissionId: z.uuid(),
    gid: identifier,
  }),
]);
export const MediaSubmitRequestSchema = z.strictObject({
  submissionId: z.uuid(),
  selection: MediaSelectionSchema,
});
export const MediaSubmitResponseSchema = z.strictObject({
  id: z.uuid(),
  submissionId: z.uuid(),
  gid: identifier,
});
export const MediaCancelResponseSchema = z.discriminatedUnion('state', [
  z.strictObject({ id: z.uuid(), state: z.literal('cancelled') }),
  z.strictObject({
    id: z.uuid(),
    state: z.literal('submitted'),
    submissionId: z.uuid(),
    gid: identifier,
  }),
]);
export const MediaErrorResponseSchema = z.strictObject({ error: MediaFailureCodeSchema });

export type MediaSource = z.infer<typeof MediaSourceSchema>;
export type MediaSourceKind = z.infer<typeof MediaSourceKindSchema>;
export type MediaRequestContext = z.infer<typeof MediaRequestContextSchema>;
export type MediaTrack = z.infer<typeof MediaTrackSchema>;
export type MediaSelection = z.infer<typeof MediaSelectionSchema>;
export type MediaPresentation = z.infer<typeof MediaPresentationSchema>;
export type MediaProbe = z.infer<typeof MediaProbeSchema>;
export type MediaProbeRequest = z.infer<typeof MediaProbeRequestSchema>;
export type MediaSubmitRequest = z.infer<typeof MediaSubmitRequestSchema>;
export type MediaFailureCode = z.infer<typeof MediaFailureCodeSchema>;

/** A selection references native track IDs; resolution labels never become selectors. */
export function selectionError(
  presentation: { kind: MediaSourceKind; live: boolean; tracks: MediaTrack[]; formats: string[] },
  selection: MediaSelection,
): string | null {
  if (!presentation.formats.includes(selection.format)) return 'Choose an available output format.';
  if (!presentation.live && selection.recordTimeSeconds !== 0)
    return 'Duration limits apply to live recordings only.';
  if (presentation.kind === 'file') {
    return selection.format !== 'original' ||
      selection.videoId ||
      selection.audioId ||
      selection.subtitleId
      ? 'Direct files must keep their original format.'
      : null;
  }
  if (selection.format === 'original') return 'Choose a media container.';
  const video = presentation.tracks.find((track) => track.id === selection.videoId);
  const audio = presentation.tracks.find((track) => track.id === selection.audioId);
  const subtitle = presentation.tracks.find((track) => track.id === selection.subtitleId);
  if (selection.videoId && (!video || !['video', 'muxed'].includes(video.type)))
    return 'Choose an available video track.';
  if (selection.audioId && (!audio || !['audio', 'muxed'].includes(audio.type)))
    return 'Choose an available audio track.';
  if (selection.subtitleId && (!subtitle || subtitle.type !== 'subtitle'))
    return 'Choose an available subtitle track.';
  if (video && audio && (video.type === 'muxed' || audio.type === 'muxed') && video.id !== audio.id)
    return 'Choose audio from the selected multiplexed source or omit it.';
  if (!video && !audio) return 'Select at least one video or audio track.';
  return null;
}
