# Functional flows and states

Source contracts: [ordinary downloads](../../DOWNLOADS.md), [media discovery](../../MEDIA.md), [media API](../../MEDIA_API.md). The background worker owns interception, credentials and operation identity. These contracts are not replaced by image suggestions.

## Popup and connection

1. Bootstrap stored theme and locale before rendering. Show a reserved, quiet initial state while reading actual connection data.
2. Connected requires the existing ping and authenticated stat check. A reachable app with a wrong secret is not Connected.
3. Show live aggregate speeds and counts only when data is valid. On loss of connection show a clear unavailable state; do not silently replace unknown data with zeros.
4. Open Rayburst uses existing activation-only Native Messaging. Starting shows pending feedback; failure offers settings or retry. Do not add a transfer channel to Native Messaging.
5. Interception off changes future browser handling; existing desktop tasks and media discovery are independent.
6. Pause all and Resume all call the existing desktop endpoints, block duplicate clicks and report failure without claiming success.
7. Media discovery stays accessible while the desktop is disconnected. Inspection and downloading require the relevant local API.

## Media catalogue

- Catalogue changes follow native storage events. Scope by actual tab, frame and document identity.
- Source name, kind, host and known size are evidence, not guarantees of a complete presentation. Do not merge sources by filename or host.
- Scan page uses the existing DOM/resource-timing supplement without reloading playback.
- Locate player works only for a unique connected match. Ambiguous or stale matches produce guidance, not a guessed scroll.
- Discovery off and site excluded have distinct states. Always-skip site rules can also suppress discovery; enabling a local exclusion alone must not claim to override that rule.
- Clear list removes catalogue evidence, not already-created desktop downloads. Repeated observations may discover a source again.
- Empty, no-active-tab, restricted-page, filtered-empty, globally-disabled, site-excluded, uncertain/blob evidence and stale-source cases use the same quiet empty/feedback pattern.
- Optional filtering appears when the list needs it. No universal site extractor, DRM bypass or invented media thumbnail service is added.

## Inspection and selection

```text
Source -> Inspecting -> Ready -> Confirming receipt -> Created
                       |              |
                       |              +-> Check/replay same operation
                       +-> Cancel inspection
```

Use the actual operation states: probing, ready, submitting, submitted, cancelling, cancelled and failed.

A selected HLS/DASH source is inspected by Rayburst/Aria2 Next, not parsed or muxed in the extension. Keep opaque native track IDs. Offer at most one video, one audio and one subtitle, with format choices from capabilities. No video or no audio may be valid; both absent is invalid. Multiplexed-track compatibility stays governed by the contract.

Live sources have a duration limit in seconds, 0 meaning until explicitly finished in the desktop. Finite media keeps a zero recording limit and does not display this field. Do not fabricate output size, transcoding options, multi-audio selection or a file destination picker.

A direct file uses the ordinary download contract, with a clearly named original-file action. It must not masquerade as a reconstructed stream.

Persist the inspection ID and immutable submission ID/selection before posting. A lost response is unresolved, not proof of failure. Keep the same identity for reconciliation. A confirmed GID means task creation, not completed transfer. Never show a fresh Start download action while the original submission is unresolved.

Keep distinct remedies for extension secret mismatch, source-site authentication, unsupported selection, protected media, expired inspection, expired source and network failure. Cancellation affects an inspection only. If a receipt already exists, retain the download.

## Player entry

Reuse the current WXT Shadow Root button and extension iframe. The small control follows an observed active/hovered player; the panel reuses the same media components and theme. The parent frame determines source scope. No whole-page veil, player restyling or duplicate custom browser menu.

Escape closes the top dismissible panel and restores focus to its trigger. Dismiss hides the control for the current playback source; site exclusion is a separate action. Player-container fullscreen can host the control; native video fullscreen and browser Picture-in-Picture cannot.

Native browser context menus and notifications retain browser styling. Only their existing localized wording and brand icon are in scope.

## Settings persistence

Retain the existing distinction rather than mechanically turning every setting into autosave:

- Immediate: interception enabled/scope, site rules, appearance and locale. If persistence fails, restore or clearly mark the unresolved value.
- Draft: connection, media-discovery settings in Options, request forwarding, download-bar behavior, unavailable-desktop behavior, filters and diagnostic retention.
- Popup discovery/site commands already persist immediately through their existing background commands; Options edits remain drafts.
- Import and restore defaults stage an entire snapshot. During staging all changes stay local until Save, including normally immediate controls. Discard restores the saved snapshot and theme.
- Test connection validates the draft port/secret without saving. Editing either field invalidates a prior successful test result.
- Save failure keeps the draft and explicit retry. The current multiple-write flow can partially succeed; never claim rollback or complete atomicity without implementation support.
- Permission-denied toggles return to their actual state. downloads.ui is offered only on supported Chromium builds. Native permission prompts are never imitated inside the UI.

## Maintenance

Import uses a native browser file input and the current backup parser. Export uses the existing browser download path. Settings backups include the configured connection secret under the current contract; add a concise relevant note at export instead of claiming they are sanitized. Diagnostic exports omit the connection secret but may contain URLs/context; do not fabricate a privacy guarantee.

Use a standard specific confirmation for Clear log and Restore defaults. Replace the timer/countdown confirmation with the library's accessible confirmation control. Clearing diagnostics is immediate after confirmation; restoring defaults stages settings until Save. Invalid import preserves the current draft and reports a bounded error. Log filters, pagination, retention limits and event details remain available.
