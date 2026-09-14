# Motion

The goal is continuity without visual weight. Use browser CSS transitions with Vue lifecycle and existing Naive UI animation components. No new animation dependency is justified by the current scope.

## Ownership

| Interaction                           | Owner                                                | Initial timing                     |
| ------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| Hover, press, color                   | CSS transition                                       | 100–120 ms                         |
| Status text                           | Vue Transition with opacity                          | 120–160 ms                         |
| Popup tabs                            | Existing Naive UI tabs animation                     | About 160–200 ms                   |
| Media list/detail                     | One Vue Transition, opacity and at most 6–8 px shift | 160–200 ms                         |
| Settings content                      | One Vue Transition with small crossfade              | 160–200 ms                         |
| Related setting fields                | Naive UI NCollapseTransition or NCollapse            | 180–220 ms                         |
| Site-rule insertion/removal           | Vue TransitionGroup with stable IDs                  | Enter 180 ms; leave 140 ms         |
| Menus and confirmations               | Library transition                                   | Existing short library default     |
| Browser popup open/close/outer resize | Browser                                              | Not controlled by extension CSS    |
| Reduced motion                        | System media query + library setting                 | No displacement; immediate cleanup |

Use one neutral decelerating curve, starting with cubic-bezier(0.2, 0, 0, 1). Timing values are tuning targets, not measured frame-performance guarantees.

## Continuity rules

- One owner per animated property. Do not combine a library transition and another custom height/transform engine on the same element.
- Retain leaving content until the transition completes; do not clear fields immediately on close.
- Do not force an out-in empty gap between settings or connection phases. Keep a stable containing surface.
- Fast repeated navigation interrupts the old visual transition. Async responses remain tied to their original candidate/operation/configuration revision.
- Do not animate speed digits individually. Update values with tabular numerals and stable measurement slots.
- Keep media selections and meaningful operation state when switching tabs. Background state survives popup unmount according to native session-storage lifetime.
- No forced delay before returning a successful action just to display a spinner. Remove the current 600 ms artificial connection-test wait.
- Do not animate the browser's popup bounding box using repeated DOM height measurements. Its lifecycle and resizing differ across hosts; animate contained content and bound overflow instead.
- A browser closing the popup destroys its document. Do not delay security/lifecycle cleanup for an exit animation that cannot run.
- Site-rule removal changes data immediately; Vue may preserve the leaving node. Do not reimplement FLIP, spring physics or timer-based position correction.
- If a native overlay is invalidated by navigation or host removal, clean up immediately. Cosmetic exit cannot outlive its security scope.

## Existing implementation to simplify

Review the popup ResizeObserver/height binding, overlapping text-swap/phase-switch/section transitions, transition: all on rule rows, custom CollapsePanel and timed maintenance confirmations. Replace a mechanism only after its library-owned alternative preserves focus, interruption and cleanup. Remove the old CSS and obsolete tests in the same change.

Keep essential requestAnimationFrame scheduling used for player-anchor positioning: it is browser geometry coordination, not a decorative animation engine.

A native reduced-motion query is enough; no new application setting is introduced by this design. Static boards cannot prove smoothness. The maintainer performs actual Chrome/Edge/Firefox acceptance.
