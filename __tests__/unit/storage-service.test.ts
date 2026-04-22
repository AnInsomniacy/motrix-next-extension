import { describe, it, expect, vi } from 'vitest';
import { StorageService } from '@/lib/storage/storage-service';

// ─── Mock Storage API ───────────────────────────────────

function createMockApi(data: Record<string, unknown> = {}) {
  const store = { ...data };
  return {
    get: vi.fn().mockImplementation(async (keys: string[] | null) => {
      if (keys === null) return { ...store };
      const result: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn().mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    _store: store,
  };
}

// ─── load() ─────────────────────────────────────────────

describe('StorageService.load', () => {
  it('returns fully typed storage with defaults for empty storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    const { storage: result, migration } = await service.load();

    expect(result.connection).toEqual({ port: 16801, secret: '' });
    expect(result.settings.enabled).toBe(true);
    expect(result.siteRules).toEqual([]);
    expect(result.uiPrefs.theme).toBe('system');
    expect(result.diagnosticLog).toEqual([]);
    expect(migration.migrated).toBe(true);
  });

  it('returns schema-validated data for valid storage', async () => {
    const api = createMockApi({
      _version: 1,
      connection: { port: 9000, secret: 'test' },
      settings: {
        enabled: false,
        minFileSize: 5,
        hideDownloadBar: true,
      },
    });
    const service = new StorageService(api);

    const { storage: result, migration } = await service.load();

    expect(result.connection.port).toBe(9000);
    expect(result.connection.secret).toBe('test');
    expect(result.settings.enabled).toBe(false);
    expect(result.settings.minFileSize).toBe(5);
    expect(migration.from).toBe(1);
    expect(migration.to).toBe(2);
    expect(migration.migrated).toBe(true);
  });

  it('returns defaults for corrupt storage without throwing', async () => {
    const api = createMockApi({
      connection: 'garbage',
      settings: 42,
    });
    const service = new StorageService(api);

    const { storage: result } = await service.load();

    // Should return defaults, not throw
    expect(result.connection.port).toBe(16801);
    expect(result.settings.enabled).toBe(true);
  });
});

// ─── saveConnectionConfig() ─────────────────────────────

describe('StorageService.saveConnectionConfig', () => {
  it('persists connection config to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    await service.saveConnectionConfig({ port: 9000, secret: 'abc' });

    expect(api.set).toHaveBeenCalledWith({
      connection: { port: 9000, secret: 'abc' },
    });
  });
});

// ─── saveSettings() ─────────────────────────────────────

describe('StorageService.saveSettings', () => {
  it('persists download settings to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    const settings = {
      enabled: false,
      minFileSize: 10,
      hideDownloadBar: true,
      autoLaunchApp: false,
    };

    await service.saveSettings(settings);

    expect(api.set).toHaveBeenCalledWith({ settings });
  });
});

// ─── saveSiteRules() ────────────────────────────────────

describe('StorageService.saveSiteRules', () => {
  it('persists site rules array to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    const rules = [{ id: 'r1', pattern: '*.github.com', action: 'always-intercept' as const }];

    await service.saveSiteRules(rules);

    expect(api.set).toHaveBeenCalledWith({ siteRules: rules });
  });
});

// ─── saveUiPrefs() ──────────────────────────────────────

describe('StorageService.saveUiPrefs', () => {
  it('persists UI preferences to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    await service.saveUiPrefs({ theme: 'dark', colorScheme: 'space', locale: 'en' });

    expect(api.set).toHaveBeenCalledWith({
      uiPrefs: { theme: 'dark', colorScheme: 'space', locale: 'en' },
    });
  });
});

// ─── saveDiagnosticLog() ────────────────────────────────

describe('StorageService.saveDiagnosticLog', () => {
  it('persists diagnostic log to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    const events = [
      { id: 'e1', ts: 1, level: 'info' as const, code: 'download_routed' as const, message: 'ok' },
    ];

    await service.saveDiagnosticLog(events);

    expect(api.set).toHaveBeenCalledWith({ diagnosticLog: events });
  });
});
