import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from '@/shared/use-polling';

describe('usePolling', () => {
  let stop: (() => void) | undefined;
  let hidden: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  });

  afterEach(() => {
    stop?.();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function start(fn: () => Promise<boolean>) {
    const poller = usePolling({ fn, baseIntervalMs: 100, maxIntervalMs: 400 });
    stop = poller.stop;
    poller.start();
    return poller;
  }

  function setHidden(value: boolean) {
    hidden = value;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('backs off on failed results and errors, caps the delay, and resets after success', async () => {
    const fn = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    start(fn);

    await vi.advanceTimersByTimeAsync(0);
    for (const [delay, calls] of [
      [200, 2],
      [400, 3],
      [400, 4],
      [100, 5],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fn).toHaveBeenCalledTimes(calls - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fn).toHaveBeenCalledTimes(calls);
    }
  });

  it('pauses hidden pages and never overlaps requests during visibility changes', async () => {
    hidden = true;
    const pending = Promise.withResolvers<boolean>();
    const fn = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(true);
    const poller = start(fn);
    expect(fn).not.toHaveBeenCalled();

    setHidden(false);
    poller.start();
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(1);

    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('discards an old scheduling cycle after restart and removes timers and listeners on stop', async () => {
    const pending = Promise.withResolvers<boolean>();
    const fn = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(true);
    const poller = start(fn);
    poller.stop();
    poller.start();
    expect(fn).toHaveBeenCalledTimes(1);
    pending.resolve(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(3);

    poller.stop();
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
