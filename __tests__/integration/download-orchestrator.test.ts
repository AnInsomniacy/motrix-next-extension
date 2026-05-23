import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type { OrchestratorDeps } from '@/lib/download/orchestrator';
import type { DownloadSettings, SiteRule } from '@/shared/types';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import { DesktopApiClient } from '@/lib/api/desktop-client';
import { ApiAuthError } from '@/shared/errors';

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
}

function createMockDownloadItem(overrides?: Partial<MockDownloadItem>): MockDownloadItem {
  return {
    id: 1,
    url: 'https://example.com/file.zip',
    finalUrl: 'https://example.com/file.zip',
    filename: 'file.zip',
    fileSize: 10_000_000,
    totalBytes: 10_000_000,
    mime: 'application/zip',
    state: 'in_progress',
    ...overrides,
  };
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
    getSiteRules: vi.fn().mockReturnValue([] as SiteRule[]),
    getTabUrl: vi.fn<() => Promise<string>>().mockResolvedValue('https://example.com/page'),
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

  // ─── handleCreated — unified deep-link routing ─────────

  describe('handleCreated — routes all intercepted downloads to desktop', () => {
    it('cancels browser download and routes to desktop via deep link', async () => {
      const item = createMockDownloadItem();

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(true);
      expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
      expect(deps.downloads.erase).toHaveBeenCalledWith({ id: 1 });
      expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com/page',
      );
    });

    it('uses finalUrl (post-redirect) instead of url for deep link', async () => {
      const item = createMockDownloadItem({
        url: 'https://landing.example.com/page',
        finalUrl: 'https://cdn.example.com/913b9d40.zip',
      });

      await orchestrator.handleCreated(item);

      expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://cdn.example.com/913b9d40.zip',
        'https://example.com/page',
        'file.zip',
      );
    });

    it('falls back to url when finalUrl is empty', async () => {
      const item = createMockDownloadItem({
        url: 'https://example.com/file.zip',
        finalUrl: '',
      });

      await orchestrator.handleCreated(item);

      expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com/page',
      );
    });

    it('routes torrent downloads to desktop (same unified path)', async () => {
      const item = createMockDownloadItem({
        url: 'https://example.com/linux.torrent',
        finalUrl: 'https://example.com/linux.torrent',
        mime: 'application/x-bittorrent',
      });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(true);
      expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/linux.torrent',
        'https://example.com/page',
      );
    });

    it('logs download_intercepted before download_routed', async () => {
      const item = createMockDownloadItem();

      await orchestrator.handleCreated(item);

      const calls = (deps.diagnosticLog.append as ReturnType<typeof vi.fn>).mock.calls;
      const codes = calls.map((c: unknown[]) => (c[0] as { code: string }).code);
      const interceptedIdx = codes.indexOf('download_intercepted');
      const routedIdx = codes.indexOf('download_routed');
      expect(interceptedIdx).toBeGreaterThanOrEqual(0);
      expect(routedIdx).toBeGreaterThan(interceptedIdx);
    });

    it('logs download_routed with correct context', async () => {
      const item = createMockDownloadItem();

      await orchestrator.handleCreated(item);

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'download_routed',
          level: 'info',
        }),
      );
    });

    it('includes hasCookie: false in diagnostic context without cookies', async () => {
      await orchestrator.handleCreated(createMockDownloadItem());

      const routedCall = (deps.diagnosticLog.append as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => (c[0] as { code: string }).code === 'download_routed',
      );
      expect(routedCall).toBeDefined();
      expect((routedCall![0] as { context: { hasCookie: boolean } }).context.hasCookie).toBe(false);
    });

    it('cancels the browser download before resolving delayed filename metadata', async () => {
      const calls: string[] = [];
      const earlyCancelDeps = createMockDeps();
      earlyCancelDeps.downloads.cancel = vi
        .fn<(id: number) => Promise<void>>()
        .mockImplementation(async () => {
          calls.push('cancel');
        });
      const filenameMetadata = {
        resolve: vi.fn().mockImplementation(async () => {
          calls.push('metadata');
          return {
            filename: 'file.zip',
            source: 'determining-filename' as const,
          };
        }),
      };
      earlyCancelDeps.filenameMetadata = filenameMetadata;
      const orch = new DownloadOrchestrator(earlyCancelDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(filenameMetadata.resolve).toHaveBeenCalled();
      expect(calls).toEqual(['cancel', 'metadata']);
    });

    it('cancels the browser download before collecting cookies', async () => {
      const calls: string[] = [];
      const earlyCancelDeps = createMockDeps({
        getSettings: vi.fn().mockReturnValue({
          ...DEFAULT_DOWNLOAD_SETTINGS,
          forwardCookies: true,
        } satisfies DownloadSettings),
      });
      earlyCancelDeps.downloads.cancel = vi
        .fn<(id: number) => Promise<void>>()
        .mockImplementation(async () => {
          calls.push('cancel');
        });
      const cookies = {
        getAll: vi.fn().mockImplementation(async () => {
          calls.push('cookies');
          return [{ name: 'token', value: 'abc123' }];
        }),
      };
      earlyCancelDeps.cookies = cookies;
      const orch = new DownloadOrchestrator(earlyCancelDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(cookies.getAll).toHaveBeenCalled();
      expect(calls).toEqual(['cancel', 'cookies']);
    });

    it('cancels the browser download before routing to the desktop app', async () => {
      const calls: string[] = [];
      const earlyCancelDeps = createMockDeps({
        openProtocolNewTask: undefined,
      });
      earlyCancelDeps.downloads.cancel = vi
        .fn<(id: number) => Promise<void>>()
        .mockImplementation(async () => {
          calls.push('cancel');
        });
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
      const addDownload = vi.spyOn(desktopClient, 'addDownload').mockImplementation(async () => {
        calls.push('route');
        return { action: 'queued' };
      });
      earlyCancelDeps.desktopClient = desktopClient;
      const orch = new DownloadOrchestrator(earlyCancelDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(addDownload).toHaveBeenCalled();
      expect(calls).toEqual(['cancel', 'route']);
    });
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

    it('intercepts downloads with state "in_progress" (normal new download)', async () => {
      const item = createMockDownloadItem({ state: 'in_progress' });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(true);
      expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
    });

    it('does not invoke getSettings or getTabUrl for stale items (fast path)', async () => {
      const item = createMockDownloadItem({ state: 'complete' });

      await orchestrator.handleCreated(item);

      expect(deps.getSettings).not.toHaveBeenCalled();
      expect(deps.getTabUrl).not.toHaveBeenCalled();
    });
  });

  // ─── handleCreated — skip conditions (preserved) ───────

  describe('handleCreated — skip conditions', () => {
    it('skips when extension is disabled and returns false', async () => {
      (deps.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_DOWNLOAD_SETTINGS,
        enabled: false,
      });

      const intercepted = await orchestrator.handleCreated(createMockDownloadItem());

      expect(intercepted).toBe(false);
      expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
    });

    it('skips downloads triggered by an extension and returns false', async () => {
      const item = createMockDownloadItem({ byExtensionId: 'my-ext-id' });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(false);
      expect(deps.downloads.cancel).not.toHaveBeenCalled();
    });

    it('skips blob URLs and returns false', async () => {
      const item = createMockDownloadItem({ url: 'blob:https://example.com/abc' });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(false);
      expect(deps.downloads.cancel).not.toHaveBeenCalled();
    });

    it('logs download_skipped diagnostic event', async () => {
      const item = createMockDownloadItem({ url: 'blob:https://example.com/abc' });

      await orchestrator.handleCreated(item);

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_skipped' }),
      );
    });

    it('skips text/html downloads (cloud storage landing page defense)', async () => {
      const item = createMockDownloadItem({
        url: 'https://lanzou.com/file/?xyz&toolsdown',
        mime: 'text/html',
      });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(false);
      expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_skipped' }),
      );
    });

    it('leaves small files in the browser when minimum file size filtering is enabled', async () => {
      (deps.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_DOWNLOAD_SETTINGS,
        minimumFileSize: {
          enabled: true,
          sizeMb: 5,
          unknownSizeAction: 'intercept',
        },
      } satisfies DownloadSettings);
      const item = createMockDownloadItem({ fileSize: 1_000_000, totalBytes: 1_000_000 });

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(false);
      expect(deps.downloads.cancel).not.toHaveBeenCalled();
      expect(deps.openProtocolNewTask).not.toHaveBeenCalled();
    });
  });

  // ─── handleCreated — defensive fallback ────────────────

  describe('handleCreated — defensive fallback', () => {
    it('cancels download but logs warning when no route is available', async () => {
      const noDeps = createMockDeps({ openProtocolNewTask: undefined, desktopClient: undefined });
      const orch = new DownloadOrchestrator(noDeps);

      const intercepted = await orch.handleCreated(createMockDownloadItem());

      // Download was already cancelled — can't un-cancel, so returns true
      expect(intercepted).toBe(true);
      // Should log a warning about no route available
      expect(noDeps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_fallback', level: 'warn' }),
      );
    });
  });

  // ─── handleCreated — cookie collection ─────────────────

  describe('handleCreated — cookie forwarding', () => {
    it('forwards cookies only to the HTTP API path', async () => {
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
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
        referer: 'https://example.com/page',
        cookie: 'token=abc123; session=xyz789',
        filename: 'file.zip',
      });
    });

    it('does not collect cookies when cookie forwarding is disabled', async () => {
      const cookies = {
        getAll: vi.fn().mockResolvedValue([{ name: 'token', value: 'abc123' }]),
      };
      const cookieDeps = createMockDeps({
        cookies,
        getSettings: vi.fn().mockReturnValue({
          ...DEFAULT_DOWNLOAD_SETTINGS,
          forwardCookies: false,
        } satisfies DownloadSettings),
      });
      const orch = new DownloadOrchestrator(cookieDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(cookies.getAll).not.toHaveBeenCalled();
      expect(cookieDeps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com/page',
      );
    });

    it('drops cookies when falling back to the protocol handler', async () => {
      const cookieDeps = createMockDeps({
        getSettings: vi.fn().mockReturnValue({
          ...DEFAULT_DOWNLOAD_SETTINGS,
          forwardCookies: true,
        } satisfies DownloadSettings),
        cookies: {
          getAll: vi.fn().mockResolvedValue([{ name: 'token', value: 'abc123' }]),
        },
      });
      const orch = new DownloadOrchestrator(cookieDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(cookieDeps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com/page',
      );
    });

    it('passes empty cookie string when cookies API is not provided', async () => {
      const noCookieApiDeps = createMockDeps({ cookies: undefined });
      const orch = new DownloadOrchestrator(noCookieApiDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(noCookieApiDeps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com/page',
      );
    });

    it('gracefully degrades when cookies.getAll throws', async () => {
      const errorDeps = createMockDeps({
        cookies: {
          getAll: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });
      const orch = new DownloadOrchestrator(errorDeps);

      const intercepted = await orch.handleCreated(createMockDownloadItem());

      expect(intercepted).toBe(true);
      expect(errorDeps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com/page',
      );
    });

    it('passes empty cookie string when no cookies exist for the URL', async () => {
      const emptyCookieDeps = createMockDeps({
        cookies: {
          getAll: vi.fn().mockResolvedValue([]),
        },
      });
      const orch = new DownloadOrchestrator(emptyCookieDeps);

      await orch.handleCreated(createMockDownloadItem());

      expect(emptyCookieDeps.openProtocolNewTask).toHaveBeenCalledWith(
        'https://example.com/file.zip',
        'https://example.com/page',
      );
    });

    it('does not forward generic download placeholder as HTTP API filename', async () => {
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
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
        referer: 'https://example.com/page',
        cookie: undefined,
      });
    });

    it('does not forward numeric download-item placeholder as HTTP API filename', async () => {
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
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
        referer: 'https://example.com/page',
        cookie: undefined,
      });
    });

    it('forwards filename metadata captured after browser filename determination', async () => {
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
      const addDownload = vi
        .spyOn(desktopClient, 'addDownload')
        .mockResolvedValue({ action: 'queued' });
      const apiDeps = createMockDeps({
        desktopClient,
        openProtocolNewTask: undefined,
        filenameMetadata: {
          resolve: vi.fn().mockResolvedValue({
            filename: 'ИТОГИ ЛДУ 2026.xlsx',
            source: 'determining-filename',
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
        referer: 'https://example.com/page',
        cookie: undefined,
        filename: 'ИТОГИ ЛДУ 2026.xlsx',
      });
    });

    it('forwards meaningful unicode filename as HTTP API filename', async () => {
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
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
        referer: 'https://example.com/page',
        cookie: undefined,
        filename: 'Итоги_2026.docx',
      });
    });

    it('decodes RFC 2047 encoded-word filename before forwarding to HTTP API', async () => {
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
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
        referer: 'https://example.com/page',
        cookie: undefined,
        filename: 'Итоги_2026.docx',
      });
    });

    it('includes hasCookie: true in diagnostic context when cookies are collected', async () => {
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'secret' });
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
      const desktopClient = new DesktopApiClient({ port: 16801, secret: 'wrong-secret' });
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

  // ─── Verify removed behaviors ─────────────────────────

  describe('no legacy aria2 dependency', () => {
    it('does not have aria2 property in deps interface', () => {
      // Verify the deps object passed to orchestrator has no aria2 property.
      // This is a structural test confirming the legacy dependency was removed.
      expect(deps).not.toHaveProperty('aria2');
    });
  });

  // ─── Diagnostic logging coverage ──────────────────────

  describe('diagnostic log — cookie_collect_failed', () => {
    it('logs cookie_collect_failed when cookies.getAll throws', async () => {
      const errorDeps = createMockDeps({
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
      const errorDeps = createMockDeps({
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
