import { describe, expect, it, vi } from 'vitest';
import { DesktopApiClient } from '@/lib/api';
import { holdChromiumFilenameDecision } from '@/lib/download/chromium-interception';
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
    finalUrl: 'https://example.com/file.zip',
    filename: 'file.zip',
    filenameSource: 'browser-determined',
    fileSize: 10_000_000,
    totalBytes: 10_000_000,
    mime: 'application/zip',
    state: 'in_progress',
    referrer: 'https://example.com/page',
  };
}

function createDeps(options: {
  settings?: DownloadSettings;
  reachable?: boolean;
  cancel?: (id: number) => Promise<void>;
  calls?: string[];
}): OrchestratorDeps {
  const desktopClient = new DesktopApiClient({ port: 29110, secret: '' });
  vi.spyOn(desktopClient, 'isReachable').mockResolvedValue(options.reachable ?? true);
  vi.spyOn(desktopClient, 'addDownload').mockImplementation(async () => {
    options.calls?.push('route');
    return { action: 'queued' };
  });

  return {
    downloads: {
      cancel: vi.fn(options.cancel ?? (async () => {})),
      erase: vi.fn().mockResolvedValue(undefined),
    },
    diagnosticLog: { append: vi.fn() },
    getSettings: () => options.settings ?? DEFAULT_DOWNLOAD_SETTINGS,
    getSiteRules: () => [] as SiteRule[],
    desktopClient,
  };
}

function runInterception(
  orchestrator: DownloadOrchestrator,
  suggest: () => void,
  onError: (error: unknown) => void = vi.fn(),
): true {
  return holdChromiumFilenameDecision(
    async () => {
      await orchestrator.handleBrowserDownload(createDownloadItem());
    },
    suggest,
    onError,
  );
}

describe('Chromium filename interception', () => {
  it('returns true synchronously and releases only after cancellation completes', async () => {
    const calls: string[] = [];
    let finishCancellation: (() => void) | undefined;
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve;
    });
    const deps = createDeps({
      calls,
      cancel: async () => {
        calls.push('cancel-start');
        await cancellation;
        calls.push('cancel-end');
      },
    });
    const orchestrator = new DownloadOrchestrator(deps);
    const suggest = vi.fn(() => calls.push('suggest'));

    expect(runInterception(orchestrator, suggest)).toBe(true);
    await vi.waitFor(() => expect(deps.downloads.cancel).toHaveBeenCalledWith(1));
    expect(suggest).not.toHaveBeenCalled();

    finishCancellation?.();
    await vi.waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['cancel-start', 'cancel-end', 'route', 'suggest']);
  });

  it('keeps the original download when the desktop app is unavailable', async () => {
    const settings = {
      ...DEFAULT_DOWNLOAD_SETTINGS,
      desktopUnavailable: {
        ...DEFAULT_DOWNLOAD_SETTINGS.desktopUnavailable,
        action: 'browser' as const,
      },
    } satisfies DownloadSettings;
    const deps = createDeps({ settings, reachable: false });
    const orchestrator = new DownloadOrchestrator(deps);
    const suggest = vi.fn();

    runInterception(orchestrator, suggest);

    await vi.waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    expect(deps.downloads.cancel).not.toHaveBeenCalled();
    expect(deps.desktopClient?.addDownload).not.toHaveBeenCalled();
  });

  it('releases a download skipped by the filter without touching it', async () => {
    const settings = {
      ...DEFAULT_DOWNLOAD_SETTINGS,
      enabled: false,
    } satisfies DownloadSettings;
    const deps = createDeps({ settings });
    const orchestrator = new DownloadOrchestrator(deps);
    const suggest = vi.fn();

    runInterception(orchestrator, suggest);

    await vi.waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    expect(deps.downloads.cancel).not.toHaveBeenCalled();
    expect(deps.desktopClient?.isReachable).not.toHaveBeenCalled();
  });

  it('releases the filename decision when interception throws', async () => {
    const suggest = vi.fn();
    const onError = vi.fn();

    expect(
      holdChromiumFilenameDecision(
        async () => {
          throw new Error('interception failed');
        },
        suggest,
        onError,
      ),
    ).toBe(true);

    await vi.waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'interception failed' }),
    );
  });

  it('calls suggest exactly once after successful interception', async () => {
    const deps = createDeps({});
    const orchestrator = new DownloadOrchestrator(deps);
    const suggest = vi.fn();

    runInterception(orchestrator, suggest);

    await vi.waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(suggest).toHaveBeenCalledTimes(1);
  });
});
