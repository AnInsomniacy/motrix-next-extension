# AGENTS.md — Motrix Next Extension

> This file provides context and instructions for AI coding agents.
> For human contributors, see [README.md](README.md) and [CONTRIBUTING.md](docs/CONTRIBUTING.md).

> [!IMPORTANT]
> **All changes must meet industrial-grade quality.** Enforce DRY (extract services/utilities over duplication), strict TypeScript (no `any`, justify every `as` cast), dependency injection for all Chrome API surfaces, and full verification (`vue-tsc` + tests pass) before completion.

---

## A. Project Architecture

| Layer               | Stack                                           |
| ------------------- | ----------------------------------------------- |
| **Framework**       | WXT 0.20 (Manifest V3) + Vue 3 Composition API  |
| **UI**              | Naive UI + Tailwind CSS 4                       |
| **Validation**      | Zod 4 (storage schemas)                         |
| **Testing**         | Vitest (288 tests, DI-based — no browser mocks) |
| **Build**           | Vite (via WXT) → `.output/chrome-mv3/`          |
| **Package Manager** | pnpm 10                                         |

### Key File Paths

```
entrypoints/
├── background.ts               # Service worker — orchestrator, listeners, heartbeat polling
├── content.ts                   # Content script — magnet/torrent link detection
├── popup/
│   ├── App.vue                  # Browser action popup — status, speed, task dashboard
│   └── components/              # PopupHeader, SpeedBar, StatDashboard
└── options/
    ├── App.vue                  # Full-page settings — connection, behavior, rules, appearance
    └── composables/
        ├── use-appearance.ts     # Theme and color scheme switching
        ├── use-connection-test.ts # RPC connection testing
        ├── use-diagnostics.ts    # Diagnostic log viewer
        ├── use-enhanced-permissions.ts # Optional permissions toggle
        └── use-site-rules.ts     # Per-site interception rules CRUD

lib/                             # Core logic — all services use dependency injection
├── download/
│   ├── orchestrator.ts          # Download interception entry point, retry-after-wake
│   ├── filter.ts                # 6-stage filter pipeline (see Section A′)
│   └── metadata-collector.ts    # Filename, cookie, referer extraction
├── rpc/
│   └── aria2-client.ts          # aria2 JSON-RPC 2.0 client with retry and auth
├── services/
│   ├── connection.ts            # Heartbeat polling, connect/disconnect state
│   ├── completion-tracker.ts    # Poll active tasks, detect completion, notify
│   ├── context-menu.ts          # Right-click "Download with Motrix Next"
│   ├── download-bar.ts          # chrome.downloads.setUiOptions (Chrome 115+)
│   ├── notification.ts          # Desktop notification builder
│   ├── permission.ts            # Optional permissions grant/revoke
│   ├── theme.ts                 # Material You theme resolution
│   └── wake.ts                  # motrixnext:// protocol launcher
├── protocol/
│   └── launcher.ts              # Protocol URL builder and tab management
└── storage/
    ├── schema.ts                # Zod schemas + safe parse functions (see Section C)
    ├── storage-service.ts       # Typed get/set wrappers over chrome.storage.local
    ├── migration.ts             # Forward-only versioned schema migration (see Section C′)
    └── diagnostic-log.ts        # Capped event log with severity levels

shared/
├── i18n/
│   ├── engine.ts                # Compile-time i18n with positional $placeholder$ support
│   └── dictionaries.ts          # Locale module registry
├── types.ts                     # TypeScript interfaces (RpcConfig, DownloadSettings, etc.)
├── constants.ts                 # Default configs, timing constants, URL schemes
├── color-schemes.ts             # Material You color scheme definitions
├── url.ts                       # URL validation and scheme classification
├── thunder.ts                   # Thunder (迅雷) link decoder
├── errors.ts                    # Typed error constructors
├── use-color-scheme.ts          # Color scheme composable with dynamic CSS injection
├── use-polling.ts               # Generic polling composable with lifecycle management
├── use-preference-form.ts       # Two-way preference form binding composable
└── use-theme.ts                 # System/light/dark theme detection composable

__tests__/
├── unit/                        # 27 isolated service test files
└── integration/                 # End-to-end interception flow

public/_locales/                 # Chrome i18n message bundles
├── en/messages.json             # English (reference locale)
├── zh_CN/messages.json          # Chinese Simplified
└── ja/messages.json             # Japanese

.github/workflows/
├── ci.yml                       # Quality gate: compile → test → lint → i18n → format → build
└── release.yml                  # Package → upload to GitHub Release
```

### A′. Download Filter Pipeline

The 6-stage filter (`lib/download/filter.ts`) evaluates downloads in strict order:

| Stage | Gate               | Pass                               | Reject                             |
| ----- | ------------------ | ---------------------------------- | ---------------------------------- |
| 1     | Global toggle      | `enabled === true`                 | Skip — extension disabled          |
| 2     | Self-trigger guard | Not triggered by Motrix itself     | Skip — avoid infinite loop         |
| 3     | URL scheme         | `http:`, `https:`, `ftp:`          | Skip — `blob:`, `data:`, `chrome:` |
| 4     | Per-site rules     | `always-intercept` or `use-global` | Skip — `always-skip`               |
| 5     | Minimum file size  | `contentLength >= minFileSize`     | Skip — file too small              |
| 6     | Final verdict      | Intercept                          | —                                  |

Every stage returns a typed `FilterResult` with the reason code. All stages are pure functions — no side effects, fully unit-testable.

---

## B. Version Management

**`package.json` is the single source of truth.** WXT reads `version` from here for the manifest.

### How to Bump

```bash
# Edit package.json version field
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0
```

> **Never manually edit the version string.** Always use `npm version` which also creates a git tag.

---

## C. Adding a New Storage Key

Follow this exact checklist:

1. **`shared/types.ts`** — Add the field to the relevant interface (`RpcConfig`, `DownloadSettings`, `UiPrefs`, or create a new one)
2. **`shared/constants.ts`** — Add the default value to the corresponding `DEFAULT_*` constant
3. **`lib/storage/schema.ts`** — Add the field to the Zod schema with `.default()` matching the constant
4. **`lib/storage/storage-service.ts`** — Add typed getter/setter if the key is accessed individually
5. **`parseStorage()` in `schema.ts`** — Ensure the new field is included in the composite parse
6. **All 3 locale files** — Add any i18n label keys to `en`, `zh_CN`, and `ja`
7. **UI binding** — Wire into the appropriate Options page section
8. **Tests** — Add parse tests in `__tests__/unit/storage-schema.test.ts`

---

## C′. Storage Schema Migration

`lib/storage/migration.ts` implements forward-only versioned schema migration for `chrome.storage.local`.

### How It Works

- `STORAGE_VERSION` constant defines the current schema version
- `MIGRATIONS` array holds ordered migration functions (each with a `version` and `up` transform)
- On extension startup, `migrateStorage()` reads `_version`, applies pending migrations, writes back
- No-op if already at current version

### Adding a New Migration

1. Increment `STORAGE_VERSION` in `migration.ts`
2. Append a new entry to the `MIGRATIONS` array with the target version and `up` function
3. Add tests in `__tests__/unit/storage-migration.test.ts`

### Rules

- Migrations **must be idempotent** — safe to re-run on already-migrated data
- Migrations **must not delete** user data without logging
- Use spread operator to preserve existing fields: `(data) => ({ ...data, newField: default })`

---

## D. i18n / Locale Operations

### Rules

1. **Always update all 3 locales** when adding or modifying keys. Partial updates are not accepted.
2. English (`en`) is the reference locale — validate this first.
3. Run `pnpm lint:i18n` after every change to verify consistency.

### 3 Locale Directories

```
public/_locales/en/messages.json
public/_locales/zh_CN/messages.json
public/_locales/ja/messages.json
```

### Chrome i18n Format

```json
{
  "key_name": {
    "message": "Your text with $PLACEHOLDER$ support",
    "description": "Context for translators",
    "placeholders": {
      "PLACEHOLDER": {
        "content": "$1",
        "example": "127.0.0.1"
      }
    }
  }
}
```

### Adding a New Language

1. Create `public/_locales/{code}/messages.json` (copy `en` as template)
2. Translate all messages
3. Register the locale in `shared/i18n/dictionaries.ts`
4. Add the locale code to `LOCALES` array in `scripts/lint-i18n.ts`
5. Submit a Pull Request

---

## E. Release Process

### Trigger

The release workflow (`.github/workflows/release.yml`) is triggered by `on: release: types: [published]` or manual `workflow_dispatch`.

### How to Publish a Release

1. **Bump the version:**

   ```bash
   npm version patch  # or minor/major
   git push && git push --tags
   ```

2. **Generate Release Title and Notes** following the conventions below, output in two separate code blocks (title + body).

3. **Create a GitHub Release** selecting the tag — CI automatically runs quality gates, packages the `.zip`, and uploads it to the Release.

### Build Artifact

The `pnpm zip` command produces `motrix-next-extension-{version}-chromium-mv3.zip`. This single artifact works with **all Chromium-based browsers** (Chrome, Edge, Brave, Arc, Vivaldi, etc.).

### Release Notes Conventions

**Title format:** `v{VERSION} — {Short Description}`

**Body template:**

```markdown
## What's Changed

One-paragraph summary.

### ✨ New

- **Feature name** — description

### 🛠 Improvements

- Description

### 🐛 Bug Fixes

- Fixed specific issue

### 📦 Install

The `.zip` below works with all Chromium-based browsers.
Install from store or load manually via `chrome://extensions`.
```

Omit empty sections. Patch releases: keep concise.

---

## F. CI/CD Structure

### `ci.yml` (Push to Main + Pull Requests)

Single job `quality-gate`:

| Step       | Command                        |
| ---------- | ------------------------------ |
| TypeScript | `pnpm compile`                 |
| Tests      | `pnpm test`                    |
| Lint       | `pnpm lint`                    |
| i18n       | `npx tsx scripts/lint-i18n.ts` |
| Format     | `pnpm format:check`            |
| Build      | `pnpm build`                   |

### `release.yml` (Release Published + Manual Dispatch)

1. **quality-gate job** — same 6 checks as CI
2. **package job** — `pnpm zip` → upload `.zip` to GitHub Release (on publish) or Actions artifact (on dispatch)

---

## G. Code Conventions

### Dependency Injection

**Every service that touches Chrome APIs must accept an injected adapter interface.** This is the core architectural principle — it enables unit testing without `chrome.*` mocks.

```typescript
// ✅ Correct — injectable
export function createNotification(api: NotificationApi, opts: NotifyOpts): void

// ❌ Wrong — direct Chrome dependency
export function createNotification(opts: NotifyOpts): void {
  chrome.notifications.create(...)  // untestable
}
```

### TypeScript / Vue

- **Strict mode** enabled in `tsconfig.json`
- **`<script setup lang="ts">`** for all components
- **No `any`** — use `unknown` + type guards or Zod parse
- **Pure functions first** — filter evaluation, theme resolution, notification building
- **Graceful degradation** — silently catch API errors for features on older browsers
- **Formatting**: Prettier with project config (`.prettierrc`)

### CSS

- **Tailwind CSS 4** utility classes for layout
- **Naive UI** component library with `NaiveUiResolver` auto-import
- **Custom properties** for theme-specific tokens (Material You color schemes)

---

## H. Verification Commands

Run these before committing changes:

```bash
pnpm format           # Auto-format all files
pnpm format:check     # Verify formatting (CI runs this)
pnpm compile          # TypeScript type checking
pnpm test             # Vitest — 288 unit + integration tests
pnpm lint             # ESLint
pnpm lint:i18n        # i18n key consistency across 3 locales
pnpm build            # Production build
pnpm zip              # Package for store submission
```

> **Every commit MUST pass `pnpm format:check`.** Run `pnpm format` before committing if you edit any source file.

All checks must pass with zero errors before any PR or release.

---

## I. Testing Constraints

> **DO NOT use browser tools (Playwright, puppeteer, etc.) to test this extension.** Extension popup and options pages run in a restricted Chrome extension context — they cannot be accessed via `localhost` URLs. Use CLI checks (`vue-tsc`, `pnpm test`) for automated verification. For UI testing, ask the user to load the unpacked extension via `chrome://extensions` and verify manually.

> **All services are testable via DI.** If you find yourself needing to mock `chrome.*` globals, the design is wrong — inject the API surface instead.
