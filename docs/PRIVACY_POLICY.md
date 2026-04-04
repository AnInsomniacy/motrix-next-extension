# Privacy Policy — Motrix Next Extension

**Last updated:** April 4, 2026

## Overview

Motrix Next Extension ("the Extension") is a browser extension that intercepts browser downloads and redirects them to the [Motrix Next](https://github.com/AnInsomniacy/motrix-next) desktop application for accelerated downloading via aria2.

This privacy policy explains what data the Extension accesses, how it is used, and how it is protected.

## Data Collection

**The Extension does not collect, store, transmit, or share any personal data with the developer or any third party.**

The Extension operates entirely on your local machine. All communication occurs exclusively between your browser and the locally running Motrix Next desktop application.

## Data Access

The Extension accesses the following data solely to perform its core functionality:

### Download Metadata

When a browser download is initiated and intercepted by the Extension, it reads:

- **Download URL** — to forward to the local aria2 service
- **Filename** — to display in notifications and pass to aria2
- **HTTP Referer** — to include as a request header for aria2 (required by some servers)
- **File size** — to apply the minimum file size filter

This data is sent only to the aria2 JSON-RPC service running on `127.0.0.1` (localhost) — **never to any external server**.

### Cookies (Optional — User-Initiated Only)

If the user explicitly grants the optional "cookies" permission via Settings → Enhanced Mode:

- The Extension reads cookies for the download URL's domain
- These cookies are forwarded to the local aria2 service as HTTP headers
- This enables authenticated downloads (e.g., from file hosting services that require login)
- **Cookies are never sent to any external server** — only to the locally running aria2 instance

If the user does not grant this permission, no cookies are accessed.

### Local Storage

The Extension stores the following user-configured preferences in `chrome.storage.local`:

- RPC connection settings (port number, secret token)
- Download behavior preferences (enabled/disabled, minimum file size, fallback mode)
- Site rules (per-domain interception settings)
- Appearance settings (theme, color scheme, language)
- Diagnostic event log (a local ring buffer of recent extension events for troubleshooting)

This data never leaves your browser and is not accessible to any external service.

## Network Communication

The Extension makes network requests **only** to the following local addresses:

- `http://127.0.0.1:{port}` — aria2 JSON-RPC endpoint
- `http://localhost:{port}` — aria2 JSON-RPC endpoint (alternative)

Where `{port}` is the user-configured RPC port (default: 16800).

**The Extension does not communicate with any remote servers, cloud services, analytics platforms, or third-party APIs.**

## Permissions Explained

| Permission | Why It's Needed |
|---|---|
| `downloads` | Intercept, pause, cancel, and erase browser downloads that are delegated to aria2 |
| `storage` | Save user settings, site rules, and diagnostic logs locally |
| `contextMenus` | Add "Download with Motrix Next" to the right-click menu |
| `notifications` | Show desktop notifications for download events |
| `cookies` *(optional)* | Forward cookies to local aria2 for authenticated downloads |
| `downloads.ui` *(optional)* | Hide the browser download bar after interception |
| `http://127.0.0.1/*`, `http://localhost/*` | Communicate with the local aria2 RPC service |
| `https://*/*`, `http://*/*` *(optional)* | Read cookies from any origin (required for cookie forwarding) |

## Third-Party Services

The Extension does not integrate with, send data to, or receive data from any third-party services. There are no analytics, telemetry, advertising, or tracking mechanisms.

## Data Retention

- **Download metadata** is used transiently during interception and is not persisted
- **User settings** remain in local storage until the user clears them or uninstalls the Extension
- **Diagnostic logs** use a fixed-size ring buffer (default 30 entries) and are automatically overwritten

## Children's Privacy

The Extension does not knowingly collect any information from children under the age of 13.

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this document with an updated "Last updated" date. Continued use of the Extension after changes constitutes acceptance of the updated policy.

## Open Source

The Extension is open source under the MIT License. The complete source code is available for inspection at:

https://github.com/AnInsomniacy/motrix-next-extension

## Contact

For privacy-related questions or concerns, please open an issue on the GitHub repository:

https://github.com/AnInsomniacy/motrix-next-extension/issues
