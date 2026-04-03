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

  it('copyDiagnosticLog() writes JSON to clipboard', () => {
    const storage = mockStorageService();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const { hydrate, copyDiagnosticLog } = useDiagnostics(storage);
    const events = [createEvent({ id: 'e1', message: 'test' })];
    hydrate(events);

    copyDiagnosticLog();

    expect(writeText).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeText.mock.calls[0]![0] as string);
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe('e1');

    vi.unstubAllGlobals();
  });
});
