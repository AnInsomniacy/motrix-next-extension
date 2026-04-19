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
import arRaw from 'locale:ar';
import bgRaw from 'locale:bg';
import caRaw from 'locale:ca';
import deRaw from 'locale:de';
import elRaw from 'locale:el';
import enRaw from 'locale:en';
import esRaw from 'locale:es';
import faRaw from 'locale:fa';
import frRaw from 'locale:fr';
import huRaw from 'locale:hu';
import idRaw from 'locale:id';
import itRaw from 'locale:it';
import jaRaw from 'locale:ja';
import koRaw from 'locale:ko';
import nbRaw from 'locale:nb';
import nlRaw from 'locale:nl';
import plRaw from 'locale:pl';
import ptBRRaw from 'locale:pt_BR';
import roRaw from 'locale:ro';
import ruRaw from 'locale:ru';
import thRaw from 'locale:th';
import trRaw from 'locale:tr';
import ukRaw from 'locale:uk';
import viRaw from 'locale:vi';
import zhCNRaw from 'locale:zh_CN';
import zhTWRaw from 'locale:zh_TW';

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
 * Sorted alphabetically by locale ID for consistent UI ordering.
 */
export const SUPPORTED_LOCALES: readonly LocaleEntry[] = [
  { id: 'ar', endonym: 'عربي', exonym: 'Arabic' },
  { id: 'bg', endonym: 'Българският език', exonym: 'Bulgarian' },
  { id: 'ca', endonym: 'Català', exonym: 'Catalan' },
  { id: 'de', endonym: 'Deutsch', exonym: 'German' },
  { id: 'el', endonym: 'Ελληνικά', exonym: 'Greek' },
  { id: 'en', endonym: 'English', exonym: 'English' },
  { id: 'es', endonym: 'Español', exonym: 'Spanish' },
  { id: 'fa', endonym: 'فارسی', exonym: 'Persian' },
  { id: 'fr', endonym: 'Français', exonym: 'French' },
  { id: 'hu', endonym: 'Magyar', exonym: 'Hungarian' },
  { id: 'id', endonym: 'Indonesia', exonym: 'Indonesian' },
  { id: 'it', endonym: 'Italiano', exonym: 'Italian' },
  { id: 'ja', endonym: '日本語', exonym: 'Japanese' },
  { id: 'ko', endonym: '한국어', exonym: 'Korean' },
  { id: 'nb', endonym: 'Norsk Bokmål', exonym: 'Norwegian Bokmål' },
  { id: 'nl', endonym: 'Nederlands', exonym: 'Dutch' },
  { id: 'pl', endonym: 'Polski', exonym: 'Polish' },
  { id: 'pt_BR', endonym: 'Português (Brasil)', exonym: 'Portuguese (Brazil)' },
  { id: 'ro', endonym: 'Română', exonym: 'Romanian' },
  { id: 'ru', endonym: 'Русский', exonym: 'Russian' },
  { id: 'th', endonym: 'แบบไทย', exonym: 'Thai' },
  { id: 'tr', endonym: 'Türkçe', exonym: 'Turkish' },
  { id: 'uk', endonym: 'Українська', exonym: 'Ukrainian' },
  { id: 'vi', endonym: 'Tiếng Việt', exonym: 'Vietnamese' },
  { id: 'zh_CN', endonym: '简体中文', exonym: 'Chinese (Simplified)' },
  { id: 'zh_TW', endonym: '繁體中文', exonym: 'Chinese (Traditional)' },
];

export const FALLBACK_LOCALE = 'en';

// ─── Flatten ────────────────────────────────────────────

/**
 * Flatten Chrome i18n format to a flat Record<string, string>.
 *
 * Pre-compiles named placeholders to positional format so the
 * engine only needs to do simple $1/$2/... replacement at runtime.
 *
 * "↓ $speed$" + placeholders { speed: { content: "$1" } } → "↓ $1"
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
  ar: flatten(arRaw as ChromeMessages),
  bg: flatten(bgRaw as ChromeMessages),
  ca: flatten(caRaw as ChromeMessages),
  de: flatten(deRaw as ChromeMessages),
  el: flatten(elRaw as ChromeMessages),
  en: flatten(enRaw as ChromeMessages),
  es: flatten(esRaw as ChromeMessages),
  fa: flatten(faRaw as ChromeMessages),
  fr: flatten(frRaw as ChromeMessages),
  hu: flatten(huRaw as ChromeMessages),
  id: flatten(idRaw as ChromeMessages),
  it: flatten(itRaw as ChromeMessages),
  ja: flatten(jaRaw as ChromeMessages),
  ko: flatten(koRaw as ChromeMessages),
  nb: flatten(nbRaw as ChromeMessages),
  nl: flatten(nlRaw as ChromeMessages),
  pl: flatten(plRaw as ChromeMessages),
  pt_BR: flatten(ptBRRaw as ChromeMessages),
  ro: flatten(roRaw as ChromeMessages),
  ru: flatten(ruRaw as ChromeMessages),
  th: flatten(thRaw as ChromeMessages),
  tr: flatten(trRaw as ChromeMessages),
  uk: flatten(ukRaw as ChromeMessages),
  vi: flatten(viRaw as ChromeMessages),
  zh_CN: flatten(zhCNRaw as ChromeMessages),
  zh_TW: flatten(zhTWRaw as ChromeMessages),
};

// ─── Locale Resolution ──────────────────────────────────

/**
 * Explicit regional → locale mappings that cannot be inferred
 * from base language matching alone.
 *
 * These handle cases where a regional variant should map to a
 * specific locale rather than the first alphabetical match.
 */
const REGION_OVERRIDES: Record<string, string> = {
  // Chinese regional variants
  zh_HK: 'zh_TW', // Hong Kong → Traditional Chinese
  zh_MO: 'zh_TW', // Macau → Traditional Chinese
  zh_SG: 'zh_CN', // Singapore → Simplified Chinese
  // Norwegian: nn (Nynorsk) falls back to nb (Bokmål)
  nn: 'nb',
};

/**
 * Resolve a raw locale string (from browser or storage) to a
 * supported locale ID.
 *
 * Matching priority:
 * 1. Exact match (after hyphen→underscore normalization)
 * 2. Explicit regional override (zh-HK → zh_TW)
 * 3. Base language match (case-insensitive)
 * 4. Fallback to 'en'
 *
 * @example
 * resolveLocaleId('zh-CN') → 'zh_CN'
 * resolveLocaleId('zh-HK') → 'zh_TW'
 * resolveLocaleId('pt')    → 'pt_BR'
 * resolveLocaleId('fr-CA') → 'fr'
 * resolveLocaleId('sw')    → 'en'
 */
export function resolveLocaleId(raw: string): string {
  // 1. Normalize hyphens → underscores and try exact match
  const normalized = raw.replace(/-/g, '_');
  if (DICTIONARIES[normalized]) return normalized;

  // 2. Check explicit regional overrides
  if (REGION_OVERRIDES[normalized]) return REGION_OVERRIDES[normalized]!;

  // 3. Base language match (case-insensitive)
  const base = raw.split(/[-_]/)[0]!.toLowerCase();
  if (!base) return FALLBACK_LOCALE;
  const match = Object.keys(DICTIONARIES).find((k) => k.toLowerCase().startsWith(base));
  if (match) return match;

  // 4. Fallback
  return FALLBACK_LOCALE;
}
