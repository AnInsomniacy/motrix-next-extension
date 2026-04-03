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
import { migrateStorage, type MigrationStorageApi } from './migration';
import type {
  RpcConfig,
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

// ─── Service ────────────────────────────────────────────

export class StorageService {
  constructor(private readonly api: StorageApi) {}

  /**
   * Load the entire storage snapshot, running migrations and schema
   * validation. Returns fully typed, defaulted storage.
   */
  async load(): Promise<ParsedStorage> {
    // Run migrations first (stamps _version if needed).
    await migrateStorage(this.api as MigrationStorageApi);

    // Read and validate.
    const raw = await this.api.get(null);
    return parseStorage(raw);
  }

  /** Persist RPC connection configuration. */
  async saveRpcConfig(config: RpcConfig): Promise<void> {
    await this.api.set({ rpc: config });
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
