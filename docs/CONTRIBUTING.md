# Motrix Next Extension Contributing Guide

Maintained by [@AnInsomniacy](https://github.com/AnInsomniacy). PRs and issues are welcome!

Before you start contributing, make sure you understand [GitHub flow](https://guides.github.com/introduction/flow/).

## 🛠 Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 24.16.0 LTS
- [pnpm](https://pnpm.io/) 10.34.1
- [Motrix Next](https://github.com/AnInsomniacy/motrix-next) desktop app running with RPC enabled (for manual testing)

### Getting Started

```bash
git clone https://github.com/AnInsomniacy/motrix-next-extension.git
cd motrix-next-extension
pnpm install
pnpm dev    # Build the development extension with hot reload
```

Open `chrome://extensions` in a regular Chrome profile and load
`.output/chrome-mv3-dev` as an unpacked extension. WXT does not launch an
isolated browser because Native Messaging registrations follow the browser data
root on macOS and Linux.

Load the unpacked extension:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `.output/chromium-mv3` directory

## ✅ Code Quality

All checks must pass before PR merge:

```bash
pnpm format:check    # Prettier formatting
pnpm compile         # TypeScript strict mode (vue-tsc --noEmit)
pnpm test            # Vitest unit and integration tests
pnpm lint            # ESLint (0 errors, 0 warnings)
pnpm lint:i18n       # i18n key consistency across locales
pnpm build           # Chromium production build
pnpm build:firefox   # Firefox production build
pnpm zip             # Chromium store package
pnpm zip:firefox     # Firefox store package
```

## 📐 Code Guidelines

- **Keep dependencies explicit.** Use plain functions and WXT browser APIs. Introduce adapters only where they clarify a real boundary; avoid test-only service interfaces.
- **Pure functions first.** Theme resolution, notification building, filter evaluation — keep them stateless and side-effect-free.
- **Handle real failures.** Preserve browser downloads when desktop delivery fails. Validate external inputs and respect browser-specific APIs and permissions.
- Use `<script setup lang="ts">` with Composition API for all Vue components.
- Keep service files focused — one responsibility per module.

## 🧪 Testing

- Keep tests focused on download ownership, recovery, data boundaries, and confirmed regressions.
- Tests live in `__tests__/unit/` and `__tests__/integration/`.
- Use Vitest mocks for external effects and fake timers for scheduling. Share small fixtures where setup repeats.
- Run the test site for manual interception verification:
  ```bash
  npx serve test-site -p 3001
  ```

## 🌍 Translation Guide

The extension uses Chrome's native i18n system with `messages.json` files under `public/_locales/`.

### Supported Locales

| Locale                | Directory                             |
| --------------------- | ------------------------------------- |
| Arabic                | `public/_locales/ar/messages.json`    |
| Bulgarian             | `public/_locales/bg/messages.json`    |
| Catalan               | `public/_locales/ca/messages.json`    |
| German                | `public/_locales/de/messages.json`    |
| Greek                 | `public/_locales/el/messages.json`    |
| English               | `public/_locales/en/messages.json`    |
| Spanish               | `public/_locales/es/messages.json`    |
| Persian               | `public/_locales/fa/messages.json`    |
| French                | `public/_locales/fr/messages.json`    |
| Hindi                 | `public/_locales/hi/messages.json`    |
| Hungarian             | `public/_locales/hu/messages.json`    |
| Indonesian            | `public/_locales/id/messages.json`    |
| Italian               | `public/_locales/it/messages.json`    |
| Japanese              | `public/_locales/ja/messages.json`    |
| Korean                | `public/_locales/ko/messages.json`    |
| Norwegian Bokmål      | `public/_locales/nb/messages.json`    |
| Dutch                 | `public/_locales/nl/messages.json`    |
| Polish                | `public/_locales/pl/messages.json`    |
| Portuguese (Brazil)   | `public/_locales/pt_BR/messages.json` |
| Romanian              | `public/_locales/ro/messages.json`    |
| Russian               | `public/_locales/ru/messages.json`    |
| Thai                  | `public/_locales/th/messages.json`    |
| Turkish               | `public/_locales/tr/messages.json`    |
| Ukrainian             | `public/_locales/uk/messages.json`    |
| Vietnamese            | `public/_locales/vi/messages.json`    |
| Chinese (Simplified)  | `public/_locales/zh_CN/messages.json` |
| Chinese (Traditional) | `public/_locales/zh_TW/messages.json` |

### Adding or Modifying Keys

1. Add or modify keys with a temporary batch helper in the operating system's temporary directory so all 27 locale files are updated together.
2. Keep English (`en`) as the reference message and provide translations for every supported locale.
3. Follow the Chrome i18n format:
   ```json
   "key_name": {
     "message": "Your translated text",
     "description": "Context for translators"
   }
   ```
4. If the message contains dynamic values, use Chrome's `$placeholder$` syntax with a `placeholders` object.
5. Validate consistency across all locales:
   ```bash
   pnpm lint:i18n
   ```
6. Every PR that adds or modifies i18n keys **must update all 27 locales**. Partial updates will not be accepted.

### Adding a New Language

1. Create a new directory under `public/_locales/` with the Chrome locale code (e.g. `public/_locales/ko/`)
2. Copy `public/_locales/en/messages.json` as a template
3. Translate all messages
4. Register the locale in `shared/i18n/locales.ts` and run `pnpm lint:i18n`
5. Submit a Pull Request

## 💬 Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add download interception status indicator in popup
fix(filter): handle blob URLs in scheme validation stage
refactor: extract completion polling into standalone service
test: add site rule glob matching edge cases
docs: update translation guide for Japanese locale
```

## 🤝 Pull Requests

### Size and scope

Hard limits — PRs that exceed these will be closed without review:

- **< 300 lines** of changed code (excluding tests and generated files).
- **< 10 files** touched. Docs-only or config-only PRs may exceed this.
- **One concern per PR.** A single PR should do exactly one thing.

How to split a large change:

| Instead of                               | Split into                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| "Add download history feature" (800 LOC) | PR 1: storage schema + tests → PR 2: history service + tests → PR 3: UI integration |
| "Add feature + fix lint + update config" | PR 1: lint/config fixes → PR 2: the feature                                         |
| "Update i18n for 3 features"             | One PR per feature, each updating all supported locales                             |

### Before you start

- **Bug fixes** — open an issue first to confirm the bug, then reference it in the PR.
- **New features** — open an issue and get maintainer approval before writing code. PRs for undiscussed features will be closed.
- **Refactors** — keep them purely behavioral-neutral. Don't sneak functional changes into a refactor PR.

### Manifest permission changes

Any PR that adds or modifies manifest permissions must include:

1. A clear justification in the PR description for why the permission is necessary.
2. Confirmation that the permission is added as `optional_permissions` if possible (prefer optional over required).
3. Updated documentation in the README if it affects the user-facing permission prompt.

### Before you push

Run the full check suite locally. PRs that fail any of these will not be reviewed:

```bash
pnpm format:check    # Prettier formatting
pnpm compile         # TypeScript strict mode
pnpm test            # Vitest unit + integration tests
pnpm lint            # ESLint
pnpm lint:i18n       # i18n key consistency
pnpm build           # Production build
```

### AI-assisted development

Using AI tools (Copilot, Claude, ChatGPT, Cursor, etc.) to assist development is welcome and encouraged. What is not acceptable is blind vibe coding — generating code with AI and submitting it without understanding or reviewing it.

**Rules:**

1. You must **review and understand every line** you submit, whether you wrote it or an AI did.
2. You must be able to **explain any change** if asked during review.
3. Add tests when they protect meaningful behavior. Avoid wrapper tests, copied implementation assertions, and duplicate checks.
4. All checks must **pass locally** before pushing — not after a chain of fix commits.

**Disclosure:**

The PR template includes an AI usage disclosure section. Fill it out honestly. You may also add a commit trailer:

```
feat: add speed limit control

AI-Assisted-By: Claude
```

**What gets your PR closed immediately:**

- Commit history showing a "generate → push → fix → fix → fix" loop.
- Code that doesn't pass lint, type checks, or tests on first push.
- Misleading AI disclosure (claiming no AI was used when it was).

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](https://opensource.org/licenses/MIT).
