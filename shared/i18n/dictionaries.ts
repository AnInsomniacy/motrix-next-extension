/**
 * Translation data layer for runtime locale switching.
 *
 * All `public/_locales/<id>/messages.json` bundles are aggregated by the
 * `virtual:locales` build plugin — messages.json stays the single source of
 * truth. Named placeholders (`$speed$`) are pre-compiled to positional
 * (`$1`) at module load so the engine only does simple replacement.
 *
 * Adding a language: create the messages.json + add one SUPPORTED_LOCALES
 * entry in locales.ts.
 */
import rawLocales from 'virtual:locales';
import { FALLBACK_LOCALE } from './locales';

// ─── Types ──────────────────────────────────────────────

type ChromeMessages = Record<
  string,
  {
    message: string;
    placeholders?: Record<string, { content: string }>;
  }
>;

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
