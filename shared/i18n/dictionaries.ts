/**
 * @fileoverview Translation data layer for runtime locale switching.
 *
 * Imports Chrome i18n messages.json files directly (they are the SSOT)
 * and flattens them to Record<string, string> for runtime use.
 * Named placeholders (e.g. $speed$) are pre-compiled to positional
 * ($1) at module load time so the engine only does simple replacement.
 *
 * Adding a new language requires exactly two steps:
 * 1. Create public/_locales/<id>/messages.json
 * 2. Add one import + one SUPPORTED_LOCALES entry + one DICTIONARIES entry below
 */
// Virtual modules served by locale-virtual-import plugin in wxt.config.ts.
// Reads from public/_locales/ at build time — SSOT stays in messages.json.
import enRaw from 'locale:en';
import jaRaw from 'locale:ja';
import zhCNRaw from 'locale:zh_CN';

// ─── Types ──────────────────────────────────────────────

type ChromeMessages = Record<
  string,
  {
    message: string;
    description?: string;
    placeholders?: Record<string, { content: string; example?: string }>;
  }
>;

/** Locale entry for the language selector UI. */
export interface LocaleEntry {
  /** Storage ID: 'en', 'zh_CN', etc. */
  readonly id: string;
  /** Native name: 'English', '中文', '日本語' */
  readonly endonym: string;
  /** English name: 'English', 'Chinese', 'Japanese' */
  readonly exonym: string;
}

// ─── Locale Registry ────────────────────────────────────

/**
 * Supported locales with display metadata.
 * Adding a language = adding one entry here + one import + one dict entry.
 */
export const SUPPORTED_LOCALES: readonly LocaleEntry[] = [
  { id: 'zh_CN', endonym: '中文', exonym: 'Chinese' },
  { id: 'en', endonym: 'English', exonym: 'English' },
  { id: 'ja', endonym: '日本語', exonym: 'Japanese' },
];

export const FALLBACK_LOCALE = 'en';

// ─── Flatten ────────────────────────────────────────────

/**
 * Flatten Chrome i18n format to a flat Record<string, string>.
 *
 * Pre-compiles named placeholders to positional format so the
 * engine only needs to do simple $1/$2/... replacement at runtime.
 *
 * "$filename$ is now downloading" + placeholders { filename: { content: "$1" } }
 * → "$1 is now downloading"
 */
function flatten(raw: ChromeMessages): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw)) {
    let msg = entry.message;
    if (entry.placeholders) {
      for (const [name, ph] of Object.entries(entry.placeholders)) {
        // Replace $name$ with the positional content (e.g. $1)
        msg = msg.replaceAll(`$${name}$`, ph.content);
      }
    }
    dict[key] = msg;
  }
  return dict;
}

// ─── Dictionaries ───────────────────────────────────────

/** All flattened dictionaries, keyed by locale ID. */
export const DICTIONARIES: Record<string, Record<string, string>> = {
  en: flatten(enRaw as ChromeMessages),
  ja: flatten(jaRaw as ChromeMessages),
  zh_CN: flatten(zhCNRaw as ChromeMessages),
};

// ─── Locale Resolution ──────────────────────────────────

/**
 * Resolve a raw locale string (from browser or storage) to a
 * supported locale ID.
 *
 * Matching priority: exact → base language → fallback.
 *
 * @example
 * resolveLocaleId('zh-CN') → 'zh_CN'
 * resolveLocaleId('zh-TW') → 'zh_CN'
 * resolveLocaleId('fr')    → 'en'
 */
export function resolveLocaleId(raw: string): string {
  // 1. Normalize hyphen → underscore and try exact match
  const normalized = raw.replace('-', '_');
  if (DICTIONARIES[normalized]) return normalized;

  // 2. Base language match (case-insensitive)
  const base = raw.split(/[-_]/)[0]!.toLowerCase();
  if (!base) return FALLBACK_LOCALE;
  const match = Object.keys(DICTIONARIES).find((k) => k.toLowerCase().startsWith(base));
  if (match) return match;

  // 3. Fallback
  return FALLBACK_LOCALE;
}
