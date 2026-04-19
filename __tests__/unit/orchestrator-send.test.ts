import { describe, it, expect, vi } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type { OrchestratorDeps } from '@/lib/download/orchestrator';
import type { SiteRule } from '@/shared/types';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';

// ─── Mock Deps Factory ──────────────────────────────────

function createMockDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    downloads: {
      cancel: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      erase: vi.fn<(query: { id: number }) => Promise<void>>().mockResolvedValue(undefined),
    },
    diagnosticLog: {
      append: vi.fn(),
    },
    getSettings: () => ({ ...DEFAULT_DOWNLOAD_SETTINGS }),
    getSiteRules: () => [] as SiteRule[],
    getTabUrl: vi.fn<() => Promise<string>>().mockResolvedValue(''),
    openProtocolNewTask: vi
      .fn<(url: string, referer: string, cookie: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── sendUrl Tests ──────────────────────────────────────

describe('DownloadOrchestrator.sendUrl', () => {
  it('routes URL to desktop and returns routed-to-desktop', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    const result = await orch.sendUrl('https://example.com/file.zip', 'https://example.com');

    expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
      'https://example.com/file.zip',
      'https://example.com',
      '',
    );
    expect(result).toBe('routed-to-desktop');
  });

  it('passes tabUrl as referer parameter', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://cdn.example.com/video.mp4', 'https://example.com/videos');

    expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
      'https://cdn.example.com/video.mp4',
      'https://example.com/videos',
      '',
    );
  });

  it('handles empty tabUrl gracefully', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    const result = await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.openProtocolNewTask).toHaveBeenCalledWith('https://example.com/file.zip', '', '');
    expect(result).toBe('routed-to-desktop');
  });

  it('routes magnet URIs to desktop without any preprocessing', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('magnet:?xt=urn:btih:abc', '');

    expect(deps.openProtocolNewTask).toHaveBeenCalledWith('magnet:?xt=urn:btih:abc', '', '');
  });

  it('routes torrent URLs to desktop without fetching', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://tracker.example.com/dl/ubuntu.torrent', 'https://ubuntu.com');

    expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
      'https://tracker.example.com/dl/ubuntu.torrent',
      'https://ubuntu.com',
      '',
    );
  });

  it('logs download_routed diagnostic event on success', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'download_routed',
        level: 'info',
      }),
    );
  });

  it('throws when openProtocolNewTask is not available', async () => {
    const deps = createMockDeps({ openProtocolNewTask: undefined });
    const orch = new DownloadOrchestrator(deps);

    await expect(orch.sendUrl('https://example.com/file.zip', '')).rejects.toThrow();
  });

  it('preserves URL encoding in the routed URL', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);
    const encodedUrl = 'https://example.com/%E6%96%87%E4%BB%B6.zip';

    await orch.sendUrl(encodedUrl, '');

    expect(deps.openProtocolNewTask).toHaveBeenCalledWith(encodedUrl, '', '');
  });

  it('routes FTP URLs to desktop', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('ftp://mirror.example.com/pub/file.iso', '');

    expect(deps.openProtocolNewTask).toHaveBeenCalledWith(
      'ftp://mirror.example.com/pub/file.iso',
      '',
      '',
    );
  });
});
