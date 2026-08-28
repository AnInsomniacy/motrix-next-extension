import { describe, expect, it, vi } from 'vitest';
import { createDesktopActivationCoordinator } from '@/lib/desktop';

describe('createDesktopActivationCoordinator', () => {
  it('skips activation when the desktop app and engine are ready', async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    const checkReady = vi.fn().mockResolvedValue(true);

    const result = await createDesktopActivationCoordinator()({
      activate,
      checkReady,
      maxWaitMs: 5000,
      pollIntervalMs: 10,
    });

    expect(result).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('activates once and polls until the desktop app and engine are ready', async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    const checkReady = vi.fn().mockImplementation(async () => ++callCount >= 3);

    const result = await createDesktopActivationCoordinator()({
      activate,
      checkReady,
      maxWaitMs: 1000,
      pollIntervalMs: 10,
    });

    expect(result).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(checkReady).toHaveBeenCalledTimes(3);
  });

  it('returns false when readiness polling times out', async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    const checkReady = vi.fn().mockResolvedValue(false);

    const result = await createDesktopActivationCoordinator()({
      activate,
      checkReady,
      maxWaitMs: 40,
      pollIntervalMs: 10,
    });

    expect(result).toBe(false);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(checkReady.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('treats readiness check failures as not ready', async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    const checkReady = vi.fn().mockImplementation(async () => {
      if (++callCount < 3) throw new Error('ECONNREFUSED');
      return true;
    });

    const result = await createDesktopActivationCoordinator()({
      activate,
      checkReady,
      maxWaitMs: 1000,
      pollIntervalMs: 10,
    });

    expect(result).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(checkReady).toHaveBeenCalledTimes(3);
  });

  it('coalesces concurrent activation attempts', async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    const checkReady = vi.fn().mockResolvedValue(false);
    const activateAndWait = createDesktopActivationCoordinator();
    const options = { activate, checkReady, maxWaitMs: 40, pollIntervalMs: 10 };

    const first = activateAndWait(options);
    const second = activateAndWait(options);

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('clears the pending activation after completion', async () => {
    const activate = vi.fn().mockResolvedValue(undefined);
    const checkReady = vi.fn().mockResolvedValue(false);
    const activateAndWait = createDesktopActivationCoordinator();

    await activateAndWait({ activate, checkReady, maxWaitMs: 20, pollIntervalMs: 10 });
    checkReady.mockResolvedValue(true);

    await expect(
      activateAndWait({ activate, checkReady, maxWaitMs: 100, pollIntervalMs: 10 }),
    ).resolves.toBe(true);
    expect(checkReady.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
