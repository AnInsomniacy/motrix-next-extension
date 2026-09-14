# Rayburst Connect design reference

This is the static design handoff for the extension's visual refresh. The user selected the lightweight popup and accepted matching media and connection-settings previews on 2026-09-14.

Start with [the gallery](GALLERY.html), then read [the visual specification](specs/VISUAL-SPEC.md). This pack contains three accepted direction references and four proposed composite boards. It is not a clickable product prototype or a shipped component library.

## Contents

- [Screens](screens/): seven current reference images, with related states grouped on boards.
- [Visual specification](specs/VISUAL-SPEC.md): density, layout, typography, color and adaptation.
- [Components](specs/COMPONENTS.md): control states, semantics and concise English copy.
- [Flows](specs/FLOWS.md): connection, media, player overlay and settings behavior.
- [Motion](specs/MOTION.md): native and library ownership, interruption and cleanup.
- [Settings map](specs/SETTINGS-MAP.md): every persisted configuration field and its existing owner.
- [Implementation plan](specs/IMPLEMENTATION-PLAN.md): scoped work and verification.
- [Coverage and corrections](specs/COVERAGE.md): what each board covers and what text resolves.
- [Sources](specs/SOURCES.md): official references and their actual application.
- [Design values](specs/design-values.json): proposed logical measurements, not runtime configuration.
- [Generation prompts](specs/generation.json): the four new built-in ImageGen prompts and their references.
- [Manifest](manifest.json): image status, dimensions and checksums.

## Authority

1. User decisions: preserve the independently developed extension's functionality; refresh its visual language; use the selected small, quiet, light popup; keep the Rayburst brand and all 27 locales.
2. Existing download and media contracts in [DOWNLOADS](../DOWNLOADS.md), [MEDIA](../MEDIA.md) and [MEDIA_API](../MEDIA_API.md).
3. Written specifications in this directory.
4. Raster images, which illustrate composition.

Images are enlarged previews. Measure implementation in logical CSS pixels. Never copy generated glyphs, made-up controls, sample values or status errors into the application. Use the official [SVG logo](../../assets/rayburst-connect.svg) and existing icon library. Three direction images do not constitute approval of every pixel or all proposed behavior refinements.

## Scope

The extension now implements this reference across the popup, settings and player panel. See [implementation notes](specs/IMPLEMENTATION.md) for component ownership, verification and the remaining manual acceptance boundary. Browser permissions, transfer APIs, package versions and publication settings are unchanged.

The application remains WXT, Vue 3, Naive UI and native browser APIs. The extension stays an independent repository. No old visual compatibility layer is retained. Browser/native acceptance remains with the maintainer; this pack makes no runtime animation or integration claim.
