import type { MediaTrack } from './contracts';
const failures: Record<string, string> = {
  integration_unavailable: 'unavailable',
  api_auth_failed: 'api_auth',
  authentication_required: 'source_auth',
  unreachable: 'connection',
  source_expired: 'expired',
  expired: 'expired',
  not_found: 'expired',
  player_not_found: 'ambiguous',
  protected_media: 'protected',
  unsupported_source: 'unsupported',
  unsupported_selection: 'invalid',
};
export function mediaFailureKey(code: string): string {
  return `media_${failures[code] ?? 'failed'}`;
}

export function mediaTrackLabel(track: MediaTrack, locale: string, includesAudio: string): string {
  let language = track.language;
  if (language) {
    try {
      language =
        new Intl.DisplayNames([locale.replace('_', '-')], { type: 'language' }).of(language) ||
        language;
    } catch {
      /* Keep nonstandard source labels. */
    }
  }
  return (
    [
      track.height ? `${track.height}p` : '',
      track.frameRate ? `${track.frameRate} fps` : '',
      language,
      track.codec,
      track.bandwidth ? `${Math.round(track.bandwidth / 1000)} kb/s` : '',
      track.type === 'muxed' ? includesAudio : '',
    ]
      .filter(Boolean)
      .join(' · ') || track.id
  );
}

export function mediaSize(bytes: number | null, locale: string, unknown: string): string {
  if (bytes === null) return unknown;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index =
    bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${new Intl.NumberFormat(locale.replace('_', '-'), { maximumFractionDigits: 1 }).format(bytes / 1024 ** index)} ${units[index]}`;
}

export function mediaDuration(milliseconds: number, locale: string): string {
  return new Intl.NumberFormat(locale.replace('_', '-'), {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'long',
    maximumFractionDigits: 0,
  }).format(milliseconds / 1000);
}
