# AGENTS.md — Rayburst Connect

## Architecture

Rayburst Connect is an independent WXT Manifest V3 extension using Vue 3,
TypeScript, Naive UI and native browser APIs. It discovers browser intent and
media sources, then delegates transfers to Rayburst. Aria2 Next remains the engine.

- `entrypoints/`: background, content scripts, popup, options and media iframe.
- `lib/schema.ts`: Zod persistence schemas, inferred types and parsed defaults.
- `lib/storage.ts`: validation over native browser storage.
- `lib/api.ts`, `lib/desktop.ts`: local HTTP API and activation-only Native Messaging.
- `lib/download/`: interception and immutable handoff identity.
- `lib/media/`: discovery, scoped request context and inspection coordination.
- `shared/theme.ts`: Material colors, pre-mount bootstrap and Naive UI mapping.
- `shared/color-schemes.ts`: preset seeds for theme and persistence validation.
- `public/_locales/`: all 27 native browser locale bundles.

No shared parent package, cross-repository tests or desktop source imports.
See docs/DOWNLOADS.md, docs/MEDIA.md and docs/MEDIA_API.md for the contracts.

## Engineering

Code, comments and engineering documentation use English. Prefer native browser
APIs, WXT utilities and maintained libraries. Use strict TypeScript and plain
functions. Do not introduce abstractions solely for mocks.

Validate external inputs. Keep credentials scoped to their observed source and
out of popup payloads. Preserve immutable request identities after ambiguous
submissions; never create a second download because a receipt was lost.
Do not add compatibility aliases, speculative repairs or obsolete API fallbacks.

## Branding and localization

`assets/rayburst-connect.svg` is the logo source. WXT's official auto-icons module
creates platform PNGs at build time; development retains full color.
`pnpm brand:assets` exports local promotional graphics and the test-page favicon.
UI uses SVG directly. Electric Purple (`#7B3ED1`) is the default Material seed.
Warning, success, error and information retain distinct semantic roles.

Update all 27 locales in one Python batch operation. Preserve placeholders and
native message structure. English (en) is the schema. Run `pnpm lint:i18n`.
One-off helpers are not project source; reusable scripts need a clear purpose.

## Verification

Use repository-local `pnpm compile`, `pnpm lint`, `pnpm lint:i18n`,
`pnpm format:check`, `pnpm media:contract:check`, `pnpm build` and
`pnpm build:firefox`. Local packages use `pnpm zip` and `pnpm zip:firefox`.
Module tests use `pnpm test`, happy-dom and WXT fakeBrowser.

Test behavior, ownership and confirmed regressions. Remove tests for retired
or duplicated behavior. Do not add wrapper or branding snapshots. Honor task-
specific verification limits. Do not use browser automation. The maintainer
performs real integration acceptance with separately built applications.

## Local development and distribution

Work on the current branch. No subagents or orchestration without explicit user
authorization. The parent directory is not a repository.

WXT reuses `.wxt/chrome-data` through `chromiumProfile` and
`keepProfileChanges: true`. Preserve that directory so development settings survive.
The Chromium public key and browser installation IDs remain stable in development
and production builds.

Package.json owns the version; changes use scripts/bump-version.sh after the
implementation is final. WXT generates manifest versions. Use X.Y.Z for stable
and -alpha.N, -beta.N or -rc.N for prereleases; tags add v. In an authorized release
task, follow the requested version/channel or continue the current channel with
the appropriate SemVer increment. Do not promote silently.

Follow [Releasing](docs/RELEASING.md). scripts/release.sh validates and packages
before staging all changes, committing, tagging and pushing the current branch
and all local tags. CI must pass before publishing the GitHub Release. A tag push
alone does not start packaging. Store publication is a separate manual workflow
for production releases; a green submission job does not prove store availability.
Write concise English release notes; provide title and body in separate code
blocks for manual publication. Changed packages require a new version and tag.

README may link existing store listings while clearly identifying their published
branding. Do not claim the Rayburst Connect rebrand is live before publication.
GitHub remotes remain unchanged. Publication is a separate task; review store
identifiers and signing configuration before submission.
