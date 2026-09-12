import type { MediaTrack } from './contracts';

const failures: Record<string, string> = {
  integration_unavailable:
    'Motrix Next has not implemented the media interface yet. Discovery remains available.',
  invalid_response:
    'Motrix Next returned an invalid media response. Check the integration before retrying.',
  api_auth_failed: 'The desktop API secret does not match. Check Connection settings.',
  unreachable: 'Could not connect to Motrix Next. Start the app and check Connection settings.',
  timeout: 'The desktop did not reply in time. Retry to check the same operation.',
  desktop_error: 'The desktop could not complete this request. Retry to check the same operation.',
  source_expired: 'This source is no longer available. Play the media again and scan the page.',
  expired: 'The format inspection expired. Inspect the source again.',
  protected_media: 'This source uses protected media that the engine cannot download.',
  authentication_required:
    'The source needs authentication. Check your login and cookie forwarding settings.',
  unsupported_source: 'This source cannot be downloaded through the media interface.',
  unsupported_selection:
    'The selected tracks or container are not supported. Choose another combination.',
  probe_failed: 'The engine could not inspect this source. Play it again or try another source.',
  conflict:
    'The operation conflicts with an existing request. Check its status before starting another download.',
  connection_changed:
    'Connection settings changed. Inspect the source using the current connection.',
  privacy_changed:
    'Request forwarding settings changed. Inspect the source again with the current settings.',
  not_found: 'The desktop no longer has this inspection. Inspect the source again.',
  site_limit: 'The excluded-site list is full. Remove a site before adding another.',
  inspection_limit:
    'Eight inspections are already open. Finish or cancel one before inspecting another source.',
};
export function mediaFailureMessage(code: string): string {
  return (
    failures[code] ??
    'The media operation could not finish. Retry or check the extension diagnostics.'
  );
}

export function mediaTrackLabel(track: MediaTrack): string {
  let language = track.language;
  if (language) {
    try {
      language = new Intl.DisplayNames(['en'], { type: 'language' }).of(language) || language;
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
      track.type === 'muxed' ? 'Includes audio' : '',
    ]
      .filter(Boolean)
      .join(' · ') || track.id
  );
}

export function mediaSize(bytes: number | null): string {
  if (bytes === null) return 'Size unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index =
    bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(bytes / 1024 ** index)} ${units[index]}`;
}
