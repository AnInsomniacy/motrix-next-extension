# Motrix Next Extension Contributing Guide

Maintained by [@AnInsomniacy](https://github.com/AnInsomniacy). PRs and issues are welcome!

Before you start contributing, make sure you understand [GitHub flow](https://guides.github.com/introduction/flow/).

## 🛠 Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9
- [Motrix Next](https://github.com/AnInsomniacy/motrix-next) desktop app running with RPC enabled (for manual testing)

### Getting Started

```bash
git clone https://github.com/AnInsomniacy/motrix-next-extension.git
cd motrix-next-extension
pnpm install
pnpm dev    # Start WXT dev server with hot reload
```

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
pnpm test            # Vitest (288 tests)
pnpm lint            # ESLint (0 errors, 0 warnings)
pnpm lint:i18n       # i18n key consistency across locales
pnpm build           # Production build
```

## 📐 Code Guidelines

- **Dependency Injection everywhere.** All services accept API adapters via constructor — never import `chrome.*` directly. This enables comprehensive unit testing without browser environment mocks.
- **Pure functions first.** Theme resolution, notification building, filter evaluation — keep them stateless and side-effect-free.
- **Graceful degradation.** Silently catch API errors for features that may not exist on older browsers (e.g., `setUiOptions` on Chrome < 115).
- Use `<script setup lang="ts">` with Composition API for all Vue components.
- Keep service files focused — one responsibility per module.

## 🧪 Testing

- Follow **TDD** (Red → Green → Refactor) for new services and utilities.
- Tests live in `__tests__/unit/` and `__tests__/integration/`.
- All services are tested through their DI interfaces — no browser API mocking required.
- Run the test site for manual interception verification:
  ```bash
  npx serve test-site -p 3001
  ```

## 🌍 Translation Guide

The extension uses Chrome's native i18n system with `messages.json` files under `public/_locales/`.

### Supported Locales

| Locale               | Directory                             |
| -------------------- | ------------------------------------- |
| English              | `public/_locales/en/messages.json`    |
| Chinese (Simplified) | `public/_locales/zh_CN/messages.json` |
| Japanese             | `public/_locales/ja/messages.json`    |

### Adding or Modifying Keys

1. Add the new key to **all 3 locale files** following the Chrome i18n format:
   ```json
   "key_name": {
     "message": "Your translated text",
     "description": "Context for translators"
   }
   ```
2. If the message contains dynamic values, use Chrome's `$placeholder$` syntax with a `placeholders` object.
3. Validate consistency across all locales:
   ```bash
   pnpm lint:i18n
   ```
4. Every PR that adds or modifies i18n keys **must update all 3 locales**. Partial updates will not be accepted.

### Adding a New Language

1. Create a new directory under `public/_locales/` with the Chrome locale code (e.g. `public/_locales/ko/`)
2. Copy `public/_locales/en/messages.json` as a template
3. Translate all messages
4. Register the locale module in `shared/i18n/dictionaries.ts`
5. Submit a Pull Request

## 💬 Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add minimum file size indicator in popup
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
| "Update i18n for 3 features"             | One PR per feature, each updating all 3 locales                                     |

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
3. Tests must be written **before** implementation (TDD), not bolted on after.
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
