import type { DesktopApiClient } from '@/lib/api/desktop-client';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import type { DownloadSettings } from '@/shared/types';

const BROWSER_FALLBACK_TTL_MS = 30_000;

export interface AutomaticHandoffDeps {
  downloads: {
    pause: (id: number) => Promise<void>;
    resume: (id: number) => Promise<void>;
  };
  desktopClient?: Pick<DesktopApiClient, 'isReachable'>;
  wakeDesktop?: (timeoutMs: number) => Promise<boolean>;
  getSettings: () => DownloadSettings;
  diagnosticLog: {
    append: (event: DiagnosticInput) => void;
  };
}

export interface BrowserDownloadIdentity {
  url: string;
  finalUrl: string;
}

export class AutomaticDownloadHandoff {
  private readonly browserFallbacks = new Map<string, number>();

  constructor(private readonly deps: AutomaticHandoffDeps) {}

  async ensureDesktopAvailable(url: string): Promise<boolean> {
    const settings = this.deps.getSettings();
    if (this.deps.desktopClient && (await this.deps.desktopClient.isReachable())) {
      return true;
    }

    if (settings.desktopUnavailable.action === 'browser' || !this.deps.wakeDesktop) {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'download_fallback',
        message: `Continuing in browser because Motrix Next is unavailable: ${url}`,
        context: { url, target: 'browser' },
      });
      return false;
    }

    const timeoutMs = settings.desktopUnavailable.startupTimeoutSeconds * 1000;
    this.deps.diagnosticLog.append({
      level: 'info',
      code: 'download_wake_attempt',
      message: `Waking desktop app for: ${url}`,
      context: { url, timeoutMs },
    });

    let woke: boolean;
    try {
      woke = await this.deps.wakeDesktop(timeoutMs);
    } catch (e) {
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_fallback',
        message: `Continuing in browser because Motrix Next could not be started: ${e instanceof Error ? e.message : String(e)}`,
        context: { url, target: 'browser' },
      });
      return false;
    }

    if (woke) {
      this.deps.diagnosticLog.append({
        level: 'info',
        code: 'wake_success',
        message: `Desktop app woke successfully for: ${url}`,
        context: { url },
      });
      return true;
    }

    this.deps.diagnosticLog.append({
      level: 'warn',
      code: 'wake_timeout',
      message: `Wake timed out for: ${url}`,
      context: { url, timeoutMs },
    });
    return false;
  }

  async pauseBrowserDownload(id: number): Promise<boolean> {
    try {
      await this.deps.downloads.pause(id);
      return true;
    } catch (e) {
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_fallback',
        message: `Continuing in browser because download ${id} could not be paused: ${e instanceof Error ? e.message : String(e)}`,
        context: { downloadId: id, target: 'browser' },
      });
      return false;
    }
  }

  async resumeBrowserDownload(id: number): Promise<void> {
    try {
      await this.deps.downloads.resume(id);
    } catch (e) {
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_handler_error',
        message: `Browser download ${id} could not be resumed: ${e instanceof Error ? e.message : String(e)}`,
        context: { downloadId: id },
      });
    }
  }

  rememberBrowserFallback(url: string): void {
    this.browserFallbacks.set(url, Date.now() + BROWSER_FALLBACK_TTL_MS);
  }

  consumeBrowserFallback(item: BrowserDownloadIdentity): boolean {
    const now = Date.now();
    const urls = new Set([item.url, item.finalUrl].filter(Boolean));
    for (const url of urls) {
      const expiresAt = this.browserFallbacks.get(url);
      if (expiresAt === undefined) continue;
      this.browserFallbacks.delete(url);
      if (expiresAt > now) return true;
    }
    return false;
  }
}
