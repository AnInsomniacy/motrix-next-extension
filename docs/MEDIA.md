# Page media discovery

The extension discovers HTTP(S) HLS/DASH manifests and direct audio/video resources.
It observes native `webRequest.onSendHeaders` and `onResponseStarted` events and
public media elements/resource timing in each frame. It does not cancel playback,
patch Fetch/XHR, read response bodies, parse playlists, decrypt samples, or mux files.

## User flow

1. Open a web page and play its media. The action badge counts network/downloadable
   candidates. The popup's **Media** tab also works while the desktop is disconnected.
2. Use the **Download · Motrix Next** button next to a playing or hovered player,
   or open the popup. Selecting an HLS/DASH source starts desktop inspection without
   downloading payload segments. This requires the [media API](MEDIA_API.md).
   Ordinary files use the existing download API without media inspection.
3. Select native video/audio/subtitle tracks and an output format. Live sources can
   have a recording duration limit. Confirm once in the extension; the desktop must
   not open a second selection dialog for this submission.
4. A confirmed desktop GID produces **Download created in Motrix Next**. Playback continues.

The floating button uses WXT's isolated Shadow Root UI. Its panel loads on demand
in a WXT extension iframe and shares the popup's source and selection components.
The iframe's native parent frame determines its source scope; supplied tab IDs are
ignored. Source credentials remain in the background. Closing the panel does not
cancel an inspection or download. Escape closes the panel and restores button focus.

The control follows the active or hovered media element using native resize,
intersection, scroll and fullscreen events. Close hides it for that playback source;
site exclusion hides it across the site. Fullscreen player containers are supported;
native fullscreen on the video element itself cannot host this control. Exit that
fullscreen mode to use the button. Browser Picture-in-Picture is outside the page.

Direct element URLs are matched exactly. For MSE/blob players or ambiguous sources,
the panel explicitly lists candidates from the same frame without claiming a match.
**Locate player** scrolls to a unique, connected URL match. It refuses stale or
ambiguous matches; it does not infer identity from a shared page title or hostname.

All media UI copy uses the existing 27-locale registry, including errors and accessible
labels. Numbers, durations and track languages use native Intl formatting. Popup tabs
use Naive UI's directional animation and retain their state; hidden media tabs stop
polling. Detail transitions use Vue and CSS, respecting reduced-motion preferences.

Discovery has its own switch, independent of ordinary download interception. Disable
it globally or for the current page's host. Excluded hosts can be removed in settings.
Existing `always-skip` site rules also exclude discovery. File size and ordinary
download-extension filters do not suppress small manifests.

## State and request context

The background worker is the sole writer of `storage.session.mediaSession`. Native
session storage survives worker suspension and is not exposed to content scripts.
It is cleared by browser restart, extension reload, disablement, or update.
Settings backups never include discovery state or source credentials.

Both browser builds use a single spanning background; Firefox does not support split
mode. Private and normal sources are separated by native tab/document identity.
Loopback API fetches omit ambient browser cookies and caching; source credentials
travel only in the explicitly selected request body.

Request events arriving during worker initialization wait for the existing
configuration load in event order. Network evidence and request headers remain
paired by request ID. Media UI polls only an active inspection or submission;
catalogue changes use native storage events.

Candidates are keyed by tab, frame, document and the complete URL, including signed
query strings. Network evidence takes precedence over DOM/timing hints. Sources
expire after 30 minutes without observation; limits are 40 per tab, 128 total, and
6 MB of session data. Inactive source evidence is evicted before active inspections.
At most eight inspections may be active. Known transport fragments are credential
evidence for their own origin and do not become separate video titles.

Actual tab/frame identities come from browser events or the extension message sender.
Requests with no tab are not assigned to whichever tab happens to be active.
Navigation and tab removal invalidate old sources. Same-document history changes
update page provenance. Open shadow roots and dynamically inserted media elements
are observed without player instrumentation.

Only selected source context is sent to the configured loopback desktop endpoint.
Additional contexts are limited to recently observed media origins in the same
document. Transport-owned and conditional headers are removed. Source headers are
kept within their original origin boundary by the desktop contract. Cookies come
from the browser's actual outgoing request in the source frame,
including its native private/container/partition context. Discovery does not query
a different cookie store or synthesize cookie headers when observation missed them.
Cookie/header forwarding switches apply to discovery as well as submission.
Authorization is forwarded only when the browser
actually exposes it; it cannot be reconstructed when hidden by the browser.

The popup receives source metadata and operation state, never header values or stored
probe request bodies. Source URLs can contain private query parameters; copy/share
them deliberately. There is no automatic export or remote telemetry.

## Inspections and retries

An inspection has a client-generated UUID and a bounded desktop lease. A submission
has a different UUID and immutable track selection. Lost HTTP replies are ambiguous:
the extension checks/replays the same operation instead of generating another task.
Closing the popup does not cancel an inspection. Reopening restores its state.
Explicit cancellation affects the inspection only, never an already-created download.
Clearing sources, navigating away, or closing a tab may discard local state; the
desktop must expire orphan inspections and retain submission receipts as specified
in the protocol. Forwarding/connection changes invalidate pending local operations.

## Scope

- A `blob:` media source is an in-page reference, not a downloadable URL. It is shown
  as a hint to play the media and discover the original requests.
- HTTP response metadata provides candidates, not proof of a complete presentation.
  A generic MP4 response may be a player-specific fragment. Its explicit original-file
  action saves that resource and does not claim to reconstruct a complete presentation.
  Uncertain resources are never silently merged by filename/host guesses.
- Native observation can miss memory-cache responses, requests without tab identity,
  opaque service-worker activity, or resources created before observation starts.
  **Scan page** supplements current DOM and resource timing without reloading it.
- POST-only sources, DRM, arbitrary JavaScript-generated media, WebRTC/WebTransport
  payloads and website-specific extraction are outside this protocol.
- No backward-compatible media endpoints or ordinary-file fallback are provided.
  An unavailable media API leaves discovery functional and explains the missing integration.

## Validation

Manual checks in the unpacked extension:

- Play media, hover a second player, scroll, close the control, and change its source.
- Use **Locate player** on a direct source; ambiguous sources must report uncertainty.
- Open the floating panel in a cross-origin iframe; it must show only that frame's sources.
- Switch Media/Downloads repeatedly; selection and scroll state must survive without a loading flash.
- Switch languages, including Chinese and RTL languages; inspect empty lists, errors and track labels.
- Try player-container fullscreen, native video fullscreen, SPA navigation and site exclusion.

Automated tests use happy-dom and fakeBrowser only; actual browser UI remains a manual check.

Run `pnpm compile`, `pnpm test`, `pnpm lint`, `pnpm lint:i18n`,
`pnpm format:check`, `pnpm media:contract:check`, `pnpm build`, and
`pnpm build:firefox`. Tests cover native event correlation, stale documents, tab
isolation, fragment filtering, session recovery, credential boundaries, selection
validation and ambiguous submission/cancellation results.

Static verification and module tests are local to this repository. There is no
simulated desktop server or cross-repository test runner. The maintainer performs
E2E acceptance with independently built applications and real playable media.

Manually check Chrome, Edge and Firefox: dynamic sources, frames, same-document
navigation, popup closure/reopening, disabled sites, keyboard-only selection,
long track labels, dark mode and reduced motion. Browser automation is not used.

## Reference

The interaction follows IDM's browser download-panel model. Detection uses
browser APIs directly; no third-party sniffing engine or page-player patch is used.

- [IDM download panel](https://www.internetdownloadmanager.com/register/new_faq/bi25.html)
- [Chrome webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest)
- [Chrome webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)
- [Session storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Firefox webRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest)
