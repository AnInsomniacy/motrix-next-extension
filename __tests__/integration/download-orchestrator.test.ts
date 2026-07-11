import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type {
  DownloadCandidate,
  DownloadItem,
  OrchestratorDeps,
} from '@/lib/download/orchestrator';
import type { DownloadSettings, SiteRule } from '@/shared/types';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import { DesktopApiClient } from '@/lib/api/desktop-client';
import { ApiAuthError } from '@/shared/errors';
import type {
  RequestHeaderContext,
  RequestHeaderMatchReason,
} from '@/lib/download/request-context';

// ─── Mock Types ─────────────────────────────────────────

interface MockDownloadItem {
  id: number;
  url: string;
  finalUrl: string;
  filename: string;
  fileSize: number;
  totalBytes: number;
  mime: string;
  byExtensionId?: string;
  state: string;
  referrer?: string;
  requestHeaderContext?: RequestHeaderContext;
  requestHeaderDiagnostics?: {
    enabled: boolean;
    matched: boolean;
    reason: RequestHeaderMatchReason | 'disabled';
    source?: 'finalUrl' | 'url';
    ageMs?: number;
  };
}

function createMockDownloadItem(overrides?: Partial<MockDownloadItem>): DownloadItem {
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

function createMockDownloadCandidate(overrides?: Partial<DownloadCandidate>): DownloadCandidate {
  const { id: _id, state: _state, ...candidate } = createMockDownloadItem();
  return { ...candidate, ...overrides };
}

function createDesktopClient(reachable = true, secret = 'secret'): DesktopApiClient {
  const client = new DesktopApiClient({ port: 29110, secret });
  vi.spyOn(client, 'isReachable').mockResolvedValue(reachable);
  return client;
}

// ─── Mock Dependencies ──────────────────────────────────

function createMockDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    downloads: {
      cancel: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      erase: vi.fn<(query: { id: number }) => Promise<void>>().mockResolvedValue(undefined),
    },
    diagnosticLog: {
      append: vi.fn(),
    },
    getSettings: vi.fn().mockReturnValue({
      ...DEFAULT_DOWNLOAD_SETTINGS,
    } satisfies DownloadSettings),
    getLatestSettings: vi.fn().mockResolvedValue({
      ...DEFAULT_DOWNLOAD_SETTINGS,
    } satisfies DownloadSettings),
    getSiteRules: vi.fn().mockReturnValue([] as SiteRule[]),
    openProtocolNewTask: vi
      .fn<(url: string, referer: string, filename?: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    ...overrides,
  };
}

type MockDeps = ReturnType<typeof createMockDeps>;

// ─── Tests ──────────────────────────────────────────────

describe('DownloadOrchestrator', () => {
  let deps: MockDeps;
  let orchestrator: DownloadOrchestrator;

  beforeEach(() => {
    deps = createMockDeps();
    orchestrator = new DownloadOrchestrator(deps);
  });

  // ─── handleCreated — state guard (#267) ─────────────────

  describe('handleCreated — state guard against stale replay', () => {
    it('skips downloads with state "complete" (Chrome history replay)', async () => {
      const item = createMockDownloadItem({ state: 'complete' });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(false);
      expect(deps.downloads.cancel).not.toHaveBeenCalled();
      expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
    });

    it('skips downloads with state "interrupted" (resumed after reboot)', async () => {
      const item = createMockDownloadItem({ state: 'interrupted' });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(false);
      expect(deps.downloads.cancel).not.toHaveBeenCalled();
      expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
    });

    it('logs download_skipped with state-guard stage for stale items', async () => {
      const item = createMockDownloadItem({ state: 'complete' });

      await orchestrator.handleCreated(item);

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'download_skipped',
          context: expect.objectContaining({
            state: 'complete',
            stage: 'state-guard',
          }),
        }),
      );
    });

    it('does not invoke getSettings for stale items (fast path)', async () => {
      const item = createMockDownloadItem({ state: 'complete' });

      await orchestrator.handleCreated(item);

      expect(deps.getSettings).not.toHaveBeenCalled();
    });
  });

  describe('handleResponse — Firefox pre-download routing', () => {
    it('cancels the response only after the desktop API accepts the download', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const responseDeps = createMockDeps({ desktopClient });
      const orch = new DownloadOrchestrator(responseDeps);

      const intercepted = await orch.handleResponse(createMockDownloadCandidate(), {
        filename: 'file.zip',
        source: 'content-disposition',
      });

      expect(intercepted).toBe(true);
      expect(addDownload).toHaveBeenCalledTimes(1);
      expect(responseDeps.downloads.cancel).not.toHaveBeenCalled();
      expect(responseDeps.openProtocolNewTask).not.toHaveBeenCalled();
    });

    it('leaves the Firefox response untouched when the desktop API is unavailable', async () => {
      const desktopClient = createDesktopClient(false);
      const addDownload = vi.spyOn(desktopClient, 'addDownload');
      const browserSettings = {
        ...DEFAULT_DOWNLOAD_SETTINGS,
        desktopUnavailable: {
          ...DEFAULT_DOWNLOAD_SETTINGS.desktopUnavailable,
          action: 'browser' as const,
        },
      } satisfies DownloadSettings;
      const responseDeps = createMockDeps({
        desktopClient,
        getSettings: vi.fn().mockReturnValue(browserSettings),
        getLatestSettings: vi.fn().mockResolvedValue(browserSettings),
      });
      const orch = new DownloadOrchestrator(responseDeps);

      const intercepted = await orch.handleResponse(createMockDownloadCandidate());

      expect(intercepted).toBe(false);
      expect(addDownload).not.toHaveBeenCalled();
      expect(responseDeps.downloads.cancel).not.toHaveBeenCalled();
      expect(responseDeps.openProtocolNewTask).not.toHaveBeenCalled();
    });
  });

  // ─── handleCreated — cookie collection ─────────────────

  describe('handleCreated — cookie forwarding', () => {
    it('forwards cookies only to the HTTP API path', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const cookieDeps = createMockDeps({
        desktopClient,
        openProtocolNewTask: undefined,
        getSettings: vi.fn().mockReturnValue({
          ...DEFAULT_DOWNLOAD_SETTINGS,
          forwardCookies: true,
        } satisfies DownloadSettings),
        cookies: {
          getAll: vi.fn().mockResolvedValue([
            { name: 'token', value: 'abc123' },
            { name: 'session', value: 'xyz789' },
          ]),
        },
      });
      const orch = new DownloadOrchestrator(cookieDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://example.com/file.zip',
        finalUrl: 'https://example.com/file.zip',
        referer: 'https://example.com/page',
        cookie: 'token=abc123; session=xyz789',
        filename: 'file.zip',
      });
    });

    it('forwards captured request headers and User-Agent only through the HTTP API path', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({ desktopClient, openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          requestHeaderContext: {
            url: 'https://example.com/file.zip',
            createdAt: 1000,
            referer: 'https://download.example.com/page',
            userAgent: 'Browser/1.0',
            requestHeaders: [{ name: 'Accept', value: 'application/octet-stream' }],
          },
        }),
      );

      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://example.com/file.zip',
        finalUrl: 'https://example.com/file.zip',
        referer: 'https://download.example.com/page',
        cookie: undefined,
        filename: 'file.zip',
        userAgent: 'Browser/1.0',
        requestHeaders: [{ name: 'Accept', value: 'application/octet-stream' }],
      });
    });

    it('logs only header context counts and booleans after HTTP routing', async () => {
      const desktopClient = createDesktopClient();
      vi.spyOn(desktopClient, 'addDownload').mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({ desktopClient, openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          requestHeaderContext: {
            url: 'https://example.com/file.zip',
            createdAt: 1000,
            userAgent: 'SensitiveBrowser/1.0',
            requestHeaders: [{ name: 'Origin', value: 'https://private.example.com' }],
          },
        }),
      );

      const routedCall = (apiDeps.diagnosticLog.append as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => (c[0] as { code: string }).code === 'download_routed',
      );

      expect(routedCall).toBeDefined();
      expect((routedCall![0] as { context: Record<string, unknown> }).context).toEqual(
        expect.objectContaining({
          hasCookie: false,
          hasUserAgent: true,
          headerCount: 1,
          matchedHeaderContext: true,
        }),
      );
      expect(JSON.stringify(routedCall![0])).not.toContain('SensitiveBrowser');
      expect(JSON.stringify(routedCall![0])).not.toContain('private.example.com');
    });

    it('logs request-header match reason when no cached context is available', async () => {
      const desktopClient = createDesktopClient();
      vi.spyOn(desktopClient, 'addDownload').mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({ desktopClient, openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          requestHeaderDiagnostics: {
            enabled: true,
            matched: false,
            reason: 'expired',
          },
        }),
      );

      const routedCall = (apiDeps.diagnosticLog.append as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => (c[0] as { code: string }).code === 'download_routed',
      );

      expect(routedCall).toBeDefined();
      expect((routedCall![0] as { context: Record<string, unknown> }).context).toEqual(
        expect.objectContaining({
          requestHeadersEnabled: true,
          matchedHeaderContext: false,
          headerMatchReason: 'expired',
          hasUserAgent: false,
          headerCount: 0,
        }),
      );
    });

    it('does not forward generic download placeholder as HTTP API filename', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({ desktopClient, openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          url: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
          finalUrl: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
          filename: 'download',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      );

      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
        finalUrl: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
        referer: 'https://example.com/page',
        cookie: undefined,
      });
    });

    it('does not forward numeric download-item placeholder as HTTP API filename', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({ desktopClient, openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          url: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
          finalUrl: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
          filename: '0.xlsx',
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );

      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
        finalUrl: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
        referer: 'https://example.com/page',
        cookie: undefined,
      });
    });

    it('forwards filename metadata captured from Content-Disposition', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({
        desktopClient,
        openProtocolNewTask: undefined,
        filenameMetadata: {
          resolve: vi.fn().mockResolvedValue({
            filename: 'ИТОГИ ЛДУ 2026.xlsx',
            source: 'content-disposition',
          }),
        },
      });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          url: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
          finalUrl: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
          filename: 'download',
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );

      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
        finalUrl: 'https://mail-attachment.googleusercontent.com/attachment/u/0/',
        referer: 'https://example.com/page',
        cookie: undefined,
        filename: 'ИТОГИ ЛДУ 2026.xlsx',
      });
    });

    it('forwards meaningful unicode filename as HTTP API filename', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({ desktopClient, openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          url: 'https://cdn.example.com/hash',
          finalUrl: 'https://cdn.example.com/hash',
          filename: 'Итоги_2026.docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      );

      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://cdn.example.com/hash',
        finalUrl: 'https://cdn.example.com/hash',
        referer: 'https://example.com/page',
        cookie: undefined,
        filename: 'Итоги_2026.docx',
      });
    });

    it('decodes RFC 2047 encoded-word filename before forwarding to HTTP API', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({ desktopClient, openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(apiDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          url: 'https://cdn.example.com/hash',
          finalUrl: 'https://cdn.example.com/hash',
          filename: '=?UTF-8?B?0JjRgtC+0LPQuF8yMDI2LmRvY3g=?=',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      );

      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://cdn.example.com/hash',
        finalUrl: 'https://cdn.example.com/hash',
        referer: 'https://example.com/page',
        cookie: undefined,
        filename: 'Итоги_2026.docx',
      });
    });

    it('includes hasCookie: true in diagnostic context when cookies are collected', async () => {
      const desktopClient = createDesktopClient();
      vi.spyOn(desktopClient, 'addDownload').mockResolvedValue({ action: 'queued' });
      const cookieDeps = createMockDeps({
        desktopClient,
        openProtocolNewTask: undefined,
        getSettings: vi.fn().mockReturnValue({
          ...DEFAULT_DOWNLOAD_SETTINGS,
          forwardCookies: true,
        } satisfies DownloadSettings),
        cookies: {
          getAll: vi.fn().mockResolvedValue([{ name: 'auth', value: 'secret' }]),
        },
      });
      const orch = new DownloadOrchestrator(cookieDeps);

      await orch.handleCreated(createMockDownloadItem());

      const routedCall = (
        cookieDeps.diagnosticLog.append as ReturnType<typeof vi.fn>
      ).mock.calls.find((c: unknown[]) => (c[0] as { code: string }).code === 'download_routed');
      expect(routedCall).toBeDefined();
      expect((routedCall![0] as { context: { hasCookie: boolean } }).context.hasCookie).toBe(true);
    });

    it('prefers the captured browser Cookie header over cookies API reconstruction', async () => {
      const desktopClient = createDesktopClient();
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const getAll = vi.fn().mockResolvedValue([{ name: 'xf_session', value: 'abc' }]);
      const cookieDeps = createMockDeps({
        desktopClient,
        openProtocolNewTask: undefined,
        getSettings: vi.fn().mockReturnValue({
          ...DEFAULT_DOWNLOAD_SETTINGS,
          forwardCookies: true,
        } satisfies DownloadSettings),
        cookies: { getAll },
      });
      const orch = new DownloadOrchestrator(cookieDeps);

      await orch.handleCreated(
        createMockDownloadItem({
          requestHeaderContext: {
            url: 'https://spigotmc.org/download',
            createdAt: 1000,
            cookie: 'xf_session=abc; cf_clearance=ok',
            requestHeaders: [],
          },
        }),
      );

      expect(getAll).not.toHaveBeenCalled();
      expect(addDownload).toHaveBeenCalledWith({
        url: 'https://example.com/file.zip',
        finalUrl: 'https://example.com/file.zip',
        referer: 'https://example.com/page',
        cookie: 'xf_session=abc; cf_clearance=ok',
        filename: 'file.zip',
      });
    });
  });

  // ─── sendUrl — unified deep-link routing ───────────────

  describe('sendUrl — routes all URLs to desktop', () => {
    it('routes HTTP URL to desktop via deep link', async () => {
      const result = await orchestrator.sendUrl(
        'https://example.com/file.zip',
        'https://example.com',
      );

      expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com',
      );
      expect(result).toBe('routed-to-desktop');
    });

    it('routes magnet URI to desktop', async () => {
      const result = await orchestrator.sendUrl('magnet:?xt=urn:btih:abc123', '');

      expect(deps.openProtocolNewTask).toHaveBeenCalledWith('magnet:?xt=urn:btih:abc123', '');
      expect(result).toBe('routed-to-desktop');
    });

    it('routes torrent URL to desktop', async () => {
      const result = await orchestrator.sendUrl(
        'https://example.com/linux.torrent',
        'https://example.com',
      );

      expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/linux.torrent',
        'https://example.com',
      );
      expect(result).toBe('routed-to-desktop');
    });

    it('logs download_routed diagnostic event', async () => {
      await orchestrator.sendUrl('https://example.com/file.zip', '');

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'download_routed',
          level: 'info',
        }),
      );
    });

    it('throws when openProtocolNewTask is unavailable', async () => {
      const noDeps = createMockDeps({ openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(noDeps);

      await expect(orch.sendUrl('https://example.com/file.zip', '')).rejects.toThrow();
    });

    it('does not fall back to deep-link when HTTP API authentication fails', async () => {
      const desktopClient = new DesktopApiClient({ port: 29110, secret: 'wrong-secret' });
      vi.spyOn(desktopClient, 'addDownload').mockRejectedValue(new ApiAuthError());
      const authDeps = createMockDeps({
        desktopClient,
        wakeDesktop: vi.fn().mockResolvedValue(true),
      });
      const orch = new DownloadOrchestrator(authDeps);

      await expect(orch.sendUrl('https://example.com/file.zip', '')).rejects.toThrow(
        'Desktop app routing unavailable',
      );

      expect(authDeps.wakeDesktop).not.toHaveBeenCalled();
      expect(authDeps.openProtocolNewTask).not.toHaveBeenCalled();
      expect(authDeps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'api_auth_failed',
          level: 'error',
        }),
      );
    });
  });

  // ─── Diagnostic logging coverage ──────────────────────

  describe('diagnostic log — cookie_collect_failed', () => {
    it('logs cookie_collect_failed when cookies.getAll throws', async () => {
      const desktopClient = createDesktopClient();
      vi.spyOn(desktopClient, 'addDownload').mockResolvedValue({ action: 'queued' });
      const errorDeps = createMockDeps({
        desktopClient,
        getSettings: vi.fn().mockReturnValue({
          ...DEFAULT_DOWNLOAD_SETTINGS,
          forwardCookies: true,
        } satisfies DownloadSettings),
        cookies: {
          getAll: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });
      const orch = new DownloadOrchestrator(errorDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(errorDeps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'cookie_collect_failed',
          level: 'warn',
        }),
      );
    });
  });

  describe('diagnostic log — download_cancel_failed', () => {
    it('logs download_cancel_failed when cancel throws', async () => {
      const desktopClient = createDesktopClient();
      vi.spyOn(desktopClient, 'addDownload').mockResolvedValue({ action: 'queued' });
      const errorDeps = createMockDeps({
        desktopClient,
        downloads: {
          cancel: vi.fn().mockRejectedValue(new Error('Download already gone')),
          erase: vi.fn().mockResolvedValue(undefined),
        },
      });
      const orch = new DownloadOrchestrator(errorDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(errorDeps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'download_cancel_failed',
          level: 'warn',
        }),
      );
    });
  });

  describe('diagnostic log — stage name in context', () => {
    it('includes stage name in download_skipped context', async () => {
      (deps.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_DOWNLOAD_SETTINGS,
        enabled: false,
      });

      await orchestrator.handleCreated(createMockDownloadItem());

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'download_skipped',
          context: expect.objectContaining({ stage: 'enabled' }),
        }),
      );
    });

    it('includes stage name in download_skipped context for scheme filter', async () => {
      const item = createMockDownloadItem({ url: 'blob:https://example.com/abc' });

      await orchestrator.handleCreated(item);

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'download_skipped',
          context: expect.objectContaining({ stage: 'scheme' }),
        }),
      );
    });
  });
});
