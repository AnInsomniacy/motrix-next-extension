<div align="center">
  <img src="public/icon/icon.svg" alt="Motrix Next Extension" width="96" height="96" />
  <h1>Motrix Next Extension</h1>
  <p>Browser extension for <a href="https://github.com/AInsomniacy/motrix-next">Motrix Next</a> — seamless download interception &amp; delegation.</p>
</div>

## Features

- **Download Interception** — Automatically captures browser downloads and routes them through aria2 for accelerated multi-threaded downloading
- **Smart Filtering** — Multi-stage filter pipeline: global toggle → self-trigger guard → scheme validation → site rules → minimum file size
- **Site Rules** — Per-domain rules to always intercept, always skip, or defer to global settings using glob patterns
- **Cookie Forwarding** — Best-effort cookie forwarding via optional enhanced permissions for authenticated downloads
- **Connection Status** — Real-time connection indicator with aria2 version display and one-click connection testing
- **Live Download Monitor** — Popup shows active downloads with progress bars, speed indicators, and global transfer stats
- **Completion Tracking** — Polls aria2 for task status and fires desktop notifications when downloads complete
- **Download Bar Control** — Optionally hides Chrome's native download shelf (Chrome 115+, requires enhanced permissions)
- **Context Menu** — Right-click "Send link to Motrix Next" on any `<a>` element
- **Protocol Launcher** — Launches the Motrix Next desktop app via `motrixnext://` custom protocol
- **Theme System** — System / Light / Dark with class-based switching and real-time OS theme tracking
- **i18n** — Full English and Chinese (Simplified) localization for all UI surfaces
- **Diagnostics** — Built-in event log with severity levels, copy-to-clipboard, and structured context data

## Architecture

```
entrypoints/
├── background.ts              # Service worker — orchestrator, listeners, polling
├── popup/App.vue              # Browser action popup — status, tasks, actions
└── options/App.vue            # Full-page settings — connection, behavior, rules, permissions

lib/
├── download/
│   ├── orchestrator.ts        # Core interception flow: filter → pause → metadata → addUri → cancel
│   ├── filter.ts              # 6-stage filter pipeline (enabled, self-trigger, scheme, site-rule, size, final)
│   └── metadata-collector.ts  # Extracts filename, referrer, cookies from browser context
├── rpc/
│   └── aria2-client.ts        # JSON-RPC 2.0 client with retry logic and secret token auth
├── services/
│   ├── completion-tracker.ts  # Polls aria2 tellStatus for tracked GIDs, fires completion callbacks
│   ├── connection.ts          # Connection health check via aria2 getVersion
│   ├── context-menu.ts        # Right-click context menu registration
│   ├── download-bar.ts        # chrome.downloads.setUiOptions wrapper with graceful degradation
│   ├── notification.ts        # Notification payload builders and click action resolver
│   ├── permission.ts          # Optional permissions grant/revoke/check
│   └── theme.ts               # Theme preference → CSS class resolution
├── protocol/
│   └── launcher.ts            # motrixnext:// URL builder
└── storage/
    ├── schema.ts              # Zod schemas with runtime validation and safe parsers
    ├── migration.ts           # Versioned storage migration framework
    ├── storage-service.ts     # DI-friendly typed storage facade
    └── diagnostic-log.ts      # Ring-buffer diagnostic event store

shared/
├── types.ts                   # All TypeScript interfaces (RPC, download, filter, UI)
├── constants.ts               # Default configs, timing constants, scheme lists
├── errors.ts                  # Structured error types
├── use-polling.ts             # Visibility-aware smart polling with exponential backoff
└── use-preference-form.ts     # Generic form state tracking with dirty detection
```

### Design Principles

- **Dependency Injection** — All services accept API adapters via constructor, never import `chrome.*` directly. This enables comprehensive unit testing without browser environment mocks.
- **Graceful Degradation** — Services silently catch API errors for features that may not exist on older browser versions (e.g., `setUiOptions` on Chrome < 115).
- **Pipeline Architecture** — Download filtering uses a chain-of-responsibility pattern with 6 composable stages, each independently testable.
- **Pure Functions** — Theme resolution, notification building, and filter evaluation are stateless pure functions.

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) ≥ 9
- [Motrix Next](https://github.com/AnInsomniacy/motrix-next) desktop app running with RPC enabled

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server with hot reload
pnpm dev
```

Load the extension in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` directory

## Scripts

| Command             | Description                                   |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | Start WXT dev server with hot reload          |
| `pnpm build`        | Production build → `.output/chrome-mv3/`      |
| `pnpm zip`          | Build and package as `.zip` for distribution  |
| `pnpm test`         | Run all unit and integration tests            |
| `pnpm test:watch`   | Run tests in watch mode                       |
| `pnpm compile`      | TypeScript type checking (`vue-tsc --noEmit`) |
| `pnpm lint`         | ESLint (flat config, Vue 3 + TypeScript)      |
| `pnpm format`       | Auto-format all files with Prettier           |
| `pnpm format:check` | Verify formatting without writing             |

## Testing

The project uses [Vitest](https://vitest.dev/) with a strict TDD workflow. All services are tested through their dependency injection interfaces — no browser API mocking required.

```bash
# Run all 240 tests
pnpm test

# Watch mode for development
pnpm test:watch
```

### Test Structure

```
__tests__/
├── unit/                              # Isolated service tests
│   ├── storage-schema.test.ts         # Zod schema validation, safe parsers (36 tests)
│   ├── download-filter.test.ts        # All 6 filter stages + pipeline (29 tests)
│   ├── aria2-client.test.ts           # RPC client: call, retry, auth, timeout (18 tests)
│   ├── use-preference-form.test.ts    # Form state, dirty tracking, reset (17 tests)
│   ├── diagnostic-log.test.ts         # Ring buffer, severity, overflow (12 tests)
│   ├── completion-tracker.test.ts     # GID tracking, polling, mixed statuses (11 tests)
│   ├── use-polling.test.ts            # Visibility-aware polling, DI (9 tests)
│   ├── metadata-collector.test.ts     # Filename extraction, cookies, headers (9 tests)
│   ├── storage-service.test.ts        # StorageService load/save operations (8 tests)
│   ├── orchestrator-send.test.ts      # sendUrl flow, error handling (8 tests)
│   ├── url.test.ts                    # URL filename extraction edge cases (8 tests)
│   ├── storage-migration.test.ts      # Versioned migration framework (7 tests)
│   ├── composable-permissions.test.ts # Enhanced permissions lifecycle (6 tests)
│   ├── notification.test.ts           # Payload builders, click routing (6 tests)
│   ├── protocol-launcher.test.ts      # URL construction, encoding (6 tests)
│   ├── composable-site-rules.test.ts  # Site rules CRUD + persistence (5 tests)
│   ├── permission.test.ts             # Grant, revoke, check (5 tests)
│   ├── theme.test.ts                  # System/light/dark resolution (5 tests)
│   ├── thunder.test.ts                # Thunder link decoding (5 tests)
│   ├── composable-appearance.test.ts  # Theme/color scheme switching (4 tests)
│   ├── composable-diagnostics.test.ts # Diagnostic log clear/copy (4 tests)
│   ├── download-bar.test.ts           # UI options, graceful degradation (4 tests)
│   ├── context-menu.test.ts           # Menu creation, click handling (4 tests)
│   └── connection.test.ts             # Health check, version parsing (2 tests)
└── integration/
    └── download-orchestrator.test.ts   # End-to-end interception flow (12 tests)
```

## Permissions

### Required

| Permission      | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `downloads`     | Intercept, cancel, and erase browser downloads    |
| `storage`       | Persist settings, site rules, and diagnostic logs |
| `contextMenus`  | Right-click "Send to Motrix Next"                 |
| `notifications` | Download sent/complete notifications              |

### Host Permissions

| Host                 | Purpose                      |
| -------------------- | ---------------------------- |
| `http://127.0.0.1/*` | aria2 JSON-RPC communication |
| `http://localhost/*` | aria2 JSON-RPC communication |

### Optional (Enhanced Mode)

| Permission                  | Purpose                                             |
| --------------------------- | --------------------------------------------------- |
| `cookies`                   | Forward session cookies for authenticated downloads |
| `downloads.ui`              | Hide Chrome's native download bar                   |
| `https://*/*`, `http://*/*` | Read cookies from any origin                        |

## Configuration

Default settings (configurable via Options page):

| Setting            | Default    | Description                                |
| ------------------ | ---------- | ------------------------------------------ |
| RPC Port           | `16800`    | aria2 JSON-RPC port                        |
| RPC Secret         | _(empty)_  | aria2 `--rpc-secret` token                 |
| Interception       | `enabled`  | Global download interception toggle        |
| Min File Size      | `0` MB     | Skip files smaller than this               |
| Fallback           | `enabled`  | Resume browser download on aria2 failure   |
| Notify on Start    | `enabled`  | Desktop notification when download is sent |
| Notify on Complete | `disabled` | Desktop notification when aria2 finishes   |
| Hide Download Bar  | `disabled` | Hide Chrome's native download shelf        |
| Theme              | `system`   | System / Light / Dark appearance           |

## Tech Stack

| Layer       | Technology                                                                |
| ----------- | ------------------------------------------------------------------------- |
| Framework   | [WXT](https://wxt.dev/) 0.20 (Manifest V3)                                |
| UI          | [Vue 3](https://vuejs.org/) Composition API                               |
| Styling     | [Tailwind CSS](https://tailwindcss.com/) 4 with M3-inspired design tokens |
| Type System | TypeScript 5 (strict mode, `noUncheckedIndexedAccess`)                    |
| Testing     | Vitest 4                                                                  |
| Linting     | ESLint 10 (flat config) + Prettier                                        |
| Build       | Vite 8                                                                    |

## Verification

Before committing, ensure all gates pass:

```bash
pnpm format:check   # Formatting
pnpm lint            # Linting
pnpm compile         # Type checking
pnpm test            # Unit + integration tests
pnpm build           # Production bundle
```

## License

[MIT](LICENSE)
