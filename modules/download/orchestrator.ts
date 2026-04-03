import type { DownloadSettings, SiteRule, FilterContext } from '@/shared/types';
import type { DiagnosticInput } from '@/modules/storage/diagnostic-log';
import { evaluateFilterPipeline } from './filter';
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

    // ─── Collect Metadata ─────────────────────────
    // Resolve a display filename for logging and notifications.
    // We intentionally do NOT pass `out` to aria2 — aria2 has superior
    // filename resolution via Content-Disposition, redirected URLs, and
    // URL path segments (see aria2 HttpResponse.cc:determineFilename()).
    // Forcing `out` would override aria2's native resolution.
    const enhanced = this.deps.hasEnhancedPermissions();
    const displayName = item.filename
      || extractFilenameFromUrl(item.finalUrl || item.url)
      || 'download';

    const metadata = await this.metadataCollector.collectMetadata({
      url: item.url,
      filename: displayName,
      tabUrl,
      cookiesApi: enhanced ? this.deps.cookies : null,
      hasEnhancedPermissions: enhanced,
    });

    const headers = MetadataCollector.buildAria2Headers(metadata);

    // ─── Send to aria2 ────────────────────────────
    // Do NOT set `out` — let aria2 resolve the filename natively.
    const aria2Options: Record<string, unknown> = {};
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
}
