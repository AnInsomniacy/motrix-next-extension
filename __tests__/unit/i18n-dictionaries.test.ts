import { describe, expect, it } from 'vitest';
import { resolveLocaleId } from '@/shared/i18n/dictionaries';
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales';

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
    for (const { id } of SUPPORTED_LOCALES) {
      expect(resolveLocaleId(id), id).toBe(id);
    }
  });
});
