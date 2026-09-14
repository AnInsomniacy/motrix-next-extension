# Settings map

The authoritative schema is [lib/schema.ts](../../../lib/schema.ts). This inventory covers all 31 persisted leaf paths, including the internal site-rule identity. [settings-map.json](settings-map.json) contains the same mapping as structured data. Media session credentials/operations are transient state, not settings.

| Path                                                | Section              | Control / constraint                                | Default   | Persistence                                    | Existing owner               |
| --------------------------------------------------- | -------------------- | --------------------------------------------------- | --------- | ---------------------------------------------- | ---------------------------- |
| `connection.port`                                   | General / Connection | Number: 1024–65535                                  | 29110     | draft                                          | ConnectionSection            |
| `connection.secret`                                 | General / Connection | Password with explicit reveal                       | empty     | draft                                          | ConnectionSection            |
| `settings.enabled`                                  | Downloads / Popup    | Switch                                              | true      | immediate                                      | BehaviorSection / popup/App  |
| `settings.interceptionScope.browserDownloads`       | Downloads            | Checkbox/switch within interception group           | true      | immediate                                      | BehaviorSection              |
| `settings.interceptionScope.magnet`                 | Downloads            | Checkbox/switch within interception group           | true      | immediate                                      | BehaviorSection              |
| `settings.interceptionScope.ed2k`                   | Downloads            | Checkbox/switch within interception group           | true      | immediate                                      | BehaviorSection              |
| `settings.interceptionScope.thunder`                | Downloads            | Checkbox/switch within interception group           | true      | immediate                                      | BehaviorSection              |
| `settings.mediaDiscovery.enabled`                   | Downloads / Media    | Independent discovery switch                        | true      | draft in Options; immediate via media commands | BehaviorSection / MediaPanel |
| `settings.mediaDiscovery.excludedHosts`             | Downloads / Media    | Removable host list; up to 100 hosts                | []        | draft in Options; immediate via media commands | BehaviorSection / MediaPanel |
| `settings.forwardRequestHeaders`                    | Downloads            | Independent switch                                  | true      | draft                                          | BehaviorSection              |
| `settings.forwardCookies`                           | Downloads            | Permission-aware independent switch                 | true      | draft                                          | BehaviorSection              |
| `settings.hideDownloadBar`                          | Downloads            | Supported Chromium only; downloads.ui permission    | false     | draft                                          | BehaviorSection              |
| `settings.desktopUnavailable.action`                | Downloads            | Select: launch Rayburst / use browser               | launch    | draft                                          | BehaviorSection              |
| `settings.desktopUnavailable.startupTimeoutSeconds` | Downloads            | Number: 1–60 seconds; shown for launch              | 15        | draft                                          | BehaviorSection              |
| `settings.duplicateGuard.enabled`                   | Rules                | Switch                                              | true      | draft                                          | RulesSection                 |
| `settings.duplicateGuard.windowSeconds`             | Rules                | Number: 1–300 seconds                               | 10        | draft                                          | RulesSection                 |
| `settings.fileExtensionRule.enabled`                | Rules                | Switch                                              | false     | draft                                          | RulesSection                 |
| `settings.fileExtensionRule.extensions`             | Rules                | NDynamicTags; existing normalization                | []        | draft                                          | RulesSection                 |
| `settings.fileExtensionRule.listedAction`           | Rules                | Select: intercept / skip                            | skip      | draft                                          | RulesSection                 |
| `settings.fileExtensionRule.unknownAction`          | Rules                | Select: intercept / skip                            | intercept | draft                                          | RulesSection                 |
| `settings.minimumFileSize.enabled`                  | Rules                | Switch                                              | false     | draft                                          | RulesSection                 |
| `settings.minimumFileSize.sizeMb`                   | Rules                | Number: at least 0 MB                               | 5         | draft                                          | RulesSection                 |
| `settings.minimumFileSize.unknownSizeAction`        | Rules                | Select: intercept / skip                            | intercept | draft                                          | RulesSection                 |
| `siteRules[].id`                                    | Rules                | No editor; stable identity for existing operations  | generated | immediate                                      | SiteRulesSection             |
| `siteRules[].pattern`                               | Rules                | Labelled text input; existing picomatch semantics   | none      | immediate                                      | SiteRulesSection             |
| `siteRules[].action`                                | Rules                | Select: always intercept / always skip / use global | none      | immediate                                      | SiteRulesSection             |
| `uiPrefs.theme`                                     | General / Appearance | Radio/select: system / light / dark                 | system    | immediate                                      | AppearanceSection            |
| `uiPrefs.colorScheme`                               | General / Appearance | Ten presets and Custom from shared/color-schemes.ts | electric  | immediate                                      | AppearanceSection            |
| `uiPrefs.customColorScheme`                         | General / Appearance | NColorPicker; opaque HEX, normalized to six digits  | #737373   | immediate with custom selection                | AppearanceSection            |
| `uiPrefs.locale`                                    | General              | Native names; browser default and all 27 locales    | auto      | immediate                                      | LanguageSection              |
| `diagnostics.maxEvents`                             | Maintenance          | Number: 10–500 entries                              | 100       | draft                                          | MaintenanceSection           |

## Shared behavior

Import/reset staging temporarily turns every field into a local draft until Save or Discard. The section is not its persistence owner: changing tabs must not clear drafts.

Download interception and discovery are independent. Options discovery fields are currently draft-tracked; the popup's media commands update the background immediately. Preserve that distinction and reconcile native storage events without discarding an unsaved Options draft.

Request headers and cookies have separate controls. There is no persisted master Request information switch. The generated board's extra master switch is not an implementation requirement.

General combines connection, appearance and language. Downloads, Rules and Maintenance remain independent. SettingsPage retains visited forms and scroll containers through native Vue show transitions.

## Rule semantics

- Existing first matching website rule wins over later website rules. Match the source page and download hosts using the existing library.
- Interception disabled, self-trigger/scope/scheme handling precedes website rules. The UI must not promise that an Always intercept website entry bypasses these earlier gates.
- Always skip website rules also affect media discovery under its existing contract.
- File-extension normalization and wildcard behavior remain in the existing helpers. Unlisted extensions continue through later filters; they are not automatically the opposite of the listed action.
- The small-file filter leaves torrent descriptors alone. Unknown size follows its configured handling.
- Duplicate handling and immutable handoff IDs are separate safeguards. A visual refresh does not remove either.
- No new reorder editor, MIME editor or regex language is introduced by the raster examples.

## Non-field actions

| Action                                   | Surface                 | Behavior                                                                         |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| Test connection                          | Connection              | Uses draft values; no implicit save; invalidates prior feedback when edited      |
| Save / Discard                           | Global settings footer  | Handles current draft/staged snapshot                                            |
| Add/remove site rule                     | Rules                   | Existing immediate storage behavior outside staging                              |
| Remove excluded host                     | Downloads               | Draft outside the media popup command surface                                    |
| Import settings                          | Maintenance             | Native file selection; parse; stage; explicit Save                               |
| Export settings                          | Maintenance             | Current backup contract; includes configured API secret                          |
| Restore defaults                         | Maintenance             | Accessible confirmation; stage; explicit Save                                    |
| Log filters / pagination / event details | Maintenance             | View state, not persisted configuration                                          |
| Clear log                                | Maintenance             | Confirm; immediate background operation                                          |
| Export diagnostic report                 | Maintenance             | Uses existing report contract; no connection secret, possible diagnostic context |
| Open Rayburst                            | Popup / settings footer | Existing native activation/open operation                                        |
| About                                    | Settings footer         | Small version/support information, not another dashboard                         |

The package version and browser identities are not settings fields. No version bump or release is part of the design handoff.
