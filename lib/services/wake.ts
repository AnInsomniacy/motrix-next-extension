/**
 * @fileoverview Protocol-based wake service for Motrix Next.
 *
 * When a download is intercepted but aria2 RPC is unreachable (app not
 * running), this service attempts to wake the desktop app via the
 * registered `motrixnext://` custom protocol, then polls getVersion()
 * to detect when the RPC becomes available for retry.
 *
 * Key design decisions:
 *   - Check RPC FIRST before opening protocol (avoids unnecessary tab)
 *   - The protocol tab STAYS OPEN so the user can interact with the
 *     "Open MotrixNext.app?" dialog — it is only closed after success
 *   - Concurrent callers share a single wake attempt (dedup via promise)
 *   - Exceptions from checkRpc are treated as "not reachable" (keep polling)
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
  /** Return true if aria2 RPC is reachable (e.g. getVersion succeeds). */
  checkRpc: () => Promise<boolean>;
  /** Maximum time to wait for RPC to become available (ms). Default: 15000. */
  maxWaitMs?: number;
  /** Interval between RPC checks during polling (ms). Default: 1500. */
  pollIntervalMs?: number;
}

// ─── Constants ──────────────────────────────────────────

const DEFAULT_MAX_WAIT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

// ─── Service ────────────────────────────────────────────

/**
 * Attempts to wake Motrix Next via custom protocol and waits for the
 * aria2 RPC to become reachable.
 *
 * Usage:
 *   const woke = await wakeService.wakeAndWaitForRpc({ ... });
 *   if (woke) { // retry addUri }
 */
export class WakeService {
  /** Shared promise for deduplicating concurrent wake attempts. */
  private inflight: Promise<boolean> | null = null;

  /**
   * Try to wake the app and wait for RPC.
   *
   * 1. Pre-check: if RPC is already reachable, return true immediately.
   * 2. Open the protocol URL to trigger OS app launch.
   *    The tab stays open so the user can click the confirmation dialog.
   * 3. Poll checkRpc() until it returns true or maxWaitMs expires.
   * 4. On success, close the protocol tab automatically.
   *
   * Concurrent calls share the same wake attempt — only one protocol
   * tab is ever opened for overlapping requests.
   *
   * @returns true if RPC became reachable, false if timed out.
   */
  async wakeAndWaitForRpc(deps: WakeDeps): Promise<boolean> {
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
    if (await this.safeCheck(deps.checkRpc)) return true;

    // Step 2: Open protocol tab — stays open for user interaction.
    const closeTab = await deps.openProtocol();

    // Step 3: Poll until RPC is reachable or timeout.
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      await this.delay(pollIntervalMs);
      if (await this.safeCheck(deps.checkRpc)) {
        // Step 4: App launched — close the protocol tab.
        closeTab();
        return true;
      }
    }

    // Timed out — leave the tab open so user can still try manually.
    return false;
  }

  /** Swallow exceptions from checkRpc — treat as "not reachable". */
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
