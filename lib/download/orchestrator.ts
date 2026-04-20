import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import { evaluateFilterPipeline, createFilterPipeline } from './filter';
import { extractFilenameFromUrl } from '@/shared/url';
import type { DesktopApiClient } from '@/lib/api/desktop-client';

// ─── Dependency Interface ───────────────────────────────

/**
 * Minimal dependency interface for the download orchestrator.
 *
 * Primary path: HTTP API via `desktopClient.addDownload()`.
 * Fallback path: `openProtocolNewTask()` deep-link when the desktop app
 * is not reachable via HTTP (e.g. app not yet started).
 */
export interface OrchestratorDeps {
  downloads: {
    cancel: (id: number) => Promise<void>;
    erase: (query: { id: number }) => Promise<void>;
  };
  /** Optional browser cookies API for forwarding auth cookies to the desktop app. */
  cookies?: {
    getAll: (details: { url: string }) => Promise<Array<{ name: string; value: string }>>;
  };
  diagnosticLog: {
    append: (event: DiagnosticInput) => void;
  };
  getSettings: () => DownloadSettings;
  getSiteRules: () => SiteRule[];
  getTabUrl: (id?: number) => Promise<string>;
  /**
   * HTTP API client for direct communication with the desktop app.
   * When available and reachable, this is the primary download submission path.
   */
  desktopClient?: DesktopApiClient;
  /**
   * Wake the desktop app via protocol handler and wait for the HTTP API
   * to become reachable. Returns true if the app woke up successfully.
   * Used as an intermediate step before falling back to the raw deep-link.
   */
  wakeDesktop?: () => Promise<boolean>;
  /**
   * Fallback: route a URL to the desktop app via `motrixnext://new?url=...`
   * deep link. Used only when both HTTP API and wake+retry fail.
   */
  openProtocolNewTask?: (url: string, referer: string, cookie: string) => Promise<void>;
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
 * Routing priority:
 * 1. HTTP API (`desktopClient.addDownload()`) — non-blocking, no browser dialog
 * 2. Deep-link fallback (`openProtocolNewTask()`) — when HTTP API unreachable
 *
 * The extension is a thin interceptor + router layer:
 *   filter → collect cookies → cancel browser download → send to desktop
 */
export class DownloadOrchestrator {
  private readonly deps: OrchestratorDeps;
  private readonly filterStages;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
    this.filterStages = createFilterPipeline(() => deps.getSiteRules());
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

    // ─── Filter ─────────────────────────────────
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

    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_intercepted',
      message: `Intercepted: ${item.url}`,
      context: { url: item.url, fileSize: item.fileSize, mime: item.mime },
    });

    // ─── Route to desktop app ───────────────────
    const effectiveUrl = item.finalUrl || item.url;
    const displayName = item.filename || extractFilenameFromUrl(effectiveUrl) || 'download';
    const cookie = await this.collectCookies(effectiveUrl);

    await this.safeCancel(item.id);

    const routed = await this.sendToDesktop(effectiveUrl, tabUrl, cookie, displayName);
    if (!routed) {
      // Both paths failed — can't route to desktop
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_fallback',
        message: `No route to desktop for: ${displayName}`,
        context: { url: effectiveUrl },
      });
      return true; // Already cancelled — can't un-cancel
    }

    return true;
  }

  /**
   * Send a URL to the desktop app (e.g. from context menu or magnet interception).
   *
   * @returns `'routed-to-desktop'` sentinel on success
   * @throws when no routing path is available
   */
  async sendUrl(url: string, tabUrl: string): Promise<string> {
    const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';
    const cookie = await this.collectCookies(url);

    const routed = await this.sendToDesktop(url, tabUrl, cookie, displayName);
    if (!routed) {
      throw new Error(
        'Desktop app routing unavailable: neither HTTP API nor protocol handler provided',
      );
    }

    return 'routed-to-desktop';
  }

  // ─── Private Helpers ──────────────────────────────

  /**
   * Try HTTP API first, then fall back to deep-link protocol.
   * @returns `true` if successfully routed, `false` if all paths failed.
   */
  private async sendToDesktop(
    url: string,
    referer: string,
    cookie: string,
    displayName: string,
  ): Promise<boolean> {
    // Primary: HTTP API
    if (this.deps.desktopClient) {
      try {
        const response = await this.deps.desktopClient.addDownload({
          url,
          referer: referer || undefined,
          cookie: cookie || undefined,
          filename: displayName || undefined,
        });

        this.deps.diagnosticLog.append({
          level: 'info',
          code: 'download_routed',
          message: `Routed via HTTP API: ${displayName} (${response.action})`,
          context: { url, action: response.action, hasCookie: cookie.length > 0 },
        });
        return true;
      } catch (e) {
        // HTTP API failed — attempt wake + retry before falling back to deep-link
        this.deps.diagnosticLog.append({
          level: 'warn',
          code: 'download_fallback',
          message: `HTTP API failed, attempting wake: ${e instanceof Error ? e.message : String(e)}`,
          context: { url },
        });

        // Wake → retry: try to start the desktop app and retry via HTTP
        if (this.deps.wakeDesktop && this.deps.desktopClient) {
          try {
            const woke = await this.deps.wakeDesktop();
            if (woke) {
              const retryResponse = await this.deps.desktopClient.addDownload({
                url,
                referer: referer || undefined,
                cookie: cookie || undefined,
                filename: displayName || undefined,
              });

              this.deps.diagnosticLog.append({
                level: 'info',
                code: 'download_routed',
                message: `Routed via HTTP API (after wake): ${displayName} (${retryResponse.action})`,
                context: { url, action: retryResponse.action, hasCookie: cookie.length > 0 },
              });
              return true;
            }
          } catch {
            // Wake+retry failed — fall through to deep-link
          }
        }
      }
    }

    // Fallback: deep-link protocol
    if (this.deps.openProtocolNewTask) {
      await this.deps.openProtocolNewTask(url, referer, cookie);

      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_routed',
        message: `Routed via deep-link: ${displayName}`,
        context: { url, hasCookie: cookie.length > 0 },
      });
      return true;
    }

    return false;
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
   * Collect browser cookies for the given URL.
   */
  private async collectCookies(url: string): Promise<string> {
    if (!this.deps.cookies) {
      return '';
    }
    try {
      const cookies = await this.deps.cookies.getAll({ url });
      if (!cookies.length) return '';
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch {
      return ''; // Graceful degradation — never block the download
    }
  }
}
