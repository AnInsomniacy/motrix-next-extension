import { describe, expect, it } from 'vitest';
import {
  DICTIONARIES,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  resolveLocaleId,
} from '@/shared/i18n/dictionaries';

const LOCALE_IDS = [
  'ar',
  'bg',
  'ca',
  'de',
  'el',
  'en',
  'es',
  'fa',
  'fr',
  'hi',
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

describe('i18n dictionaries', () => {
  it('registers the supported locales and dictionaries', () => {
    expect(FALLBACK_LOCALE).toBe('en');
    expect(SUPPORTED_LOCALES.map((locale) => locale.id)).toEqual(LOCALE_IDS);

    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.endonym, `${locale.id}: endonym`).toBeTruthy();
      expect(locale.exonym, `${locale.id}: exonym`).toBeTruthy();
      expect(DICTIONARIES[locale.id], `${locale.id}: dictionary`).toBeDefined();
    }
  });

  it('flattens Chrome i18n messages into string dictionaries', () => {
    expect(DICTIONARIES.en!['popup_status_connected']).toBe('Connected');
    expect(DICTIONARIES.zh_CN!['popup_status_connected']).toBe('已连接');
    expect(DICTIONARIES.en!['popup_speed_download']).toBe('↓ $1');
    expect(DICTIONARIES.en!['popup_error_timeout_hint']).toContain('$1');
    expect(DICTIONARIES.en!['popup_error_timeout_hint']).not.toContain('$1$');

    for (const id of LOCALE_IDS) {
      for (const [key, value] of Object.entries(DICTIONARIES[id]!)) {
        expect(typeof value, `${id}.${key}: type`).toBe('string');
        expect(value.trim(), `${id}.${key}: value`).not.toBe('');
      }
    }
  });

  it('keeps every locale aligned with the English reference keys', () => {
    const enKeys = Object.keys(DICTIONARIES.en!).sort();

    for (const id of LOCALE_IDS) {
      expect(Object.keys(DICTIONARIES[id]!).sort(), `${id}: keys`).toEqual(enKeys);
    }
  });
});

describe('resolveLocaleId', () => {
  it('normalizes browser locale variants and unknown languages', () => {
    const cases: Array<readonly [string, string]> = [
      ['en-US', 'en'],
      ['zh-CN', 'zh_CN'],
      ['zh-TW', 'zh_TW'],
      ['zh-HK', 'zh_TW'],
      ['pt-PT', 'pt_BR'],
      ['de-AT', 'de'],
      ['es-419', 'es'],
      ['nn', 'nb'],
      ['sw', 'en'],
      ['', 'en'],
      ['ZH-cn', 'zh_CN'],
    ];
    for (const [raw, expected] of cases) expect(resolveLocaleId(raw)).toBe(expected);
  });

  it('keeps exact locale ids unchanged', () => {
    for (const id of LOCALE_IDS) {
      expect(resolveLocaleId(id), id).toBe(id);
    }
  });
});
