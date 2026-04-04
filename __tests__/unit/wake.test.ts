import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WakeService } from '@/lib/services/wake';

describe('WakeService', () => {
  let service: WakeService;

  beforeEach(() => {
    service = new WakeService();
  });

  // ─── wakeAndWaitForRpc ─────────────────────────────────

  it('skips protocol launch if RPC is already reachable', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkRpc = vi.fn().mockResolvedValue(true);

    const result = await service.wakeAndWaitForRpc({
      openProtocol,
      checkRpc,
      maxWaitMs: 5000,
      pollIntervalMs: 100,
    });

    expect(result).toBe(true);
    expect(openProtocol).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
    expect(checkRpc).toHaveBeenCalledTimes(1);
  });

  it('launches protocol and polls until RPC becomes reachable', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    let callCount = 0;
    const checkRpc = vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount >= 3; // Succeeds on 3rd poll
    });

    const result = await service.wakeAndWaitForRpc({
      openProtocol,
      checkRpc,
      maxWaitMs: 10000,
      pollIntervalMs: 50,
    });

    expect(result).toBe(true);
    expect(openProtocol).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledTimes(1); // Tab closed after success
    expect(checkRpc).toHaveBeenCalledTimes(3);
  });

  it('returns false when polling times out (tab stays open)', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkRpc = vi.fn().mockResolvedValue(false);

    const result = await service.wakeAndWaitForRpc({
      openProtocol,
      checkRpc,
      maxWaitMs: 300,
      pollIntervalMs: 50,
    });

    expect(result).toBe(false);
    expect(openProtocol).toHaveBeenCalledTimes(1);
    // Tab NOT closed on timeout — user may still click manually
    expect(closeTab).not.toHaveBeenCalled();
    expect(checkRpc.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('treats checkRpc exceptions as unreachable (continues polling)', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    let callCount = 0;
    const checkRpc = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) throw new Error('ECONNREFUSED');
      return true;
    });

    const result = await service.wakeAndWaitForRpc({
      openProtocol,
      checkRpc,
      maxWaitMs: 10000,
      pollIntervalMs: 50,
    });

    expect(result).toBe(true);
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(checkRpc).toHaveBeenCalledTimes(3);
  });

  it('deduplicates concurrent wake calls (single protocol launch)', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    let callCount = 0;
    const checkRpc = vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount >= 3;
    });

    const deps = { openProtocol, checkRpc, maxWaitMs: 10000, pollIntervalMs: 50 };

    // Fire two concurrent wake requests
    const [r1, r2] = await Promise.all([
      service.wakeAndWaitForRpc(deps),
      service.wakeAndWaitForRpc(deps),
    ]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    // Protocol should only be opened once despite two concurrent callers
    expect(openProtocol).toHaveBeenCalledTimes(1);
  });

  it('uses default timeouts when not specified', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkRpc = vi.fn().mockResolvedValue(true);

    // First call returns false (not reachable), second returns true
    checkRpc.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await service.wakeAndWaitForRpc({
      openProtocol,
      checkRpc,
      // No maxWaitMs / pollIntervalMs — should use defaults
    });

    expect(result).toBe(true);
  });

  it('resets state after completion so subsequent calls work', async () => {
    const closeTab = vi.fn();
    const openProtocol = vi.fn().mockResolvedValue(closeTab);
    const checkRpc = vi.fn().mockResolvedValue(false);

    // First call: timeout
    const r1 = await service.wakeAndWaitForRpc({
      openProtocol,
      checkRpc,
      maxWaitMs: 100,
      pollIntervalMs: 30,
    });
    expect(r1).toBe(false);

    // Second call: immediate success
    checkRpc.mockResolvedValue(true);
    const r2 = await service.wakeAndWaitForRpc({
      openProtocol,
      checkRpc,
      maxWaitMs: 5000,
      pollIntervalMs: 50,
    });
    expect(r2).toBe(true);
  });
});
