import type { MediaCandidate } from '@/lib/schema';
import type { MediaPresentation, MediaSelection } from '@/lib/media/contracts';

export const mediaSelection: MediaSelection = {
  videoId: 'video-1080',
  audioId: 'audio-en',
  subtitleId: null,
  format: 'mp4',
  recordTimeSeconds: 0,
};
export function mediaPresentation(): MediaPresentation {
  return {
    kind: 'hls',
    title: 'Example video',
    live: false,
    durationMs: 60_000,
    size: null,
    tracks: [
      {
        id: 'video-1080',
        type: 'video',
        language: '',
        codec: 'avc1',
        width: 1920,
        height: 1080,
        bandwidth: 4_000_000,
        frameRate: 30,
      },
      {
        id: 'video-720',
        type: 'video',
        language: '',
        codec: 'avc1',
        width: 1280,
        height: 720,
        bandwidth: 2_000_000,
        frameRate: 30,
      },
      {
        id: 'audio-en',
        type: 'audio',
        language: 'en',
        codec: 'mp4a',
        width: 0,
        height: 0,
        bandwidth: 128_000,
        frameRate: 0,
      },
    ],
    formats: ['mp4', 'mkv'],
    defaults: { ...mediaSelection },
  };
}
export function mediaCandidate(patch: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    id: crypto.randomUUID(),
    tabId: 1,
    frameId: 0,
    documentId: 'document-one',
    frameUrl: 'https://example.com/watch',
    pageUrl: 'https://example.com/watch',
    url: 'https://cdn.example.com/master.m3u8?token=secret',
    kind: 'hls',
    title: 'Example video',
    filename: 'master.m3u8',
    mime: 'application/vnd.apple.mpegurl',
    size: null,
    method: 'GET',
    evidence: 'network',
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    ...patch,
  };
}
