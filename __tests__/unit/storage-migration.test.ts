import { describe, it, expect, vi } from 'vitest';
import { migrateStorage, STORAGE_VERSION, type MigrationStorageApi } from '@/modules/storage/migration';

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
    const api = createMockStorage({ rpc: { port: 6800 } });

    await migrateStorage(api);

    expect(api.set).toHaveBeenCalledWith(
      expect.objectContaining({ _version: STORAGE_VERSION }),
    );
  });

  it('does not write when data is already at current version', async () => {
    const api = createMockStorage({ _version: STORAGE_VERSION });

    await migrateStorage(api);

    expect(api.set).not.toHaveBeenCalled();
  });

  it('preserves existing data fields during migration', async () => {
    const api = createMockStorage({
      rpc: { host: '127.0.0.1', port: 6800, secret: 'test' },
      settings: { enabled: false },
    });

    await migrateStorage(api);

    const setCall = (api.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCall.rpc).toEqual({ host: '127.0.0.1', port: 6800, secret: 'test' });
    expect(setCall.settings).toEqual({ enabled: false });
  });

  it('handles empty storage gracefully', async () => {
    const api = createMockStorage({});

    await migrateStorage(api);

    expect(api.set).toHaveBeenCalledWith(
      expect.objectContaining({ _version: STORAGE_VERSION }),
    );
  });

  it('handles corrupt _version (non-number) as version 0', async () => {
    const api = createMockStorage({ _version: 'garbage' });

    await migrateStorage(api);

    expect(api.set).toHaveBeenCalledWith(
      expect.objectContaining({ _version: STORAGE_VERSION }),
    );
  });

  it('handles future versions gracefully (does not downgrade)', async () => {
    const futureVersion = STORAGE_VERSION + 99;
    const api = createMockStorage({ _version: futureVersion });

    await migrateStorage(api);

    expect(api.set).not.toHaveBeenCalled();
  });
});
