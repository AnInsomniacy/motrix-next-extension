import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type { DownloadSettings, SiteRule } from '@/shared/types';
import { RpcUnreachableError, RpcTimeoutError, RpcAuthError } from '@/shared/errors';

// ─── Mock Types ─────────────────────────────────────────

interface MockDownloadItem {
  id: number;
  url: string;
  finalUrl: string;
  filename: string;
  fileSize: number;
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
    mime: 'application/zip',
    state: 'in_progress',
    ...overrides,
  };
}

// ─── Mock Dependencies ──────────────────────────────────

function createMockDeps() {
  return {
    aria2: {
      addUri: vi.fn().mockResolvedValue('gid-abc123'),
      addTorrent: vi.fn().mockResolvedValue('gid-torrent-1'),
    },
    downloads: {
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      erase: vi.fn().mockResolvedValue(undefined),
    },
    notifications: {
      create: vi.fn().mockResolvedValue('notif-1'),
    },
    cookies: {
      getAll: vi.fn().mockResolvedValue([]),
    },
    diagnosticLog: {
      append: vi.fn(),
    },
    getSettings: vi.fn().mockReturnValue({
      enabled: true,
      minFileSize: 0,
      fallbackToBrowser: true,
      hideDownloadBar: false,
      notifyOnStart: true,
      notifyOnComplete: false,
      autoLaunchApp: true,
    } satisfies DownloadSettings),
    getSiteRules: vi.fn().mockReturnValue([] as SiteRule[]),
    getTabUrl: vi.fn().mockResolvedValue('https://example.com/page'),
    hasEnhancedPermissions: vi.fn().mockReturnValue(false),
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

  describe('handleCreated — successful interception', () => {
    it('pauses, sends to aria2, then cancels and erases browser download', async () => {
      const item = createMockDownloadItem();

      await orchestrator.handleCreated(item);

      // 1. Pause browser download
      expect(deps.downloads.pause).toHaveBeenCalledWith(1);
      // 2. Send to aria2 — no `out` option (aria2 resolves filename natively)
      expect(deps.aria2.addUri).toHaveBeenCalledWith(
        ['https://example.com/file.zip'],
        expect.not.objectContaining({ out: expect.anything() }),
      );
      // 3. Cancel and erase
      expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
      expect(deps.downloads.erase).toHaveBeenCalledWith({ id: 1 });
    });

    it('sends notification on successful interception', async () => {
      const item = createMockDownloadItem();

      await orchestrator.handleCreated(item);

      expect(deps.notifications.create).toHaveBeenCalled();
    });

    it('logs download_sent diagnostic event', async () => {
      const item = createMockDownloadItem();

      await orchestrator.handleCreated(item);

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_sent' }),
      );
    });

    it('logs download_intercepted before download_sent (entry → exit instrumentation)', async () => {
      const item = createMockDownloadItem();

      await orchestrator.handleCreated(item);

      const calls = (deps.diagnosticLog.append as ReturnType<typeof vi.fn>).mock.calls;
      const codes = calls.map((c: unknown[]) => (c[0] as { code: string }).code);
      const interceptedIdx = codes.indexOf('download_intercepted');
      const sentIdx = codes.indexOf('download_sent');
      expect(interceptedIdx).toBeGreaterThanOrEqual(0);
      expect(sentIdx).toBeGreaterThan(interceptedIdx);
    });
  });

  describe('handleCreated — skip conditions', () => {
    it('skips when extension is disabled', async () => {
      deps.getSettings.mockReturnValue({ ...deps.getSettings(), enabled: false });

      await orchestrator.handleCreated(createMockDownloadItem());

      expect(deps.downloads.pause).not.toHaveBeenCalled();
      expect(deps.aria2.addUri).not.toHaveBeenCalled();
    });

    it('skips downloads triggered by an extension', async () => {
      const item = createMockDownloadItem({ byExtensionId: 'my-ext-id' });

      await orchestrator.handleCreated(item);

      expect(deps.downloads.pause).not.toHaveBeenCalled();
    });

    it('skips blob URLs', async () => {
      const item = createMockDownloadItem({ url: 'blob:https://example.com/abc' });

      await orchestrator.handleCreated(item);

      expect(deps.downloads.pause).not.toHaveBeenCalled();
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

      await orchestrator.handleCreated(item);

      expect(deps.downloads.pause).not.toHaveBeenCalled();
      expect(deps.aria2.addUri).not.toHaveBeenCalled();
      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_skipped' }),
      );
    });
  });

  describe('handleCreated — finalUrl preference (redirect resolution)', () => {
    it('sends finalUrl to aria2 instead of pre-redirect url', async () => {
      const item = createMockDownloadItem({
        url: 'https://developer2.lanrar.com/file/?xyz&toolsdown',
        finalUrl: 'https://cdn.example.com/913b9d40.zip',
        filename: '913b9d40.zip',
      });

      await orchestrator.handleCreated(item);

      // Must use finalUrl (the CDN URL), NOT url (the landing page)
      expect(deps.aria2.addUri).toHaveBeenCalledWith(
        ['https://cdn.example.com/913b9d40.zip'],
        expect.any(Object),
      );
    });

    it('falls back to url when finalUrl is empty', async () => {
      const item = createMockDownloadItem({
        url: 'https://example.com/file.zip',
        finalUrl: '',
      });

      await orchestrator.handleCreated(item);

      expect(deps.aria2.addUri).toHaveBeenCalledWith(
        ['https://example.com/file.zip'],
        expect.any(Object),
      );
    });

    it('uses finalUrl for wake-retry as well', async () => {
      const wakeDeps = {
        ...createMockDeps(),
        wakeService: { wakeAndWaitForRpc: vi.fn().mockResolvedValue(true) },
        openProtocol: vi.fn().mockResolvedValue(() => {}),
        checkRpc: vi.fn().mockResolvedValue(true),
      };
      // First addUri fails, second succeeds
      wakeDeps.aria2.addUri
        .mockRejectedValueOnce(new RpcUnreachableError())
        .mockResolvedValueOnce('gid-retry');

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(
        createMockDownloadItem({
          url: 'https://landing.example.com/page',
          finalUrl: 'https://cdn.example.com/real-file.zip',
        }),
      );

      // Both initial and retry calls must use finalUrl
      expect(wakeDeps.aria2.addUri).toHaveBeenNthCalledWith(
        1,
        ['https://cdn.example.com/real-file.zip'],
        expect.any(Object),
      );
      expect(wakeDeps.aria2.addUri).toHaveBeenNthCalledWith(
        2,
        ['https://cdn.example.com/real-file.zip'],
        expect.any(Object),
      );
    });
  });

  describe('handleCreated — RPC failure with fallback', () => {
    it('resumes browser download when aria2 fails and fallback is enabled', async () => {
      deps.aria2.addUri.mockRejectedValue(new RpcUnreachableError());

      await orchestrator.handleCreated(createMockDownloadItem());

      expect(deps.downloads.pause).toHaveBeenCalledWith(1);
      expect(deps.downloads.resume).toHaveBeenCalledWith(1);
      expect(deps.downloads.cancel).not.toHaveBeenCalled();
    });

    it('logs download_fallback diagnostic event', async () => {
      deps.aria2.addUri.mockRejectedValue(new RpcUnreachableError());

      await orchestrator.handleCreated(createMockDownloadItem());

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_fallback' }),
      );
    });
  });

  describe('handleCreated — RPC failure without fallback', () => {
    it('cancels browser download when fallback is disabled', async () => {
      deps.getSettings.mockReturnValue({
        ...deps.getSettings(),
        fallbackToBrowser: false,
      });
      deps.aria2.addUri.mockRejectedValue(new RpcUnreachableError());

      await orchestrator.handleCreated(createMockDownloadItem());

      expect(deps.downloads.cancel).toHaveBeenCalledWith(1);
      expect(deps.downloads.resume).not.toHaveBeenCalled();
    });

    it('logs download_failed diagnostic event', async () => {
      deps.getSettings.mockReturnValue({
        ...deps.getSettings(),
        fallbackToBrowser: false,
      });
      deps.aria2.addUri.mockRejectedValue(new RpcUnreachableError());

      await orchestrator.handleCreated(createMockDownloadItem());

      expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_failed' }),
      );
    });
  });

  describe('handleCreated — cookie forwarding', () => {
    it('includes cookies in aria2 request when enhanced permissions are granted', async () => {
      deps.hasEnhancedPermissions.mockReturnValue(true);
      deps.cookies.getAll.mockResolvedValue([{ name: 'session', value: 'abc123' }]);

      await orchestrator.handleCreated(createMockDownloadItem());

      const addUriCall = deps.aria2.addUri.mock.calls[0];
      const options = addUriCall?.[1] as Record<string, unknown> | undefined;
      const headers = options?.header as string[] | undefined;
      expect(headers).toContainEqual(expect.stringContaining('Cookie: session=abc123'));
    });
  });

  // ─── Wake + Retry ───────────────────────────────────────

  describe('handleCreated — wake + retry on unreachable', () => {
    function createWakeDeps() {
      const base = createMockDeps();
      return {
        ...base,
        wakeService: {
          wakeAndWaitForRpc: vi.fn().mockResolvedValue(true),
        },
        openProtocol: vi.fn().mockResolvedValue(() => {}),
        checkRpc: vi.fn().mockResolvedValue(true),
      };
    }

    it('wakes app and retries addUri on RpcUnreachableError', async () => {
      const wakeDeps = createWakeDeps();
      // First addUri fails (unreachable), second succeeds.
      wakeDeps.aria2.addUri
        .mockRejectedValueOnce(new RpcUnreachableError())
        .mockResolvedValueOnce('gid-retry');

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(createMockDownloadItem());

      expect(wakeDeps.wakeService.wakeAndWaitForRpc).toHaveBeenCalledTimes(1);
      expect(wakeDeps.aria2.addUri).toHaveBeenCalledTimes(2);
      expect(wakeDeps.downloads.cancel).toHaveBeenCalledWith(1);
      expect(wakeDeps.downloads.erase).toHaveBeenCalledWith({ id: 1 });
    });

    it('wakes app and retries on RpcTimeoutError', async () => {
      const wakeDeps = createWakeDeps();
      wakeDeps.aria2.addUri
        .mockRejectedValueOnce(new RpcTimeoutError(5000))
        .mockResolvedValueOnce('gid-timeout-retry');

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(createMockDownloadItem());

      expect(wakeDeps.wakeService.wakeAndWaitForRpc).toHaveBeenCalledTimes(1);
      expect(wakeDeps.downloads.cancel).toHaveBeenCalledWith(1);
    });

    it('falls back to browser when wake times out', async () => {
      const wakeDeps = createWakeDeps();
      wakeDeps.aria2.addUri.mockRejectedValue(new RpcUnreachableError());
      wakeDeps.wakeService.wakeAndWaitForRpc.mockResolvedValue(false);

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(createMockDownloadItem());

      expect(wakeDeps.downloads.resume).toHaveBeenCalledWith(1);
      expect(wakeDeps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_fallback' }),
      );
    });

    it('does not attempt wake on RpcAuthError', async () => {
      const wakeDeps = createWakeDeps();
      wakeDeps.aria2.addUri.mockRejectedValue(new RpcAuthError());

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(createMockDownloadItem());

      expect(wakeDeps.wakeService.wakeAndWaitForRpc).not.toHaveBeenCalled();
      expect(wakeDeps.downloads.resume).toHaveBeenCalledWith(1);
    });

    it('does not attempt wake when autoLaunchApp is disabled', async () => {
      const wakeDeps = createWakeDeps();
      wakeDeps.aria2.addUri.mockRejectedValue(new RpcUnreachableError());
      wakeDeps.getSettings.mockReturnValue({
        ...wakeDeps.getSettings(),
        autoLaunchApp: false,
      });

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(createMockDownloadItem());

      expect(wakeDeps.wakeService.wakeAndWaitForRpc).not.toHaveBeenCalled();
      expect(wakeDeps.downloads.resume).toHaveBeenCalledWith(1);
    });

    it('falls back when retry after wake also fails', async () => {
      const wakeDeps = createWakeDeps();
      // Both addUri calls fail
      wakeDeps.aria2.addUri.mockRejectedValue(new RpcUnreachableError());
      wakeDeps.wakeService.wakeAndWaitForRpc.mockResolvedValue(true);

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(createMockDownloadItem());

      // Should still fallback after retry failure
      expect(wakeDeps.downloads.resume).toHaveBeenCalledWith(1);
    });

    it('logs wake attempt diagnostic', async () => {
      const wakeDeps = createWakeDeps();
      wakeDeps.aria2.addUri
        .mockRejectedValueOnce(new RpcUnreachableError())
        .mockResolvedValueOnce('gid-log-test');

      const orch = new DownloadOrchestrator(wakeDeps);
      await orch.handleCreated(createMockDownloadItem());

      expect(wakeDeps.diagnosticLog.append).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'download_wake_attempt' }),
      );
    });
  });
});
