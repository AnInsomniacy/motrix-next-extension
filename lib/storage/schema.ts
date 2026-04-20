/**
 * @fileoverview Runtime schema validation for chrome.storage.local data.
 *
 * Provides Zod schemas for every persisted data structure and safe parse
 * functions that return validated, typed objects with defaults for any
 * missing or corrupt fields. This eliminates all `as Record<string, unknown>`
 * type assertions from the storage hydration path.
 *
 * Design decisions:
 *   - Every parse function accepts `unknown` input and NEVER throws.
 *   - Invalid values are silently replaced by defaults (graceful degradation).
 *   - Extra properties are stripped to prevent storage pollution.
 *   - SiteRule/DiagnosticEvent arrays filter out invalid entries rather than
 *     rejecting the entire array — partial data is better than no data.
 *
 * @see /shared/constants.ts — default values sourced from here
 * @see /shared/types.ts — canonical TypeScript interfaces
 */
import { z } from 'zod';

import {
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_UI_PREFS,
} from '@/shared/constants';

// ─── Leaf Schemas ───────────────────────────────────────

const ConnectionConfigSchema = z
  .object({
    port: z.number().int().min(1024).max(65535).default(DEFAULT_CONNECTION_CONFIG.port),
    secret: z.string().default(DEFAULT_CONNECTION_CONFIG.secret),
  })
  .strict();

const DownloadSettingsSchema = z
  .object({
    enabled: z.boolean().default(DEFAULT_DOWNLOAD_SETTINGS.enabled),
    minFileSize: z.number().min(0).default(DEFAULT_DOWNLOAD_SETTINGS.minFileSize),
    fallbackToBrowser: z.boolean().default(DEFAULT_DOWNLOAD_SETTINGS.fallbackToBrowser),
    hideDownloadBar: z.boolean().default(DEFAULT_DOWNLOAD_SETTINGS.hideDownloadBar),
    notifyOnStart: z.boolean().default(DEFAULT_DOWNLOAD_SETTINGS.notifyOnStart),
    notifyOnComplete: z.boolean().default(DEFAULT_DOWNLOAD_SETTINGS.notifyOnComplete),
    autoLaunchApp: z.boolean().default(DEFAULT_DOWNLOAD_SETTINGS.autoLaunchApp),
  })
  .strict();

const SiteRuleActionSchema = z.enum(['always-intercept', 'always-skip', 'use-global']);

const SiteRuleSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  action: SiteRuleActionSchema,
});

const UiPrefsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).default(DEFAULT_UI_PREFS.theme),
    colorScheme: z.string().default(DEFAULT_UI_PREFS.colorScheme),
    locale: z.string().default(DEFAULT_UI_PREFS.locale),
  })
  .strict();

const DiagnosticLevelSchema = z.enum(['info', 'warn', 'error']);

const DiagnosticCodeSchema = z.enum([
  'api_connected',
  'api_unreachable',
  'api_auth_failed',
  'download_intercepted',
  'download_sent',
  'download_skipped',
  'download_fallback',
  'download_failed',
  'download_wake_attempt',
  'download_routed',
  'download_browser_redirect',
  'cookie_permission_missing',
  'cookie_collect_failed',
  'permission_granted',
  'permission_revoked',
]);

const DiagnosticEventSchema = z.object({
  id: z.string(),
  ts: z.number(),
  level: DiagnosticLevelSchema,
  code: DiagnosticCodeSchema,
  message: z.string(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

// ─── Composite Storage Schema ───────────────────────────

export interface ParsedStorage {
  connection: z.infer<typeof ConnectionConfigSchema>;
  settings: z.infer<typeof DownloadSettingsSchema>;
  siteRules: z.infer<typeof SiteRuleSchema>[];
  uiPrefs: z.infer<typeof UiPrefsSchema>;
  diagnosticLog: z.infer<typeof DiagnosticEventSchema>[];
  _version: number;
}

// ─── Safe Parse Functions ───────────────────────────────
//
// Each function accepts `unknown` and returns a validated object.
// Invalid input → defaults. Never throws.

/**
 * Parse and validate a ConnectionConfig object.
 * Missing or invalid fields are replaced with defaults.
 */
export function parseConnectionConfig(input: unknown): ParsedStorage['connection'] {
  if (input == null || typeof input !== 'object') {
    return ConnectionConfigSchema.parse({});
  }
  const result = ConnectionConfigSchema.safeParse(input);
  if (result.success) return result.data;
  // Field-level fallback: parse with all defaults, then overlay valid fields
  return ConnectionConfigSchema.parse({});
}

/**
 * Parse and validate a DownloadSettings object.
 * Missing or invalid fields are replaced with defaults.
 */
export function parseDownloadSettings(input: unknown): ParsedStorage['settings'] {
  if (input == null || typeof input !== 'object') {
    return DownloadSettingsSchema.parse({});
  }
  const result = DownloadSettingsSchema.safeParse(input);
  if (result.success) return result.data;
  return DownloadSettingsSchema.parse({});
}

/**
 * Parse and validate an array of SiteRule objects.
 * Invalid entries are silently filtered out.
 */
export function parseSiteRules(input: unknown): ParsedStorage['siteRules'] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => SiteRuleSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data!);
}

/**
 * Parse and validate a UiPrefs object.
 * Missing or invalid fields are replaced with defaults.
 */
export function parseUiPrefs(input: unknown): ParsedStorage['uiPrefs'] {
  if (input == null || typeof input !== 'object') {
    return UiPrefsSchema.parse({});
  }
  const result = UiPrefsSchema.safeParse(input);
  if (result.success) return result.data;
  return UiPrefsSchema.parse({});
}

/**
 * Parse and validate an array of DiagnosticEvent objects.
 * Invalid entries are silently filtered out.
 */
export function parseDiagnosticEvents(input: unknown): ParsedStorage['diagnosticLog'] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => DiagnosticEventSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data!);
}

/**
 * Parse a complete storage snapshot from chrome.storage.local.
 * Every field is validated independently — corrupt fields get defaults
 * without affecting valid sibling data.
 */
export function parseStorage(input: unknown): ParsedStorage {
  const raw = (input != null && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    connection: parseConnectionConfig(raw.connection),
    settings: parseDownloadSettings(raw.settings),
    siteRules: parseSiteRules(raw.siteRules),
    uiPrefs: parseUiPrefs(raw.uiPrefs),
    diagnosticLog: parseDiagnosticEvents(raw.diagnosticLog),
    _version: typeof raw._version === 'number' ? raw._version : 0,
  };
}
