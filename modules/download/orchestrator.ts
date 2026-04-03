import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/modules/storage/diagnostic-log';
import { evaluateFilterPipeline } from './filter';
import { MetadataCollector } from './metadata-collector';
import { NotificationService } from '@/modules/services/notification';

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

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
  }

  async handleCreated(item: DownloadItem): Promise<void> {
    const settings = this.deps.getSettings();
    const rules = this.deps.getSiteRules();
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

    const verdict = evaluateFilterPipeline(ctx, settings, rules);

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

    // chrome.downloads.onCreated fires before the browser resolves the
    // filename from Content-Disposition, so item.filename is usually empty.
    // Fallback chain: item.filename → URL path basename → 'download'
    const enhanced = this.deps.hasEnhancedPermissions();
    const filename = item.filename
      || this.extractFilenameFromUrl(item.finalUrl || item.url)
      || 'download';

    const metadata = await this.metadataCollector.collectMetadata({
      url: item.url,
      filename,
      tabUrl,
      cookiesApi: enhanced ? this.deps.cookies : null,
      hasEnhancedPermissions: enhanced,
    });

    const headers = MetadataCollector.buildAria2Headers(metadata);

    // ─── Send to aria2 ────────────────────────────
    const aria2Options: Record<string, unknown> = {};
    if (metadata.filename) {
      aria2Options.out = metadata.filename;
    }
    if (headers.length > 0) {
      aria2Options.header = headers;
    }

    try {
      const gid = await this.deps.aria2.addUri([item.url], aria2Options);

      // ─── Success: cancel browser download ─────
      await this.deps.downloads.cancel(item.id);
      await this.deps.downloads.erase({ id: item.id });

      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_sent',
        message: `Sent: ${metadata.filename}`,
        context: { url: item.url, filename: metadata.filename, gid },
      });

      // ─── Track for completion ──────────────────
      this.deps.onSent?.(gid, metadata.filename);

      // ─── Notify ─────────────────────────────────
      if (settings.notifyOnStart) {
        const notification = NotificationService.buildSentNotification(metadata.filename, item.id);
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
   * Extract a filename from a URL's pathname.
   *
   * Example: "https://cdn.example.com/files/app-v2.0.zip?token=abc"
   *       → "app-v2.0.zip"
   *
   * Returns null if the URL is invalid or the path has no usable basename.
   */
  private extractFilenameFromUrl(url: string): string | null {
    try {
      const { pathname } = new URL(url);
      // Decode percent-encoded characters (e.g. %20 → space)
      const decoded = decodeURIComponent(pathname);
      const basename = decoded.split('/').pop();
      // Filter out empty segments and bare directory paths
      if (!basename || basename === '/' || !basename.includes('.')) {
        return null;
      }
      return basename;
    } catch {
      return null;
    }
  }
}
