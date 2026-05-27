# Permission Justifications

Text to enter in the Chrome Web Store Developer Dashboard when prompted to justify each permission.

---

## Required Permissions

### `downloads`

```
The 'downloads' permission is the core of this extension's functionality. When a browser download starts, the extension evaluates it against the user's rules, extracts the URL and metadata, and forwards it to the locally running Motrix Next desktop application via its HTTP API. After successful delegation, the original browser download is cancelled and erased. Without this permission, the extension cannot intercept or manage downloads.
```

### `storage`

```
Used to persist user-configured settings in chrome.storage.local, including: API connection parameters (port number, authentication token), download behavior preferences (enabled/disabled, auto-launch, cookie forwarding, download bar visibility), per-site interception rules, appearance preferences (theme, color scheme, language), and a diagnostic event log for troubleshooting. No data is ever sent to any remote server — all storage is local-only.
```

### `contextMenus`

```
Adds a single "Download with Motrix Next" context menu item that appears when right-clicking on links, images, audio, and video elements. This allows users to manually send a specific resource to the Motrix Next download manager without relying on automatic interception. The context menu is registered once at extension startup and its title updates to match the user's selected language.
```

### `notifications`

```
Displays a brief desktop notification when an intercepted download cannot be delivered to Motrix Next. The desktop app owns normal task start, progress, completion, and error notifications.
```

### `webRequest`

```
Observes request and response headers for downloads that are already being intercepted through the downloads API. Request headers are filtered to a strict allowlist and forwarded only to the local Motrix Next API so the desktop app can reproduce browser-authenticated downloads more accurately. Users can disable request header forwarding in Settings. Response headers are used to read Content-Disposition filenames before the browser download is cancelled. The extension does not modify, block, redirect, or transmit remote requests to any external service.
```

## Required Host Permissions

### `http://127.0.0.1/*` and `http://localhost/*`

```
Required to communicate with the Motrix Next HTTP API running on the user's local machine inside the desktop application. This is the ONLY network communication the extension makes. The extension sends requests to http://127.0.0.1:{port} (default port: 16801) to submit download tasks, check connection status, query stats, and control tasks. No requests are ever made to any remote server.
```

### `cookies`

```
Required to read cookies for the download URL's domain when cookie forwarding is enabled. Cookie forwarding is enabled by default so authenticated downloads work immediately for sites that require login, such as private file hosting services. Cookies are sent ONLY to the local Motrix Next instance (127.0.0.1) and are never placed in protocol fallback URLs. Users can disable cookie forwarding in Settings.
```

### `https://*/*` and `http://*/*`

```
Required because chrome.cookies.getAll() and webRequest need matching host permissions for the target download domain. Since delegated downloads can originate from any site, broad HTTP and HTTPS access is necessary for authenticated downloads, request context preservation, and response filename header preservation. Cookies, filtered request metadata, and filename metadata are sent only to the local Motrix Next HTTP API.
```

## Optional Permissions

### `downloads.ui`

```
When the user enables "Hide Browser Download Bar" in Settings, this optional permission is requested and then used to call chrome.downloads.setUiOptions() to suppress the browser's native download shelf after downloads are intercepted and delegated to Motrix Next. Only available on Chrome 115+; the extension gracefully degrades on browsers that do not support this API.
```

---

## Privacy Practices (Dashboard Section)

### Single Purpose Description

```
Intercept browser downloads and delegate them to the Motrix Next desktop download manager for accelerated multi-threaded downloading via aria2.
```

### Permission Justification Summary

```
This extension intercepts browser downloads and sends them to a locally running download manager (Motrix Next). Required permissions: 'downloads' to intercept browser downloads, 'webRequest' to observe filtered request headers and Content-Disposition response headers for the same intercepted downloads, 'storage' for local settings persistence, 'contextMenus' for right-click download option, 'notifications' for delivery failure alerts, and 'cookies' for authenticated download forwarding. Required host permissions include localhost for the Motrix Next HTTP API plus broad HTTP/HTTPS origins so cookie forwarding, request context forwarding, and filename header preservation work for downloads from any site. The only optional permission is 'downloads.ui' for hiding the browser download bar. No data is collected, transmitted, or shared with any external service.
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
