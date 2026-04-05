import { describe, it, expect, vi } from 'vitest';
import { DownloadOrchestrator } from '@/lib/download/orchestrator';
import type { OrchestratorDeps } from '@/lib/download/orchestrator';
import type { SiteRule } from '@/shared/types';
import { DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import { DocumentUrlError } from '@/shared/errors';

// ─── Mock Deps Factory ──────────────────────────────────

function createMockDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    aria2: {
      addUri: vi
        .fn<(uris: string[], opts?: unknown) => Promise<string>>()
        .mockResolvedValue('gid-ctx-1'),
      addTorrent: vi
        .fn<(base64: string, opts?: unknown) => Promise<string>>()
        .mockResolvedValue('gid-torrent-1'),
    },
    downloads: {
      pause: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      resume: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      cancel: vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined),
      erase: vi.fn<(query: { id: number }) => Promise<void>>().mockResolvedValue(undefined),
    },
    notifications: {
      create: vi.fn().mockResolvedValue('notification-id'),
    },
    cookies: {
      getAll: vi.fn().mockResolvedValue([]),
    },
    diagnosticLog: {
      append: vi.fn(),
    },
    getSettings: () => ({ ...DEFAULT_DOWNLOAD_SETTINGS }),
    getSiteRules: () => [] as SiteRule[],
    getTabUrl: vi.fn<() => Promise<string>>().mockResolvedValue(''),
    hasEnhancedPermissions: () => false,
    onSent: vi.fn(),
    // Default fetchFn: no redirect, binary content-type (normal download)
    fetchFn: vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        url,
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
      } as Response),
    ),
    ...overrides,
  };
}

// ─── sendUrl Tests ──────────────────────────────────────

describe('DownloadOrchestrator.sendUrl', () => {
  it('sends URL to aria2 and returns the GID', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    const result = await orch.sendUrl('https://example.com/file.zip', 'https://example.com');

    expect(deps.aria2.addUri).toHaveBeenCalledWith(
      ['https://example.com/file.zip'],
      expect.objectContaining({ header: expect.arrayContaining(['Referer: https://example.com']) }),
    );
    expect(result).toBe('gid-ctx-1');
  });

  it('includes cookie header when enhanced permissions are available', async () => {
    const deps = createMockDeps({
      hasEnhancedPermissions: () => true,
      cookies: {
        getAll: vi.fn().mockResolvedValue([
          { name: 'session', value: 'abc123' },
          { name: 'token', value: 'xyz' },
        ]),
      },
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', 'https://example.com');

    expect(deps.aria2.addUri).toHaveBeenCalledWith(
      ['https://example.com/file.zip'],
      expect.objectContaining({
        header: expect.arrayContaining(['Cookie: session=abc123; token=xyz']),
      }),
    );
  });

  it('logs download_sent diagnostic event on success', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'download_sent',
        level: 'info',
      }),
    );
  });

  it('calls onSent callback with gid and filename on success', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.onSent).toHaveBeenCalledWith('gid-ctx-1', 'file.zip');
  });

  it('logs download_failed diagnostic event on error', async () => {
    const deps = createMockDeps({
      aria2: {
        addUri: vi.fn().mockRejectedValue(new Error('connection refused')),
        addTorrent: vi.fn().mockRejectedValue(new Error('connection refused')),
      },
    });
    const orch = new DownloadOrchestrator(deps);

    await expect(orch.sendUrl('https://example.com/file.zip', '')).rejects.toThrow(
      'connection refused',
    );

    expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'download_failed',
        level: 'error',
      }),
    );
  });

  it('omits referer header when tabUrl is empty', async () => {
    const deps = createMockDeps();
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    const call = (deps.aria2.addUri as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = call?.[1] as Record<string, unknown> | undefined;
    // Should not have header array, or header array shouldn't contain Referer
    if (options?.header) {
      expect(options.header).not.toContain(expect.stringContaining('Referer'));
    }
  });

  it('creates start notification when notifyOnStart is true', async () => {
    const deps = createMockDeps({
      getSettings: () => ({ ...DEFAULT_DOWNLOAD_SETTINGS, notifyOnStart: true }),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.notifications.create).toHaveBeenCalled();
  });

  it('skips notification when notifyOnStart is false', async () => {
    const deps = createMockDeps({
      getSettings: () => ({ ...DEFAULT_DOWNLOAD_SETTINGS, notifyOnStart: false }),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  // ─── Redirect Resolution (context menu) ───────────────

  it('resolves redirects via HEAD before sending to aria2', async () => {
    const deps = createMockDeps({
      fetchFn: vi.fn().mockResolvedValue({
        url: 'https://cdn.example.com/real-file.zip',
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
      } as Response),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://landing.example.com/download', 'https://example.com');

    // Should resolve to CDN URL, not the landing page
    expect(deps.aria2.addUri).toHaveBeenCalledWith(
      ['https://cdn.example.com/real-file.zip'],
      expect.any(Object),
    );
    expect(deps.onSent).toHaveBeenCalledWith('gid-ctx-1', 'real-file.zip');
  });

  it('falls back to original URL when redirect resolution fails', async () => {
    const deps = createMockDeps({
      fetchFn: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://example.com/file.zip', '');

    // Should degrade gracefully to the original URL
    expect(deps.aria2.addUri).toHaveBeenCalledWith(
      ['https://example.com/file.zip'],
      expect.any(Object),
    );
  });

  it('uses resolved URL for cookie collection', async () => {
    const deps = createMockDeps({
      hasEnhancedPermissions: () => true,
      cookies: {
        getAll: vi.fn().mockResolvedValue([{ name: 'cdn_token', value: 'secret' }]),
      },
      fetchFn: vi.fn().mockResolvedValue({
        url: 'https://cdn.example.com/real-file.zip',
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
      } as Response),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('https://landing.example.com/download', '');

    // Cookie collection should use the resolved CDN URL's domain
    expect(deps.cookies.getAll).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/real-file.zip',
    });
  });

  it('does not resolve redirects for magnet URIs', async () => {
    const deps = createMockDeps({
      openProtocolNewTask: vi.fn().mockResolvedValue(undefined),
    });
    const orch = new DownloadOrchestrator(deps);

    await orch.sendUrl('magnet:?xt=urn:btih:abc', '');

    // fetchFn should NOT be called for magnet URIs
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });

  // ─── Document URL Detection (JS-based download pages) ───

  it('throws DocumentUrlError for text/html responses (cloud storage landing page)', async () => {
    const deps = createMockDeps({
      fetchFn: vi.fn().mockResolvedValue({
        url: 'https://lanzou.com/file/?xyz&toolsdown',
        ok: true,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      } as Response),
    });
    const orch = new DownloadOrchestrator(deps);

    await expect(orch.sendUrl('https://lanzou.com/file/?xyz&toolsdown', '')).rejects.toThrow(
      DocumentUrlError,
    );

    // Should NOT send to aria2
    expect(deps.aria2.addUri).not.toHaveBeenCalled();
  });

  it('logs download_browser_redirect diagnostic for document URLs', async () => {
    const deps = createMockDeps({
      fetchFn: vi.fn().mockResolvedValue({
        url: 'https://lanzou.com/page',
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
      } as Response),
    });
    const orch = new DownloadOrchestrator(deps);

    await expect(orch.sendUrl('https://lanzou.com/page', '')).rejects.toThrow(DocumentUrlError);

    expect(deps.diagnosticLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'download_browser_redirect' }),
    );
  });

  it('allows text/html with Content-Disposition: attachment (downloadable HTML)', async () => {
    const deps = createMockDeps({
      fetchFn: vi.fn().mockResolvedValue({
        url: 'https://example.com/report.html',
        ok: true,
        headers: new Headers({
          'content-type': 'text/html',
          'content-disposition': 'attachment; filename="report.html"',
        }),
      } as Response),
    });
    const orch = new DownloadOrchestrator(deps);

    // Should NOT throw — this is a legitimate HTML file download
    const gid = await orch.sendUrl('https://example.com/report.html', '');
    expect(gid).toBe('gid-ctx-1');
    expect(deps.aria2.addUri).toHaveBeenCalled();
  });
});
