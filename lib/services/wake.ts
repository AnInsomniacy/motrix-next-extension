/**
 * @fileoverview Protocol-based wake service for Motrix Next.
 *
 * When a download is intercepted but the desktop API is unreachable (app not
 * running), this service attempts to wake the desktop app via the
 * registered `motrixnext://` custom protocol, then polls the API
 * to detect when it becomes available for retry.
 *
 * Key design decisions:
 *   - Check API FIRST before opening protocol (avoids unnecessary tab)
 *   - The protocol tab STAYS OPEN so the user can interact with the
 *     "Open MotrixNext.app?" dialog — it is only closed after success
 *   - Concurrent callers share a single wake attempt (dedup via promise)
 *   - Exceptions from checkApi are treated as "not reachable" (keep polling)
 *   - No dependency on Chrome APIs — all I/O is injected for testability
 */

// ─── Types ──────────────────────────────────────────────

export interface WakeDeps {
  /**
   * Open the motrixnext:// protocol URL in a new tab.
   * Returns a cleanup function that closes the tab when called.
   * The tab MUST stay open until cleanup is called — the user needs
   * to interact with the browser's protocol confirmation dialog.
   */
  openProtocol: () => Promise<() => void>;
  /** Return true if the desktop API is reachable (e.g. ping succeeds). */
  checkApi: () => Promise<boolean>;
  /** Maximum time to wait for API to become available (ms). Default: 15000. */
  maxWaitMs?: number;
  /** Interval between API checks during polling (ms). Default: 500. */
  pollIntervalMs?: number;
}

// ─── Constants ──────────────────────────────────────────

const DEFAULT_MAX_WAIT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

// ─── Service ────────────────────────────────────────────

/**
 * Attempts to wake Motrix Next via custom protocol and waits for the
 * desktop API to become reachable.
 *
 * Usage:
 *   const woke = await wakeService.wakeAndWaitForApi({ ... });
 *   if (woke) { // retry download submission }
 */
export class WakeService {
  /** Shared promise for deduplicating concurrent wake attempts. */
  private inflight: Promise<boolean> | null = null;

  /**
   * Try to wake the app and wait for API.
   *
   * 1. Pre-check: if API is already reachable, return true immediately.
   * 2. Open the protocol URL to trigger OS app launch.
   *    The tab stays open so the user can click the confirmation dialog.
   * 3. Poll checkApi() until it returns true or maxWaitMs expires.
   * 4. On success, close the protocol tab automatically.
   *
   * Concurrent calls share the same wake attempt — only one protocol
   * tab is ever opened for overlapping requests.
   *
   * @returns true if API became reachable, false if timed out.
   */
  async wakeAndWaitForApi(deps: WakeDeps): Promise<boolean> {
    // If another wake is already in progress, piggyback on it.
    if (this.inflight) return this.inflight;

    this.inflight = this.doWake(deps);

    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  // ─── Internal ───────────────────────────────────────

  private async doWake(deps: WakeDeps): Promise<boolean> {
    const maxWaitMs = deps.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    // Step 1: Pre-check — maybe app is already running.
    if (await this.safeCheck(deps.checkApi)) return true;

    // Step 2: Open protocol tab — stays open for user interaction.
    const closeTab = await deps.openProtocol();

    // Step 3: Poll until API is reachable or timeout.
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      await this.delay(pollIntervalMs);
      if (await this.safeCheck(deps.checkApi)) {
        // Step 4: App launched — close the protocol tab.
        closeTab();
        return true;
      }
    }

    // Timed out — leave the tab open so user can still try manually.
    return false;
  }

  /** Swallow exceptions from checkApi — treat as "not reachable". */
  private async safeCheck(fn: () => Promise<boolean>): Promise<boolean> {
    try {
      return await fn();
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
