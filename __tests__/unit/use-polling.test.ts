import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePolling } from '@/shared/use-polling';

// ─── Tests ──────────────────────────────────────────────

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the poll function at the base interval', async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 2000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
    });

    start();
    await vi.advanceTimersByTimeAsync(0); // flush initial tick
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);

    stop();
  });

  it('backs off exponentially on consecutive errors', async () => {
    const fn = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('fail'));
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 8000,
      backoffMultiplier: 2,
    });

    start();
    await vi.advanceTimersByTimeAsync(0); // error 1
    expect(fn).toHaveBeenCalledTimes(1);

    // After 1st error: delay = 2000 (1000 * 2^1)
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(1); // not yet
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2); // error 2

    // After 2nd error: delay = 4000 (1000 * 2^2)
    await vi.advanceTimersByTimeAsync(3999);
    expect(fn).toHaveBeenCalledTimes(2); // not yet
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3); // error 3

    stop();
  });

  it('caps backoff at maxIntervalMs', async () => {
    const fn = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('fail'));
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 4000,
      backoffMultiplier: 2,
    });

    start();
    await vi.advanceTimersByTimeAsync(0); // error 1 → next: 2000

    await vi.advanceTimersByTimeAsync(2000); // error 2 → next: 4000

    await vi.advanceTimersByTimeAsync(4000); // error 3 → next: 8000 capped to 4000

    const callsBefore = fn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000); // error 4 at 4000 (capped), not 8000
    expect(fn.mock.calls.length).toBe(callsBefore + 1);

    stop();
  });

  it('resets to base interval after a successful poll', async () => {
    let shouldFail = true;
    const fn = vi.fn<() => Promise<void>>().mockImplementation(async () => {
      if (shouldFail) throw new Error('fail');
    });
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
    });

    start();
    await vi.advanceTimersByTimeAsync(0); // error 1 → delay = 2000

    shouldFail = false;
    await vi.advanceTimersByTimeAsync(2000); // success → reset to 1000

    const callsBefore = fn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000); // should fire at 1000 (base)
    expect(fn.mock.calls.length).toBe(callsBefore + 1);

    stop();
  });

  it('stop() prevents further polling', async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
    });

    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    stop();

    await vi.advanceTimersByTimeAsync(10000);
    expect(fn).toHaveBeenCalledTimes(1); // no more calls
  });

  it('can be restarted after stop', async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
    });

    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(1);

    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(2);

    stop();
  });

  // ─── Visibility-Aware Tests ───────────────────────────

  it('pauses polling when page becomes hidden', async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let visibilityCallback: (() => void) | null = null;
    const visibilityApi = {
      isHidden: () => false,
      onVisibilityChange: (cb: () => void) => {
        visibilityCallback = cb;
        return () => {
          visibilityCallback = null;
        };
      },
    };
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
      visibilityApi,
    });

    start();
    await vi.advanceTimersByTimeAsync(0); // initial tick
    expect(fn).toHaveBeenCalledTimes(1);

    // Simulate page becoming hidden
    visibilityApi.isHidden = () => true;
    visibilityCallback!();

    // Time passes — should NOT fire
    await vi.advanceTimersByTimeAsync(10000);
    expect(fn).toHaveBeenCalledTimes(1);

    stop();
  });

  it('fires immediately when page becomes visible again', async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let visibilityCallback: (() => void) | null = null;
    const visibilityApi = {
      isHidden: () => false,
      onVisibilityChange: (cb: () => void) => {
        visibilityCallback = cb;
        return () => {
          visibilityCallback = null;
        };
      },
    };
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
      visibilityApi,
    });

    start();
    await vi.advanceTimersByTimeAsync(0); // initial tick
    expect(fn).toHaveBeenCalledTimes(1);

    // Go hidden
    visibilityApi.isHidden = () => true;
    visibilityCallback!();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(1); // paused

    // Come back visible — should fire immediately
    visibilityApi.isHidden = () => false;
    visibilityCallback!();
    await vi.advanceTimersByTimeAsync(0); // flush the immediate tick
    expect(fn).toHaveBeenCalledTimes(2);

    // Normal polling resumes at base interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(3);

    stop();
  });

  it('cleans up visibility listener on stop', async () => {
    const fn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    let registered = false;
    const visibilityApi = {
      isHidden: () => false,
      onVisibilityChange: (_cb: () => void) => {
        registered = true;
        return () => {
          registered = false;
        };
      },
    };
    const { start, stop } = usePolling({
      fn,
      baseIntervalMs: 1000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
      visibilityApi,
    });

    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(registered).toBe(true);

    stop();
    expect(registered).toBe(false);
  });
});
