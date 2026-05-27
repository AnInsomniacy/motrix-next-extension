import { describe, expect, it } from 'vitest';
import { I18nEngine } from '@/shared/i18n/engine';

describe('I18nEngine', () => {
  it('translates with locale and English fallback dictionaries', () => {
    const engine = new I18nEngine('zh_CN');

    expect(engine.t('popup_status_connected')).toBe('已连接');
    expect(engine.t('ext_name')).toBe('Motrix Next Extension');
  });

  it('uses fallback string before returning the raw missing key', () => {
    const engine = new I18nEngine('en');

    expect(engine.t('missing_key', 'Fallback')).toBe('Fallback');
    expect(engine.t('missing_key')).toBe('missing_key');
  });

  it('falls back to English for unsupported locales', () => {
    const engine = new I18nEngine('sw');

    expect(engine.locale).toBe('sw');
    expect(engine.t('popup_status_connected')).toBe('Connected');
  });

  it('replaces positional placeholders', () => {
    const engine = new I18nEngine('en');

    expect(engine.tSub('popup_speed_download', ['10 MB/s'])).toBe('↓ 10 MB/s');
    expect(engine.tSub('missing_key', ['A', 'B'], '$1 and $2')).toBe('A and B');
  });

  it('switches locale and reports the requested locale id', () => {
    const engine = new I18nEngine('en');

    engine.setLocale('zh_CN');
    expect(engine.locale).toBe('zh_CN');
    expect(engine.t('options_section_connection')).toBe('连接');

    engine.setLocale('unknown');
    expect(engine.locale).toBe('unknown');
    expect(engine.t('options_section_connection')).toBe('Connection');
  });
});
