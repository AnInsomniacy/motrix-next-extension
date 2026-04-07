import { describe, it, expect, vi } from 'vitest';
import { useDiagnostics } from '@/entrypoints/options/composables/use-diagnostics';
import type { StorageService } from '@/lib/storage/storage-service';
import type { DiagnosticEvent } from '@/shared/types';

// ─── Mock StorageService ────────────────────────────────

function mockStorageService(): StorageService {
  return {
    load: vi.fn(),
    saveRpcConfig: vi.fn().mockResolvedValue(undefined),
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
    code: 'download_sent',
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
      rpc: { host: '127.0.0.1', port: 16800, secret: 'my-secret' },
      settings: {
        enabled: true,
        minFileSize: 0,
        fallbackToBrowser: true,
        hideDownloadBar: false,
        notifyOnStart: true,
        notifyOnComplete: false,
        autoLaunchApp: true,
      },
      siteRules: [{ id: 'r1', pattern: '*.github.com', action: 'always-intercept' }],
      uiPrefs: { theme: 'system', colorScheme: 'amber', locale: 'auto' },
      diagnosticLog: [createEvent({ id: 'e1' })],
      _version: 1,
    });

    // Mock browser APIs
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const clickFn = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        set href(_v: string) {
          /* noop */
        },
        set download(_v: string) {
          /* noop */
        },
        click: clickFn,
      }),
    });
    vi.stubGlobal(
      'Blob',
      class MockBlob {
        public parts: unknown[];
        constructor(parts: unknown[]) {
          this.parts = parts;
        }
      },
    );
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: () => ({ version: '1.0.1', manifest_version: 3 }),
      },
    });
    vi.stubGlobal('navigator', { userAgent: 'TestAgent', language: 'en-US' });

    const { hydrate, exportDiagnosticReport } = useDiagnostics(storage);
    hydrate([createEvent({ id: 'e1' })]);

    await exportDiagnosticReport();

    // Verify Blob was created with JSON content
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0]![0] as { parts: string[] };
    const report = JSON.parse(blobArg.parts[0]!);

    // Verify report structure
    expect(report.exportedAt).toBeDefined();
    expect(report.extension.version).toBe('1.0.1');
    expect(report.browser.userAgent).toBe('TestAgent');
    expect(report.config.rpc.host).toBe('127.0.0.1');
    expect(report.config.siteRules).toHaveLength(1);
    expect(report.diagnosticLog).toHaveLength(1);

    // Verify secret is NOT exported
    expect(report.config.rpc.secret).toBeUndefined();

    // Verify download triggered
    expect(clickFn).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    vi.unstubAllGlobals();
  });
});
