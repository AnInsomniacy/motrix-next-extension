import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { StorageService } from '@/lib/storage/storage-service';
import {
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_UI_PREFS,
} from '@/shared/constants';

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

    expect(result.connection).toEqual({ port: 29110, secret: '' });
    expect(result.settings.enabled).toBe(true);
    expect(result.siteRules).toEqual([]);
    expect(result.uiPrefs.theme).toBe('system');
    expect(result.diagnosticLog).toEqual([]);
  });

  it('returns schema-validated data for valid storage', async () => {
    const api = createMockApi({
      connection: { port: 9000, secret: 'test' },
      settings: {
        enabled: false,
        hideDownloadBar: true,
        forwardCookies: true,
      },
    });
    const service = new StorageService(api);

    const result = await service.load();

    expect(result.connection.port).toBe(9000);
    expect(result.connection.secret).toBe('test');
    expect(result.settings.enabled).toBe(false);
    expect(result.settings.hideDownloadBar).toBe(true);
  });

  it('returns defaults for corrupt storage without throwing', async () => {
    const api = createMockApi({
      connection: 'garbage',
      settings: 42,
    });
    const service = new StorageService(api);

    const result = await service.load();

    // Should return defaults, not throw
    expect(result.connection.port).toBe(29110);
    expect(result.settings.enabled).toBe(true);
  });
});

describe('StorageService.loadSettings', () => {
  it('loads only the latest persisted settings', async () => {
    const api = createMockApi({
      settings: {
        desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
      },
    });
    const service = new StorageService(api);

    const settings = await service.loadSettings();

    expect(settings.desktopUnavailable.action).toBe('browser');
    expect(api.get).toHaveBeenCalledWith(['settings']);
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

// ─── updateConnectionConfig() ───────────────────────────

describe('StorageService.updateConnectionConfig', () => {
  it('patches connection config while preserving existing fields', async () => {
    const api = createMockApi({
      connection: { port: 29110, secret: 'token' },
    });
    const service = new StorageService(api);

    await service.updateConnectionConfig({ port: 16802 });

    expect(api.set).toHaveBeenLastCalledWith({
      connection: { port: 16802, secret: 'token' },
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
      hideDownloadBar: true,
      desktopUnavailable: { action: 'browser' as const, startupTimeoutSeconds: 15 },
      forwardRequestHeaders: true,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: true,
        sizeMb: 5,
        unknownSizeAction: 'intercept' as const,
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip' as const,
        unknownAction: 'intercept' as const,
      },
      interceptionScope: {
        browserDownloads: true,
        magnet: true,
        ed2k: true,
        thunder: true,
      },
    };

    await service.saveSettings(settings);

    expect(api.set).toHaveBeenCalledWith({ settings });
  });

  it('strips Vue proxies before writing settings to extension storage', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);
    const settings = ref({
      enabled: false,
      hideDownloadBar: true,
      desktopUnavailable: { action: 'browser' as const, startupTimeoutSeconds: 15 },
      forwardRequestHeaders: true,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: true,
        sizeMb: 5,
        unknownSizeAction: 'intercept' as const,
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip' as const,
        unknownAction: 'intercept' as const,
      },
      interceptionScope: {
        browserDownloads: true,
        magnet: true,
        ed2k: true,
        thunder: true,
      },
    });

    await service.saveSettings(settings.value);

    const payload = api.set.mock.calls[0]?.[0];
    expect(() => structuredClone(payload)).not.toThrow();
    expect(payload).toEqual({ settings: settings.value });
  });
});

// ─── updateSettings() ───────────────────────────────────

describe('StorageService.updateSettings', () => {
  it('patches download settings while preserving existing fields', async () => {
    const api = createMockApi({
      settings: {
        enabled: true,
        hideDownloadBar: true,
        desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
        forwardRequestHeaders: true,
        forwardCookies: true,
        duplicateGuard: {
          enabled: true,
          windowSeconds: 10,
        },
        minimumFileSize: {
          enabled: true,
          sizeMb: 5,
          unknownSizeAction: 'skip',
        },
        fileExtensionRule: {
          enabled: false,
          extensions: [],
          listedAction: 'skip',
          unknownAction: 'intercept',
        },
        interceptionScope: {
          browserDownloads: true,
          magnet: false,
          ed2k: true,
          thunder: true,
        },
      },
    });
    const service = new StorageService(api);

    await service.updateSettings({ enabled: false });

    expect(api.set).toHaveBeenLastCalledWith({
      settings: {
        enabled: false,
        hideDownloadBar: true,
        desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
        forwardRequestHeaders: true,
        forwardCookies: true,
        duplicateGuard: {
          enabled: true,
          windowSeconds: 10,
        },
        minimumFileSize: {
          enabled: true,
          sizeMb: 5,
          unknownSizeAction: 'skip',
        },
        fileExtensionRule: {
          enabled: false,
          extensions: [],
          listedAction: 'skip',
          unknownAction: 'intercept',
        },
        interceptionScope: {
          browserDownloads: true,
          magnet: false,
          ed2k: true,
          thunder: true,
        },
      },
    });
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

// ─── updateUiPrefs() ────────────────────────────────────

describe('StorageService.updateUiPrefs', () => {
  it('patches UI preferences while preserving existing fields', async () => {
    const api = createMockApi({
      uiPrefs: { theme: 'dark', colorScheme: 'space', locale: 'en' },
    });
    const service = new StorageService(api);

    await service.updateUiPrefs({ locale: 'zh_CN' });

    expect(api.set).toHaveBeenLastCalledWith({
      uiPrefs: { theme: 'dark', colorScheme: 'space', locale: 'zh_CN' },
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

// ─── saveSnapshot() ─────────────────────────────────────

describe('StorageService.saveSnapshot', () => {
  it('persists the full storage snapshot with cloneable values', async () => {
    const api = createMockApi({});
    const service = new StorageService(api);
    const snapshot = ref({
      connection: { ...DEFAULT_CONNECTION_CONFIG },
      settings: {
        ...DEFAULT_DOWNLOAD_SETTINGS,
        duplicateGuard: { ...DEFAULT_DOWNLOAD_SETTINGS.duplicateGuard },
        minimumFileSize: { ...DEFAULT_DOWNLOAD_SETTINGS.minimumFileSize },
        fileExtensionRule: {
          ...DEFAULT_DOWNLOAD_SETTINGS.fileExtensionRule,
          extensions: [...DEFAULT_DOWNLOAD_SETTINGS.fileExtensionRule.extensions],
        },
        interceptionScope: { ...DEFAULT_DOWNLOAD_SETTINGS.interceptionScope },
      },
      siteRules: [],
      uiPrefs: { ...DEFAULT_UI_PREFS },
      diagnosticLog: [],
    });

    await service.saveSnapshot(snapshot.value);

    const payload = api.set.mock.calls[0]?.[0];
    expect(() => structuredClone(payload)).not.toThrow();
    expect(payload).toEqual(snapshot.value);
  });
});
