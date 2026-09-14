# Components and copy

Reuse Naive UI controls and native browser elements. Do not recreate focus management, select menus, checkboxes, tables, dialogs, permission prompts or upload pickers.

## Component contracts

| Component                  | Required states                                            | Implementation direction                                                                |
| -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Brand header               | Connected, checking, starting, disconnected                | Official SVG; compact localized text; no success claim from unauthenticated ping alone  |
| Tabs                       | Selected, hover, focus, disabled where necessary           | Existing NTabs/NTabPane; preserve tab data and scroll during a popup session            |
| Action                     | Default, hover, pressed, keyboard focus, disabled, pending | NButton or semantic button; stable name/width; pending must prevent duplicate mutations |
| Switch                     | On, off, pending, denied/reverted                          | NSwitch; name its scope; permission denial must not leave a false enabled state         |
| Text/number/password field | Default, focus, invalid, disabled                          | NInput/NInputNumber; visible label; field-local validation                              |
| Select / radio             | Closed, open, keyboard focus, selected, unavailable option | NSelect/NRadioGroup; use actual track IDs and supported choices                         |
| Source row                 | Default, focus, selected, pending, submitted, unavailable  | Stable candidate identity; separate source and Locate buttons                           |
| Disclosure                 | Open, closed, interrupted, reduced motion                  | Existing library transition; hidden descendants cannot receive focus                    |
| Feedback                   | Empty, pending, success, warning, error                    | Small text/icon treatment; persistent relevant error near affected action               |
| Diagnostic table           | Populated, empty, filtered-empty, page change              | NDataTable; maintained pagination; text and number alignment by content                 |
| Diagnostic details         | Open, closed, long context                                 | NPopover with labelled scroll area; no raw secret values                                |
| Confirmation               | Open, cancel, pending, failed                              | NPopconfirm/NDialog; specific action and consequence, no confirmation countdown gimmick |
| Save footer                | Clean, dirty, saving, failed, staged import/reset          | Keep draft on failure and allow explicit retry; release focus correctly                 |
| Player button/panel        | Hidden, available, open, dismissed, unavailable            | WXT Shadow Root + extension iframe; browser observation owns positioning                |

Controls must fit the quiet design without discarding their library semantics. Do not trace icons out of PNGs.

## Concise English product copy

These are canonical meanings for the existing locale registry. Implementation updates all 27 bundles together, including tooltips and aria labels. Existing keys can be retained when their meaning remains correct; avoid aliases for retired visible wording.

| Context                  | Proposed English                                                    |
| ------------------------ | ------------------------------------------------------------------- |
| Overview tab             | Overview                                                            |
| Media tab                | Media                                                               |
| Interception switch      | Intercept downloads                                                 |
| Discovery switch         | Find media                                                          |
| Connection               | Connected / Connecting / Starting / Not connected                   |
| Overview metrics         | Download / Upload                                                   |
| Counts                   | Active / Waiting / Stopped                                          |
| Global task controls     | Pause all / Resume all                                              |
| Desktop action           | Open Rayburst                                                       |
| Source navigation        | Media list                                                          |
| Source actions           | Scan page / Clear list / Disable on this site / Enable on this site |
| Locate action            | Locate player                                                       |
| Empty discovery          | No media found                                                      |
| Empty guidance           | Play a video or audio on this page, then try again.                 |
| Track fields             | Video / Audio / Subtitles / Format                                  |
| Track absence            | No video / No audio / No subtitles                                  |
| Live duration            | Recording limit                                                     |
| Live duration help       | 0 records until you finish it in Rayburst.                          |
| Submit                   | Download / Start recording                                          |
| Raw resource             | Download original file                                              |
| Inspection               | Inspecting media                                                    |
| Ambiguous submission     | Confirming download                                                 |
| Retry reconciliation     | Check status                                                        |
| Confirmed receipt        | Download created in Rayburst                                        |
| Connection failure       | Cannot connect to Rayburst                                          |
| Extension authentication | API secret does not match                                           |
| Source authentication    | Sign in to the source website                                       |
| Protection               | This media is protected                                             |
| Expired selection        | This selection has expired                                          |
| Settings fields          | API port / API secret                                               |
| Settings actions         | Test connection / Save / Discard                                    |
| Draft state              | Unsaved changes                                                     |
| Rules                    | Always intercept / Always skip / Use global rules                   |
| Maintenance              | Export settings / Import settings / Restore defaults                |
| Diagnostics              | Export report / Clear log / Event details                           |

Do not rename Stopped to Completed: the API's numStopped is not a pure successful-completion count. The icon-only Pause all/Resume all controls must not be labelled merely Pause/Resume in accessibility text.

Raster Chinese wording illustrates the selected language. The written English meaning and the native locale schema govern implementation. Avoid translating protocol names or file extensions.
