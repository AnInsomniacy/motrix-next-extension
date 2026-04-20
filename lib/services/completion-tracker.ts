// ─── Types ──────────────────────────────────────────────

interface TaskStatus {
  status: 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed';
}

export interface CompletionTrackerDeps {
  /** Query the desktop app for the current status of a GID. */
  tellStatus: (gid: string) => Promise<TaskStatus>;
  /** Callback fired when a tracked GID reaches 'complete' status. */
  onComplete: (gid: string, filename: string) => void;
}

// ─── Terminal statuses that trigger untracking ──────────

const TERMINAL_STATUSES = new Set(['complete', 'error', 'removed']);

// ─── Service ────────────────────────────────────────────

/**
 * Tracks download GIDs sent by the extension and polls for completion.
 *
 * Design:
 * - Pure DI: no global chrome reference
 * - Graceful degradation: tellStatus failures keep the GID tracked for retry
 * - Only 'complete' fires onComplete; 'error' and 'removed' silently untrack
 */
export class CompletionTracker {
  private readonly deps: CompletionTrackerDeps;
  private readonly tracked = new Map<string, string>(); // gid → filename

  constructor(deps: CompletionTrackerDeps) {
    this.deps = deps;
  }

  /** Start tracking a GID for completion. */
  track(gid: string, filename: string): void {
    this.tracked.set(gid, filename);
  }

  /** Stop tracking a GID. */
  untrack(gid: string): void {
    this.tracked.delete(gid);
  }

  /** Remove all tracked GIDs. */
  clear(): void {
    this.tracked.clear();
  }

  /** Number of currently tracked GIDs. */
  get trackedCount(): number {
    return this.tracked.size;
  }

  /**
   * Poll all tracked GIDs and fire callbacks for terminal statuses.
   * Safe to call on an interval — gracefully handles errors.
   */
  async poll(): Promise<void> {
    const entries = [...this.tracked.entries()];

    for (const [gid, filename] of entries) {
      try {
        const result = await this.deps.tellStatus(gid);

        if (result.status === 'complete') {
          this.deps.onComplete(gid, filename);
          this.tracked.delete(gid);
        } else if (TERMINAL_STATUSES.has(result.status)) {
          // Error/removed — silently untrack
          this.tracked.delete(gid);
        }
        // Active/waiting/paused — keep tracking
      } catch {
        // Network error — keep tracking for next poll
      }
    }
  }
}
