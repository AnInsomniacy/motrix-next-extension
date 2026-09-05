import { SettingsBackupSchema, SETTINGS_BACKUP_KIND, type StorageSnapshot } from './schema';

export function createSettingsBackup(
  snapshot: StorageSnapshot,
  options: { extensionVersion: string; exportedAt?: string },
) {
  return SettingsBackupSchema.parse({
    kind: SETTINGS_BACKUP_KIND,
    schemaVersion: SettingsBackupSchema.shape.schemaVersion.value,
    extensionVersion: options.extensionVersion,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    settings: snapshot,
  });
}

export function parseSettingsBackup(json: string): StorageSnapshot {
  try {
    return SettingsBackupSchema.parse(JSON.parse(json)).settings;
  } catch {
    throw new Error('Invalid settings backup');
  }
}
