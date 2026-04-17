import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import { evaluateFilterPipeline, createFilterPipeline } from './filter';
import { extractFilenameFromUrl } from '@/shared/url';

// ─── Dependency Interface ───────────────────────────────

/**
 * Minimal dependency interface for the unified deep-link orchestrator.
 *
 * All downloads are routed to the desktop app via `openProtocolNewTask`.
 * No direct aria2 RPC, cookie collection, or wake logic is needed.
 */
export interface OrchestratorDeps {
  downloads: {
    cancel: (id: number) => Promise<void>;
    erase: (query: { id: number }) => Promise<void>;
  };
  diagnosticLog: {
    append: (event: DiagnosticInput) => void;
  };
  getSettings: () => DownloadSettings;
  getSiteRules: () => SiteRule[];
  getTabUrl: (id?: number) => Promise<string>;
  hasEnhancedPermissions: () => boolean;
  /**
   * Route a URL to the desktop app via `motrixnext://new?url=...&referer=...`
   * deep link. The desktop app shows its native "Add Task" dialog for user
   * confirmation and applies file classification before submission.
   */
  openProtocolNewTask?: (url: string, referer: string) => Promise<void>;
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
 * Central download interception orchestrator — unified deep-link routing.
 *
 * All intercepted downloads are routed to the desktop app via
 * `motrixnext://new?url=...&referer=...` deep link. The desktop app
 * shows the "Add Task" dialog for user confirmation and applies file
 * classification, proxy, and other settings before submission.
 *
 * The extension no longer calls aria2 RPC directly — it is a thin
 * interceptor + router layer:
 *   filter → cancel browser download → openProtocolNewTask
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
   * All intercepted downloads are routed to the desktop app via deep link.
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

    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_intercepted',
      message: `Intercepted: ${item.url}`,
      context: { url: item.url, fileSize: item.fileSize, mime: item.mime },
    });

    // ─── Route to desktop app ─────────────────────
    // Defensive fallback: if openProtocolNewTask is unavailable, let
    // the browser handle the download (return false = don't cancel).
    if (!this.deps.openProtocolNewTask) {
      return false;
    }

    // Prefer finalUrl — the post-redirect URL that Chrome actually downloaded
    // from. Many cloud storage services return an HTML landing page at
    // item.url, then redirect to a CDN URL. Without finalUrl, the desktop
    // app would re-request the landing page instead of the actual file.
    const effectiveUrl = item.finalUrl || item.url;
    const displayName = item.filename || extractFilenameFromUrl(effectiveUrl) || 'download';

    await this.safeCancel(item.id);
    await this.deps.openProtocolNewTask(effectiveUrl, tabUrl);

    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_routed',
      message: `Routed to desktop: ${displayName}`,
      context: { url: effectiveUrl, filename: displayName },
    });

    return true;
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
   * Send a URL to the desktop app (e.g. from context menu or magnet interception).
   *
   * Routes through `motrixnext://new?url=...&referer=...` deep link.
   * The desktop app shows the "Add Task" dialog for user confirmation.
   *
   * @returns `'routed-to-desktop'` sentinel on success
   * @throws when `openProtocolNewTask` is unavailable
   */
  async sendUrl(url: string, tabUrl: string): Promise<string> {
    if (!this.deps.openProtocolNewTask) {
      throw new Error('Desktop app routing unavailable: openProtocolNewTask not provided');
    }

    const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';

    await this.deps.openProtocolNewTask(url, tabUrl);

    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_routed',
      message: `Routed to desktop: ${displayName}`,
      context: { url },
    });

    return 'routed-to-desktop';
  }
}
