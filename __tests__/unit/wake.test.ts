import { describe, it, expect, vi } from 'vitest';
import { wakeAndWaitForApi } from '@/lib/desktop';

describe('wakeAndWaitForApi', () => {
  // ─── wakeAndWaitForApi ─────────────────────────────────

  it('skips protocol launch if API is already reachable', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkApi = vi.fn().mockResolvedValue(true);

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkApi,
      maxWaitMs: 5000,
      pollIntervalMs: 100,
    });

    expect(result).toBe(true);
    expect(openProtocol).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
    expect(checkApi).toHaveBeenCalledTimes(1);
  });

  it('launches protocol and polls until API becomes reachable', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    let callCount = 0;
    const checkApi = vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount >= 3; // Succeeds on 3rd poll
    });

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkApi,
      maxWaitMs: 10000,
      pollIntervalMs: 50,
    });

    expect(result).toBe(true);
    expect(openProtocol).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1); // Tab closed after success
    expect(checkApi).toHaveBeenCalledTimes(3);
  });

  it('returns false and closes the protocol tab when polling times out', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkApi = vi.fn().mockResolvedValue(false);

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkApi,
      maxWaitMs: 300,
      pollIntervalMs: 50,
    });

    expect(result).toBe(false);
    expect(openProtocol).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(checkApi.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('treats checkApi exceptions as unreachable (continues polling)', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    let callCount = 0;
    const checkApi = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error('ECONNREFUSED');
      return true;
    });

    const result = await wakeAndWaitForApi({
      openProtocol,
      checkApi,
      maxWaitMs: 10000,
      pollIntervalMs: 50,
    });

    expect(result).toBe(true);
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(checkApi).toHaveBeenCalledTimes(3);
  });

  it('starts an independent protocol launch for each concurrent wake request', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkApi = vi.fn().mockResolvedValue(false);

    const deps = { openProtocol, checkApi, maxWaitMs: 50, pollIntervalMs: 10 };

    const [r1, r2] = await Promise.all([wakeAndWaitForApi(deps), wakeAndWaitForApi(deps)]);

    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(openProtocol).toHaveBeenCalledTimes(2);
  });

  it('resets state after completion so subsequent calls work', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkApi = vi.fn().mockResolvedValue(false);

    // First call: timeout
    const r1 = await wakeAndWaitForApi({
      openProtocol,
      checkApi,
      maxWaitMs: 100,
      pollIntervalMs: 30,
    });
    expect(r1).toBe(false);

    // Second call: immediate success
    checkApi.mockResolvedValue(true);
    const r2 = await wakeAndWaitForApi({
      openProtocol,
      checkApi,
      maxWaitMs: 5000,
      pollIntervalMs: 50,
    });
    expect(r2).toBe(true);
  });
});
