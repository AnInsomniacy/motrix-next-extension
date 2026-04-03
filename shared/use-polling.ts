/**
 * @fileoverview Smart polling utility with exponential backoff and
 * visibility-aware scheduling.
 *
 * Features:
 *   - Exponential backoff on consecutive errors
 *   - Configurable max interval cap
 *   - Automatic reset to base interval on success
 *   - Pauses when page is hidden (visibilitychange API)
 *   - Fires immediately when page returns to foreground
 *   - Clean start/stop lifecycle with listener cleanup
 *
 * Does NOT depend on Vue — pure TypeScript utility.
 * Accepts an optional VisibilityApi for testability (defaults to document).
 */

// ─── Types ──────────────────────────────────────────────

/** Abstraction over document visibility for testability. */
export interface VisibilityApi {
  isHidden: () => boolean;
  /** Register a callback; returns an unsubscribe function. */
  onVisibilityChange: (callback: () => void) => () => void;
}

export interface PollingOptions {
  /** Async function to call on each poll tick. */
  fn: () => Promise<void>;
  /** Base interval in milliseconds (used when healthy). */
  baseIntervalMs: number;
  /** Maximum interval after backoff (hard cap). */
  maxIntervalMs: number;
  /** Multiplier for each consecutive failure (e.g. 2 = double). */
  backoffMultiplier: number;
  /** Optional visibility API for testing. Defaults to document-based. */
  visibilityApi?: VisibilityApi;
}

export interface PollingHandle {
  /** Start polling. Executes fn immediately, then schedules next tick. */
  start: () => void;
  /** Stop polling. Clears any pending timer and visibility listener. */
  stop: () => void;
}

// ─── Default Visibility (browser document API) ──────────

function createDocumentVisibilityApi(): VisibilityApi | undefined {
  if (typeof document === 'undefined') return undefined;
  return {
    isHidden: () => document.hidden,
    onVisibilityChange: (cb) => {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
  };
}

// ─── Implementation ─────────────────────────────────────

export function usePolling(options: PollingOptions): PollingHandle {
  const { fn, baseIntervalMs, maxIntervalMs, backoffMultiplier } = options;
  const visibility = options.visibilityApi ?? createDocumentVisibilityApi();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveErrors = 0;
  let stopped = true;
  let paused = false;
  let unsubscribeVisibility: (() => void) | null = null;

  function computeDelay(): number {
    if (consecutiveErrors === 0) return baseIntervalMs;
    const delay = baseIntervalMs * Math.pow(backoffMultiplier, consecutiveErrors);
    return Math.min(delay, maxIntervalMs);
  }

  function tick(): void {
    fn().then(
      () => {
        consecutiveErrors = 0;
        if (!stopped && !paused) scheduleNext();
      },
      () => {
        consecutiveErrors++;
        if (!stopped && !paused) scheduleNext();
      },
    );
  }

  function scheduleNext(): void {
    timer = setTimeout(tick, computeDelay());
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function handleVisibilityChange(): void {
    if (stopped) return;

    if (visibility!.isHidden()) {
      // Page hidden → pause: clear pending timer
      paused = true;
      clearTimer();
    } else {
      // Page visible → resume: fire immediately
      paused = false;
      tick();
    }
  }

  function start(): void {
    stopped = false;
    paused = false;
    consecutiveErrors = 0;

    // Register visibility listener
    if (visibility) {
      unsubscribeVisibility = visibility.onVisibilityChange(handleVisibilityChange);
    }

    // Execute immediately, then schedule on completion.
    tick();
  }

  function stop(): void {
    stopped = true;
    paused = false;
    clearTimer();

    // Clean up visibility listener
    if (unsubscribeVisibility) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
  }

  return { start, stop };
}
