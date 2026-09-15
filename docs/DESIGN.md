# Rayburst Connect design system

Rayburst has one visual language across the desktop application and Rayburst
Connect. This document records the decisions that code cannot explain by itself.

## Principles

1. **Quiet structure, one light source.** Surfaces are layered neutrals that
   borrow a faint amount of the accent hue. Saturated color appears in three
   places only: the principal action, active progress and the selected state.
   All three use the same diagonal gradient, which follows the light in the logo.
2. **Grouped surfaces.** Rows that belong together share one raised card with
   hairlines between them. Cards never nest.
3. **Type and iconography carry the identity.** Geist for interface text and
   numbers, Geist Mono for hashes, URLs and paths, Lucide for icons, and
   file-kind tiles so a list can be scanned by content type.
4. **Motion answers the user.** Every animation corresponds to an action:
   selecting, pushing into details, expanding, confirming. Nothing plays on its
   own except the engine progress sweep while the engine is unavailable.

## Color

`shared/theme/palette.ts` derives every role from one seed color in OKLCH.
Accent chroma follows a bell curve over lightness so hues keep the same weight,
and neutral surfaces receive a small amount of the seed hue. Neutral schemes
(Graphite, low-saturation custom seeds) stay achromatic.

| Role                              | Light                             | Dark                   |
| --------------------------------- | --------------------------------- | ---------------------- |
| `--rb-canvas` / `--rb-sidebar`    | L 0.985 / 0.965                   | L 0.17 / 0.145         |
| `--rb-raised` / `--rb-overlay`    | white                             | L 0.215 / 0.255        |
| `--rb-text` / `-muted` / `-faint` | L 0.22 / 0.50 / 0.64              | L 0.94 / 0.70 / 0.55   |
| `--rb-accent`                     | seed lightness, clamped 0.46–0.60 | L 0.74                 |
| `--rb-gradient`                   | accent-bright → accent            | accent-bright → accent |

Semantic colors (success, warning, danger, info) use fixed hues and fixed
lightness; they are not blended with the seed. `assets/styles/globals.css` holds the
Electric Purple values as first-paint defaults; the theme engine overwrites them
on the root element once preferences load.

Naive UI receives the same tokens through `shared/theme/naive.ts`.

## Shape and depth

| Token                 | Value | Use                                  |
| --------------------- | ----- | ------------------------------------ |
| `--rb-radius-control` | 9px   | buttons, inputs, segments, nav items |
| `--rb-radius-tile`    | 10px  | metric tiles, inset panels           |
| `--rb-radius-card`    | 14px  | grouped rows, cards                  |
| `--rb-radius-dialog`  | 18px  | dialogs                              |

Raised surfaces use a 1px hairline ring plus a soft shadow. Overlays use a
larger shadow. Dark mode keeps the ring and deepens the shadow; there is no
translucency or blur anywhere.

## Typography

| Role          | Size / line | Weight |
| ------------- | ----------- | ------ |
| Page title    | 24 / 32     | 650    |
| Detail title  | 22 / 28     | 650    |
| Dialog title  | 18 / 24     | 650    |
| Task name     | 14 / 20     | 560    |
| Body          | 13 / 20     | 450    |
| Metadata      | 12 / 18     | 450    |
| Section label | 12 / 16     | 600    |

Numbers are tabular everywhere. Geist is bundled from fontsource; CJK text falls
back to the system font.

## Motion

Motion for Vue owns layout, presence, reordering and the sliding indicators
(`layoutId`). CSS transitions own fades, pushes and progress. Durations live in
`globals.css`:

| Token                  | Value | Use                            |
| ---------------------- | ----- | ------------------------------ |
| `--rb-motion-feedback` | 120ms | hover, press, color            |
| `--rb-motion-view`     | 200ms | view crossfade, text swap      |
| `--rb-motion-exit`     | 150ms | any leave                      |
| `--rb-motion-push`     | 280ms | list → details                 |
| `--rb-motion-dialog`   | 240ms | dialog enter                   |
| `--rb-motion-layout`   | 240ms | keyed list moves               |
| `--rb-motion-progress` | 400ms | progress width, sparkline path |

The root `MotionConfig` uses a spring (stiffness 520, damping 42). Reduced motion
follows the application preference or the OS setting; durations drop to zero and
lifecycle callbacks still complete.

## Components

- Media rows use a tinted tile keyed by source kind.
- `EmptyState`: brand mark on a glow, title, optional hint and action.
- `Sparkline`: d3-shape area and line over the last 60 transfer samples in the popup.
- Settings rows following a section title form one card through CSS sibling
  selectors; no wrapper component is required.
