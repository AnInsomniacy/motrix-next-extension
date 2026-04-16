import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import type { WakeDeps } from '@/lib/services/wake';
import { evaluateFilterPipeline, createFilterPipeline } from './filter';
import { MetadataCollector } from './metadata-collector';
import { NotificationService } from '@/lib/services/notification';
import { extractFilenameFromUrl } from '@/shared/url';
import { RpcUnreachableError, RpcTimeoutError, DocumentUrlError } from '@/shared/errors';

// ─── Constants ──────────────────────────────────────────

const TORRENT_MIME = 'application/x-bittorrent';

// ─── Dependency Interface ───────────────────────────────

export interface OrchestratorDeps {
  aria2: {
    addUri: (uris: string[], options?: Record<string, unknown>) => Promise<string>;
    addTorrent: (base64: string, options?: Record<string, unknown>) => Promise<string>;
  };
  downloads: {
    cancel: (id: number) => Promise<void>;
    erase: (query: { id: number }) => Promise<void>;
  };
  notifications: {
    create: (id: string, options: Record<string, unknown>) => Promise<string>;
  };
  cookies: {
    getAll: (details: { url: string }) => Promise<Array<{ name: string; value: string }>>;
  };
  diagnosticLog: {
    append: (event: DiagnosticInput) => void;
  };
  getSettings: () => DownloadSettings;
  getSiteRules: () => SiteRule[];
  getTabUrl: (id?: number) => Promise<string>;
  hasEnhancedPermissions: () => boolean;
  onSent?: (gid: string, filename: string) => void;

  /** Wake service for auto-launching the app. Optional — degrades gracefully. */
  wakeService?: {
    wakeAndWaitForRpc: (deps: WakeDeps) => Promise<boolean>;
  };
  /** Open the motrixnext:// protocol URL. Returns cleanup fn to close tab. */
  openProtocol?: () => Promise<() => void>;
  /** Return true if aria2 RPC is currently reachable (heartbeat check). */
  checkRpc?: () => Promise<boolean>;
  /**
   * Route a URL to the desktop app via `motrixnext://new?url=...` deep link.
   * The desktop app shows its native "Add Task" dialog with file selection.
   * Used for torrent/magnet URLs that need user interaction before download.
   */
  openProtocolNewTask?: (url: string, referer: string) => Promise<void>;
  /** Custom fetch for DI in tests. Defaults to globalThis.fetch. */
  fetchFn?: typeof fetch;
}

/** Shape of a browser DownloadItem as received from chrome.downloads events. */
interface DownloadItem {
  id: number;
  url: string;
  finalUrl: string;
  filename: string;
  fileSize: number;
  mime: string;
  byExtensionId?: string;
  state: string;
}

// ─── Orchestrator ───────────────────────────────────────

/**
 * Central download interception orchestrator.
 *
 * Called from onDeterminingFilename — download is suspended by Chrome until
 * the caller invokes suggest(). No pause() needed.
 *
 * Flow: filter → collect metadata → addUri/addTorrent → cancel/erase
 * On failure: wake-and-retry → return false (fallback) or cancel (no fallback)
 */
export class DownloadOrchestrator {
  private readonly deps: OrchestratorDeps;
  private readonly metadataCollector = new MetadataCollector();
  private readonly filterStages;
  private readonly fetchFn: typeof fetch;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
    this.filterStages = createFilterPipeline(() => deps.getSiteRules());
    this.fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Handle a download interception event.
   *
   * Called from `onDeterminingFilename` — the download is suspended by Chrome
   * until the caller invokes `suggest()`. No `pause()` is needed.
   *
   * @returns `true` if the download was intercepted (cancel called),
   *          `false` if the browser should continue (caller calls suggest).
   */
  async handleCreated(item: DownloadItem): Promise<boolean> {
    const settings = this.deps.getSettings();
    const tabUrl = await this.deps.getTabUrl();

    // ─── Filter ───────────────────────────────────
    const ctx: FilterContext = {
      url: item.url,
      finalUrl: item.finalUrl,
      filename: item.filename,
      fileSize: item.fileSize,
      mimeType: item.mime,
      tabUrl,
      byExtensionId: item.byExtensionId,
    };

    const verdict = evaluateFilterPipeline(ctx, settings, this.filterStages);

    if (verdict === 'skip') {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_skipped',
        message: `Skipped: ${item.url}`,
        context: { url: item.url },
      });
      return false;
    }

    // No pause() needed — onDeterminingFilename holds the download in pending
    // state until the caller invokes suggest().

    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_intercepted',
      message: `Intercepted: ${item.url}`,
      context: { url: item.url, fileSize: item.fileSize, mime: item.mime },
    });

    // ─── Collect Metadata ─────────────────────────
    // Resolve a display filename for logging and notifications.
    // We intentionally do NOT pass `out` to aria2 — aria2 has superior
    // filename resolution via Content-Disposition, redirected URLs, and
    // URL path segments (see aria2 HttpResponse.cc:determineFilename()).
    const displayName =
      item.filename || extractFilenameFromUrl(item.finalUrl || item.url) || 'download';

    // Prefer finalUrl — the post-redirect URL that Chrome actually downloaded from.
    // Many cloud storage services (Lanzou, MediaFire, etc.) return an HTML landing
    // page at item.url, then redirect to a CDN URL. Without finalUrl, aria2 would
    // re-request the landing page and download HTML instead of the actual file.
    const effectiveUrl = item.finalUrl || item.url;
    const aria2Options = await this.buildAria2Options(effectiveUrl, tabUrl);
    const isTorrent = this.isTorrentDownload(item.mime, effectiveUrl);

    // ─── Torrent / Magnet: route to desktop app for file selection ───
    // The desktop app's handleDeepLinkUrls now correctly detects remote
    // .torrent URLs (via detectKind) and fetches them through Rust IPC,
    // shows the Add Task dialog with file selection, then submits via
    // addTorrent — identical UX to dragging a local .torrent into Motrix.
    if (isTorrent && this.deps.openProtocolNewTask) {
      await this.safeCancel(item.id);
      await this.deps.openProtocolNewTask(effectiveUrl, tabUrl);
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_routed',
        message: `Routed to desktop: ${displayName}`,
        context: { url: item.url, filename: displayName, torrent: true },
      });
      return true;
    }

    // ─── Torrent fallback: fetch → base64 → addTorrent ──────
    // When deep link is unavailable, submit directly via aria2 RPC.
    // No file selection UI, but the torrent is correctly parsed as BT.
    if (isTorrent) {
      try {
        const gid = await this.submitTorrent(effectiveUrl, aria2Options);
        await this.safeCancel(item.id);
        this.onSendSuccess(gid, displayName, item.url, settings);
        return true;
      } catch (torrentError) {
        this.deps.diagnosticLog.append({
          level: 'warn',
          code: 'download_fallback',
          message: `Torrent submit failed, trying addUri: ${displayName}`,
          context: { url: item.url, error: String(torrentError) },
        });
      }
    }

    try {
      const gid = await this.deps.aria2.addUri([effectiveUrl], aria2Options);

      // ─── Success: cancel browser download ─────
      await this.safeCancel(item.id);

      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_sent',
        message: `Sent: ${displayName}`,
        context: { url: effectiveUrl, filename: displayName, gid },
      });

      // ─── Track for completion ──────────────────
      this.deps.onSent?.(gid, displayName);

      // ─── Notify ─────────────────────────────────
      if (settings.notifyOnStart) {
        const notification = NotificationService.buildSentNotification(displayName, item.id);
        await this.deps.notifications.create(
          notification.id,
          notification.options as Record<string, unknown>,
        );
      }

      return true;
    } catch (error) {
      // ─── Wake + Retry ──────────────────────────
      const retryGid = await this.tryWakeAndRetry(
        error,
        settings,
        () => this.deps.aria2.addUri([effectiveUrl], aria2Options),
        displayName,
        effectiveUrl,
      );

      if (retryGid !== null) {
        await this.safeCancel(item.id);
        this.deps.onSent?.(retryGid, displayName);

        if (settings.notifyOnStart) {
          const notification = NotificationService.buildSentNotification(displayName, item.id);
          await this.deps.notifications.create(
            notification.id,
            notification.options as Record<string, unknown>,
          );
        }
        return true;
      }

      // ─── Fallback / Cancel ─────────────────────────
      if (settings.fallbackToBrowser) {
        this.deps.diagnosticLog.append({
          level: 'warn',
          code: 'download_fallback',
          message: `Fallback: ${effectiveUrl}`,
          context: { url: effectiveUrl, error: String(error) },
        });
        return false;
      } else {
        await this.safeCancel(item.id);
        this.deps.diagnosticLog.append({
          level: 'error',
          code: 'download_failed',
          message: `Failed: ${effectiveUrl}`,
          context: { url: effectiveUrl, error: String(error) },
        });
        return true;
      }
    }
  }

  /**
   * Cancel and erase a browser download, ignoring errors if the download
   * has already been cancelled or removed.
   */
  private async safeCancel(id: number): Promise<void> {
    try {
      await this.deps.downloads.cancel(id);
    } catch {
      /* download may already be gone */
    }
    try {
      await this.deps.downloads.erase({ id });
    } catch {
      /* already removed from history */
    }
  }

  /**
   * Send a URL directly to aria2 (e.g. from context menu or magnet interception).
   *
   * Handles: metadata collection → header building → addUri → wake-retry → diagnostics → notification.
   * Throws on aria2 failure only after wake-retry is exhausted.
   *
   * @returns The aria2 GID for the submitted download
   */
  async sendUrl(url: string, tabUrl: string): Promise<string> {
    const settings = this.deps.getSettings();
    const isTorrent = this.isTorrentDownload('', url);
    const isMagnet = url.startsWith('magnet:');

    // ─── Torrent / Magnet: route to desktop app for file selection ───
    if ((isTorrent || isMagnet) && this.deps.openProtocolNewTask) {
      const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';
      await this.deps.openProtocolNewTask(url, tabUrl);
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_routed',
        message: `Routed to desktop: ${displayName}`,
        context: { url, torrent: isTorrent, magnet: isMagnet },
      });
      return 'routed-to-desktop';
    }

    // ─── Torrent fallback: fetch → base64 → addTorrent ──────
    if (isTorrent) {
      const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';
      const aria2Options = await this.buildAria2Options(url, tabUrl);
      try {
        const gid = await this.submitTorrent(url, aria2Options);
        this.onSendSuccess(gid, displayName, url, settings);
        return gid;
      } catch (error) {
        const retryGid = await this.tryWakeAndRetry(
          error,
          settings,
          async () => this.submitTorrent(url, aria2Options),
          displayName,
          url,
        );
        if (retryGid !== null) {
          this.onSendSuccess(retryGid, displayName, url, settings);
          return retryGid;
        }
        this.deps.diagnosticLog.append({
          level: 'error',
          code: 'download_failed',
          message: `Failed: ${url}`,
          context: { url, error: String(error) },
        });
        throw error;
      }
    }

    // ─── HTTP / FTP: resolve redirects, then addUri ──────────
    // Context menu provides the raw link href, which for cloud storage
    // services is often a landing page URL that HTTP-redirects to the
    // actual CDN download URL. Follow redirects via HEAD to discover
    // the real URL before handing off to aria2.
    const resolved = await this.resolveRedirects(url);

    // If the HEAD response reveals a document page (text/html without
    // Content-Disposition: attachment), the URL is a landing page that
    // uses JavaScript to generate the real download link. Throw so the
    // caller can open it in the browser — the page’s JS will trigger
    // the actual download, which handleCreated() will intercept.
    if (resolved.isDocument) {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_browser_redirect',
        message: `Document URL detected, deferring to browser: ${url}`,
        context: { url, resolvedUrl: resolved.url },
      });
      throw new DocumentUrlError(url);
    }

    const resolvedUrl = resolved.url;
    const displayName =
      extractFilenameFromUrl(resolvedUrl) || resolvedUrl.split('/').pop() || 'download';
    const aria2Options = await this.buildAria2Options(resolvedUrl, tabUrl);

    // ─── Send to aria2 ────────────────────────────
    try {
      const gid = await this.deps.aria2.addUri([resolvedUrl], aria2Options);
      this.onSendSuccess(gid, displayName, resolvedUrl, settings);
      return gid;
    } catch (error) {
      // ─── Wake + Retry ──────────────────────────
      const retryGid = await this.tryWakeAndRetry(
        error,
        settings,
        () => this.deps.aria2.addUri([resolvedUrl], aria2Options),
        displayName,
        resolvedUrl,
      );

      if (retryGid !== null) {
        this.onSendSuccess(retryGid, displayName, resolvedUrl, settings);
        return retryGid;
      }

      this.deps.diagnosticLog.append({
        level: 'error',
        code: 'download_failed',
        message: `Failed: ${resolvedUrl}`,
        context: { url: resolvedUrl, error: String(error) },
      });
      throw error;
    }
  }

  // ─── Private Helpers ────────────────────────────────

  /**
   * Shared success handler for both handleCreated and sendUrl.
   */
  private onSendSuccess(
    gid: string,
    displayName: string,
    url: string,
    settings: DownloadSettings,
  ): void {
    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_sent',
      message: `Sent: ${displayName}`,
      context: { url, filename: displayName, gid },
    });

    this.deps.onSent?.(gid, displayName);

    if (settings.notifyOnStart) {
      const notification = NotificationService.buildSentNotification(displayName, Date.now());
      void this.deps.notifications.create(
        notification.id,
        notification.options as Record<string, unknown>,
      );
    }
  }

  /**
   * Attempt to wake the desktop app and retry the RPC call.
   *
   * Shared by handleCreated() and sendUrl() to avoid code duplication.
   * Returns the GID on success, null if wake is unavailable or failed.
   */
  private async tryWakeAndRetry(
    error: unknown,
    settings: DownloadSettings,
    retryFn: () => Promise<string>,
    displayName: string,
    url: string,
  ): Promise<string | null> {
    const isUnreachable = error instanceof RpcUnreachableError || error instanceof RpcTimeoutError;

    if (
      !isUnreachable ||
      !settings.autoLaunchApp ||
      !this.deps.wakeService ||
      !this.deps.openProtocol ||
      !this.deps.checkRpc
    ) {
      return null;
    }

    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_wake_attempt',
      message: `Waking app for: ${displayName}`,
      context: { url },
    });

    const woke = await this.deps.wakeService.wakeAndWaitForRpc({
      openProtocol: this.deps.openProtocol,
      checkRpc: this.deps.checkRpc,
    });

    if (!woke) return null;

    try {
      return await retryFn();
    } catch {
      return null; // Retry also failed — caller handles fallback.
    }
  }

  /**
   * Detect whether a download is a `.torrent` file by MIME type or URL extension.
   */
  private isTorrentDownload(mime: string, url: string): boolean {
    if (mime === TORRENT_MIME) return true;
    try {
      const pathname = new URL(url).pathname;
      return pathname.endsWith('.torrent');
    } catch {
      return url.endsWith('.torrent');
    }
  }

  /**
   * Follow HTTP redirects via HEAD to discover the actual download URL.
   *
   * Context menus provide the raw link `href`, which for cloud storage
   * services (Lanzou, MediaFire, etc.) is often a landing page URL that
   * HTTP-redirects to the actual CDN download URL. By resolving redirects
   * here, we send the final URL to aria2 — matching what the browser does
   * when the user clicks the link normally.
   *
   * Additionally detects document responses (text/html without
   * Content-Disposition: attachment) so the caller can fall back to
   * browser navigation for JavaScript-based download pages.
   *
   * Design decisions:
   * - HEAD (not GET) to avoid downloading the response body
   * - 10-second timeout to avoid indefinite UI blocking
   * - Graceful fallback: returns the original URL on any error
   * - Redirect limit of 10 hops (browser default) to prevent loops
   */
  private async resolveRedirects(url: string): Promise<{ url: string; isDocument: boolean }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await this.fetchFn(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const finalUrl = response.url || url;
      const contentType = response.headers?.get?.('content-type') ?? '';
      const contentDisposition = response.headers?.get?.('content-disposition') ?? '';

      // Detect document pages: Content-Type is text/html (or similar) AND
      // the server did NOT set Content-Disposition: attachment (which would
      // indicate the HTML file itself IS the intended download).
      const mimeBase = (contentType.split(';')[0] ?? '').trim().toLowerCase();
      const isHtmlLike =
        mimeBase === 'text/html' || mimeBase === 'application/xhtml+xml' || mimeBase === 'text/xml';
      const isAttachment = /attachment/i.test(contentDisposition);
      const isDocument = isHtmlLike && !isAttachment;

      return { url: finalUrl, isDocument };
    } catch {
      // Network error, timeout, CORS — return original URL.
      // This preserves existing behavior for direct download URLs.
      return { url, isDocument: false };
    }
  }

  /**
   * Build aria2 options (headers, cookies) for a URL.
   * Shared by handleCreated and sendUrl to eliminate duplication.
   */
  private async buildAria2Options(url: string, tabUrl: string): Promise<Record<string, unknown>> {
    const enhanced = this.deps.hasEnhancedPermissions();

    const metadata = await this.metadataCollector.collectMetadata({
      url,
      filename: '', // not used for aria2 options
      tabUrl,
      cookiesApi: enhanced ? this.deps.cookies : null,
      hasEnhancedPermissions: enhanced,
    });

    const headers = MetadataCollector.buildAria2Headers(metadata);
    const options: Record<string, unknown> = {};
    if (headers.length > 0) {
      options.header = headers;
    }
    return options;
  }

  /**
   * Fetch a remote .torrent file, base64-encode it, and submit via addTorrent.
   *
   * This ensures aria2 parses the torrent metadata and creates a proper BT
   * download task — unlike addUri which would download the .torrent file itself
   * as a regular file.
   *
   * The fetch uses the same credentials (cookies, referer) that would be sent
   * by the browser, ensuring authenticated torrent downloads work correctly.
   */
  private async submitTorrent(url: string, aria2Options: Record<string, unknown>): Promise<string> {
    const response = await this.fetchFn(url);
    if (!response.ok) {
      throw new Error(`Torrent fetch failed: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    const base64 = this.arrayBufferToBase64(buffer);
    return this.deps.aria2.addTorrent(base64, aria2Options);
  }

  /**
   * Convert an ArrayBuffer to a base64-encoded string.
   * Uses chunked btoa to avoid call-stack overflow on large buffers.
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 0x8000; // 32 KiB — safe for String.fromCharCode.apply
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode.apply(null, [...bytes.subarray(i, i + CHUNK)]));
    }
    return btoa(chunks.join(''));
  }
}
