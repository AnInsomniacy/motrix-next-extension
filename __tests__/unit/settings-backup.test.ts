import { describe, expect, it } from 'vitest';
import { createSettingsBackup, parseSettingsBackup } from '@/lib/backup';
import { createDefaultSnapshot } from '@/lib/schema';

describe('settings backup', () => {
  const snapshot = createDefaultSnapshot();
  snapshot.connection.secret = 'secret-token';
  snapshot.settings.fileExtensionRule.extensions = ['jpg', 'tar.gz'];
  snapshot.siteRules = [{ id: 'r1', pattern: '*.example.com', action: 'always-skip' }];
  snapshot.uiPrefs.locale = 'zh_CN';
  snapshot.diagnostics.maxEvents = 250;

  it('round-trips current settings, including the secret, without diagnostic events', () => {
    const backup = createSettingsBackup(snapshot, { extensionVersion: '1.3.7' });
    expect(parseSettingsBackup(JSON.stringify(backup))).toEqual(snapshot);
    expect(JSON.stringify(backup)).not.toContain('diagnosticLog');
  });

  it('rejects malformed, obsolete, and secretless backups', () => {
    const backup = createSettingsBackup(snapshot, { extensionVersion: '1.3.7' });
    const secretless = JSON.stringify(backup, (key, value) =>
      key === 'secret' ? undefined : value,
    );
    for (const json of [
      '{',
      '{"kind":"other"}',
      JSON.stringify({ ...backup, schemaVersion: 2 }),
      secretless,
    ]) {
      expect(() => parseSettingsBackup(json)).toThrow('Invalid settings backup');
    }
  });
});
