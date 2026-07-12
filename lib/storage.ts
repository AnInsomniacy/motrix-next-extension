/**
 * Typed, schema-validated persistence over `browser.storage.local`.
 *
 * Reads are repaired through zod (corrupt fields collapse to defaults) and
 * writes are re-parsed, which both validates and strips Vue reactivity
 * proxies / extra properties before they hit extension storage.
 */
import { storage } from 'wxt/utils/storage';
import {
  parseConnectionConfig,
  parseDiagnosticEvents,
  parseDownloadSettings,
  parseSiteRules,
  parseSnapshot,
  parseUiPrefs,
  type ConnectionConfig,
  type DiagnosticEvent,
  type DownloadSettings,
  type SiteRule,
  type StorageSnapshot,
  type UiPrefs,
} from './schema';

export const STORAGE_KEYS = [
  'connection',
  'settings',
  'siteRules',
  'uiPrefs',
  'diagnosticLog',
] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

const local = (key: StorageKey) => `local:${key}` as const;

// ─── Reads ──────────────────────────────────────────────

export async function loadSnapshot(): Promise<StorageSnapshot> {
  const entries = await Promise.all(
    STORAGE_KEYS.map(async (key) => [key, await storage.getItem(local(key))] as const),
  );
  return parseSnapshot(Object.fromEntries(entries));
}

export async function loadSettings(): Promise<DownloadSettings> {
  return parseDownloadSettings(await storage.getItem(local('settings')));
}

export async function loadUiPrefs(): Promise<UiPrefs> {
  return parseUiPrefs(await storage.getItem(local('uiPrefs')));
}

// ─── Writes (validated + normalized on the way in) ──────

export async function saveConnectionConfig(config: ConnectionConfig): Promise<void> {
  await storage.setItem(local('connection'), parseConnectionConfig(config));
}

export async function saveSettings(settings: DownloadSettings): Promise<void> {
  await storage.setItem(local('settings'), parseDownloadSettings(settings));
}

export async function updateSettings(patch: Partial<DownloadSettings>): Promise<void> {
  await saveSettings({ ...(await loadSettings()), ...patch });
}

export async function saveSiteRules(rules: SiteRule[]): Promise<void> {
  await storage.setItem(local('siteRules'), parseSiteRules(rules));
}

export async function saveUiPrefs(prefs: UiPrefs): Promise<void> {
  await storage.setItem(local('uiPrefs'), parseUiPrefs(prefs));
}

export async function updateUiPrefs(patch: Partial<UiPrefs>): Promise<void> {
  await saveUiPrefs({ ...(await loadUiPrefs()), ...patch });
}

export async function saveDiagnosticLog(events: DiagnosticEvent[]): Promise<void> {
  await storage.setItem(local('diagnosticLog'), parseDiagnosticEvents(events));
}

export async function saveSnapshot(snapshot: StorageSnapshot): Promise<void> {
  const validated = parseSnapshot(snapshot);
  await storage.setItems(STORAGE_KEYS.map((key) => ({ key: local(key), value: validated[key] })));
}
