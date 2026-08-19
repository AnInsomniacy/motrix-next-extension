import { describe, expect, it, vi } from 'vitest';
import { DesktopApiClient } from '@/lib/api';
import { startChromiumTakeover } from '@/lib/download/chromium-takeover';
import {
  DownloadOrchestrator,
  type DownloadItem,
  type OrchestratorDeps,
} from '@/lib/download/orchestrator';
import { DEFAULT_DOWNLOAD_SETTINGS, type DownloadSettings, type SiteRule } from '@/lib/schema';

function createDownloadItem(): DownloadItem {
  return {
    id: 1,
    url: 'https://example.com/file.zip',
    finalUrl: 'https://cdn.example.com/file.zip',
    filename: 'file.zip',
    filenameSource: 'browser-determined',
    fileSize: 10_000_000,
    totalBytes: 10_000_000,
    mime: 'application/zip',
    state: 'in_progress',
    referrer: 'https://example.com/page',
  };
}

function createDeps(options?: {
  settings?: DownloadSettings;
  reachable?: boolean;
  routeFails?: boolean;
  cancellation?: Promise<void>;
}): OrchestratorDeps {
  const desktopClient = new DesktopApiClient({ port: 29110, secret: '' });
  vi.spyOn(desktopClient, 'isReachable').mockResolvedValue(options?.reachable ?? true);
  vi.spyOn(desktopClient, 'addDownload').mockImplementation(async () => {
    if (options?.routeFails) throw new Error('Connection lost');
    return { action: 'queued' };
  });

  return {
    downloads: {
      cancel: vi.fn().mockReturnValue(options?.cancellation ?? Promise.resolve()),
      erase: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(2),
    },
    diagnosticLog: { append: vi.fn() },
    getSettings: () => options?.settings ?? DEFAULT_DOWNLOAD_SETTINGS,
    getSiteRules: () => [] as SiteRule[],
    desktopClient,
  };
}

describe('Chromium takeover', () => {
  it('issues cancellation before returning from the filename event turn', () => {
    const calls: string[] = [];
    const cancel = vi.fn(() => {
      calls.push('cancel');
      return Promise.resolve();
    });
    const continueTakeover = vi.fn(async () => {
      calls.push('continue');
    });

    expect(startChromiumTakeover(cancel, continueTakeover, vi.fn())).toBeUndefined();
    expect(calls).toEqual(['cancel', 'continue']);
  });

  it('routes only after Chromium confirms cancellation', async () => {
    let finishCancellation: (() => void) | undefined;
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const deps = createDeps({ cancellation });
    const orchestrator = new DownloadOrchestrator(deps);
    const takeover = orchestrator.handleChromiumTakeover(createDownloadItem(), cancellation);

    expect(deps.desktopClient?.addDownload).not.toHaveBeenCalled();
    finishCancellation?.();
    await expect(takeover).resolves.toBe(true);
    expect(deps.downloads.erase).toHaveBeenCalledWith({ id: 1 });
    expect(deps.desktopClient?.addDownload).toHaveBeenCalledTimes(1);
    expect(deps.downloads.download).not.toHaveBeenCalled();
  });

  it('restarts a filtered download in Chrome', async () => {
    const settings = {
      ...DEFAULT_DOWNLOAD_SETTINGS,
      enabled: false,
    } satisfies DownloadSettings;
    const deps = createDeps({ settings });
    const orchestrator = new DownloadOrchestrator(deps);

    await expect(
      orchestrator.handleChromiumTakeover(createDownloadItem(), Promise.resolve()),
    ).resolves.toBe(false);
    expect(deps.downloads.download).toHaveBeenCalledWith({
      url: 'https://example.com/file.zip',
    });
    expect(deps.desktopClient?.isReachable).not.toHaveBeenCalled();
  });

  it('restarts in Chrome when browser fallback mode cannot reach the desktop', async () => {
    const settings = {
      ...DEFAULT_DOWNLOAD_SETTINGS,
      desktopUnavailable: {
        ...DEFAULT_DOWNLOAD_SETTINGS.desktopUnavailable,
        action: 'browser' as const,
      },
    } satisfies DownloadSettings;
    const deps = createDeps({ settings, reachable: false });
    const orchestrator = new DownloadOrchestrator(deps);

    await expect(
      orchestrator.handleChromiumTakeover(createDownloadItem(), Promise.resolve()),
    ).resolves.toBe(false);
    expect(deps.downloads.download).toHaveBeenCalledTimes(1);
    expect(deps.desktopClient?.addDownload).not.toHaveBeenCalled();
  });

  it('restarts in Chrome when browser-mode desktop submission fails', async () => {
    const settings = {
      ...DEFAULT_DOWNLOAD_SETTINGS,
      desktopUnavailable: {
        ...DEFAULT_DOWNLOAD_SETTINGS.desktopUnavailable,
        action: 'browser' as const,
      },
    } satisfies DownloadSettings;
    const deps = createDeps({ settings, routeFails: true });
    const orchestrator = new DownloadOrchestrator(deps);

    await expect(
      orchestrator.handleChromiumTakeover(createDownloadItem(), Promise.resolve()),
    ).resolves.toBe(false);
    expect(deps.downloads.download).toHaveBeenCalledTimes(1);
  });
});
