import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import type { WakeDeps } from '@/lib/services/wake';
import { evaluateFilterPipeline, createFilterPipeline } from './filter';
import { MetadataCollector } from './metadata-collector';
import { NotificationService } from '@/lib/services/notification';
import { extractFilenameFromUrl } from '@/shared/url';
import { RpcUnreachableError, RpcTimeoutError } from '@/shared/errors';

// ─── Constants ──────────────────────────────────────────

const TORRENT_MIME = 'application/x-bittorrent';

// ─── Dependency Interface ───────────────────────────────

export interface OrchestratorDeps {
  aria2: {
    addUri: (uris: string[], options?: Record<string, unknown>) => Promise<string>;
    addTorrent: (base64: string, options?: Record<string, unknown>) => Promise<string>;
  };
  downloads: {
    pause: (id: number) => Promise<void>;
    resume: (id: number) => Promise<void>;
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

/** Shape of a browser DownloadItem as received from chrome.downloads.onCreated */
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
 * Flow: filter → pause → collect metadata → addUri/addTorrent → cancel/erase
 * On failure: wake-and-retry → resume (fallback) or cancel (no fallback)
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

  async handleCreated(item: DownloadItem): Promise<void> {
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
      return;
    }

    // ─── Pause ────────────────────────────────────
    await this.deps.downloads.pause(item.id);

    // ─── Collect Metadata ─────────────────────────
    // Resolve a display filename for logging and notifications.
    // We intentionally do NOT pass `out` to aria2 — aria2 has superior
    // filename resolution via Content-Disposition, redirected URLs, and
    // URL path segments (see aria2 HttpResponse.cc:determineFilename()).
    const displayName =
      item.filename || extractFilenameFromUrl(item.finalUrl || item.url) || 'download';

    const aria2Options = await this.buildAria2Options(item.url, tabUrl);
    const effectiveUrl = item.finalUrl || item.url;
    const isTorrent = this.isTorrentDownload(item.mime, effectiveUrl);

    // ─── Torrent / Magnet: route to desktop app for file selection ───
    // The desktop app's handleDeepLinkUrls now correctly detects remote
    // .torrent URLs (via detectKind) and fetches them through Rust IPC,
    // shows the Add Task dialog with file selection, then submits via
    // addTorrent — identical UX to dragging a local .torrent into Motrix.
    if (isTorrent && this.deps.openProtocolNewTask) {
      await this.deps.downloads.cancel(item.id);
      await this.deps.downloads.erase({ id: item.id });
      await this.deps.openProtocolNewTask(effectiveUrl, tabUrl);
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_routed',
        message: `Routed to desktop: ${displayName}`,
        context: { url: item.url, filename: displayName, torrent: true },
      });
      return;
    }

    // ─── Torrent fallback: fetch → base64 → addTorrent ──────
    // When deep link is unavailable, submit directly via aria2 RPC.
    // No file selection UI, but the torrent is correctly parsed as BT.
    if (isTorrent) {
      try {
        const gid = await this.submitTorrent(effectiveUrl, aria2Options);
        await this.deps.downloads.cancel(item.id);
        await this.deps.downloads.erase({ id: item.id });
        this.onSendSuccess(gid, displayName, item.url, settings);
        return;
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
      const gid = await this.deps.aria2.addUri([item.url], aria2Options);

      // ─── Success: cancel browser download ─────
      await this.deps.downloads.cancel(item.id);
      await this.deps.downloads.erase({ id: item.id });

      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_sent',
        message: `Sent: ${displayName}`,
        context: { url: item.url, filename: displayName, gid },
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
    } catch (error) {
      // ─── Wake + Retry ──────────────────────────
      const retryGid = await this.tryWakeAndRetry(
        error,
        settings,
        () => this.deps.aria2.addUri([item.url], aria2Options),
        displayName,
        item.url,
      );

      if (retryGid !== null) {
        await this.deps.downloads.cancel(item.id);
        await this.deps.downloads.erase({ id: item.id });
        this.deps.onSent?.(retryGid, displayName);

        if (settings.notifyOnStart) {
          const notification = NotificationService.buildSentNotification(displayName, item.id);
          await this.deps.notifications.create(
            notification.id,
            notification.options as Record<string, unknown>,
          );
        }
        return;
      }

      // ─── Fallback / Cancel ─────────────────────────
      if (settings.fallbackToBrowser) {
        await this.deps.downloads.resume(item.id);
        this.deps.diagnosticLog.append({
          level: 'warn',
          code: 'download_fallback',
          message: `Fallback: ${item.url}`,
          context: { url: item.url, error: String(error) },
        });
      } else {
        await this.deps.downloads.cancel(item.id);
        this.deps.diagnosticLog.append({
          level: 'error',
          code: 'download_failed',
          message: `Failed: ${item.url}`,
          context: { url: item.url, error: String(error) },
        });
      }
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
    const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';
    const isTorrent = this.isTorrentDownload('', url);
    const isMagnet = url.startsWith('magnet:');

    // ─── Torrent / Magnet: route to desktop app for file selection ───
    if ((isTorrent || isMagnet) && this.deps.openProtocolNewTask) {
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

    // ─── Magnet / HTTP / FTP: addUri directly ────────────────
    // aria2 handles magnet URIs natively — no pre-processing needed.

    const aria2Options = await this.buildAria2Options(url, tabUrl);

    // ─── Send to aria2 ────────────────────────────
    try {
      const gid = await this.deps.aria2.addUri([url], aria2Options);
      this.onSendSuccess(gid, displayName, url, settings);
      return gid;
    } catch (error) {
      // ─── Wake + Retry ──────────────────────────
      const retryGid = await this.tryWakeAndRetry(
        error,
        settings,
        () => this.deps.aria2.addUri([url], aria2Options),
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
