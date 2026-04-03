import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadOrchestrator } from '@/modules/download/orchestrator';
import type { DownloadSettings, SiteRule } from '@/shared/types';
import { RpcUnreachableError } from '@/shared/errors';

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
      // 2. Send to aria2
      expect(deps.aria2.addUri).toHaveBeenCalledWith(
        ['https://example.com/file.zip'],
        expect.objectContaining({ out: 'file.zip' }),
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
});
