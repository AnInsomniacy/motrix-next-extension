import { describe, expect, it } from 'vitest';
import { createSettingsBackup, parseSettingsBackup, SETTINGS_BACKUP_KIND } from '@/lib/backup';
import type { StorageSnapshot } from '@/lib/schema';

function createSnapshot(): StorageSnapshot {
  return {
    connection: { port: 29110, secret: 'secret-token' },
    settings: {
      enabled: true,
      hideDownloadBar: false,
      desktopUnavailable: { action: 'launch', startupTimeoutSeconds: 15 },
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
    diagnostics: { maxEvents: 100 },
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
      schemaVersion: 3,
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
      settings: {
        connection: { port: 29110, secret: 'secret-token' },
        settings: createSnapshot().settings,
        siteRules: [{ id: 'r1', pattern: '*.example.com', action: 'always-skip' }],
        uiPrefs: { theme: 'dark', colorScheme: 'amber', locale: 'en' },
        diagnostics: { maxEvents: 100 },
      },
    });
    expect(JSON.stringify(backup)).not.toContain('diagnosticLog');
  });

  it('preserves the current secret when importing a historical backup without one', () => {
    const exported = createSettingsBackup(createSnapshot(), {
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
    });
    const jsonWithoutSecret = JSON.stringify(exported, (key, value) =>
      key === 'secret' ? undefined : value,
    );

    expect(parseSettingsBackup(jsonWithoutSecret, { currentSecret: 'local-secret' })).toEqual({
      ...createSnapshot(),
      connection: { port: 29110, secret: 'local-secret' },
    });
  });

  it('imports a valid backup as a settings snapshot', () => {
    const exported = createSettingsBackup(createSnapshot(), {
      extensionVersion: '1.2.19',
      exportedAt: '2026-06-02T00:00:00.000Z',
    });

    expect(parseSettingsBackup(JSON.stringify(exported))).toEqual(createSnapshot());
  });

  it('rejects files that are not Motrix Next settings backups', () => {
    expect(() => parseSettingsBackup('{"kind":"other"}')).toThrow('Invalid settings backup');
  });

  it('rejects legacy backup schemas', () => {
    const backup = createSettingsBackup(createSnapshot(), {
      extensionVersion: '1.3.3',
      exportedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(() => parseSettingsBackup(JSON.stringify({ ...backup, schemaVersion: 2 }))).toThrow(
      'Invalid settings backup',
    );
  });
});
