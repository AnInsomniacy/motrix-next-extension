# Microsoft Edge Add-ons — Store Listing

This file contains all text content needed for the Microsoft Partner Center submission.

---

## Extension Name

```
Motrix Next
```

## Short Description (132 characters max)

```
Send browser downloads to Motrix Next — a modern download manager powered by aria2 for accelerated multi-threaded downloading.
```

## Detailed Description

```
Motrix Next Extension seamlessly bridges your browser with the Motrix Next desktop download manager. When you download a file, the extension automatically intercepts it and delegates the task to Motrix Next's aria2 engine — unlocking multi-threaded, resumable, and accelerated downloads.

KEY FEATURES

• Automatic Download Interception — Captures browser downloads and routes them to aria2 for multi-threaded acceleration. Works transparently — just download as you normally would.

• Smart Filtering Pipeline — A 6-stage filter decides what to intercept: global toggle, self-trigger guard, URL scheme check, per-site rules, minimum file size, and final verdict.

• Per-Site Rules — Add glob-pattern rules (e.g. *.github.com) to always intercept, always skip, or defer to global settings for specific domains.

• Context Menu — Right-click any link, image, audio, or video and choose "Download with Motrix Next" to send it directly to aria2.

• Magnet Link & Torrent Support — Magnet links and .torrent files are automatically captured and routed to Motrix Next.

• Real-Time Dashboard — The popup displays live download/upload speeds, active/waiting/completed task counts, and connection status.

• Cookie Forwarding (Optional) — Grant enhanced permissions to forward session cookies to aria2, enabling authenticated downloads from private file hosts.

• Auto-Launch — When Motrix Next is not running, the extension can automatically launch it via the motrixnext:// protocol, wait for the RPC service, then retry the download.

• Completion Notifications — Get desktop notifications when downloads are sent and when they finish.

• Appearance Customization — System/Light/Dark themes with 10 Material You color schemes.

• Multi-Language — English, Chinese (Simplified), and Japanese.

HOW IT WORKS

1. Install the extension and configure the RPC port and secret in Settings
2. Make sure Motrix Next is running on your computer with RPC enabled
3. Download any file — the extension intercepts it and sends it to Motrix Next
4. The file downloads through aria2 with multi-threaded acceleration

PRIVACY

This extension does NOT collect, store, or transmit any personal data. All communication occurs between your browser and the locally running Motrix Next app (127.0.0.1). No data is sent to any external server.

REQUIREMENTS

• Motrix Next desktop application (https://github.com/AnInsomniacy/motrix-next)
• aria2 RPC service enabled in Motrix Next

OPEN SOURCE

Free and open source under the MIT License.
Source code: https://github.com/AnInsomniacy/motrix-next-extension
```

## Category

```
Productivity
```

## Privacy Policy URL

```
https://github.com/AnInsomniacy/motrix-next-extension/blob/main/PRIVACY_POLICY.md
```

## Website URL

```
https://github.com/AnInsomniacy/motrix-next
```

## Support URL

```
https://github.com/AnInsomniacy/motrix-next-extension/issues
```

---

## Screenshots

Same screenshots as Chrome Web Store submission:

1. **Popup view**: `docs/store/assets/screenshot-popup.png` (1280×800)
2. **Settings page**: `docs/store/assets/screenshot-settings.png` (1280×800)

> **Note:** Edge accepts the same image dimensions as Chrome (1280×800 or 640×400).

## Additional Notes

- Edge Add-ons does NOT require a small promotional tile (440×280)
- Edge accepts the same ZIP package built for Chrome (`pnpm zip`)
- Edge review typically takes 3-7 business days
