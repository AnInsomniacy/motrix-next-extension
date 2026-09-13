<div align="center">
  <img src="docs/media/rayburst-connect-banner-5x1-preview.png" alt="Rayburst Connect — Spot the source, hand it off seamlessly" width="1280" />

[![Release](https://img.shields.io/github/v/release/AnInsomniacy/motrix-next-extension?label=release&color=7B3ED1)](https://github.com/AnInsomniacy/motrix-next-extension/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/AnInsomniacy/motrix-next-extension/total?label=GitHub%20downloads&color=7B3ED1)](https://github.com/AnInsomniacy/motrix-next-extension/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/AnInsomniacy/motrix-next-extension/ci.yml?branch=main&label=build)](https://github.com/AnInsomniacy/motrix-next-extension/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/AnInsomniacy/motrix-next-extension?color=7B3ED1)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-V3-5F526D)

**[Install](#install)** · **[Connect to Rayburst](#connect-to-rayburst)** · **[Media discovery](#find-and-download-media)** · **[Development](#development)**

</div>

**Rayburst Connect** brings browser downloads and discovered media to the
[Rayburst desktop app](https://github.com/AnInsomniacy/motrix-next). Send a file from
your browser, choose which sites to intercept, or find a playing video's source
and select its tracks before downloading.

> [!NOTE]
> The Rayburst Connect rebrand is currently available in source. Existing store
> listings and GitHub packages still use the Motrix Next Extension name. Repository
> addresses and installation IDs are unchanged. To try the current branding and
> media integration, build this extension and Rayburst from their current sources.

## Install

### Browser stores

<div align="center">
  <a href="https://chromewebstore.google.com/detail/ofeajdebdjajhkmcmamagokecnbephhl"><img src="docs/badges/chrome-web-store.png" alt="Available in the Chrome Web Store" height="58" /></a>
  &nbsp;&nbsp;
  <a href="https://microsoftedge.microsoft.com/addons/detail/loojjolhejmakcdlbidigoniobfanjlb"><img src="docs/badges/edge-add-ons.png" alt="Get it from Microsoft Edge" height="58" /></a>
  &nbsp;&nbsp;
  <a href="https://addons.mozilla.org/firefox/addon/motrix-next-extension/"><img src="docs/badges/firefox-add-ons.svg" alt="Get the Add-on for Firefox" height="58" /></a>
</div>

| Browser | Published listing                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| Chrome  | [Chrome Web Store](https://chromewebstore.google.com/detail/ofeajdebdjajhkmcmamagokecnbephhl)                |
| Edge    | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/loojjolhejmakcdlbidigoniobfanjlb) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/motrix-next-extension/)                           |

Stores review releases independently, so their versions may differ. Install a
desktop version compatible with the extension you choose; current source builds
are not a compatibility layer for older desktop releases.

### GitHub packages and local builds

[GitHub Releases](https://github.com/AnInsomniacy/motrix-next-extension/releases)
provides published browser ZIPs and release notes. For the current Rayburst Connect
source, install dependencies as described in [Development](#development), then build:

```sh
pnpm build
pnpm build:firefox
```

Load the generated files:

- **Chrome / Edge:** open `chrome://extensions` or `edge://extensions`, enable
  **Developer mode**, choose **Load unpacked**, and select `.output/chromium-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose
  **Load Temporary Add-on**, and select `.output/firefox-mv3/manifest.json`.

For a downloaded ZIP, extract it and select its root folder (Chromium) or its
`manifest.json` (Firefox) instead. Firefox's temporary installation ends
when the browser restarts; use the signed store release for normal installation.
Current source targets Chromium 132+ and desktop Firefox 140+. Downloads require
Rayburst on the same computer.

## Connect to Rayburst

1. Install and open [Rayburst](https://github.com/AnInsomniacy/motrix-next).
2. In the desktop app's Advanced Settings, find the **Extension API** port and secret.
3. Enter the same values in the extension's connection settings. The default port is
   `29110`. The Extension API secret is separate from the engine RPC secret.
4. Confirm the popup reports a connection, then download a file or use a right-click
   **Download with Rayburst** action.

Rayburst Connect communicates with the desktop over a local loopback HTTP API.
Native Messaging can activate the installed app when it is closed; it does not
perform the download itself. If activation fails, open Rayburst manually and check
the connection settings and desktop Native Messaging diagnostics.

## Features

| Feature               | What it does                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Download interception | Hands browser downloads to Rayburst with filename hints and the relevant request context.               |
| Site and file rules   | Controls interception by site, file type, MIME type and minimum size.                                   |
| Context menu          | Sends a link, image, audio or video directly from the page.                                             |
| Media discovery       | Finds HLS/DASH manifests and direct audio/video sources while playback continues.                       |
| Track selection       | Shows available video, audio and subtitle choices, MP4/MKV output and live-recording options.           |
| Protocol links        | Handles magnet, ED2K and Thunder links, plus torrent downloads.                                         |
| Popup dashboard       | Shows connection status, transfer speeds and task counts.                                               |
| Browser controls      | Configures desktop activation, cookie/header forwarding and the optional Chromium download bar control. |
| Appearance            | Light, dark and system themes, Electric Purple and additional color presets, and 27 languages.          |
| Diagnostics           | Keeps a bounded local event log with filtering and export for troubleshooting.                          |

## Find and download media

1. Open a page and start playback. The extension badge counts discovered sources.
2. Open the popup's **Media** tab or use the **Download · Rayburst** button beside
   a supported player.
3. Select a source. Rayburst inspects a streaming manifest and returns its available
   tracks; choose the video, audio, subtitles and output container.
4. Confirm the selection. The task is created in Rayburst while page playback continues.

Discovery also works while the desktop is disconnected; inspection and downloading
need Rayburst. Media discovery has its own global switch and site exclusions,
independent of ordinary download interception.

The extension observes browser requests and public media elements. Rayburst and
Aria2 Next handle inspection, transfer and media packaging. DRM-protected playback,
transcoding and universal website extraction are outside the supported scope.
A `blob:` player can expose several sources; the extension lists candidates without
claiming an uncertain match. See [Media discovery](docs/MEDIA.md) for details.

## Permissions and privacy

Rayburst Connect has no analytics, advertising or telemetry. Settings and diagnostic
logs stay in browser storage. Temporary source and request context is held in browser
session storage; selected download information is sent to your local desktop app.

Website access is needed to discover sources and preserve request context for
authenticated downloads. Cookie and header forwarding can be disabled in Settings.
Source URLs may contain private tokens; review copied URLs and diagnostic exports
before sharing them.

See [Privacy Policy](PRIVACY_POLICY.md) and [Permissions](docs/store/permissions.md)
for the data handled and the purpose of each browser permission.

## Development

Use Node.js 24.16 or later within the range in `package.json`, and the pinned pnpm
version. No desktop or engine source checkout is required to build the extension.

```sh
git clone https://github.com/AnInsomniacy/motrix-next-extension.git
cd motrix-next-extension
pnpm install
pnpm dev
```

WXT launches Chrome with a persistent development profile in `.wxt/chrome-data`.
Settings survive restarts; deleting that directory resets the development browser.
Use `pnpm dev:firefox` for Firefox. Both development and production Chromium builds
retain the public key needed for the local native-host identity.

| Command                             | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `pnpm build` / `pnpm build:firefox` | Build Chromium / Firefox production files.                   |
| `pnpm zip` / `pnpm zip:firefox`     | Build and package browser ZIPs locally; no store submission. |
| `pnpm compile`                      | Check TypeScript and Vue types.                              |
| `pnpm lint` / `pnpm format:check`   | Check source style and formatting.                           |
| `pnpm lint:i18n`                    | Validate the 27 locale bundles.                              |
| `pnpm media:contract:check`         | Check the repository's media schema export.                  |
| `pnpm test`                         | Run repository-local behavior tests.                         |
| `pnpm brand:assets`                 | Export promotional assets and the manual test-page favicon.  |

The logo source is `assets/rayburst-connect.svg`. WXT's official auto-icons module
generates browser icon sizes; the approved README banner lives separately in
`docs/media/`. Code and engineering documentation use English.

Tests use Vitest and WXT's `fakeBrowser`. The maintainer performs browser-to-desktop
acceptance with independently built applications; no cross-repository test runner
is required. The `test-site/` directory contains a standalone page for manual
download checks.

## Documentation and support

- [Contributing](docs/CONTRIBUTING.md) · [Code of Conduct](docs/CODE_OF_CONDUCT.md)
- [Download handoff](docs/DOWNLOADS.md) · [Media discovery](docs/MEDIA.md) · [Media API](docs/MEDIA_API.md)
- [Versioning, releases and store submission](docs/RELEASING.md)
- [Report a bug or request a feature](https://github.com/AnInsomniacy/motrix-next-extension/issues)
- [Support development](https://github.com/AnInsomniacy/AnInsomniacy/blob/main/SPONSOR.md)

For connection or interception issues, include the browser, extension and desktop
versions, reproduction steps and relevant diagnostics. Do not publish cookies,
API secrets or private source URLs.

## License

[MIT](LICENSE) — Copyright © 2025–present AnInsomniacy.
Dependencies retain their own licenses and notices.
