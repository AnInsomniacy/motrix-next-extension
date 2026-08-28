import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiAuthError, DesktopApiClient } from '@/lib/api';
import {
  DownloadOrchestrator,
  type DownloadItem,
  type OrchestratorDeps,
} from '@/lib/download/orchestrator';
import type { RequestHeaderContext } from '@/lib/download/request-context';
import { DEFAULT_DOWNLOAD_SETTINGS, type SiteRule } from '@/lib/schema';

function item(overrides: Partial<DownloadItem> = {}): DownloadItem {
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
    ...overrides,
  };
}

function desktopClient(ready = true): DesktopApiClient {
  const client = new DesktopApiClient({ port: 29110, secret: '' });
  vi.spyOn(client, 'isReady').mockResolvedValue(ready);
  return client;
}

function deps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    downloads: {
      cancel: vi.fn().mockResolvedValue(undefined),
      erase: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(2),
    },
    diagnosticLog: { append: vi.fn() },
    getSettings: vi.fn().mockReturnValue(structuredClone(DEFAULT_DOWNLOAD_SETTINGS)),
    getSiteRules: vi.fn().mockReturnValue([] as SiteRule[]),
    activateDesktop: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('DownloadOrchestrator', () => {
  let baseDeps: OrchestratorDeps;

  beforeEach(() => {
    baseDeps = deps();
  });

  it('ignores stale Firefox replay events without work or log noise', async () => {
    const orchestrator = new DownloadOrchestrator(baseDeps);

    await expect(
      orchestrator.handleFirefoxCreatedDownload(item({ state: 'complete' })),
    ).resolves.toBe(false);
    expect(baseDeps.downloads.cancel).not.toHaveBeenCalled();
    expect(baseDeps.diagnosticLog.append).not.toHaveBeenCalled();
  });

  it('routes claimed Firefox responses and recreates them after routing failure', async () => {
    const client = desktopClient(true);
    const add = vi.spyOn(client, 'addDownload').mockResolvedValue({ action: 'queued' });
    const successDeps = deps({ desktopClient: client });
    const success = new DownloadOrchestrator(successDeps);
    const candidate = (({ id: _id, state: _state, ...rest }) => rest)(item());

    await expect(success.handleFirefoxResponseTakeover(candidate)).resolves.toBe(true);
    expect(add).toHaveBeenCalledTimes(1);

    add.mockRejectedValue(new Error('offline'));
    const fallback = new DownloadOrchestrator(successDeps);
    await expect(fallback.handleFirefoxResponseTakeover(candidate)).resolves.toBe(false);
    expect(successDeps.downloads.download).toHaveBeenCalledWith({ url: candidate.url });
    await expect(fallback.handleFirefoxCreatedDownload(item())).resolves.toBe(false);
    expect(successDeps.downloads.cancel).not.toHaveBeenCalled();
  });

  it('forwards the complete authenticated request context without logging sensitive values', async () => {
    const client = desktopClient(true);
    const add = vi.spyOn(client, 'addDownload').mockResolvedValue({ action: 'queued' });
    const requestHeaderContext: RequestHeaderContext = {
      url: 'https://example.com/file.zip',
      createdAt: Date.now(),
      referer: 'https://example.com/page',
      userAgent: 'Browser/1.0',
      cookie: 'session=secret',
      requestHeaders: [{ name: 'Accept', value: 'application/zip' }],
    };
    const contextDeps = deps({ desktopClient: client });
    const orchestrator = new DownloadOrchestrator(contextDeps);

    await orchestrator.handleFirefoxCreatedDownload(
      item({ filename: 'archive.zip', requestHeaderContext }),
    );

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        cookie: 'session=secret',
        userAgent: 'Browser/1.0',
        requestHeaders: [{ name: 'Accept', value: 'application/zip' }],
        filename: 'archive.zip',
      }),
    );
    const event = vi.mocked(contextDeps.diagnosticLog.append).mock.calls.at(-1)?.[0];
    expect(event).toMatchObject({
      code: 'download_delegated',
      context: { hasCookie: true, headerCount: 1 },
    });
    expect(JSON.stringify(event)).not.toContain('session=secret');
  });

  it('does not forward weak browser filename placeholders', async () => {
    const client = desktopClient(true);
    const add = vi.spyOn(client, 'addDownload').mockResolvedValue({ action: 'queued' });
    const orchestrator = new DownloadOrchestrator(deps({ desktopClient: client }));

    await orchestrator.handleFirefoxCreatedDownload(
      item({
        url: 'https://example.com/download',
        finalUrl: 'https://example.com/download',
        filename: 'download',
      }),
    );

    expect(add).toHaveBeenCalledWith(expect.not.objectContaining({ filename: expect.anything() }));
  });

  it('routes explicit HTTP and protocol URLs through the desktop API', async () => {
    const client = desktopClient(true);
    const add = vi.spyOn(client, 'addDownload').mockResolvedValue({ action: 'queued' });
    const orchestrator = new DownloadOrchestrator(deps({ desktopClient: client }));

    await orchestrator.sendUrl('https://example.com/file.zip', 'https://example.com', {
      source: 'context-menu',
    });
    await orchestrator.sendUrl('magnet:?xt=urn:btih:abc', '', {
      source: 'external-protocol',
    });

    expect(add).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: 'https://example.com/file.zip',
        referer: 'https://example.com',
      }),
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: expect.stringMatching(/^magnet:/) }),
    );
  });

  it('activates once and retries an explicit delivery', async () => {
    const client = desktopClient(false);
    const add = vi
      .spyOn(client, 'addDownload')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ action: 'queued' });
    const activateDesktop = vi.fn().mockResolvedValue(true);
    const orchestrator = new DownloadOrchestrator(deps({ desktopClient: client, activateDesktop }));

    await orchestrator.sendUrl('https://example.com/file.zip', '', { source: 'context-menu' });

    expect(activateDesktop).toHaveBeenCalledWith(15_000);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('does not activate after authentication failure and records one terminal error', async () => {
    const client = desktopClient(true);
    vi.spyOn(client, 'addDownload').mockRejectedValue(new ApiAuthError());
    const authDeps = deps({ desktopClient: client });
    const orchestrator = new DownloadOrchestrator(authDeps);

    await expect(
      orchestrator.sendUrl('https://example.com/file.zip', '', { source: 'context-menu' }),
    ).rejects.toThrow('api-auth-failed');

    expect(authDeps.activateDesktop).not.toHaveBeenCalled();
    expect(authDeps.diagnosticLog.append).toHaveBeenCalledTimes(1);
    expect(authDeps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'api_auth_failed', level: 'error' }),
    );
  });

  it('logs cookie degradation and continues without cookies', async () => {
    const client = desktopClient(true);
    const add = vi.spyOn(client, 'addDownload').mockResolvedValue({ action: 'queued' });
    const cookieDeps = deps({
      desktopClient: client,
      cookies: { getAll: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const orchestrator = new DownloadOrchestrator(cookieDeps);

    await orchestrator.handleFirefoxCreatedDownload(item());

    expect(add).toHaveBeenCalledWith(expect.not.objectContaining({ cookie: expect.anything() }));
    expect(cookieDeps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'cookie_collect_failed', level: 'warn' }),
    );
  });

  it('stops before routing when browser cancellation fails', async () => {
    const cancelDeps = deps({
      downloads: {
        cancel: vi.fn().mockRejectedValue(new Error('cancel failed')),
        erase: vi.fn().mockResolvedValue(undefined),
        download: vi.fn().mockResolvedValue(2),
      },
    });
    const orchestrator = new DownloadOrchestrator(cancelDeps);

    await expect(orchestrator.handleFirefoxCreatedDownload(item())).resolves.toBe(false);
    expect(cancelDeps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'download_cancel_failed', level: 'warn' }),
    );
  });

  it('suppresses routine skip noise while retaining actionable rule skips', async () => {
    const quietDeps = deps({
      getSettings: () => ({
        ...structuredClone(DEFAULT_DOWNLOAD_SETTINGS),
        enabled: false,
      }),
    });
    await new DownloadOrchestrator(quietDeps).handleFirefoxCreatedDownload(item());
    expect(quietDeps.diagnosticLog.append).not.toHaveBeenCalled();

    const ruleDeps = deps({
      getSiteRules: () => [{ id: 'skip', pattern: 'example.com', action: 'always-skip' }],
    });
    await new DownloadOrchestrator(ruleDeps).handleFirefoxCreatedDownload(item());
    expect(ruleDeps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'download_skipped',
        context: expect.objectContaining({ stage: 'site-rule' }),
      }),
    );
  });
});
