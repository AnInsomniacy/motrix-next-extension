import { describe, it, expect, vi } from 'vitest';
import { wakeAndWaitForApi } from '@/lib/desktop';

describe('wakeAndWaitForApi', () => {
  // ─── wakeAndWaitForApi ─────────────────────────────────

  it('skips protocol launch if the desktop app and engine are ready', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkReady = vi.fn().mockResolvedValue(true);

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkReady,
      maxWaitMs: 5000,
      pollIntervalMs: 100,
    });

    expect(result).toBe(true);
    expect(openProtocol).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('launches protocol and polls until the desktop app and engine become ready', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    let callCount = 0;
    const checkReady = vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount >= 3; // Succeeds on 3rd poll
    });

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkReady,
      maxWaitMs: 10000,
      pollIntervalMs: 50,
    });

    expect(result).toBe(true);
    expect(openProtocol).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1); // Tab closed after success
    expect(checkReady).toHaveBeenCalledTimes(3);
  });

  it('returns false and closes the protocol tab when polling times out', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkReady = vi.fn().mockResolvedValue(false);

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkReady,
      maxWaitMs: 300,
      pollIntervalMs: 50,
    });

    expect(result).toBe(false);
    expect(openProtocol).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(checkReady.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('treats readiness check failures as not ready and continues polling', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    let callCount = 0;
    const checkReady = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error('ECONNREFUSED');
      return true;
    });

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkReady,
      maxWaitMs: 10000,
      pollIntervalMs: 50,
    });

    expect(result).toBe(true);
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(checkReady).toHaveBeenCalledTimes(3);
  });

  it('starts an independent protocol launch for each concurrent wake request', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkReady = vi.fn().mockResolvedValue(false);

    const deps = { openProtocol, checkReady, maxWaitMs: 50, pollIntervalMs: 10 };

    const [r1, r2] = await Promise.all([wakeAndWaitForApi(deps), wakeAndWaitForApi(deps)]);

    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(openProtocol).toHaveBeenCalledTimes(2);
  });

  it('resets state after completion so subsequent calls work', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkReady = vi.fn().mockResolvedValue(false);

    // First call: timeout
    const r1 = await wakeAndWaitForApi({
      openProtocol,
      checkReady,
      maxWaitMs: 100,
      pollIntervalMs: 30,
    });
    expect(r1).toBe(false);

    // Second call: immediate success
    checkReady.mockResolvedValue(true);
    const r2 = await wakeAndWaitForApi({
      openProtocol,
      checkReady,
      maxWaitMs: 5000,
      pollIntervalMs: 50,
    });
    expect(r2).toBe(true);
  });
});
