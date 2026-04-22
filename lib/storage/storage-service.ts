/**
 * @fileoverview Centralized storage access layer for chrome.storage.local.
 *
 * Wraps all chrome.storage.local interactions behind a type-safe service
 * that validates reads through Zod schemas and provides typed setters.
 * Eliminates all `as Record<string, unknown>` casts from consuming code.
 *
 * All reads go through schema validation (parseStorage). All writes use
 * scoped setters that only update their respective keys.
 *
 * DI: accepts a StorageApi interface for testability — no direct
 * chrome.storage.local import.
 */
import { parseStorage, type ParsedStorage } from './schema';
import { migrateStorage, type MigrationStorageApi, type MigrationResult } from './migration';
import type {
  ConnectionConfig,
  DownloadSettings,
  SiteRule,
  UiPrefs,
  DiagnosticEvent,
} from '@/shared/types';

// ─── Storage API Interface ──────────────────────────────

export interface StorageApi {
  get: (keys: string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

/** Result of a load() call — includes both parsed data and migration info. */
export interface LoadResult {
  readonly storage: ParsedStorage;
  readonly migration: MigrationResult;
}

// ─── Service ────────────────────────────────────────────

export class StorageService {
  constructor(private readonly api: StorageApi) {}

  /**
   * Load the entire storage snapshot, running migrations and schema
   * validation. Returns fully typed, defaulted storage alongside
   * migration metadata for diagnostic logging.
   */
  async load(): Promise<LoadResult> {
    // Run migrations first (stamps _version if needed).
    const migration = await migrateStorage(this.api as MigrationStorageApi);

    // Read and validate.
    const raw = await this.api.get(null);
    return { storage: parseStorage(raw), migration };
  }

  /** Persist API connection configuration. */
  async saveConnectionConfig(config: ConnectionConfig): Promise<void> {
    await this.api.set({ connection: config });
  }

  /** Persist download behavior settings. */
  async saveSettings(settings: DownloadSettings): Promise<void> {
    await this.api.set({ settings });
  }

  /** Persist site rules array. */
  async saveSiteRules(rules: SiteRule[]): Promise<void> {
    await this.api.set({ siteRules: rules });
  }

  /** Persist UI appearance preferences. */
  async saveUiPrefs(prefs: UiPrefs): Promise<void> {
    await this.api.set({ uiPrefs: prefs });
  }

  /** Persist diagnostic event log. */
  async saveDiagnosticLog(events: DiagnosticEvent[]): Promise<void> {
    await this.api.set({ diagnosticLog: events });
  }
}
