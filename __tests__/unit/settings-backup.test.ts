import { describe, expect, it } from 'vitest';
import {
  createSettingsBackup,
  parseSettingsBackup,
  SETTINGS_BACKUP_KIND,
} from '@/lib/storage/settings-backup';
import type { StorageSnapshot } from '@/lib/storage';

function createSnapshot(): StorageSnapshot {
  return {
    connection: { port: 29110, secret: 'secret-token' },
    settings: {
      enabled: true,
      hideDownloadBar: false,
      autoLaunchApp: true,
      forwardRequestHeaders: true,
      forwardCookies: true,
      duplicateGuard: { enabled: true, windowSeconds: 10 },
      minimumFileSize: { enabled: false, sizeMb: 5, unknownSizeAction: 'intercept' },
      fileExtensionRule: {
        enabled: true,
        extensions: ['jpg', 'tar.gz'],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: { browserDownloads: true, magnet: true, ed2k: true, thunder: true },
    },
    siteRules: [{ id: 'r1', pattern: '*.example.com', action: 'always-skip' }],
    uiPrefs: { theme: 'dark', colorScheme: 'amber', locale: 'en' },
    diagnosticLog: [{ id: 'd1', ts: 1, level: 'info', code: 'config_loaded', message: 'loaded' }],
  };
}

describe('settings backup', () => {
  it('exports portable settings without diagnostic events', () => {
    const backup = createSettingsBackup(createSnapshot(), {
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
    });

    expect(backup).toEqual({
      kind: SETTINGS_BACKUP_KIND,
      schemaVersion: 1,
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
      settings: {
        connection: { port: 29110, secret: 'secret-token' },
        settings: createSnapshot().settings,
        siteRules: [{ id: 'r1', pattern: '*.example.com', action: 'always-skip' }],
        uiPrefs: { theme: 'dark', colorScheme: 'amber', locale: 'en' },
      },
    });
    expect(JSON.stringify(backup)).not.toContain('diagnosticLog');
  });

  it('can export settings without the connection secret', () => {
    const backup = createSettingsBackup(createSnapshot(), {
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
      includeConnectionSecret: false,
    });

    expect(backup.settings.connection).toEqual({ port: 29110 });
    expect(JSON.stringify(backup)).not.toContain('secret-token');
  });

  it('preserves the current connection secret when importing a backup without one', () => {
    const exported = createSettingsBackup(createSnapshot(), {
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
      includeConnectionSecret: false,
    });

    expect(
      parseSettingsBackup(JSON.stringify(exported), { currentSecret: 'local-secret' }),
    ).toEqual({
      ...createSnapshot(),
      connection: { port: 29110, secret: 'local-secret' },
      diagnosticLog: [],
    });
  });

  it('imports a valid backup as a full storage snapshot with an empty diagnostic log', () => {
    const exported = createSettingsBackup(createSnapshot(), {
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
    });

    expect(parseSettingsBackup(JSON.stringify(exported))).toEqual({
      ...createSnapshot(),
      diagnosticLog: [],
    });
  });

  it('rejects files that are not Motrix Next settings backups', () => {
    expect(() => parseSettingsBackup('{"kind":"other"}')).toThrow('Invalid settings backup');
  });
});
