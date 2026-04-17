# Chrome Web Store — Store Listing

This file contains all text content needed for the Chrome Web Store Developer Dashboard submission.

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

⸻ KEY FEATURES ⸻

• Automatic Download Interception
  Captures browser downloads and routes them to aria2 for multi-threaded acceleration. Works transparently — just download as you normally would.

• Smart Filtering Pipeline
  A 6-stage filter decides what to intercept: global toggle → self-trigger guard → URL scheme check → per-site rules → minimum file size → final verdict.

• Per-Site Rules
  Add glob-pattern rules (e.g. *.github.com) to always intercept, always skip, or defer to global settings for specific domains.

• Context Menu Integration
  Right-click any link, image, audio, or video and choose "Download with Motrix Next" to send it directly to aria2.

• Magnet Link Support
  Clicks on magnet: links are automatically captured and routed to Motrix Next.

• Torrent File Handling
  Intercepted .torrent files are forwarded to aria2 for immediate BitTorrent download.

• Real-Time Dashboard
  The popup displays live download/upload speeds, active/waiting/completed task counts, and connection status.

• Cookie Forwarding (Optional)
  Grant enhanced permissions to forward session cookies to aria2 — enabling authenticated downloads from private file hosts.

• Auto-Launch
  When Motrix Next is not running, the extension can automatically launch it via the motrixnext:// protocol, wait for the RPC service to become available, then retry the download.

• Download Bar Control (Optional)
  Hide Chrome's native download shelf after a download has been intercepted, keeping your browser clean.

• Completion Notifications
  Get desktop notifications when downloads are sent to aria2 and when they finish.

• Appearance Customization
  Choose from System/Light/Dark themes and 10 Material You color schemes.

• Multi-Language Support
  Full English, Chinese (Simplified), Chinese (Traditional), and Japanese localization.

• Diagnostics
  Built-in event log with severity levels for troubleshooting interception issues.

⸻ HOW IT WORKS ⸻

1. Install the extension and configure the RPC port and secret in Settings
2. Make sure Motrix Next is running on your computer with RPC enabled
3. Download any file — the extension intercepts it and sends it to Motrix Next
4. The file downloads through aria2 with multi-threaded acceleration

⸻ PRIVACY ⸻

This extension does NOT collect, store, or transmit any personal data. All communication occurs exclusively between your browser and the Motrix Next app running on your local machine (127.0.0.1). No data is ever sent to any external server. Full privacy policy: https://github.com/AnInsomniacy/motrix-next-extension/blob/main/PRIVACY_POLICY.md

⸻ REQUIREMENTS ⸻

• Motrix Next desktop application (https://github.com/AnInsomniacy/motrix-next)
• aria2 RPC service enabled in Motrix Next

⸻ OPEN SOURCE ⸻

This extension is free and open source under the MIT License.
Source code: https://github.com/AnInsomniacy/motrix-next-extension
```

## Category

```
Productivity
```

## Language

```
English, Chinese (Simplified), Chinese (Traditional), Japanese
```

## Privacy Policy URL

```
https://github.com/AnInsomniacy/motrix-next-extension/blob/main/PRIVACY_POLICY.md
```

## Website URL (optional)

```
https://github.com/AnInsomniacy/motrix-next
```

---

## Screenshots

Use the resized screenshots from `docs/store/assets/`. The Chrome Web Store requires 1280×800 or 640×400 pixel images.

1. **Popup — Connected State**: `docs/store/assets/screenshot-popup.png` (1280×800)
2. **Settings — Connection**: `docs/store/assets/screenshot-settings.png` (1280×800)

> **Note:** You should take additional screenshots yourself and add them here. Recommended:
>
> - Settings page with site rules configured
> - Settings page with appearance/theme options
> - Context menu showing "Download with Motrix Next"

## Promotional Images

### Small Promotional Tile (440×280) — Required

> **Note:** You need to create this image. It should feature:
>
> - The Motrix Next extension icon
> - The text "Motrix Next"
> - A brief tagline like "Accelerated Downloads"
> - Dark background matching the extension's theme

### Marquee Promotional Image (1400×560) — Optional but Recommended

> **Note:** Optional. Only needed if you want to be featured on the CWS homepage.
