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
import { parseDownloadSettings, parseStorage, type ParsedStorage } from './schema';
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

export interface StorageSnapshot {
  connection: ConnectionConfig;
  settings: DownloadSettings;
  siteRules: SiteRule[];
  uiPrefs: UiPrefs;
  diagnosticLog: DiagnosticEvent[];
}

function toStorageValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toStorageValue(item)) as T;
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toStorageValue(item)]),
    ) as T;
  }

  return value;
}

// ─── Service ────────────────────────────────────────────

export class StorageService {
  constructor(private readonly api: StorageApi) {}

  /**
   * Load the entire storage snapshot with schema validation.
   * Missing or corrupt fields are repaired by parseStorage defaults.
   */
  async load(): Promise<ParsedStorage> {
    const raw = await this.api.get(null);
    return parseStorage(raw);
  }

  /** Load the latest persisted download settings. */
  async loadSettings(): Promise<DownloadSettings> {
    const raw = await this.api.get(['settings']);
    return parseDownloadSettings(raw.settings);
  }

  /** Persist API connection configuration. */
  async saveConnectionConfig(config: ConnectionConfig): Promise<void> {
    await this.api.set({ connection: toStorageValue(config) });
  }

  /** Patch API connection configuration without overwriting unrelated fields. */
  async updateConnectionConfig(patch: Partial<ConnectionConfig>): Promise<void> {
    const storage = await this.load();
    await this.saveConnectionConfig({ ...storage.connection, ...patch });
  }

  /** Persist download behavior settings. */
  async saveSettings(settings: DownloadSettings): Promise<void> {
    await this.api.set({ settings: toStorageValue(settings) });
  }

  /** Patch download behavior settings without overwriting unrelated fields. */
  async updateSettings(patch: Partial<DownloadSettings>): Promise<void> {
    const storage = await this.load();
    await this.saveSettings({ ...storage.settings, ...patch });
  }

  /** Persist site rules array. */
  async saveSiteRules(rules: SiteRule[]): Promise<void> {
    await this.api.set({ siteRules: toStorageValue(rules) });
  }

  /** Persist UI appearance preferences. */
  async saveUiPrefs(prefs: UiPrefs): Promise<void> {
    await this.api.set({ uiPrefs: toStorageValue(prefs) });
  }

  /** Patch UI preferences without overwriting unrelated fields. */
  async updateUiPrefs(patch: Partial<UiPrefs>): Promise<void> {
    const storage = await this.load();
    await this.saveUiPrefs({ ...storage.uiPrefs, ...patch });
  }

  /** Persist diagnostic event log. */
  async saveDiagnosticLog(events: DiagnosticEvent[]): Promise<void> {
    await this.api.set({ diagnosticLog: toStorageValue(events) });
  }

  /** Persist the complete user-visible storage snapshot. */
  async saveSnapshot(snapshot: StorageSnapshot): Promise<void> {
    await this.api.set({
      connection: toStorageValue(snapshot.connection),
      settings: toStorageValue(snapshot.settings),
      siteRules: toStorageValue(snapshot.siteRules),
      uiPrefs: toStorageValue(snapshot.uiPrefs),
      diagnosticLog: toStorageValue(snapshot.diagnosticLog),
    });
  }
}
