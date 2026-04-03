import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/modules/storage/diagnostic-log';
import { evaluateFilterPipeline, createFilterPipeline } from './filter';
import { MetadataCollector } from './metadata-collector';
import { NotificationService } from '@/modules/services/notification';
import { extractFilenameFromUrl } from '@/shared/url';

// ─── Dependency Interface ───────────────────────────────

export interface OrchestratorDeps {
  aria2: {
    addUri: (uris: string[], options?: Record<string, unknown>) => Promise<string>;
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
 * Flow: filter → pause → collect metadata → addUri → cancel/erase
 * On failure: resume (fallback) or cancel (no fallback)
 */
export class DownloadOrchestrator {
  private readonly deps: OrchestratorDeps;
  private readonly metadataCollector = new MetadataCollector();
  private readonly filterStages;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
    this.filterStages = createFilterPipeline(() => deps.getSiteRules());
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
    const displayName = item.filename
      || extractFilenameFromUrl(item.finalUrl || item.url)
      || 'download';

    const aria2Options = await this.buildAria2Options(item.url, tabUrl);

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
      // ─── Failure ──────────────────────────────
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
   * Send a URL directly to aria2 (e.g. from context menu).
   *
   * Handles: metadata collection → header building → addUri → diagnostics → notification.
   * Throws on aria2 failure (caller decides how to handle).
   *
   * @returns The aria2 GID for the submitted download
   */
  async sendUrl(url: string, tabUrl: string): Promise<string> {
    const settings = this.deps.getSettings();
    const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';

    const aria2Options = await this.buildAria2Options(url, tabUrl);

    // ─── Send to aria2 ────────────────────────────
    try {
      const gid = await this.deps.aria2.addUri([url], aria2Options);

      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_sent',
        message: `Sent: ${displayName}`,
        context: { url, filename: displayName, gid },
      });

      this.deps.onSent?.(gid, displayName);

      if (settings.notifyOnStart) {
        const notification = NotificationService.buildSentNotification(displayName, Date.now());
        await this.deps.notifications.create(
          notification.id,
          notification.options as Record<string, unknown>,
        );
      }

      return gid;
    } catch (error) {
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
   * Build aria2 options (headers, cookies) for a URL.
   * Shared by handleCreated and sendUrl to eliminate duplication.
   */
  private async buildAria2Options(
    url: string,
    tabUrl: string,
  ): Promise<Record<string, unknown>> {
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
}
