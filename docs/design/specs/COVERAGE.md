# Coverage and raster corrections

The pack has seven images: three accepted direction references and four newly generated composite boards. It deliberately reuses layouts instead of generating a separate full screenshot for every state.

## Coverage matrix

| Image                    | Visual coverage                                                                            | Written extension                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 01 popup overview        | Connected overview, interception on, aggregate metrics, task actions                       | FLOWS: checking, starting, stale connection and task-action failure                                  |
| 02 media sources         | Three source kinds, metadata, Locate, scan/clear/site actions                              | FLOWS: uncertainty, no tab, restricted page, disabled/excluded, long/filterable catalogue            |
| 03 connection settings   | Six-section shell, connection form, test, draft footer                                     | SETTINGS-MAP: constraints, native permissions, immediate/draft/staged behavior                       |
| 04 popup states          | Interception off with active transfers, disconnected, auth error, empty discovery          | FLOWS: timeout, launch failure, disabled discovery and distinct remedies                             |
| 05 media flow            | VOD/live selection, pending receipt, task created, player entry                            | FLOWS: all seven operation states, audio-only, unsupported/expired/protected resources, cancellation |
| 06 settings details      | Downloads, rules, site entries, maintenance, log filters and confirmation                  | SETTINGS-MAP: all 31 persisted leaf paths, full diagnostics, backup contract                         |
| 07 components/adaptation | Buttons, fields, focus/error/pending, appearance/language, narrow/RTL/dark, motion samples | COMPONENTS / VISUAL-SPEC / MOTION: keyboard, reduced motion, exact ownership                         |

No image proves runtime smoothness, complete localization, browser compatibility or successful downloads. Written state coverage does not mean that each state received a separate generated screenshot.

## Corrections that override generated pixels

These are implementation instructions, not requests for more image generation.

1. All boards: use the actual SVG/icon library. Generated gradients on buttons, excessive separators or enlarged glyphs are not normative. Controls are solid color and normally 32–36 logical pixels.
2. 03: the raster's sidebar selection accent is optional; use the restrained selected background consistently. Test-result feedback must be invalidated after port/secret changes. Keep only the useful current result, avoiding duplicate status prose.
3. 04: an API-secret mismatch should prioritize Connection settings. Retry is secondary. The generated empty state repeats a large discovery row; match the compact hostname/switch treatment in 02 when it fits.
4. 05: the generator put labels beside fields. At popup width use the top labels and group spacing specified in VISUAL-SPEC, matching the accepted connection form. Do not reproduce artificial blank space above the footer. Pending/created boxes are body-state excerpts, not new independent modal windows. The small player source box is only an entry example; the actual iframe reuses the full source/selection components.
5. 06: the generator repeated popup-like headers above settings crops. These are pane samples inside the existing 03 settings shell, not three separate popups. Remove the invented master Request information toggle. Request-header and cookie settings are independent. Existing website rules need an action label and remove action; the drawn dropdown does not authorize a new inline-edit contract.
6. 06: the cropped diagnostic table omits the message column and pagination. Keep both, plus event details and retention controls. A confirm sample belongs in a transient confirmation anchored to its action, not a permanent box below logs. The unsupported-browser note belongs in documentation or relevant guidance; hide downloads.ui controls when unavailable.
7. 07: the generator mixed media names with transfer speeds/counts and invented per-source switches in the dark/RTL/motion examples. Copy only their color, alignment and focus/motion intent. Overview and Media remain separate: source rows have a selection action and Locate, never a transfer toggle or invented size/speed.
8. 07: theme swatches are illustrative. Preserve all ten actual presets and all 27 locales. Labels and Arabic layout must come from the existing locale registry, not OCR. No per-app reduced-motion switch is introduced.
9. Unknown size, count and duration values are never taken from sample images. Never turn Stopped into Completed or task-created feedback into transfer-complete feedback.
10. The browser owns native permissions, context menus, file pickers, popup open/close and outer sizing. The images do not authorize custom replacements.

11. The final refinement removes both detached logo fragments, uses the current continuous lightning SVG, combines connection, appearance and language into General and uses library theme controls with custom color and replaces the long interception-scope rows with grouped checkboxes. It supersedes the earlier boards where those differ.

## Source audit

Reviewed the current schema and settings sections, popup/header/stat/media components, shared theme/global styles, native API client/browser helpers, player overlay, backup and site/filter helpers, plus the download/media contracts. The design pack records the visual scope; it does not claim a new full audit of every backend algorithm.

## Handoff verification

Verify every local image/document link, image signature/dimensions/hash, settings-map paths against the current schema, formatting and changed-file scope. No application E2E is required for adding static reference assets and documents.
