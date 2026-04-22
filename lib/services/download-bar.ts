// ─── Types ──────────────────────────────────────────────

interface DownloadUiApi {
  setUiOptions: (options: { enabled: boolean }) => Promise<void>;
}

export interface DownloadBarInput {
  hideDownloadBar: boolean;
}

// ─── Service ────────────────────────────────────────────

/**
 * Controls the browser's download shelf/bar visibility.
 * Uses chrome.downloads.setUiOptions() (Chrome 115+).
 *
 * Design:
 * - Graceful degradation: if the API is unavailable, silently ignores
 * - Pure DI: no global chrome reference
 */
export class DownloadBarService {
  private readonly api: DownloadUiApi;

  constructor(api: DownloadUiApi) {
    this.api = api;
  }

  /**
   * Apply download bar visibility preference.
   * Throws if the API is unavailable — caller should catch for
   * graceful degradation and diagnostic logging.
   */
  async apply(input: DownloadBarInput): Promise<void> {
    await this.api.setUiOptions({ enabled: !input.hideDownloadBar });
  }
}
