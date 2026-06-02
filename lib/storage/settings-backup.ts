import {
  parseConnectionConfig,
  parseDownloadSettings,
  parseSiteRules,
  parseUiPrefs,
} from './schema';
import type { StorageSnapshot } from './storage-service';
import type { ConnectionConfig } from '@/shared/types';

export const SETTINGS_BACKUP_KIND = 'motrix-next-extension-settings' as const;
export const SETTINGS_BACKUP_SCHEMA_VERSION = 1 as const;

export interface SettingsBackup {
  kind: typeof SETTINGS_BACKUP_KIND;
  schemaVersion: typeof SETTINGS_BACKUP_SCHEMA_VERSION;
  extensionVersion: string;
  exportedAt: string;
  settings: Omit<StorageSnapshot, 'diagnosticLog'>;
}

export interface CreateSettingsBackupOptions {
  extensionVersion: string;
  exportedAt?: string;
  includeConnectionSecret?: boolean;
}

export interface ParseSettingsBackupOptions {
  currentSecret?: string;
}

export class SettingsBackupError extends Error {
  constructor(message = 'Invalid settings backup') {
    super(message);
    this.name = 'SettingsBackupError';
  }
}

function readObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SettingsBackupError();
  }
  return value as Record<string, unknown>;
}

export function createSettingsBackup(
  snapshot: StorageSnapshot,
  options: CreateSettingsBackupOptions,
): SettingsBackup {
  const connection: Partial<ConnectionConfig> = {
    port: snapshot.connection.port,
    ...(options.includeConnectionSecret !== false ? { secret: snapshot.connection.secret } : {}),
  };

  return {
    kind: SETTINGS_BACKUP_KIND,
    schemaVersion: SETTINGS_BACKUP_SCHEMA_VERSION,
    extensionVersion: options.extensionVersion,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    settings: {
      connection: connection as ConnectionConfig,
      settings: snapshot.settings,
      siteRules: snapshot.siteRules,
      uiPrefs: snapshot.uiPrefs,
    },
  };
}

export function parseSettingsBackup(
  json: string,
  options: ParseSettingsBackupOptions = {},
): StorageSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SettingsBackupError();
  }

  const envelope = readObject(parsed);
  if (
    envelope.kind !== SETTINGS_BACKUP_KIND ||
    envelope.schemaVersion !== SETTINGS_BACKUP_SCHEMA_VERSION
  ) {
    throw new SettingsBackupError();
  }

  const settings = readObject(envelope.settings);
  const connection = parseConnectionConfig(settings.connection);
  const rawConnection = readObject(settings.connection);
  return {
    connection: {
      ...connection,
      secret:
        typeof rawConnection.secret === 'string'
          ? connection.secret
          : (options.currentSecret ?? ''),
    },
    settings: parseDownloadSettings(settings.settings),
    siteRules: parseSiteRules(settings.siteRules),
    uiPrefs: parseUiPrefs(settings.uiPrefs),
    diagnosticLog: [],
  };
}
