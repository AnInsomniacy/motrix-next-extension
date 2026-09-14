# Implemented interface

The extension uses the accepted lightweight design across the popup, settings and embedded player panel. Reference images remain illustrative; the corrections in COVERAGE.md govern conflicting pixels.

## Surface ownership

| Surface          | Implementation                                   | Result                                                                                                                                                                    |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview         | popup/App, PopupHeader, StatDashboard            | Official mark, quiet connection status, text tabs, independent interception, two unboxed speed rows, task counts and small desktop actions                                |
| Media sources    | MediaPanel                                       | Unboxed source rows, actual kind/size/host, separate Locate action, internal scrolling, compact catalogue actions                                                         |
| Media selection  | MediaSelection                                   | Top labels, native track IDs, session-scoped drafts, VOD/live choices, distinct authentication/protection errors, receipt reconciliation and Open Rayburst after creation |
| Settings         | options/App, SettingsPage and section components | Neutral 180 px sidebar, unboxed forms, grouped rows, quiet fixed save footer, native permission outcomes and backup staging                                               |
| Player entry     | player-overlay and media/App                     | Existing isolated WXT control and iframe, shared media UI, native system colors for the page anchor, compact opaque panel                                                 |
| Theme and locale | shared/theme, globals.css, i18n/engine           | Brand-generated accents, neutral surfaces, ten presets, light/dark/system modes, 27 locales, library RTL styles and document language/direction                           |

The language and preset choosers use NSelect. Theme modes use NRadioGroup/NRadioButton. Custom color uses NColorPicker with a keyboard-accessible NButton trigger supplied through the supported slot. Restore defaults and Clear log use NPopconfirm. Diagnostics retain event messages, filters, pagination, retention and details. All 31 mapped persistence paths remain represented.

## Settings and theme refinement

General combines the small connection, appearance and language groups. Downloads, Rules and Maintenance remain separate. SettingsPage mounts a page on first use, retains it with v-show and uses a native CSS opacity transition through Vue. Each page owns its scroll container; hidden pages are inert. Rule input, log filters and pagination survive navigation without a separate state cache or measuring loop.

SettingsRow uses NFormItem's supported label placement and slots. Labels and descriptions are grouped; control widths are consistent. Content container queries stack long controls at narrow widths. Large tinted subpanels, repetitive separators, preview cards, custom radio-dot overrides and heavy headings were removed. The save actions follow the form's alignment.

Custom color follows Rayburst's three/six-digit opaque HEX contract and automatically selects Custom after a completed edit. The paired preference fields are persisted in one operation, retained in backups and applied before first paint across popup, settings and media iframe. MCU owns source/content palette generation. The desktop's low-saturation threshold is retained; Graphite uses #737373 and a content palette. No desktop imports, shared runtime package or new palette dependency were introduced.

Color-picker swatches and native preview changes are committed on close when they have not emitted completion. Persistence failures restore the saved custom color. Site rules clear their input only after an acknowledged save; Enter in a selection control no longer submits the surrounding rule editor.

All 27 locales include the new General/Custom strings. Naive UI's locale extension API supplies the used common control strings even for languages without an upstream locale. Existing date formatting remains native Intl. The current single-path lightning removes the wide upper facet and detached fragments. Generated icons, promotional assets and the test-site favicon follow this SVG.

## Motion and removal

CSS owns short color/opacity transitions. Vue Transition and TransitionGroup retain exiting content; Naive UI owns tab, disclosure, menu, confirmation and progress animations. Reduced motion follows the native media query, disables animated tabs and shortens library/CSS transitions. Entering views restore interactivity; exiting views become inert.

Removed the custom popup ResizeObserver/height transition, CollapsePanel, ClearDiagnosticsButtonLabel, countdown confirmations, pulsing save indicator, rolling text, exaggerated rule-button scaling, card surfaces and redundant phase/directional transition styles. No animation package or engine was added. Essential player geometry observers and visibility-aware polling remain.

The browser owns popup creation, outer resizing and destruction. CSS cannot guarantee an exit animation after the browser destroys that document.

## State behavior

- Interception does not disable desktop pause/resume or media discovery.
- Desktop actions prevent duplicate submissions and report rejected responses.
- Stale connection results cannot overwrite a newer configuration or a closed popup.
- Media drafts are keyed by probe identity and removed when their operation leaves the catalogue. Native submission identities remain background-owned.
- Settings saves capture a snapshot and block competing edits. Failed writes retain the draft. Immediate writes restore their baseline after failure.
- Import and reset stage a complete snapshot until Save; Discard reloads stored values. Permission rejection leaves its control off.
- Theme and locale bootstrap precede mounting. Native Canvas colors apply to the isolated page anchor; the iframe follows extension preferences.

## Verification

Ordinary tests include populated Naive UI controls across ten palettes and both modes, popup task-control independence, late initialization cleanup, stale connection tests, save retry, import/discard, permission denial, immediate-write rollback and media selection/re-entry. Existing transfer, interception, recovery and credential-scope suites remain in place.

The current refinement adds coverage for custom color parsing, MCU palette choice, persistence rollback, backups, retained form state, rule submission and all supported control locales. See the final task result for the latest verification run. Tests compile Vue SFCs through the same official Vue plugin already present in the WXT dependency graph. Material Color Utilities is bundled in Vitest to match Vite resolution rather than Node's strict extension resolution.

No browser automation or E2E was run. The maintainer verifies actual Chrome/Edge/Firefox popup sizing, long translations, RTL, keyboard focus, repeated transitions, native permissions and fullscreen playback. Unit tests do not establish frame-rate or pixel-level acceptance.

The build reports a shared JavaScript chunk above its 1024 kB warning threshold. Locale packaging remains unchanged; this task does not suppress the warning or introduce a new translation-loading architecture. Versioning, committing, publication and store submission are separate operations.
