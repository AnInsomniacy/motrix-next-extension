# Desktop media API v1

This is the extension-side integration contract for Motrix Next. The desktop and
engine repositories are not changed by this implementation. Discovery runs locally;
format inspection and downloading become available when the desktop implements this
contract using its native media engine.

Canonical validators: [`lib/media/contracts.ts`](../lib/media/contracts.ts).
Generated structural JSON Schemas: [`media-api.schema.json`](media-api.schema.json).
Run `pnpm media:contract` after a contract change and `pnpm media:contract:check`
to verify the generated bundle. Semantic constraints below supplement JSON Schema.

## Transport

Base URL: `http://127.0.0.1:{configuredPort}/media/v1`.
Requests and responses use JSON. Use the configured Extension API Bearer secret;
it is independent of the engine RPC secret. Handle extension-origin CORS and browser
local-network preflight. Browser-page origins must not gain control merely because
the API listens on loopback. Apply the same authentication to every media endpoint.

Return quickly (within five seconds). Inspection is asynchronous; network/manifest
work must not hold the initial HTTP request open. No content or segments pass through
the extension. Cap request size at 256 KiB and validate all input at the desktop boundary.

| Method | Path                  | Result                                                        |
| ------ | --------------------- | ------------------------------------------------------------- |
| GET    | `/capabilities`       | Actual engine-supported source kinds and `protocolVersion: 1` |
| POST   | `/probes`             | Create or retrieve an idempotent inspection                   |
| GET    | `/probes/{id}`        | Read inspection or submission state                           |
| POST   | `/probes/{id}/submit` | Apply selection and create/start exactly one task             |
| POST   | `/probes/{id}/cancel` | Cancel an inspection, without deleting an existing download   |

There are no aliases or older media contracts. Do not infer capabilities from an app
version or expose an unrestricted engine RPC proxy to the extension.

## Capabilities

```json
{ "protocolVersion": 1, "sourceKinds": ["file", "hls", "dash"] }
```

Advertise actual running-engine capabilities. The existing ordinary `/ping` and
`/stat` endpoints remain responsible for app connectivity and global statistics.

## Probe request

```json
{
  "id": "6e31af08-8c8f-4e3f-98b1-22c1309fab34",
  "source": {
    "url": "https://cdn.example.com/master.m3u8?signature=opaque",
    "kind": "hls",
    "pageUrl": "https://example.com/watch",
    "title": "Example video",
    "filename": "master.m3u8",
    "mime": "application/vnd.apple.mpegurl",
    "requestContexts": [
      {
        "url": "https://cdn.example.com/master.m3u8?signature=opaque",
        "capturedAt": 1789200000000,
        "headers": [{ "name": "referer", "value": "https://example.com/watch" }]
      }
    ]
  }
}
```

- `id` is generated and persisted by the extension before sending. Identical ID/body
  replays return the same operation. A different body for the same ID returns 409.
- `kind` is a discovery hint. Explicit HLS/DASH hints must not silently become raw
  manifest downloads. A direct-file candidate may be recognized as HLS/DASH by the probe.
- Preserve signed URL bytes. Do not sort, decode/re-encode, or strip query parameters.
- `pageUrl`, `title`, and `filename` are untrusted metadata. The desktop validates the
  source scheme, derives a safe output filename and applies its configured destination.
  `filename` is a hint, not a filesystem path or final output extension.
- `requestContexts` contains at most eight independently observed media origins from
  the source document. Each header set is scoped to the exact origin of its own `url`,
  including scheme and effective port. Never flatten these sets into global headers.
  Apply this boundary to every redirect, child manifest, segment and key request,
  including custom token headers. Do not rely only on libcurl's special handling of
  Authorization/Cookie: arbitrary custom headers require the same origin policy.
- Do not invent missing credentials, copy a page's cookies to an unrelated CDN,
  disable TLS checks, or allow manifests to open local files/executable protocols.
  Native cookie/HTTP implementations remain responsible for transport behavior.
- Probe using the native engine's manifest client. With the current Aria2 Next model,
  use `media-pause-after-probe=true` and retain the same GID through selection. Probing
  may fetch manifests and metadata; it must not start payload downloading/recording.

## Probe response

All states include `id` and `expiresAt` (Unix milliseconds). Inspections expire after
five minutes. Replays do not extend their lease. The extension tolerates at most
30 seconds of clock skew beyond that lease.

```json
{ "id": "6e31af08-8c8f-4e3f-98b1-22c1309fab34", "expiresAt": 1789200300000, "state": "probing" }
```

Ready state:

```json
{
  "id": "6e31af08-8c8f-4e3f-98b1-22c1309fab34",
  "expiresAt": 1789200300000,
  "state": "ready",
  "presentation": {
    "kind": "hls",
    "title": "Example video",
    "live": false,
    "durationMs": 60000,
    "size": null,
    "tracks": [
      {
        "id": "video-1080",
        "type": "video",
        "language": "",
        "codec": "avc1",
        "width": 1920,
        "height": 1080,
        "bandwidth": 4000000,
        "frameRate": 30
      },
      {
        "id": "audio-en",
        "type": "audio",
        "language": "en",
        "codec": "mp4a",
        "width": 0,
        "height": 0,
        "bandwidth": 128000,
        "frameRate": 0
      }
    ],
    "formats": ["mp4", "mkv"],
    "defaults": {
      "videoId": "video-1080",
      "audioId": "audio-en",
      "subtitleId": null,
      "format": "mp4",
      "recordTimeSeconds": 0
    }
  }
}
```

Wire numbers are JSON numbers, not native RPC decimal strings. The desktop adapter
converts the engine's strings/units. Unknown size and duration are `null`; do not
present fragment length as output size. Track fields use pixels, bits/second, and
frames/second. Unknown numeric track metadata is zero. Track IDs are unique, opaque,
and stable for the inspection; never use a resolution label as the selector.

Track types: `video`, `audio`, `muxed`, `subtitle`. A multiplexed representation may
be selected in both slots using the same ID, or in only one slot for video-only or
audio-only output. It cannot be combined with another representation in v1. The
desktop maps null selectors to native `none` options and preserves that packet-filtering
intent. At least one video/audio track must be selected for streaming media.
Subtitle-only output and arbitrary multi-audio output are not part of this contract.

`defaults` must reference available tracks and a supported format. `formats` contains
only actual output-container choices; final codec/container validation remains native.
For direct files use empty `tracks`, `formats: ["original"]`, and null selectors.
Finite sources have a zero recording limit; live sources use seconds, with zero meaning
record until explicitly finished in the desktop. There is no implicit transcoding.

Other probe states:

```json
{
  "id": "6e31af08-8c8f-4e3f-98b1-22c1309fab34",
  "expiresAt": 1789200300000,
  "state": "failed",
  "error": "protected_media"
}
```

`cancelled` has no additional fields. `submitted` includes `submissionId` and `gid`.

## Submission

```json
{
  "submissionId": "7e31af08-8c8f-4e3f-98b1-22c1309fab34",
  "selection": {
    "videoId": "video-1080",
    "audioId": "audio-en",
    "subtitleId": null,
    "format": "mkv",
    "recordTimeSeconds": 0
  }
}
```

The desktop validates the selection, applies native options, and starts the inspected
GID. Return success only after task creation/start is confirmed, not merely after
queueing a frontend event. Do not prompt for the same selection again.

```json
{
  "id": "6e31af08-8c8f-4e3f-98b1-22c1309fab34",
  "submissionId": "7e31af08-8c8f-4e3f-98b1-22c1309fab34",
  "gid": "0123456789abcdef"
}
```

Persist the submission receipt before acknowledging it. Repeating the same submission
returns the same GID. A different selection/ID after submission must not start another
task. `GET /probes/{id}` must expose the submitted receipt so a lost reply can be
reconciled. Retain receipts/tombstones for at least 24 hours, independently of inspection
expiry. After engine/desktop restart, a missing active inspection must fail explicitly;
an already-submitted receipt must remain discoverable.

The extension persists the submission ID and selected tracks before sending. If the
reply is lost it queries the same probe. If still ready, it replays the identical
submission. A transport error or malformed reply is not evidence that no task exists.

## Cancellation and cleanup

POST an empty JSON object to `/probes/{id}/cancel`.

```json
{ "id": "6e31af08-8c8f-4e3f-98b1-22c1309fab34", "state": "cancelled" }
```

Cancellation releases the unsubmitted native probe and its owned recovery state.
If already submitted, return `state: "submitted"`, `submissionId`, and `gid` instead.
Never cancel/delete that download. Cancellation is idempotent. Keep a cancellation
tombstone even if creation is racing, so a late create cannot resurrect the probe.

The desktop owns lease expiry and orphan cleanup. Popup closure, tab navigation,
extension reload, quota eviction, and lost connections cannot guarantee a final
cancel request. Expiry never deletes an actual submitted download.

## Errors

Use a non-2xx status and `{"error":"CODE"}`. Codes are:
`unsupported_source`, `protected_media`, `authentication_required`, `source_expired`,
`unsupported_selection`, `probe_failed`, `expired`, `not_found`, and `conflict`.
Use 401 for invalid Extension API authentication, 409 for conflicting mutations,
410 for expired probes and 422 for unsupported sources/selections. A source-site login
failure is not an Extension API 401. Do not return secret URLs, headers, tokens, raw
engine logs, or unbounded exception strings in errors.

## Local development

`pnpm dev:media-fixture` starts a loopback-only, synthetic implementation and discovery
page on port 3001 with secret `media-fixture`. It accepts only its own fixture URLs.
It exercises inspect/select/submit/replay/cancel without changing a desktop repository
or downloading media. Its in-memory receipts deliberately do not provide production
durability; the lifecycle requirements above still apply to the real desktop adapter.
