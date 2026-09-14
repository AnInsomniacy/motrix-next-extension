# Sources and application

Checked on 2026-09-14. These references inform a design handoff; they do not require replacing the existing implementation framework or copying another product's visual identity.

| Source                                                                                                               | Applied guidance                                                                                        | Limit                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Figma's DesignSystems publication](https://www.designsystems.com/)                                                  | Organize foundations, typography, iconography, content, components and implementation guidance together | A set of PNGs alone is not a complete operating design system                                                    |
| [Carbon form usage](https://carbondesignsystem.com/components/form/usage/)                                           | Keep labels, fields, helper/error text and actions coherently grouped; align controls                   | Adopt principles, not Carbon's visual skin or every spacing value                                                |
| [Chrome options pages](https://developer.chrome.com/docs/extensions/develop/ui/options-page)                         | Put complex configuration in an options page reached through the native extension mechanism             | Do not recreate full settings inside the tiny popup                                                              |
| [Chrome popup lifecycle](https://developer.chrome.com/docs/extensions/develop/ui/add-popup)                          | Popup closes when focus leaves; durable work cannot depend on its document staying alive                | No custom promise of an OS-level close animation                                                                 |
| [MDN extension popups](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups) | Browser-owned automatic resizing and Firefox overflow-menu constraints                                  | Firefox's described 800×600 maximum is an upper host limit, not our target size or a universal browser guarantee |
| [Vue Transition](https://vuejs.org/guide/built-ins/transition.html)                                                  | Use lifecycle-aware CSS transitions for enter/leave and keyed text                                      | Do not animate every live statistic or stack multiple owners                                                     |
| [Vue TransitionGroup](https://vuejs.org/guide/built-ins/transition-group.html)                                       | Use stable keys and built-in list transitions                                                           | No hand-built geometry or sorting engine is introduced                                                           |
| [WXT content-script UI](https://wxt.dev/guide/essentials/content-scripts.html)                                       | Preserve the existing isolated Shadow Root and iframe integration                                       | This handoff changes visual presentation, not page-observation ownership                                         |
| [Naive UI](https://github.com/tusen-ai/naive-ui)                                                                     | Existing maintained controls and theme overrides remain the component foundation                        | Confirm supported theme input values in the installed version                                                    |

## Local source of truth

- [Extension architecture](../../../AGENTS.md)
- [Download contract](../../DOWNLOADS.md)
- [Media discovery](../../MEDIA.md)
- [Media API](../../MEDIA_API.md)
- [Persisted schema](../../../lib/schema.ts)
- [Theme mapping](../../../shared/theme.ts)
- [Native browser helpers](../../../lib/browser.ts)

The deliverable is a static design handoff: high-fidelity mockups, reusable visual rules, a component/state inventory and implementation notes. It is not an interactive prototype or a newly invented industry design language.

The design-system, frontend-design and ui-ux-pro-max skills informed organization and visual review. No agents or delegated workflows were used. Native/library choices follow actual product needs; no new dependency is added for documentation.
