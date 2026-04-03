import { describe, it, expect, vi } from 'vitest';
import { StorageService } from '@/modules/storage/storage-service';

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

    const result = await service.load();

    expect(result.rpc).toEqual({ host: '127.0.0.1', port: 16800, secret: '' });
    expect(result.settings.enabled).toBe(true);
    expect(result.siteRules).toEqual([]);
    expect(result.uiPrefs.theme).toBe('system');
    expect(result.diagnosticLog).toEqual([]);
  });

  it('returns schema-validated data for valid storage', async () => {
    const api = createMockApi({
      _version: 1,
      rpc: { host: '192.168.1.1', port: 6800, secret: 'test' },
      settings: { enabled: false, minFileSize: 5, fallbackToBrowser: false,
        hideDownloadBar: true, notifyOnStart: false, notifyOnComplete: true },
    });
    const service = new StorageService(api);

    const result = await service.load();

    expect(result.rpc.port).toBe(6800);
    expect(result.rpc.secret).toBe('test');
    expect(result.settings.enabled).toBe(false);
    expect(result.settings.minFileSize).toBe(5);
  });

  it('returns defaults for corrupt storage without throwing', async () => {
    const api = createMockApi({
      rpc: 'garbage',
      settings: 42,
    });
    const service = new StorageService(api);

    const result = await service.load();

    // Should return defaults, not throw
    expect(result.rpc.port).toBe(16800);
    expect(result.settings.enabled).toBe(true);
  });
});

// ─── saveRpcConfig() ────────────────────────────────────

describe('StorageService.saveRpcConfig', () => {
  it('persists RPC config to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    await service.saveRpcConfig({ host: '10.0.0.1', port: 6800, secret: 'abc' });

    expect(api.set).toHaveBeenCalledWith({
      rpc: { host: '10.0.0.1', port: 6800, secret: 'abc' },
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
      fallbackToBrowser: false,
      hideDownloadBar: true,
      notifyOnStart: false,
      notifyOnComplete: true,
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

    const rules = [
      { id: 'r1', pattern: '*.github.com', action: 'always-intercept' as const },
    ];

    await service.saveSiteRules(rules);

    expect(api.set).toHaveBeenCalledWith({ siteRules: rules });
  });
});

// ─── saveUiPrefs() ──────────────────────────────────────

describe('StorageService.saveUiPrefs', () => {
  it('persists UI preferences to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    await service.saveUiPrefs({ theme: 'dark', colorScheme: 'space' });

    expect(api.set).toHaveBeenCalledWith({
      uiPrefs: { theme: 'dark', colorScheme: 'space' },
    });
  });
});

// ─── saveDiagnosticLog() ────────────────────────────────

describe('StorageService.saveDiagnosticLog', () => {
  it('persists diagnostic log to storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);

    const events = [
      { id: 'e1', ts: 1, level: 'info' as const, code: 'download_sent' as const, message: 'ok' },
    ];

    await service.saveDiagnosticLog(events);

    expect(api.set).toHaveBeenCalledWith({ diagnosticLog: events });
  });
});
