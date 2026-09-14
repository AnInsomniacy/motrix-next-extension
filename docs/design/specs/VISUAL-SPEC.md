# Visual specification

## Direction

Match [01 popup overview](../screens/01-popup-overview.png), [02 media sources](../screens/02-media-sources.png) and [03 connection settings](../screens/03-connection-settings.png). The extension is independently designed software. Preserve its useful workflow and lighten presentation.

Use unboxed lists, regular text, fine icons, short labels and sparse separators. White space groups content. Avoid large numeric displays, promotional headings, thick icons, nested cards, excessive purple surfaces, decorative shadows and glass materials.

The relationship to Rayburst is its neutral workspace, official purple mark, restrained selected states, typography and action hierarchy. A browser popup does not need the desktop application's permanent left sidebar. Settings can use one.

The 2026-09-14 refinement uses a 180 px settings sidebar, four navigation destinations and compact interception rows with indented labels on the leading side and checkboxes on the trailing side beneath the master switch. General combines connection, appearance and language. Appearance uses the same library radio/select/color-picker pattern as Rayburst. These choices supersede conflicting board details. Form rows use library label placement, never an override of only half of its grid definition. The current SVG lightning supersedes the fragmented mark visible in older boards.

## Logical measurements

| Element               | Target                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Overview popup        | 420 px wide; roughly 240–270 px tall, growing for localized text and feedback            |
| Media popup           | Same width; content-driven height, normally up to 560 px                                 |
| Popup inset           | 16 px; 12 px only under a real space constraint                                          |
| Brand row             | 44–48 px high                                                                            |
| Logo / wordmark       | 18 px popup mark; 30 px settings mark; 13 px popup wordmark                              |
| Popup tabs            | 32–36 px high; content-width underline                                                   |
| Popup row             | 36–40 px high                                                                            |
| Source row            | About 60 px for name, metadata and independent actions                                   |
| Popup speed           | 18 px, weight 500; two columns with secondary labels and tabular numerals                |
| Body / metadata       | 14/20 px and 12–13/18 px                                                                 |
| Icons / hit target    | 14–16 px glyph within at least 32 px interactive target                                  |
| Controls              | 32 px in popups; 32–36 px in settings                                                    |
| Input label gap       | 6–8 px to its own field                                                                  |
| Separate form groups  | 20–24 px; 12 px for related nested controls                                              |
| Control / menu radius | 6 px / 8 px                                                                              |
| Settings sidebar      | 180 px                                                                                   |
| Settings content      | 40 px horizontal inset; readable inner form width up to 704 px; diagnostics up to 960 px |
| Settings title        | 20/28 px, weight 500–600                                                                 |
| Settings row          | 44–52 px minimum, growing for descriptions                                               |
| Table row             | 38–44 px minimum, with accessible actions                                                |
| Footer                | 40–48 px; preserve full labels and focus visibility                                      |

These values are starting constraints, not reasons to clip content. The selected screenshot is a style reference, not an instruction to render labels below readable sizes.

## Overview composition

```text
+-------------------------------------------------+
| Logo Rayburst Connect   connected       Settings |
| Overview   Media 3                              |
|                                                 |
| Intercept downloads                     [on]    |
| Download                            24.8 MB/s   |
| Upload                               128 KB/s   |
| Active 3    Waiting 1    Stopped 8               |
|                                                 |
| [Pause all] [Resume all]         Open Rayburst   |
+-------------------------------------------------+
```

The accepted A layout places interception in the tab bar suffix, speeds in two columns and task counts on one wrapping line. Pause and resume use quiet text buttons with icons and localized names. Open Rayburst uses a small themed library button without an arrow. They act on desktop tasks, not interception. Keep one Open Rayburst action. An intercepted download does not imply a live connection, and disconnection does not imply zero transfer speed.

Overview remains aggregate-only. Do not invent a desktop task list, per-task progress, a global limit editor or a torrent selector inside it.

## Media composition

Keep the same brand row and text tabs. The media view has its own clearly labelled discovery switch. It is independent of ordinary interception. The current hostname may wrap or truncate without displacing the switch.

Each source has one primary selection target, a recognizable name, concise metadata and an optional separate Locate action. Never nest that action inside the source button. Do not invent thumbnails. Omit unknown metadata instead of filling it with a guessed value; unknown stream size is not zero.

Keep Scan page, Clear list and Disable on this site as small actions. At narrow widths, move secondary actions into a named More menu, preserving the primary scan action. Empty states need one useful action, not duplicated buttons.

Track selection replaces the media body. Labels sit above their controls. Video, audio, subtitle and container are separate fields. Audio-only is a valid selection when supported; subtitle-only is not. Use one small primary submit button. Full control semantics are in FLOWS.md.

## Settings composition

Use four destinations: General, Downloads, Rules and Maintenance. General contains connection, appearance and language; these small groups do not need separate pages. The sidebar uses one level of navigation. Do not add a second global tab bar or a large promotional header. The image's About entry can reveal extension version and existing documentation/support links; it does not require a new top-level page.

Settings use labels and descriptions on the left with controls aligned to the right. Longer controls move below their labels when the content container is narrow. Related controls expand beneath their parent. Port fields hide increment buttons because a port is an identifier, not a quantity. Use explicit spacing for field groups instead of relying on a component's feedback slot to create the layout.

Group spacing provides the main separation. Do not give every group or row a border; a short indented rule is reserved for dependent fields. Repeated action groups share one alignment rule and wrap as a group. Logs remain a real data table with native/library pagination and separate details, not a collection of cards.

The save footer appears only for draft changes. Keep it in layout or reserve its space so it does not cover a focused field. Immediate settings remain immediate; do not imply every section needs Save. Reset/import staging is an exception described in FLOWS.md.

## Color ownership

Keep Material Color Utilities as the single palette generator and Electric Purple #7B3ED1 as the default seed. The generated accessible light primary is currently #7739CD. Keep the ten presets and add Custom using Rayburst's opaque HEX contract. Graphite and low-saturation custom seeds use MCU content palettes. Custom colors affect accents, not neutral page backgrounds; feedback keeps distinct semantic colors.

Map three layers in the existing pipeline:

- Primitive: generated palettes, spacing, type scale and durations.
- Semantic: main surface, muted surface, text, field border, decorative separator, selected state, focus and feedback.
- Component: popup row, source row, field, tab, menu and footer.

Use achromatic main and raised surfaces: light main white, sidebar near neutral #F6F6F6; dark counterparts use neutral tones with clear elevation. Selected backgrounds use about 6–8% primary, not a full purple panel. Keep main and secondary text sufficiently dark. A small semantic dot or icon plus text can express connection, warning and failure; two dominant brand colors do not mean deleting error semantics.

Theme values consumed by Naive UI JavaScript must be concrete supported color values such as hex or rgba. Do not pass CSS-only expressions such as color-mix() into a color parser. CSS expressions can stay in CSS where supported. Apply the theme before Vue mounts in popup, options and iframe, with matching first-paint fallbacks.

Do not load remote fonts. Use installed system UI fonts and platform CJK fallbacks. Brand logo gradients are allowed; controls use solid colors.

## Adaptation and accessibility

- Bound popup width by available space. Do not force a global horizontal scrollbar in Firefox's overflow menu or a narrow host.
- Long media bodies scroll inside the available popup/iframe viewport. Keep navigation and actions reachable. Browser popup outer sizing is browser-owned, so do not promise an animated outer window.
- In short windows, let title/footer join the body scroll if fixed areas would leave no usable content.
- Below roughly 640–700 px options width, switch navigation to a compact wrapping menu or labelled selector; keep all four destinations readable.
- Mirror structural layout and directional arrows for RTL; isolate filenames, URLs, hashes and numbers with bidi-safe markup.
- Preserve all 27 locales. Grow or wrap labels before hiding meaning. Keep Language discoverable through native language names and a stable Language cue.
- Use 4.5:1 normal-text contrast and visible control boundaries/focus. Aim for a 2 px focus ring with 2 px offset; do not treat a decorative hairline as a sufficient input border.
- Names, switches, tab relationships, errors and pending states need accessible semantics. Announce meaningful outcomes, not every speed refresh.
- Respect system reduced motion. Theme preference and system appearance changes must not flash the old surface.

Settings use 32 px minimum rows for switches and checkboxes, 44 px for input controls, 4 px between rows and 24 px between sections. Hints and wrapped labels increase row height naturally. Compact rows use the form library theme override for control height rather than forcing overflowing content into a fixed height.
