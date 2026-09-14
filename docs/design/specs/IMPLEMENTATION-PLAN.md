# Implementation plan

Status: implemented on the current branch on 2026-09-14. This document records the agreed scope; [implementation notes](IMPLEMENTATION.md) describe the resulting code and verification. Real browser acceptance remains with the maintainer.

## 1. Establish the visual foundation

Refine shared/theme.ts and assets/styles/globals.css in place. Align neutral surfaces, type, spacing, borders, selected states and semantic feedback with VISUAL-SPEC.md. Update pre-mount fallbacks, Naive UI overrides and the media iframe together. Keep MCU, the official SVG and the existing icon library.

Remove obsolete card/elevation/uppercase-heading styling as its consumers move. Pass parseable concrete colors into component theme APIs. Validate real themed controls instead of relying exclusively on empty stubs.

## 2. Apply the accepted popup and media layouts

Make the overview match 01 and sources match 02. Preserve connection checking, backoff, aggregate statistics, native task actions and independent interception/discovery state. No new task list or handoff API.

Use small normal-weight values and one Open Rayburst action. Keep a media source's primary selection separate from Locate. Replace the media body with track selection; retain candidate identity, scroll and selection state within the proper lifecycle.

Bound internal scrolling and remove the custom popup-height animation if a stable browser-owned size/content structure satisfies the supported hosts. Do not replace it with another measuring loop.

## 3. Restyle settings and shared controls

Use General, Downloads, Rules and Maintenance with all 31 persisted paths. General combines connection, appearance and language. Apply one consistent row/form/action layout and the accepted connection page. Simplify language cards and color controls through maintained components where they fit.

Keep immediate and draft settings distinct. Retain draft edits on save errors, invalidate stale connection-test success after editing, and use native permission outcomes. Replace countdown/double-click confirmations with a small library confirmation; preserve import/reset staging.

## 4. Consolidate motion and remove retired code

Use CSS, Vue Transition/TransitionGroup and Naive UI animation primitives. Simplify phase/text/section transitions, drop artificial waits and redundant height animation. Retain essential native geometry scheduling for the player control.

No new motion library is required at present. Introduce one only for a demonstrated gap that the existing mature primitives cannot handle cleanly. Do not add an old-theme switch, compatibility routes or duplicated components.

## 5. Complete localization and verification

Update all 27 browser locale bundles in one batch, including concise visible labels, accessibility text, validation and failure states. Keep code and engineering documentation English.

Run repository-local ordinary tests and the required static/build checks:

```sh
pnpm compile
pnpm lint
pnpm lint:i18n
pnpm format:check
pnpm media:contract:check
pnpm test
pnpm build
pnpm build:firefox
```

Tests should cover real control/theme rendering, connection-state semantics, independent toggles, permission rejection, settings staging/save failure, stale media callbacks, immutable submissions and session recovery. Retain existing ownership/security tests. Avoid tests that merely copy CSS constants or snapshots of branding.

The maintainer performs real Chrome, Edge and Firefox acceptance, including narrow popup hosts, system theme, RTL, long labels, repeated tab changes, native permissions and video fullscreen behavior. Do not run browser automation or claim real frame-rate validation from unit tests.

## Completion boundary

Deliver one maintained visual implementation across popup, options and player panel. The background/download/media contracts remain independently owned and intact. Website reconstruction, desktop changes, browser-store submission, signing identities, publishing, version changes and a shared parent package are outside this task.
