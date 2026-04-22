import { describe, it, expect, vi } from 'vitest';
import { migrateStorage, STORAGE_VERSION, type MigrationStorageApi } from '@/lib/storage/migration';

// ─── Mock Storage API ───────────────────────────────────

function createMockStorage(data: Record<string, unknown> = {}): MigrationStorageApi {
  return {
    get: vi.fn<MigrationStorageApi['get']>().mockResolvedValue(data),
    set: vi.fn<MigrationStorageApi['set']>().mockResolvedValue(undefined),
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('STORAGE_VERSION', () => {
  it('is a positive integer', () => {
    expect(STORAGE_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(STORAGE_VERSION)).toBe(true);
  });
});

describe('migrateStorage', () => {
  it('stamps _version on data with no version field', async () => {
    const api = createMockStorage({ connection: { port: 16801 } });

    const result = await migrateStorage(api);

    expect(api.set).toHaveBeenCalledWith(expect.objectContaining({ _version: STORAGE_VERSION }));
    expect(result).toEqual({ from: 0, to: STORAGE_VERSION, migrated: true });
  });

  it('does not write when data is already at current version', async () => {
    const api = createMockStorage({ _version: STORAGE_VERSION });

    const result = await migrateStorage(api);

    expect(api.set).not.toHaveBeenCalled();
    expect(result).toEqual({ from: STORAGE_VERSION, to: STORAGE_VERSION, migrated: false });
  });

  it('preserves existing data fields during migration', async () => {
    const api = createMockStorage({
      connection: { port: 9000, secret: 'test' },
      settings: { enabled: false },
    });

    await migrateStorage(api);

    const setCall = (api.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(setCall.connection).toEqual({ port: 9000, secret: 'test' });
    expect(setCall.settings).toEqual({ enabled: false });
  });

  it('handles empty storage gracefully', async () => {
    const api = createMockStorage({});

    await migrateStorage(api);

    expect(api.set).toHaveBeenCalledWith(expect.objectContaining({ _version: STORAGE_VERSION }));
  });

  it('handles corrupt _version (non-number) as version 0', async () => {
    const api = createMockStorage({ _version: 'garbage' });

    await migrateStorage(api);

    expect(api.set).toHaveBeenCalledWith(expect.objectContaining({ _version: STORAGE_VERSION }));
  });

  it('handles future versions gracefully (does not downgrade)', async () => {
    const futureVersion = STORAGE_VERSION + 99;
    const api = createMockStorage({ _version: futureVersion });

    const result = await migrateStorage(api);

    expect(api.set).not.toHaveBeenCalled();
    expect(result).toEqual({ from: futureVersion, to: futureVersion, migrated: false });
  });

  // ─── v2 Migration: Remove Deprecated Settings ─────────

  it('v2 migration strips deprecated notifyOnStart, notifyOnComplete, fallbackToBrowser fields', async () => {
    const api = createMockStorage({
      _version: 1,
      settings: {
        enabled: true,
        minFileSize: 5,
        fallbackToBrowser: true,
        hideDownloadBar: false,
        notifyOnStart: true,
        notifyOnComplete: false,
        autoLaunchApp: true,
      },
    });

    await migrateStorage(api);

    const setCall = (api.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const migratedSettings = setCall.settings as Record<string, unknown>;
    expect(migratedSettings).not.toHaveProperty('notifyOnStart');
    expect(migratedSettings).not.toHaveProperty('notifyOnComplete');
    expect(migratedSettings).not.toHaveProperty('fallbackToBrowser');
    // Preserved fields remain intact
    expect(migratedSettings.enabled).toBe(true);
    expect(migratedSettings.minFileSize).toBe(5);
    expect(migratedSettings.hideDownloadBar).toBe(false);
    expect(migratedSettings.autoLaunchApp).toBe(true);
    expect(setCall._version).toBe(STORAGE_VERSION);
  });

  it('v2 migration is idempotent on data without deprecated fields', async () => {
    const api = createMockStorage({
      _version: 1,
      settings: {
        enabled: true,
        minFileSize: 0,
        hideDownloadBar: false,
        autoLaunchApp: true,
      },
    });

    await migrateStorage(api);

    const setCall = (api.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const migratedSettings = setCall.settings as Record<string, unknown>;
    expect(migratedSettings.enabled).toBe(true);
    expect(migratedSettings).not.toHaveProperty('notifyOnStart');
    expect(setCall._version).toBe(STORAGE_VERSION);
  });

  it('v2 migration handles storage without settings object', async () => {
    const api = createMockStorage({
      _version: 1,
      connection: { port: 9000, secret: '' },
    });

    await migrateStorage(api);

    const setCall = (api.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(setCall.connection).toEqual({ port: 9000, secret: '' });
    expect(setCall._version).toBe(STORAGE_VERSION);
  });
});
