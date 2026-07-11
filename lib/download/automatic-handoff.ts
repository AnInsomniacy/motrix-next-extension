import type { DesktopApiClient } from '@/lib/api/desktop-client';
import type { DiagnosticInput } from '@/lib/storage/diagnostic-log';
import type { DownloadSettings } from '@/shared/types';

const BROWSER_FALLBACK_TTL_MS = 30_000;

export interface AutomaticHandoffDeps {
  desktopClient?: Pick<DesktopApiClient, 'isReachable'>;
  wakeDesktop?: (timeoutMs: number) => Promise<boolean>;
  getSettings: () => DownloadSettings;
  getLatestSettings: () => Promise<DownloadSettings>;
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

  async resolveSettings(url: string): Promise<DownloadSettings> {
    try {
      return await this.deps.getLatestSettings();
    } catch (e) {
      this.deps.diagnosticLog.append({
        level: 'warn',
        code: 'download_fallback',
        message: `Using cached settings because current settings could not be loaded: ${e instanceof Error ? e.message : String(e)}`,
        context: { url },
      });
      return this.deps.getSettings();
    }
  }

  async isDesktopReachable(): Promise<boolean> {
    return this.deps.desktopClient ? this.deps.desktopClient.isReachable() : false;
  }

  async activateDesktop(url: string, settings: DownloadSettings): Promise<boolean> {
    if (!this.deps.wakeDesktop) {
      return this.deps.desktopClient ? this.deps.desktopClient.isReachable() : false;
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
        message: `Motrix Next could not be started: ${e instanceof Error ? e.message : String(e)}`,
        context: { url, target: 'discard' },
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
