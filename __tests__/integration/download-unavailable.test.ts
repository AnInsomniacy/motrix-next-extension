import { describe, expect, it, vi } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type {
  DownloadCandidate,
  DownloadItem,
  OrchestratorDeps,
} from '@/lib/download/orchestrator';
import { DesktopApiClient } from '@/lib/api';
import { ApiUnreachableError } from '@/lib/api';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/lib/schema';
import type { DownloadSettings, SiteRule } from '@/lib/schema';

function createDownloadItem(): DownloadItem {
  return {
    id: 1,
    url: 'https://example.com/file.zip',
    finalUrl: 'https://example.com/file.zip',
    filename: 'file.zip',
    fileSize: 10_000_000,
    totalBytes: 10_000_000,
    mime: 'application/zip',
    state: 'in_progress',
    referrer: 'https://example.com/page',
  };
}

function createDownloadCandidate(): DownloadCandidate {
  const { id: _id, state: _state, ...candidate } = createDownloadItem();
  return candidate;
}

type DownloadLifecycleDeps = OrchestratorDeps;

function createDeps(options?: {
  action?: 'launch' | 'browser';
  ready?: boolean;
  activationResult?: boolean;
  activationFails?: boolean;
  routeFails?: boolean;
  calls?: string[];
}): DownloadLifecycleDeps {
  const desktopClient = new DesktopApiClient({ port: 29110, secret: '' });
  const ready = options?.ready ?? false;
  vi.spyOn(desktopClient, 'isReady').mockResolvedValue(ready);
  if (options?.routeFails) {
    vi.spyOn(desktopClient, 'addDownload').mockRejectedValue(new ApiUnreachableError());
  } else if (ready || options?.activationResult) {
    vi.spyOn(desktopClient, 'addDownload').mockImplementation(async () => {
      options?.calls?.push('route');
      return { action: 'queued' };
    });
  } else {
    vi.spyOn(desktopClient, 'addDownload').mockRejectedValue(new ApiUnreachableError());
  }

  const settings = {
    ...DEFAULT_DOWNLOAD_SETTINGS,
    desktopUnavailable: {
      action: options?.action ?? 'browser',
      startupTimeoutSeconds: 15,
    },
  } as unknown as DownloadSettings;

  const deps = {
    downloads: {
      cancel: vi.fn().mockImplementation(async () => {
        options?.calls?.push('cancel');
      }),
      erase: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(2),
    },
    diagnosticLog: { append: vi.fn() },
    getSettings: () => settings,
    getSiteRules: () => [] as SiteRule[],
    desktopClient,
    activateDesktop: vi.fn().mockImplementation(async () => {
      options?.calls?.push('activate');
      if (options?.activationFails) throw new Error('Native host activation failed');
      return options?.activationResult ?? false;
    }),
  };

  return deps as DownloadLifecycleDeps;
}

describe('automatic download fallback', () => {
  it('leaves the browser download untouched when Motrix Next is unavailable', async () => {
    const deps = createDeps();
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleFirefoxCreatedDownload(createDownloadItem());

    expect(intercepted).toBe(false);
    expect(deps.downloads.cancel).not.toHaveBeenCalled();
    expect(deps.downloads.erase).not.toHaveBeenCalled();
    expect(deps.activateDesktop).not.toHaveBeenCalled();
  });

  it('intercepts normally in browser mode when Motrix Next and its engine are ready', async () => {
    const calls: string[] = [];
    const deps = createDeps({ action: 'browser', ready: true, calls });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleFirefoxCreatedDownload(createDownloadItem());

    expect(intercepted).toBe(true);
    expect(deps.desktopClient?.isReady).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['cancel', 'route']);
  });

  it('keeps the original cancel-first flow in launch mode when the desktop app is running', async () => {
    const calls: string[] = [];
    const deps = createDeps({
      action: 'launch',
      ready: true,
      activationResult: true,
      calls,
    });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleFirefoxCreatedDownload(createDownloadItem());

    expect(intercepted).toBe(true);
    expect(calls).toEqual(['cancel', 'activate', 'route']);
  });

  it('waits for Firefox startup using the configured timeout before intercepting', async () => {
    const deps = createDeps({ action: 'launch', ready: false, activationResult: true });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleFirefoxResponseTakeover(createDownloadCandidate());

    expect(intercepted).toBe(true);
    expect(deps.activateDesktop).toHaveBeenCalledWith(15_000);
    expect(deps.desktopClient?.addDownload).toHaveBeenCalledTimes(1);
  });

  it('restores the browser download when desktop submission fails in launch mode', async () => {
    const deps = createDeps({ action: 'launch', ready: true, routeFails: true });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleFirefoxCreatedDownload(createDownloadItem());

    expect(intercepted).toBe(false);
    expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
    expect(deps.downloads.download).toHaveBeenCalledWith({
      url: 'https://example.com/file.zip',
    });
  });

  it('restores the browser download when desktop activation fails', async () => {
    const calls: string[] = [];
    const deps = createDeps({
      action: 'launch',
      ready: false,
      activationFails: true,
      calls,
    });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleFirefoxCreatedDownload(createDownloadItem());

    expect(intercepted).toBe(false);
    expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
    expect(calls).toEqual(['cancel', 'activate']);
    expect(deps.downloads.download).toHaveBeenCalledWith({
      url: 'https://example.com/file.zip',
    });
  });

  it('restores a Firefox response when desktop startup times out', async () => {
    const deps = createDeps({ action: 'launch', ready: false, activationResult: false });
    const orchestrator = new DownloadOrchestrator(deps);

    expect(await orchestrator.handleFirefoxResponseTakeover(createDownloadCandidate())).toBe(false);

    expect(deps.activateDesktop).toHaveBeenCalledTimes(1);
    expect(deps.downloads.download).toHaveBeenCalledWith({
      url: 'https://example.com/file.zip',
    });
  });
});
