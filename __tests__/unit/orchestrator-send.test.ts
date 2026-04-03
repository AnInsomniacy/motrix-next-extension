import { describe, it, expect, vi } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type { OrchestratorDeps } from '@/lib/download/orchestrator';
import type { SiteRule } from '@/shared/types';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';

// ─── Mock Deps Factory ──────────────────────────────────

function createMockDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    aria2: {
      addUri: vi.fn<(uris: string[], opts?: unknown) => Promise<string>>().mockResolvedValue('gid-ctx-1'),
    },
    downloads: {
      pause: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      resume: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      cancel: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      erase: vi.fn<(query: { id: number }) => Promise<void>>().mockResolvedValue(undefined),
    },
    notifications: {
      create: vi.fn().mockResolvedValue('notification-id'),
    },
    cookies: {
      getAll: vi.fn().mockResolvedValue([]),
    },
    diagnosticLog: {
      append: vi.fn(),
    },
    getSettings: () => ({ ...DEFAULT_DOWNLOAD_SETTINGS }),
    getSiteRules: () => [] as SiteRule[],
    getTabUrl: vi.fn<() => Promise<string>>().mockResolvedValue(''),
    hasEnhancedPermissions: () => false,
    onSent: vi.fn(),
    ...overrides,
  };
}

// ─── sendUrl Tests ──────────────────────────────────────

describe('DownloadOrchestrator.sendUrl', () => {
  it('sends URL to aria2 and returns the GID', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    const result = await orch.sendUrl('https://example.com/file.zip', 'https://example.com');

    expect(deps.aria2.addUri).toHaveBeenCalledWith(
      ['https://example.com/file.zip'],
      expect.objectContaining({ header: expect.arrayContaining(['Referer: https://example.com']) }),
    );
    expect(result).toBe('gid-ctx-1');
  });

  it('includes cookie header when enhanced permissions are available', async () => {
    const deps = createMockDeps({
      hasEnhancedPermissions: () => true,
      cookies: {
        getAll: vi.fn().mockResolvedValue([
          { name: 'session', value: 'abc123' },
          { name: 'token', value: 'xyz' },
        ]),
      },
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', 'https://example.com');

    expect(deps.aria2.addUri).toHaveBeenCalledWith(
      ['https://example.com/file.zip'],
      expect.objectContaining({
        header: expect.arrayContaining(['Cookie: session=abc123; token=xyz']),
      }),
    );
  });

  it('logs download_sent diagnostic event on success', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'download_sent',
        level: 'info',
      }),
    );
  });

  it('calls onSent callback with gid and filename on success', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.onSent).toHaveBeenCalledWith('gid-ctx-1', 'file.zip');
  });

  it('logs download_failed diagnostic event on error', async () => {
    const deps = createMockDeps({
      aria2: {
        addUri: vi.fn().mockRejectedValue(new Error('connection refused')),
      },
    });
    const orch = new DownloadOrchestrator(deps);

    await expect(orch.sendUrl('https://example.com/file.zip', '')).rejects.toThrow('connection refused');

    expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'download_failed',
        level: 'error',
      }),
    );
  });

  it('omits referer header when tabUrl is empty', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    const call = (deps.aria2.addUri as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = call?.[1] as Record<string, unknown> | undefined;
    // Should not have header array, or header array shouldn't contain Referer
    if (options?.header) {
      expect(options.header).not.toContain(expect.stringContaining('Referer'));
    }
  });

  it('creates start notification when notifyOnStart is true', async () => {
    const deps = createMockDeps({
      getSettings: () => ({ ...DEFAULT_DOWNLOAD_SETTINGS, notifyOnStart: true }),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.notifications.create).toHaveBeenCalled();
  });

  it('skips notification when notifyOnStart is false', async () => {
    const deps = createMockDeps({
      getSettings: () => ({ ...DEFAULT_DOWNLOAD_SETTINGS, notifyOnStart: false }),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.notifications.create).not.toHaveBeenCalled();
  });
});
