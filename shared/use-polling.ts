/** Visibility-aware polling with bounded backoff and one request in flight. */
interface PollingOptions {
  fn: () => Promise<boolean>;
  baseIntervalMs: number;
  maxIntervalMs: number;
}

export function usePolling({ fn, baseIntervalMs, maxIntervalMs }: PollingOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let inFlight = false;
  let generation = 0;
  let delay = baseIntervalMs;

  function clearTimer(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  async function tick(): Promise<void> {
    if (!running || document.hidden || inFlight) return;
    const currentGeneration = generation;
    inFlight = true;
    let succeeded = false;
    try {
      succeeded = await fn();
    } catch {
      // Transport failures follow the same backoff as an unavailable API.
    } finally {
      inFlight = false;
    }
    if (!running || document.hidden) return;
    if (currentGeneration !== generation) {
      void tick();
      return;
    }
    delay = succeeded ? baseIntervalMs : Math.min(delay * 2, maxIntervalMs);
    timer = setTimeout(tick, delay);
  }

  function onVisibilityChange(): void {
    clearTimer();
    if (!document.hidden) void tick();
  }

  function start(): void {
    if (running) return;
    running = true;
    generation += 1;
    delay = baseIntervalMs;
    document.addEventListener('visibilitychange', onVisibilityChange);
    void tick();
  }

  function stop(): void {
    running = false;
    clearTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  return { start, stop };
}
