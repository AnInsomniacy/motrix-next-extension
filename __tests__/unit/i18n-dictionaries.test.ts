import { describe, it, expect } from 'vitest';

// ─── Constants ──────────────────────────────────────────

/**
 * The complete list of 26 locale IDs that must be supported,
 * matching the Motrix Next desktop app's locale set.
 */
const ALL_LOCALE_IDS = [
  'ar',
  'bg',
  'ca',
  'de',
  'el',
  'en',
  'es',
  'fa',
  'fr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt_BR',
  'ro',
  'ru',
  'th',
  'tr',
  'uk',
  'vi',
  'zh_CN',
  'zh_TW',
] as const;

/** Expected endonyms (native names) for each locale. */
const EXPECTED_ENDONYMS: Record<string, string> = {
  ar: 'عربي',
  bg: 'Българският език',
  ca: 'Català',
  de: 'Deutsch',
  el: 'Ελληνικά',
  en: 'English',
  es: 'Español',
  fa: 'فارسی',
  fr: 'Français',
  hu: 'Magyar',
  id: 'Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  nb: 'Norsk Bokmål',
  nl: 'Nederlands',
  pl: 'Polski',
  pt_BR: 'Português (Brasil)',
  ro: 'Română',
  ru: 'Русский',
  th: 'แบบไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
};

// ─── flatten() ──────────────────────────────────────────

describe('flatten', () => {
  // We test the internal flatten via the public DICTIONARIES export.

  it('extracts message strings from Chrome i18n format', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    expect(DICTIONARIES.en!['popup_status_connected']).toBe('Connected');
    expect(DICTIONARIES.zh_CN!['popup_status_connected']).toBe('已连接');
  });

  it('pre-compiles named placeholders to positional format', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    // "↓ $speed$" with placeholders { speed: { content: "$1" } } → "↓ $1"
    expect(DICTIONARIES.en!['popup_speed_download']).toBe('↓ $1');
    expect(DICTIONARIES.en!['popup_speed_upload']).toBe('↑ $1');
  });

  it('pre-compiles named placeholders for all supported locales', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    // Every locale with popup_speed_download should have "$1" not "$speed$"
    for (const id of ALL_LOCALE_IDS) {
      const dict = DICTIONARIES[id];
      expect(dict, `DICTIONARIES['${id}'] should exist`).toBeDefined();
      const msg = dict!['popup_speed_download'];
      expect(msg, `${id}: popup_speed_download should contain $1`).toContain('$1');
      expect(msg, `${id}: popup_speed_download should not contain $speed$`).not.toContain(
        '$speed$',
      );
    }
  });

  it('preserves messages that already use positional placeholders', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    // "Check your network or firewall settings. RPC port: $1"
    // placeholders: { "1": { content: "$1" } } — $1$ → $1 (identity)
    const msg = DICTIONARIES.en!['popup_error_timeout_hint'];
    expect(msg).toContain('$1');
    expect(msg).not.toContain('$1$');
  });

  it('flattens all keys from en messages.json', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    const enDict = DICTIONARIES.en!;
    // Verify key count matches source
    expect(Object.keys(enDict).length).toBeGreaterThanOrEqual(76);
    // Spot-check a few keys across different sections
    expect(enDict['ext_name']).toBe('Motrix Next Extension');
    expect(enDict['options_section_connection']).toBe('Connection');
    expect(enDict['context_menu_download']).toBe('Download with Motrix Next');
  });

  it('produces string values only (no nested objects)', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    for (const id of ALL_LOCALE_IDS) {
      const dict = DICTIONARIES[id]!;
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, `${id}.${key} should be string`).toBe('string');
      }
    }
  });
});

// ─── SUPPORTED_LOCALES ──────────────────────────────────

describe('SUPPORTED_LOCALES', () => {
  it('contains exactly 26 locales matching the desktop app', async () => {
    const { SUPPORTED_LOCALES } = await import('@/shared/i18n/dictionaries');
    expect(SUPPORTED_LOCALES).toHaveLength(26);
    const ids = SUPPORTED_LOCALES.map((l) => l.id);
    for (const id of ALL_LOCALE_IDS) {
      expect(ids, `SUPPORTED_LOCALES should include '${id}'`).toContain(id);
    }
  });

  it('has endonym and exonym for each locale', async () => {
    const { SUPPORTED_LOCALES } = await import('@/shared/i18n/dictionaries');
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.endonym, `${locale.id}: endonym should be non-empty`).toBeTruthy();
      expect(locale.exonym, `${locale.id}: exonym should be non-empty`).toBeTruthy();
      expect(locale.id, `locale id should be non-empty`).toBeTruthy();
    }
  });

  it('has correct endonyms (native names) for all locales', async () => {
    const { SUPPORTED_LOCALES } = await import('@/shared/i18n/dictionaries');
    for (const locale of SUPPORTED_LOCALES) {
      const expected = EXPECTED_ENDONYMS[locale.id];
      expect(locale.endonym, `${locale.id}: endonym mismatch`).toBe(expected);
    }
  });

  it('has matching DICTIONARIES entry for each supported locale', async () => {
    const { SUPPORTED_LOCALES, DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    for (const locale of SUPPORTED_LOCALES) {
      expect(DICTIONARIES[locale.id], `DICTIONARIES['${locale.id}'] should exist`).toBeDefined();
    }
  });
});

// ─── DICTIONARIES completeness ──────────────────────────

describe('DICTIONARIES completeness', () => {
  it('contains entries for all 26 locales', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    for (const id of ALL_LOCALE_IDS) {
      expect(DICTIONARIES[id], `DICTIONARIES['${id}'] should exist`).toBeDefined();
    }
  });

  it('every locale has the same keys as the English reference', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    const enKeys = Object.keys(DICTIONARIES.en!).sort();

    for (const id of ALL_LOCALE_IDS) {
      if (id === 'en') continue;
      const localeKeys = Object.keys(DICTIONARIES[id]!).sort();
      expect(localeKeys, `${id}: keys should match en`).toEqual(enKeys);
    }
  });

  it('no locale has empty message values', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    for (const id of ALL_LOCALE_IDS) {
      const dict = DICTIONARIES[id]!;
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${id}.${key} should not be empty`).not.toBe('');
      }
    }
  });
});

// ─── FALLBACK_LOCALE ────────────────────────────────────

describe('FALLBACK_LOCALE', () => {
  it('is set to en', async () => {
    const { FALLBACK_LOCALE } = await import('@/shared/i18n/dictionaries');
    expect(FALLBACK_LOCALE).toBe('en');
  });
});

// ─── resolveLocaleId() ──────────────────────────────────

describe('resolveLocaleId', () => {
  // ── Exact matches ──

  it('resolves exact match for all 26 locale IDs', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    for (const id of ALL_LOCALE_IDS) {
      expect(resolveLocaleId(id), `exact match for '${id}'`).toBe(id);
    }
  });

  // ── BCP 47 hyphen → underscore normalization ──

  it('normalizes BCP 47 hyphen to underscore', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('zh-CN')).toBe('zh_CN');
    expect(resolveLocaleId('zh-TW')).toBe('zh_TW');
    expect(resolveLocaleId('pt-BR')).toBe('pt_BR');
  });

  // ── Base language matching (desktop parity) ──

  it('resolves zh-HK to zh_TW (desktop parity)', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('zh-HK')).toBe('zh_TW');
  });

  it('resolves bare zh to zh_CN', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('zh')).toBe('zh_CN');
  });

  it('resolves regional English variants to en', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('en-US')).toBe('en');
    expect(resolveLocaleId('en-GB')).toBe('en');
    expect(resolveLocaleId('en-AU')).toBe('en');
  });

  it('resolves regional Arabic variants to ar', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('ar-SA')).toBe('ar');
    expect(resolveLocaleId('ar-EG')).toBe('ar');
  });

  it('resolves regional German variants to de', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('de-DE')).toBe('de');
    expect(resolveLocaleId('de-AT')).toBe('de');
    expect(resolveLocaleId('de-CH')).toBe('de');
  });

  it('resolves regional Spanish variants to es', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('es-ES')).toBe('es');
    expect(resolveLocaleId('es-MX')).toBe('es');
    expect(resolveLocaleId('es-419')).toBe('es');
  });

  it('resolves regional French variants to fr', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('fr-FR')).toBe('fr');
    expect(resolveLocaleId('fr-CA')).toBe('fr');
  });

  it('resolves regional Italian variants to it', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('it-IT')).toBe('it');
    expect(resolveLocaleId('it-CH')).toBe('it');
  });

  it('resolves regional Portuguese variants to pt_BR', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    // pt without region → pt_BR (desktop parity)
    expect(resolveLocaleId('pt')).toBe('pt_BR');
    expect(resolveLocaleId('pt-PT')).toBe('pt_BR');
  });

  it('resolves ja-JP to ja', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('ja-JP')).toBe('ja');
  });

  it('resolves ko-KR to ko', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('ko-KR')).toBe('ko');
  });

  it('resolves ru-RU to ru', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('ru-RU')).toBe('ru');
  });

  it('resolves tr-TR to tr', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('tr-TR')).toBe('tr');
  });

  it('resolves nl-BE to nl', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('nl-BE')).toBe('nl');
  });

  // ── Unsupported locales ──

  it('falls back to en for completely unsupported locales', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('sw')).toBe('en'); // Swahili
    expect(resolveLocaleId('hi')).toBe('en'); // Hindi
    expect(resolveLocaleId('xx-YY')).toBe('en');
  });

  // ── Edge cases ──

  it('handles empty string gracefully', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('')).toBe('en');
  });

  it('is case-insensitive for base language matching', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('EN')).toBe('en');
    expect(resolveLocaleId('ZH-cn')).toBe('zh_CN');
    expect(resolveLocaleId('DE')).toBe('de');
    expect(resolveLocaleId('FR')).toBe('fr');
  });
});
