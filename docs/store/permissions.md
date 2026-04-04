# Permission Justifications

Text to enter in the Chrome Web Store Developer Dashboard when prompted to justify each permission.

---

## Required Permissions

### `downloads`

```
The 'downloads' permission is the core of this extension's functionality. When a browser download starts, the extension intercepts it by pausing the download, extracting the URL and metadata, and forwarding them to the locally running Motrix Next desktop application via aria2 JSON-RPC. After successful delegation, the original browser download is cancelled and erased. Without this permission, the extension cannot intercept or manage downloads.
```

### `storage`

```
Used to persist user-configured settings in chrome.storage.local, including: RPC connection parameters (port number, authentication token), download behavior preferences (enabled/disabled, minimum file size threshold, browser fallback mode), per-site interception rules, appearance preferences (theme, color scheme, language), and a diagnostic event log for troubleshooting. No data is ever sent to any remote server — all storage is local-only.
```

### `contextMenus`

```
Adds a single "Download with Motrix Next" context menu item that appears when right-clicking on links, images, audio, and video elements. This allows users to manually send a specific resource to the Motrix Next download manager without relying on automatic interception. The context menu is registered once at extension startup and its title updates to match the user's selected language.
```

### `notifications`

```
Displays brief desktop notifications to inform the user about download events: (1) when a download is successfully intercepted and sent to aria2, showing the filename; (2) when a download fails to be sent, with an error description; (3) when a fallback to the browser's native download occurs; (4) when a tracked download completes in aria2. Users can disable notifications in Settings.
```

## Required Host Permissions

### `http://127.0.0.1/*` and `http://localhost/*`

```
Required to communicate with the aria2 JSON-RPC service running on the user's local machine inside the Motrix Next desktop application. This is the ONLY network communication the extension makes. The extension sends HTTP POST requests to http://127.0.0.1:{port}/jsonrpc (default port: 16800) to submit download tasks, check connection status, and query download progress. No requests are ever made to any remote server.
```

## Optional Permissions

### `cookies`

```
When the user explicitly enables "Enhanced Mode → Cookie Forwarding" in the extension's Settings page, this permission is requested to read cookies for the download URL's domain. The cookies are forwarded to the locally running aria2 service as HTTP request headers, enabling authenticated downloads from sites that require login (e.g., private file hosting services). Cookies are sent ONLY to the local aria2 instance (127.0.0.1) — never to any external server. This permission is never requested automatically; the user must manually grant it through the Settings UI.
```

### `downloads.ui`

```
When the user enables "Enhanced Mode → Hide Browser Download Bar" in Settings, this optional permission is used to call chrome.downloads.setUiOptions() to suppress the browser's native download shelf after a download has been intercepted and delegated to Motrix Next. This prevents an unnecessary empty download bar from appearing. Only available on Chrome 115+; the extension gracefully degrades on older versions.
```

### Optional Host: `https://*/*` and `http://*/*`

```
This broad host permission is requested ONLY when the user explicitly enables Cookie Forwarding in Enhanced Mode. It is required because chrome.cookies.getAll() needs matching host permissions for the target download domain to successfully read cookies. Without this permission, the cookies API cannot access cookies for arbitrary download URLs. This permission is never requested automatically — the user must manually grant it through the Settings page. When not granted, the extension functions normally without cookie forwarding.
```

---

## Privacy Practices (Dashboard Section)

### Single Purpose Description

```
Intercept browser downloads and delegate them to the Motrix Next desktop download manager for accelerated multi-threaded downloading via aria2.
```

### Permission Justification Summary

```
This extension intercepts browser downloads and sends them to a locally running download manager (Motrix Next / aria2). Required permissions: 'downloads' to intercept browser downloads, 'storage' for local settings persistence, 'contextMenus' for right-click download option, 'notifications' for download status alerts. Host permissions are limited to localhost (127.0.0.1) for communicating with the local aria2 RPC service. Optional permissions (cookies, downloads.ui) are only requested when the user explicitly enables Enhanced Mode. No data is collected, transmitted, or shared with any external service.
```

### Data Use Disclosures

```
- Personally identifiable information: NOT collected
- Health information: NOT collected
- Financial and payment information: NOT collected
- Authentication information: NOT collected
- Personal communications: NOT collected
- Location: NOT collected
- Web history: NOT collected
- User activity: NOT collected
- Website content: NOT collected
```
