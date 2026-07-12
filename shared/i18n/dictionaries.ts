/**
 * Translation data layer for runtime locale switching.
 *
 * All `public/_locales/<id>/messages.json` bundles are aggregated by the
 * `virtual:locales` build plugin — messages.json stays the single source of
 * truth. Named placeholders (`$speed$`) are pre-compiled to positional
 * (`$1`) at module load so the engine only does simple replacement.
 *
 * Adding a language: create the messages.json + add one SUPPORTED_LOCALES
 * entry below.
 */
import rawLocales from 'virtual:locales';

// ─── Types ──────────────────────────────────────────────

type ChromeMessages = Record<
  string,
  {
    message: string;
    placeholders?: Record<string, { content: string }>;
  }
>;

/** Locale entry for the language selector UI. */
export interface LocaleEntry {
  /** Storage ID: 'en', 'zh_CN', ... */
  readonly id: string;
  /** Native name: 'English', '中文', '日本語' */
  readonly endonym: string;
  /** English name: 'English', 'Chinese', 'Japanese' */
  readonly exonym: string;
}

// ─── Locale Registry ────────────────────────────────────

/** Supported locales with display metadata, sorted by locale ID. */
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
  { id: 'hi', endonym: 'हिन्दी', exonym: 'Hindi' },
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

// ─── Dictionaries ───────────────────────────────────────

/**
 * Flatten Chrome i18n format to Record<key, message>, pre-compiling named
 * placeholders: "↓ $speed$" + { speed: { content: "$1" } } → "↓ $1".
 */
function flatten(raw: ChromeMessages): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw)) {
    let msg = entry.message;
    for (const [name, ph] of Object.entries(entry.placeholders ?? {})) {
      msg = msg.replaceAll(`$${name}$`, ph.content);
    }
    dict[key] = msg;
  }
  return dict;
}

/** All flattened dictionaries, keyed by locale ID. */
export const DICTIONARIES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(rawLocales as Record<string, ChromeMessages>).map(([id, raw]) => [
    id,
    flatten(raw),
  ]),
);

// ─── Locale Resolution ──────────────────────────────────

/** Regional mappings that base-language matching cannot infer. */
const REGION_OVERRIDES: Record<string, string> = {
  zh_HK: 'zh_TW',
  zh_MO: 'zh_TW',
  zh_SG: 'zh_CN',
  nn: 'nb', // Norwegian Nynorsk → Bokmål
};

/**
 * Resolve a raw locale string (browser or storage) to a supported locale ID.
 * Priority: exact match → regional override → base language → 'en'.
 *
 *   resolveLocaleId('zh-CN') → 'zh_CN'
 *   resolveLocaleId('zh-HK') → 'zh_TW'
 *   resolveLocaleId('pt')    → 'pt_BR'
 *   resolveLocaleId('sw')    → 'en'
 */
export function resolveLocaleId(raw: string): string {
  const normalized = raw.replace(/-/g, '_');
  if (DICTIONARIES[normalized]) return normalized;
  if (REGION_OVERRIDES[normalized]) return REGION_OVERRIDES[normalized]!;

  const base = raw.split(/[-_]/)[0]!.toLowerCase();
  if (!base) return FALLBACK_LOCALE;
  const match = Object.keys(DICTIONARIES).find((k) => k.toLowerCase().startsWith(base));
  return match ?? FALLBACK_LOCALE;
}
