import { describe, expect, it, vi } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type {
  DownloadCandidate,
  DownloadItem,
  OrchestratorDeps,
} from '@/lib/download/orchestrator';
import { DesktopApiClient } from '@/lib/api/desktop-client';
import { ApiUnreachableError } from '@/shared/errors';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import type { DownloadSettings, SiteRule } from '@/shared/types';

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
  latestAction?: 'launch' | 'browser';
  reachable?: boolean;
  wakeResult?: boolean;
  wakeFails?: boolean;
  routeFails?: boolean;
  calls?: string[];
}): DownloadLifecycleDeps {
  const desktopClient = new DesktopApiClient({ port: 29110, secret: '' });
  const reachable = options?.reachable ?? false;
  vi.spyOn(desktopClient, 'isReachable').mockResolvedValue(reachable);
  if (options?.routeFails) {
    vi.spyOn(desktopClient, 'addDownload').mockRejectedValue(new ApiUnreachableError());
  } else if (reachable || options?.wakeResult) {
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
    },
    diagnosticLog: { append: vi.fn() },
    getSettings: () => settings,
    getLatestSettings: vi.fn().mockResolvedValue({
      ...settings,
      desktopUnavailable: {
        ...settings.desktopUnavailable,
        action: options?.latestAction ?? settings.desktopUnavailable.action,
      },
    }),
    getSiteRules: () => [] as SiteRule[],
    desktopClient,
    wakeDesktop: vi.fn().mockImplementation(async () => {
      options?.calls?.push('wake');
      if (options?.wakeFails) throw new Error('Protocol launch failed');
      return options?.wakeResult ?? false;
    }),
    openProtocolNewTask: vi.fn().mockResolvedValue(undefined),
  };

  return deps as DownloadLifecycleDeps;
}

describe('automatic download fallback', () => {
  it('leaves the browser download untouched when Motrix Next is unavailable', async () => {
    const deps = createDeps();
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleCreated(createDownloadItem());

    expect(intercepted).toBe(false);
    expect(deps.downloads.cancel).not.toHaveBeenCalled();
    expect(deps.downloads.erase).not.toHaveBeenCalled();
    expect(deps.wakeDesktop).not.toHaveBeenCalled();
    expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
  });

  it('intercepts normally in browser mode when Motrix Next is reachable', async () => {
    const calls: string[] = [];
    const deps = createDeps({ action: 'browser', reachable: true, calls });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleCreated(createDownloadItem());

    expect(intercepted).toBe(true);
    expect(deps.desktopClient?.isReachable).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['cancel', 'route']);
  });

  it('uses the persisted browser fallback before attempting to launch Motrix Next', async () => {
    const deps = createDeps({ action: 'launch', latestAction: 'browser' });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleCreated(createDownloadItem());

    expect(intercepted).toBe(false);
    expect(deps.wakeDesktop).not.toHaveBeenCalled();
  });

  it('keeps the original cancel-first flow in launch mode when the desktop app is running', async () => {
    const calls: string[] = [];
    const deps = createDeps({
      action: 'launch',
      reachable: true,
      wakeResult: true,
      calls,
    });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleCreated(createDownloadItem());

    expect(intercepted).toBe(true);
    expect(calls).toEqual(['cancel', 'wake', 'route']);
  });

  it('waits for Firefox startup using the configured timeout before intercepting', async () => {
    const deps = createDeps({ action: 'launch', reachable: false, wakeResult: true });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleResponse(createDownloadCandidate());

    expect(intercepted).toBe(true);
    expect(deps.wakeDesktop).toHaveBeenCalledWith(15_000);
    expect(deps.desktopClient?.addDownload).toHaveBeenCalledTimes(1);
    expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
  });

  it('discards the browser download when desktop submission fails in launch mode', async () => {
    const deps = createDeps({ action: 'launch', reachable: true, routeFails: true });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleCreated(createDownloadItem());

    expect(intercepted).toBe(true);
    expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
    expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
  });

  it('discards the browser download when desktop startup fails', async () => {
    const calls: string[] = [];
    const deps = createDeps({
      action: 'launch',
      reachable: false,
      wakeFails: true,
      calls,
    });
    const orchestrator = new DownloadOrchestrator(deps);

    const intercepted = await orchestrator.handleCreated(createDownloadItem());

    expect(intercepted).toBe(true);
    expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
    expect(calls).toEqual(['cancel', 'wake']);
  });

  it('cancels a Firefox response when desktop startup times out', async () => {
    const deps = createDeps({ action: 'launch', reachable: false, wakeResult: false });
    const orchestrator = new DownloadOrchestrator(deps);

    expect(await orchestrator.handleResponse(createDownloadCandidate())).toBe(true);

    expect(deps.wakeDesktop).toHaveBeenCalledTimes(1);
  });
});
