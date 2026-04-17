<div align="center">
  <img src="public/icon/icon.svg" alt="Motrix Next Extension" width="128" height="128" />
  <h1>Motrix Next Extension</h1>
  <p>Browser extension for <a href="https://github.com/AnInsomniacy/motrix-next">Motrix Next</a> — seamless download interception &amp; delegation.</p>

![Version](https://img.shields.io/github/v/release/AnInsomniacy/motrix-next-extension?label=Version)
![Build](https://img.shields.io/github/actions/workflow/status/AnInsomniacy/motrix-next-extension/ci.yml?branch=main&label=Build)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)

  <p>
    <a href="https://microsoftedge.microsoft.com/addons/detail/loojjolhejmakcdlbidigoniobfanjlb"><img src="docs/badges/edge-add-ons.png?v=2" alt="Get it from Microsoft Edge" height="58" /></a>
    &nbsp;&nbsp;
    <a href="https://chromewebstore.google.com/detail/ofeajdebdjajhkmcmamagokecnbephhl"><img src="docs/badges/chrome-web-store.png?v=2" alt="Available in the Chrome Web Store" height="58" /></a>
    &nbsp;&nbsp;
    <a href="https://addons.mozilla.org/firefox/addon/motrix-next-extension/"><img src="docs/badges/firefox-add-ons.svg?v=2" alt="Get the Add-on for Firefox" height="58" /></a>
  </p>

</div>

---

<div align="center">
  <table><tr>
    <td><img src="docs/images/popup.png" alt="Popup" width="400" /></td>
    <td><img src="docs/images/settings.png" alt="Settings" width="400" /></td>
  </tr><tr>
    <td align="center"><sub>Popup — Live speed &amp; task dashboard</sub></td>
    <td align="center"><sub>Settings — Connection, behavior, rules, appearance</sub></td>
  </tr></table>
</div>

## Features

- **Download interception** — Automatically captures browser downloads and routes them through aria2 for multi-threaded acceleration
- **Smart filtering** — 6-stage pipeline: global toggle → self-trigger guard → URL scheme → per-site rules → minimum file size → final verdict
- **Per-site rules** — Glob-pattern rules (e.g. `*.github.com`) to always intercept, always skip, or defer to global settings
- **Context menu** — Right-click any link, image, audio, or video → "Download with Motrix Next"
- **Magnet & torrent** — `magnet:` URIs and `.torrent` files are automatically captured and routed to aria2
- **Cookie forwarding** — Best-effort cookie forwarding via optional enhanced permissions for authenticated downloads
- **Real-time dashboard** — Popup shows live download/upload speeds, active/waiting/completed task counts
- **Auto-launch** — Launches Motrix Next via `motrixnext://` protocol when not running, waits for RPC, then retries
- **Completion notifications** — Desktop notifications when downloads are sent and when they finish
- **Download bar control** — Optionally hides Chrome's native download shelf (Chromium 115+, not available on Firefox)
- **Dark mode** — System / Light / Dark with 10 Material You color schemes
- **i18n** — Full English, Chinese (Simplified), and Japanese localization
- **Diagnostics** — Built-in event log with severity levels and one-click export

## Installation

### From Store (recommended)

| Browser | Link                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------- |
| Chrome  | [Chrome Web Store](https://chromewebstore.google.com/detail/ofeajdebdjajhkmcmamagokecnbephhl)      |
| Edge    | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/loojjolhejmakcdlbidigoniobfanjlb) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/motrix-next-extension/)                 |

### From Source

```bash
git clone https://github.com/AnInsomniacy/motrix-next-extension.git
cd motrix-next-extension
pnpm install

# Chrome / Edge
pnpm build

# Firefox
pnpm build:firefox
```

Then load the unpacked extension:

**Chrome / Edge:**

1. Navigate to `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` directory

**Firefox:**

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `.output/firefox-mv3/manifest.json`

## FAQ

<details>
<summary><strong>What is Motrix Next?</strong></summary>

<br>

[Motrix Next](https://github.com/AnInsomniacy/motrix-next) is a full-featured download manager powered by aria2 — a ground-up rewrite of the original [Motrix](https://github.com/agalwood/Motrix) with Tauri 2, Vue 3, and Rust. This extension bridges your browser to the Motrix Next desktop app running on your local machine.

</details>

<details>
<summary><strong>Do I need the desktop app?</strong></summary>

<br>

Yes. This extension sends downloads to the Motrix Next desktop app via aria2 JSON-RPC on `127.0.0.1:16800`. Without the desktop app running, the extension will show a "Disconnected" status and cannot process downloads.

</details>

<details>
<summary><strong>Why does the extension request broad host permissions?</strong></summary>

<br>

The broad host permissions (`*://*/*`) are **optional** — only requested when you explicitly enable "Cookie Forwarding" in Settings. The `chrome.cookies.getAll()` API requires matching host permissions for the target domain, and since downloads can come from any site, the extension needs wildcard access to read cookies. These permissions are never used for any other purpose, and all data is sent only to `127.0.0.1`.

</details>

<details>
<summary><strong>Does this extension collect any data?</strong></summary>

<br>

No. This extension does **not** collect, store, or transmit any personal data. All communication occurs exclusively between your browser and the Motrix Next app on your local machine (`127.0.0.1`). No analytics, no telemetry, no external requests. See the [full Privacy Policy](PRIVACY_POLICY.md).

</details>

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) ≥ 9
- [Motrix Next](https://github.com/AnInsomniacy/motrix-next) desktop app running with RPC enabled

### Setup

```bash
# Install dependencies
pnpm install

# Start development server (launches WXT + Vite with hot reload)
pnpm dev

# Build for production
pnpm build

# Package as .zip for store submission
pnpm zip
```

### Project Structure

```
motrix-next-extension/
├── entrypoints/                # Extension entry points
│   ├── background.ts           #   Service worker — orchestrator, listeners, polling
│   ├── popup/App.vue           #   Browser action popup — status, tasks, actions
│   └── options/App.vue         #   Full-page settings — connection, behavior, rules
├── lib/                        # Core logic (dependency-injected, fully testable)
│   ├── download/               #   Interception orchestrator, 6-stage filter, metadata collector
│   ├── rpc/                    #   aria2 JSON-RPC 2.0 client with retry and auth
│   ├── services/               #   Completion tracker, notifications, permissions, theme
│   ├── protocol/               #   motrixnext:// launcher and wake logic
│   └── storage/                #   Zod-validated schemas, migration framework, diagnostic log
├── shared/                     # Shared utilities
│   ├── i18n/                   #   Compile-time i18n engine with positional placeholders
│   ├── types.ts                #   TypeScript interfaces
│   └── constants.ts            #   Default configs, timing constants
├── __tests__/                  # 330 tests across 28 files
│   ├── unit/                   #   27 isolated service test files
│   └── integration/            #   End-to-end interception flow
├── public/_locales/            # Chrome i18n message bundles (en, zh_CN, ja)
└── .github/workflows/ci.yml   # CI: compile → test → lint → i18n → format → build
```

### Scripts

| Command              | Description                                         |
| -------------------- | --------------------------------------------------- |
| `pnpm dev`           | Start WXT dev server with hot reload (Chrome)       |
| `pnpm dev:firefox`   | Start WXT dev server with hot reload (Firefox)      |
| `pnpm build`         | Production build → `.output/chrome-mv3/`            |
| `pnpm build:firefox` | Production build → `.output/firefox-mv3/`           |
| `pnpm zip`           | Package Chrome build as `.zip` for store submission |
| `pnpm zip:firefox`   | Package Firefox build as `.zip` for AMO submission  |
| `pnpm zip:all`       | Package both Chrome and Firefox builds              |
| `pnpm test`          | Run all unit and integration tests                  |
| `pnpm test:watch`    | Run tests in watch mode                             |
| `pnpm compile`       | TypeScript type checking (`vue-tsc --noEmit`)       |
| `pnpm lint`          | ESLint (flat config, Vue 3 + TypeScript)            |
| `pnpm lint:i18n`     | Validate i18n key consistency across all locales    |
| `pnpm format`        | Auto-format all files with Prettier                 |
| `pnpm format:check`  | Verify formatting without writing                   |

### Testing

All services are tested through dependency injection interfaces — no browser API mocking required. Run the full suite before committing:

```bash
pnpm format:check && pnpm lint && pnpm compile && pnpm test && pnpm build
```

### Test Site

A self-contained static page for manually verifying download interception:

```bash
npx serve test-site -p 3001
```

Covers: Apple IPSW direct links, `.torrent` files, `magnet:` URIs, Linux ISOs, speed test binaries, and edge cases (`blob:`, `data:`, small files).

## Contributing

PRs and issues are welcome! Before submitting:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Ensure all quality gates pass (`pnpm format:check && pnpm lint && pnpm compile && pnpm test`)
4. Commit your changes (`git commit -m 'feat: add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## Sponsor

Downloads go faster. Thesis progress does not. If you'd like to help with at least one of those —

[Consider sponsoring the project ❤️](https://github.com/AnInsomniacy/AnInsomniacy/blob/main/SPONSOR.md) — your support keeps the code open, the releases shipping, and proof that a PhD can ship more than just papers.

## License

[MIT](https://opensource.org/licenses/MIT) — Copyright (c) 2025-present AnInsomniacy
