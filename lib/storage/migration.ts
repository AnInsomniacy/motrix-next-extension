/**
 * @fileoverview Storage schema versioning and migration.
 *
 * Implements a forward-only migration pipeline for chrome.storage.local.
 * Each migration is a pure function that transforms the storage snapshot
 * from version N-1 to version N. Migrations run sequentially on startup.
 *
 * Design decisions:
 *   - Forward-only: future versions are never downgraded.
 *   - Non-destructive: existing data fields are preserved through spread.
 *   - Idempotent: running migrations on already-migrated data is a no-op.
 *   - DI: storage API is injected for testability.
 */

// ─── Version ────────────────────────────────────────────

/** Current storage schema version. Bump this and add a migration entry. */
export const STORAGE_VERSION = 2;

// ─── Migration Definitions ─────────────────────────────

interface Migration {
  /** Target version this migration produces. */
  readonly version: number;
  /** Transform snapshot from (version - 1) → version. */
  readonly up: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered list of migrations. Each entry brings the schema from
 * (version - 1) to `version`. Add new entries at the end.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    // v0 → v1: Initial schema version stamping.
    // Existing users have no _version field — this migration simply
    // stamps the version without altering any data structure.
    version: 1,
    up: (data) => ({ ...data, _version: 1 }),
  },
  {
    // v1 → v2: Remove deprecated download settings.
    // notifyOnStart, notifyOnComplete, and fallbackToBrowser were empty-shell
    // features (UI switches existed but business logic never consumed them).
    // Desktop app handles all notification duties; browser fallback is not wanted.
    // These fields must be stripped before DownloadSettingsSchema.strict() parse.
    version: 2,
    up: (data) => {
      if (data.settings && typeof data.settings === 'object') {
        const s = { ...(data.settings as Record<string, unknown>) };
        delete s.notifyOnStart;
        delete s.notifyOnComplete;
        delete s.fallbackToBrowser;
        return { ...data, settings: s, _version: 2 };
      }
      return { ...data, _version: 2 };
    },
  },
];

// ─── Result Type ────────────────────────────────────────

/** Describes what happened during migration, if anything. */
export interface MigrationResult {
  /** Schema version before migration ran. */
  readonly from: number;
  /** Schema version after migration ran. */
  readonly to: number;
  /** Whether any migration was actually applied (false = already current). */
  readonly migrated: boolean;
}

// ─── Storage API Interface ──────────────────────────────

export interface MigrationStorageApi {
  get: (keys: string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

// ─── Migration Runner ───────────────────────────────────

/**
 * Run all pending migrations on the storage snapshot.
 *
 * Reads the current `_version`, applies any migrations between
 * the current version and `STORAGE_VERSION`, then writes the
 * updated snapshot back. No-op if already at current version.
 *
 * @param api - Storage API (chrome.storage.local or mock)
 */
export async function migrateStorage(api: MigrationStorageApi): Promise<MigrationResult> {
  const raw = await api.get(null);
  const currentVersion = typeof raw._version === 'number' ? raw._version : 0;

  // Already at or ahead of current version — nothing to do.
  if (currentVersion >= STORAGE_VERSION) {
    return { from: currentVersion, to: currentVersion, migrated: false };
  }

  // Apply pending migrations sequentially.
  let snapshot: Record<string, unknown> = { ...raw };
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      snapshot = migration.up(snapshot);
    }
  }

  // Ensure version is stamped even if no migrations matched.
  snapshot._version = STORAGE_VERSION;

  await api.set(snapshot);
  return { from: currentVersion, to: STORAGE_VERSION, migrated: true };
}
