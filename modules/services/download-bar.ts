// ─── Types ──────────────────────────────────────────────

interface DownloadUiApi {
  setUiOptions: (options: { enabled: boolean }) => Promise<void>;
}

export interface DownloadBarInput {
  hideDownloadBar: boolean;
  hasEnhancedPermissions: boolean;
}

// ─── Service ────────────────────────────────────────────

/**
 * Controls the browser's download shelf/bar visibility.
 * Uses chrome.downloads.setUiOptions() (Chrome 115+).
 *
 * Design:
 * - Graceful degradation: if the API is unavailable, silently ignores
 * - Only hides when BOTH hideDownloadBar=true AND enhanced permissions granted
 * - Pure DI: no global chrome reference
 */
export class DownloadBarService {
  private readonly api: DownloadUiApi;

  constructor(api: DownloadUiApi) {
    this.api = api;
  }

  async apply(input: DownloadBarInput): Promise<void> {
    const shouldHide = input.hideDownloadBar && input.hasEnhancedPermissions;

    try {
      await this.api.setUiOptions({ enabled: !shouldHide });
    } catch {
      // Graceful degradation: API may not be available on older Chrome versions
    }
  }
}
