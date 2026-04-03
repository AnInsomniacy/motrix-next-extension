/**
 * @fileoverview Smart polling utility with exponential backoff.
 *
 * Replaces naive setInterval-based polling with:
 *   - Exponential backoff on consecutive errors
 *   - Configurable max interval cap
 *   - Automatic reset to base interval on success
 *   - Clean start/stop lifecycle
 *
 * Does NOT depend on Vue or browser APIs — pure TypeScript utility.
 */

// ─── Types ──────────────────────────────────────────────

export interface PollingOptions {
  /** Async function to call on each poll tick. */
  fn: () => Promise<void>;
  /** Base interval in milliseconds (used when healthy). */
  baseIntervalMs: number;
  /** Maximum interval after backoff (hard cap). */
  maxIntervalMs: number;
  /** Multiplier for each consecutive failure (e.g. 2 = double). */
  backoffMultiplier: number;
}

export interface PollingHandle {
  /** Start polling. Executes fn immediately, then schedules next tick. */
  start: () => void;
  /** Stop polling. Clears any pending timer. */
  stop: () => void;
}

// ─── Implementation ─────────────────────────────────────

export function usePolling(options: PollingOptions): PollingHandle {
  const { fn, baseIntervalMs, maxIntervalMs, backoffMultiplier } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveErrors = 0;
  let stopped = true;

  function computeDelay(): number {
    if (consecutiveErrors === 0) return baseIntervalMs;
    const delay = baseIntervalMs * Math.pow(backoffMultiplier, consecutiveErrors);
    return Math.min(delay, maxIntervalMs);
  }

  function tick(): void {
    fn().then(
      () => {
        consecutiveErrors = 0;
        if (!stopped) scheduleNext();
      },
      () => {
        consecutiveErrors++;
        if (!stopped) scheduleNext();
      },
    );
  }

  function scheduleNext(): void {
    timer = setTimeout(tick, computeDelay());
  }

  function start(): void {
    stopped = false;
    consecutiveErrors = 0;
    // Execute immediately, then schedule on completion.
    tick();
  }

  function stop(): void {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { start, stop };
}
