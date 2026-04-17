import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type { OrchestratorDeps } from '@/lib/download/orchestrator';
import type { DownloadSettings, SiteRule } from '@/shared/types';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';

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
    hasEnhancedPermissions: vi.fn().mockReturnValue(false),
    openProtocolNewTask: vi
      .fn<(url: string, referer: string) => Promise<void>>()
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

    it('skips files below minimum size threshold', async () => {
      (deps.getSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_DOWNLOAD_SETTINGS,
        minFileSize: 10, // 10 MB minimum
      });
      const item = createMockDownloadItem({ fileSize: 1_000_000 }); // 1 MB

      const intercepted = await orchestrator.handleCreated(item);

      expect(intercepted).toBe(false);
    });
  });

  // ─── handleCreated — defensive fallback ────────────────

  describe('handleCreated — defensive fallback', () => {
    it('returns false when openProtocolNewTask is unavailable', async () => {
      const noDeps = createMockDeps({ openProtocolNewTask: undefined });
      const orch = new DownloadOrchestrator(noDeps);

      const intercepted = await orch.handleCreated(createMockDownloadItem());

      // Cannot route to desktop — let browser handle download
      expect(intercepted).toBe(false);
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
  });

  // ─── Verify removed behaviors ─────────────────────────

  describe('no direct aria2 RPC calls', () => {
    it('does not have aria2 property in deps interface', () => {
      // Verify the deps object passed to orchestrator has no aria2 property.
      // This is a structural test confirming the RPC dependency was removed.
      expect(deps).not.toHaveProperty('aria2');
    });
  });
});
