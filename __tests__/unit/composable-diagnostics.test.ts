import { describe, it, expect, vi } from 'vitest';
import { useDiagnostics } from '@/entrypoints/options/composables/use-diagnostics';
import type { StorageService } from '@/lib/storage/storage-service';
import type { DiagnosticEvent } from '@/shared/types';

// ─── Mock StorageService ────────────────────────────────

function mockStorageService(): StorageService {
  return {
    load: vi.fn(),
    saveConnectionConfig: vi.fn().mockResolvedValue(undefined),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    saveSiteRules: vi.fn().mockResolvedValue(undefined),
    saveUiPrefs: vi.fn().mockResolvedValue(undefined),
    saveDiagnosticLog: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;
}

function createEvent(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    id: 'evt-1',
    ts: Date.now(),
    level: 'info',
    code: 'download_routed',
    message: 'Sent: file.zip',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('useDiagnostics', () => {
  it('starts with an empty events array', () => {
    const storage = mockStorageService();
    const { diagnosticEvents } = useDiagnostics(storage);
    expect(diagnosticEvents.value).toEqual([]);
  });

  it('hydrate() replaces events', () => {
    const storage = mockStorageService();
    const { diagnosticEvents, hydrate } = useDiagnostics(storage);

    const events = [createEvent({ id: 'e1' }), createEvent({ id: 'e2' })];
    hydrate(events);

    expect(diagnosticEvents.value).toHaveLength(2);
    expect(diagnosticEvents.value[0]!.id).toBe('e1');
  });

  it('clearDiagnosticLog() empties events and persists empty array via StorageService', () => {
    const storage = mockStorageService();
    const { diagnosticEvents, hydrate, clearDiagnosticLog } = useDiagnostics(storage);

    hydrate([createEvent()]);
    clearDiagnosticLog();

    expect(diagnosticEvents.value).toEqual([]);
    expect(storage.saveDiagnosticLog).toHaveBeenCalledWith([]);
  });

  it('exportDiagnosticReport() triggers a file download with complete diagnostic data', async () => {
    const storage = mockStorageService();
    (storage.load as ReturnType<typeof vi.fn>).mockResolvedValue({
      connection: { port: 29110, secret: 'my-secret' },
      settings: {
        enabled: true,
        hideDownloadBar: false,
        desktopUnavailable: { action: 'launch', startupTimeoutSeconds: 15 },
        forwardRequestHeaders: true,
        forwardCookies: false,
        duplicateGuard: {
          enabled: true,
          windowSeconds: 10,
        },
        minimumFileSize: {
          enabled: true,
          sizeMb: 5,
          unknownSizeAction: 'intercept',
        },
        interceptionScope: {
          browserDownloads: true,
          magnet: true,
          ed2k: true,
          thunder: true,
        },
      },
      siteRules: [{ id: 'r1', pattern: '*.github.com', action: 'always-intercept' }],
      uiPrefs: { theme: 'system', colorScheme: 'amber', locale: 'auto' },
      diagnosticLog: [createEvent({ id: 'e1' })],
    });

    // Mock browser APIs — capture the data URI set on the anchor element.
    let capturedHref = '';
    const clickFn = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        set href(v: string) {
          capturedHref = v;
        },
        set download(_v: string) {
          /* noop */
        },
        click: clickFn,
      }),
    });
    vi.stubGlobal('navigator', { userAgent: 'TestAgent', language: 'en-US' });

    const { hydrate, exportDiagnosticReport } = useDiagnostics(storage, {
      getManifest: () => ({ version: '1.0.1', manifest_version: 3 }),
    });
    hydrate([createEvent({ id: 'e1' })]);

    await exportDiagnosticReport();

    // Verify data URI was set (bypasses chrome.downloads)
    expect(capturedHref).toMatch(/^data:application\/json;charset=utf-8,/);

    // Parse the encoded JSON from the data URI
    const jsonPayload = decodeURIComponent(
      capturedHref.replace('data:application/json;charset=utf-8,', ''),
    );
    const report = JSON.parse(jsonPayload);

    // Verify report structure
    expect(report.exportedAt).toBeDefined();
    expect(report.extension.version).toBe('1.0.1');
    expect(report.browser.userAgent).toBe('TestAgent');
    expect(report.config.connection.port).toBe(29110);
    expect(report.config.siteRules).toHaveLength(1);
    expect(report.diagnosticLog).toHaveLength(1);

    // Verify secret is NOT exported
    expect(report.config.connection.secret).toBeUndefined();

    // Verify download triggered
    expect(clickFn).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
