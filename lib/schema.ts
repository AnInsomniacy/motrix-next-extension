/**
 * Single source of truth for every persisted data structure.
 *
 * Zod schemas define shape, validation, AND defaults. TypeScript types are
 * inferred, default constants are derived by parsing `{}` — nothing is
 * written twice.
 *
 * Every exported parse helper accepts `unknown` and never throws: invalid
 * fields collapse to their defaults, invalid array entries are dropped.
 */
import { z } from 'zod';
import { normalizeFileExtensionList } from './file-extensions';

// MV3 CSP forbids eval/new Function() in extension contexts; use zod's
// interpreted path instead of its JIT compiler.
z.config({ jitless: true });

// ─── Helpers ────────────────────────────────────────────

/** Make an object schema tolerate any garbage input by re-parsing `{}`. */
function lenient<S extends z.ZodType>(schema: S): z.ZodCatch<S> {
  return schema.catch(() => schema.parse({}) as z.output<S>);
}

/** Parse an array keeping only the entries that match `schema`. */
function filteredArray<S extends z.ZodType>(schema: S) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const result = schema.safeParse(item);
        return result.success ? [result.data] : [];
      }),
    );
}

// ─── Connection ─────────────────────────────────────────

export const ConnectionConfigSchema = lenient(
  z.object({
    port: z.number().int().min(1024).max(65535).catch(29110),
    secret: z.string().catch(''),
  }),
);

export type ConnectionConfig = z.output<typeof ConnectionConfigSchema>;

// ─── Download Settings ──────────────────────────────────

const interceptOrSkip = z.enum(['intercept', 'skip']);

export const DownloadSettingsSchema = lenient(
  z.object({
    enabled: z.boolean().catch(true),
    hideDownloadBar: z.boolean().catch(false),
    desktopUnavailable: lenient(
      z.object({
        action: z.enum(['launch', 'browser']).catch('launch'),
        startupTimeoutSeconds: z.number().int().min(1).max(60).catch(15),
      }),
    ),
    forwardRequestHeaders: z.boolean().catch(true),
    forwardCookies: z.boolean().catch(true),
    duplicateGuard: lenient(
      z.object({
        enabled: z.boolean().catch(true),
        windowSeconds: z.number().int().min(1).max(300).catch(10),
      }),
    ),
    minimumFileSize: lenient(
      z.object({
        enabled: z.boolean().catch(false),
        sizeMb: z.number().min(0).catch(5),
        unknownSizeAction: interceptOrSkip.catch('intercept'),
      }),
    ),
    fileExtensionRule: lenient(
      z.object({
        enabled: z.boolean().catch(false),
        extensions: z.array(z.string()).transform(normalizeFileExtensionList).catch([]),
        listedAction: interceptOrSkip.catch('skip'),
        unknownAction: interceptOrSkip.catch('intercept'),
      }),
    ),
    interceptionScope: lenient(
      z.object({
        browserDownloads: z.boolean().catch(true),
        magnet: z.boolean().catch(true),
        ed2k: z.boolean().catch(true),
        thunder: z.boolean().catch(true),
      }),
    ),
  }),
);

export type DownloadSettings = z.output<typeof DownloadSettingsSchema>;
export type DesktopUnavailableSettings = DownloadSettings['desktopUnavailable'];
export type DesktopUnavailableAction = DesktopUnavailableSettings['action'];
export type DuplicateDownloadGuardSettings = DownloadSettings['duplicateGuard'];
export type MinimumFileSizeSettings = DownloadSettings['minimumFileSize'];
export type FileExtensionRuleSettings = DownloadSettings['fileExtensionRule'];
export type FileExtensionRuleAction = FileExtensionRuleSettings['listedAction'];
export type InterceptionScope = DownloadSettings['interceptionScope'];

// ─── Site Rules ─────────────────────────────────────────

export const SiteRuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  action: z.enum(['always-intercept', 'always-skip', 'use-global']),
});

export type SiteRule = z.output<typeof SiteRuleSchema>;

export const SiteRulesSchema = filteredArray(SiteRuleSchema);

// ─── UI Preferences ─────────────────────────────────────

export const UiPrefsSchema = lenient(
  z.object({
    theme: z.enum(['system', 'light', 'dark']).catch('system'),
    colorScheme: z.string().catch('amber'),
    locale: z.string().catch('auto'),
  }),
);

export type UiPrefs = z.output<typeof UiPrefsSchema>;
export type ThemePreference = UiPrefs['theme'];

// ─── Diagnostic Log ─────────────────────────────────────

export const DiagnosticCodeSchema = z.enum([
  // API connectivity
  'api_auth_failed',
  // Download interception lifecycle
  'download_intercepted',
  'download_skipped',
  'download_fallback',
  'download_failed',
  'download_routed',
  'download_duplicate_blocked',
  'download_cancel_failed',
  'download_handler_error',
  'request_headers_listener_ready',
  'request_headers_listener_downgraded',
  'request_headers_listener_failed',
  // Desktop activation lifecycle
  'desktop_activation_attempt',
  'desktop_activation_success',
  'desktop_activation_timeout',
  // Cookie & permission
  'cookie_collect_failed',
  'permission_granted',
  'permission_revoked',
  // Extension lifecycle
  'extension_started',
  'extension_installed',
  'extension_updated',
  // Configuration
  'config_loaded',
  'config_load_failed',
  'config_changed',
  // User-initiated actions
  'context_menu_triggered',
  'protocol_intercepted',
  // Infrastructure
  'download_bar_error',
  'notification_create_failed',
]);

export type DiagnosticCode = z.output<typeof DiagnosticCodeSchema>;

export const DiagnosticEventSchema = z.object({
  id: z.string(),
  ts: z.number(),
  level: z.enum(['info', 'warn', 'error']),
  code: DiagnosticCodeSchema,
  message: z.string(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type DiagnosticEvent = z.output<typeof DiagnosticEventSchema>;
export type DiagnosticLevel = DiagnosticEvent['level'];

export const DiagnosticEventsSchema = filteredArray(DiagnosticEventSchema);

// ─── Composite Snapshot ─────────────────────────────────

export const StorageSnapshotSchema = lenient(
  z.object({
    connection: ConnectionConfigSchema,
    settings: DownloadSettingsSchema,
    siteRules: SiteRulesSchema,
    uiPrefs: UiPrefsSchema,
    diagnosticLog: DiagnosticEventsSchema,
  }),
);

export type StorageSnapshot = z.output<typeof StorageSnapshotSchema>;

// ─── Defaults (derived, never hand-written) ─────────────

export const DEFAULT_CONNECTION_CONFIG: Readonly<ConnectionConfig> = ConnectionConfigSchema.parse(
  {},
);
export const DEFAULT_DOWNLOAD_SETTINGS: Readonly<DownloadSettings> = DownloadSettingsSchema.parse(
  {},
);
export const DEFAULT_UI_PREFS: Readonly<UiPrefs> = UiPrefsSchema.parse({});

/** Build a fresh, fully-defaulted mutable snapshot. */
export function createDefaultSnapshot(): StorageSnapshot {
  return StorageSnapshotSchema.parse({});
}

// ─── Parse Helpers ──────────────────────────────────────

export const parseConnectionConfig = (input: unknown): ConnectionConfig =>
  ConnectionConfigSchema.parse(input);
export const parseDownloadSettings = (input: unknown): DownloadSettings =>
  DownloadSettingsSchema.parse(input);
export const parseSiteRules = (input: unknown): SiteRule[] => SiteRulesSchema.parse(input);
export const parseUiPrefs = (input: unknown): UiPrefs => UiPrefsSchema.parse(input);
export const parseDiagnosticEvents = (input: unknown): DiagnosticEvent[] =>
  DiagnosticEventsSchema.parse(input);
export const parseSnapshot = (input: unknown): StorageSnapshot =>
  StorageSnapshotSchema.parse(input);
